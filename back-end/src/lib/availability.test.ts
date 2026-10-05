import { describe, expect, it, vi, afterEach } from "vitest";
import { getAvailableSlots, ServiceNotFoundError, type DbClient } from "./availability";

interface FakeDbOptions {
  service?: { durationMinutes: number; active?: boolean } | null;
  businessHours?: { startTime: string; endTime: string }[];
  appointments?: { startsAt: Date; endsAt: Date }[];
  blockedSlots?: { startsAt: Date; endsAt: Date }[];
}

/**
 * `getAvailableSlots` recebe o client (prisma ou tx) como parâmetro
 * (ver DbClient em availability.ts) justamente para permitir isso: testar a
 * lógica de geração de slots sem um banco real.
 */
function fakeDb(opts: FakeDbOptions = {}): DbClient {
  return {
    service: {
      findFirst: vi.fn().mockResolvedValue(
        "service" in opts ? opts.service : { durationMinutes: 60, active: true }
      ),
    },
    businessHour: {
      findMany: vi.fn().mockResolvedValue(opts.businessHours ?? []),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue(opts.appointments ?? []),
    },
    blockedSlot: {
      findMany: vi.fn().mockResolvedValue(opts.blockedSlots ?? []),
    },
  } as unknown as DbClient;
}

/** Sexta-feira (dayOfWeek 5), bem no futuro para nunca cair em "horário passado". */
const FRIDAY = new Date(2027, 0, 15, 12, 0);

function hours(slots: { start: Date; end: Date }[]): string[] {
  return slots.map((s) => `${s.start.getHours()}:${String(s.start.getMinutes()).padStart(2, "0")}`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getAvailableSlots", () => {
  it("lança ServiceNotFoundError quando o serviço não existe ou está inativo", async () => {
    const db = fakeDb({ service: null });
    await expect(
      getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db })
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it("retorna lista vazia quando não há expediente no dia da semana pesquisado", async () => {
    const db = fakeDb({ businessHours: [] });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(slots).toEqual([]);
  });

  it("gera um slot a cada duração do serviço dentro da janela de expediente", async () => {
    const db = fakeDb({ businessHours: [{ startTime: "09:00", endTime: "12:00" }] });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(hours(slots)).toEqual(["9:00", "10:00", "11:00"]);
  });

  it("não gera slot cujo término ultrapassa o fim da janela", async () => {
    // 09:00–10:30 com serviço de 60min: só cabe 09:00–10:00; 10:00–11:00 estoura.
    const db = fakeDb({ businessHours: [{ startTime: "09:00", endTime: "10:30" }] });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(hours(slots)).toEqual(["9:00"]);
  });

  it("considera múltiplas janelas de expediente no mesmo dia", async () => {
    const db = fakeDb({
      businessHours: [
        { startTime: "09:00", endTime: "10:00" },
        { startTime: "14:00", endTime: "15:00" },
      ],
    });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(hours(slots)).toEqual(["9:00", "14:00"]);
  });

  it("usa slotIntervalMinutes quando informado, em vez da duração do serviço", async () => {
    const db = fakeDb({
      service: { durationMinutes: 30, active: true },
      businessHours: [{ startTime: "09:00", endTime: "10:00" }],
    });
    const slots = await getAvailableSlots({
      establishmentId: "e1",
      serviceId: "s1",
      date: FRIDAY,
      slotIntervalMinutes: 15,
      db,
    });
    // Serviço de 30min a cada 15min: 9:00, 9:15, 9:30 cabem (terminam até 10:00); 9:45 não cabe.
    expect(hours(slots)).toEqual(["9:00", "9:15", "9:30"]);
  });

  it("exclui horário que colide com um agendamento existente", async () => {
    const db = fakeDb({
      businessHours: [{ startTime: "09:00", endTime: "11:00" }],
      appointments: [{ startsAt: new Date(2027, 0, 15, 9, 0), endsAt: new Date(2027, 0, 15, 10, 0) }],
    });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(hours(slots)).toEqual(["10:00"]);
  });

  it("exclui horário coberto por um bloqueio administrativo (folga/feriado)", async () => {
    const db = fakeDb({
      businessHours: [{ startTime: "09:00", endTime: "11:00" }],
      blockedSlots: [{ startsAt: new Date(2027, 0, 15, 10, 0), endsAt: new Date(2027, 0, 15, 11, 0) }],
    });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(hours(slots)).toEqual(["9:00"]);
  });

  it("descarta horários já passados quando a data pesquisada é hoje", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 15, 9, 30));

    const db = fakeDb({ businessHours: [{ startTime: "09:00", endTime: "11:00" }] });
    const slots = await getAvailableSlots({ establishmentId: "e1", serviceId: "s1", date: FRIDAY, db });
    expect(hours(slots)).toEqual(["10:00"]);
  });
});
