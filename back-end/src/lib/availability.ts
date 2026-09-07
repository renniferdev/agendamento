import { prisma } from "./prisma";

export interface TimeSlot {
  start: Date;
  end: Date;
}

interface GetAvailableSlotsParams {
  establishmentId: string;
  serviceId: string;
  /** Qualquer horário dentro do dia desejado; só a data (ano/mês/dia) é usada. */
  date: Date;
  /**
   * Granularidade dos horários oferecidos, em minutos.
   * Por padrão, usa a própria duração do serviço (slots "colados").
   */
  slotIntervalMinutes?: number;
}

const ACTIVE_APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED"] as const;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToDate(baseDate: Date, minutes: number): Date {
  const d = startOfDay(baseDate);
  d.setMinutes(minutes);
  return d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Calcula os horários disponíveis para agendar um serviço em um
 * estabelecimento, em um dia específico.
 *
 * Regras aplicadas:
 * 1. Considera apenas as janelas de funcionamento (`BusinessHour`) cujo
 *    `dayOfWeek` corresponde ao dia da semana da data pesquisada — um
 *    estabelecimento pode ter mais de uma janela no mesmo dia (ex: manhã e
 *    tarde), todas são consideradas.
 * 2. Dentro de cada janela, gera horários candidatos a cada
 *    `slotIntervalMinutes` (por padrão, a duração do serviço), descartando
 *    qualquer candidato cujo término ultrapasse o fim da janela.
 * 3. Descarta candidatos que colidam com agendamentos já existentes
 *    (status PENDING ou CONFIRMED — CANCELLED/COMPLETED não bloqueiam) ou
 *    com bloqueios administrativos (`BlockedSlot`, ex: folga/feriado).
 * 4. Descarta candidatos no passado, caso a data pesquisada seja hoje.
 *
 * Retorna a lista de slots livres, ordenada cronologicamente.
 */
export async function getAvailableSlots({
  establishmentId,
  serviceId,
  date,
  slotIntervalMinutes,
}: GetAvailableSlotsParams): Promise<TimeSlot[]> {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, establishmentId, active: true },
  });

  if (!service) {
    throw new Error("Serviço não encontrado ou inativo para este estabelecimento.");
  }

  const duration = service.durationMinutes;
  const interval = slotIntervalMinutes ?? duration;

  const dayOfWeek = date.getDay();

  const businessHours = await prisma.businessHour.findMany({
    where: { establishmentId, dayOfWeek },
    orderBy: { startTime: "asc" },
  });

  if (businessHours.length === 0) {
    return [];
  }

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Busca de uma vez só tudo que pode colidir com o dia pesquisado, em vez
  // de uma query por slot candidato.
  const [appointments, blockedSlots] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        establishmentId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.blockedSlot.findMany({
      where: {
        establishmentId,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const busyRanges = [...appointments, ...blockedSlots];
  const now = new Date();
  const slots: TimeSlot[] = [];

  for (const window of businessHours) {
    const windowStartMinutes = parseTimeToMinutes(window.startTime);
    const windowEndMinutes = parseTimeToMinutes(window.endTime);

    for (
      let slotStartMinutes = windowStartMinutes;
      slotStartMinutes + duration <= windowEndMinutes;
      slotStartMinutes += interval
    ) {
      const slotStart = minutesToDate(date, slotStartMinutes);
      const slotEnd = minutesToDate(date, slotStartMinutes + duration);

      if (slotStart < now) continue;

      const hasConflict = busyRanges.some((busy) =>
        overlaps(slotStart, slotEnd, busy.startsAt, busy.endsAt)
      );
      if (hasConflict) continue;

      slots.push({ start: slotStart, end: slotEnd });
    }
  }

  return slots;
}
