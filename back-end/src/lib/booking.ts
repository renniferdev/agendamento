import type { Prisma } from "@prisma/client";
import { getAvailableSlots } from "./availability";
import { sendAppointmentEmails } from "./email";
import { prisma } from "./prisma";

/**
 * Criação de agendamento, compartilhada entre a página pública (cliente) e o
 * painel (dono). As duas portas passam pela MESMA trava e pela mesma regra de
 * disponibilidade, então não há como duplicar um horário por nenhuma delas.
 */

export class SlotUnavailableError extends Error {
  constructor() {
    super("Este horário acabou de ficar indisponível. Escolha outro horário.");
  }
}

interface CreateAppointmentParams {
  establishmentId: string;
  serviceId: string;
  startsAt: Date;
  /**
   * Resolve (ou cria) o cliente dentro da transação, depois de confirmado que
   * o horário está livre: reserva recusada não deixa cadastro órfão.
   */
  resolveCustomerId: (tx: Prisma.TransactionClient) => Promise<string>;
}

/**
 * Concorrência: a transação começa com `SELECT ... FOR UPDATE` na linha do
 * estabelecimento, o que serializa as reservas daquele tenant. Duas
 * requisições simultâneas para o mesmo horário entram em fila nesse lock; a
 * segunda só revalida depois que a primeira gravou (commit), enxerga o novo
 * agendamento e recebe `SlotUnavailableError`. Reservas de estabelecimentos
 * diferentes não se bloqueiam.
 */
export function createAppointment({ establishmentId, serviceId, startsAt, resolveCustomerId }: CreateAppointmentParams) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT id FROM establishments WHERE id = ${establishmentId} FOR UPDATE`;

      // O horário pedido tem que ser exatamente o início de um horário livre.
      const slots = await getAvailableSlots({ establishmentId, serviceId, date: startsAt, db: tx });
      const slot = slots.find((s) => s.start.getTime() === startsAt.getTime());
      if (!slot) throw new SlotUnavailableError();

      return tx.appointment.create({
        data: {
          establishmentId,
          customerId: await resolveCustomerId(tx),
          serviceId,
          startsAt: slot.start,
          endsAt: slot.end,
          status: "CONFIRMED",
        },
        include: {
          service: { select: { name: true, durationMinutes: true, priceCents: true } },
          customer: { select: { name: true, phone: true, email: true } },
          establishment: { select: { name: true, phone: true } },
        },
      });
    },
    { timeout: 15000 }
  );
}

/** Avisos por e-mail. Nunca lança: e-mail não derruba uma reserva já feita. */
export async function notifyNewAppointment(
  appointment: Awaited<ReturnType<typeof createAppointment>>,
  options: { notifyOwner: boolean }
): Promise<void> {
  try {
    const owner = options.notifyOwner
      ? await prisma.user.findFirst({
          where: { establishmentId: appointment.establishmentId, role: "ADMIN" },
          select: { email: true },
        })
      : null;
    await sendAppointmentEmails({
      establishmentName: appointment.establishment.name,
      establishmentPhone: appointment.establishment.phone,
      serviceName: appointment.service.name,
      priceCents: appointment.service.priceCents,
      startsAt: appointment.startsAt,
      customerName: appointment.customer.name,
      customerPhone: appointment.customer.phone,
      customerEmail: appointment.customer.email,
      adminEmail: owner?.email ?? null,
    });
  } catch (err) {
    console.error("[email] erro inesperado ao notificar:", err);
  }
}
