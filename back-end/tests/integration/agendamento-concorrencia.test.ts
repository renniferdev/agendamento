import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import {
  adminCookie,
  at,
  createCustomer,
  createTenant,
  nextWeekday,
  resetDatabase,
} from "./helpers/factories";

/** Tenta agendar como um cliente já autenticado. */
function book(slug: string, cookie: string, serviceId: string, startsAt: Date) {
  return request(app)
    .post(`/establishments/${slug}/appointments`)
    .set("Cookie", cookie)
    .send({ serviceId, startsAt: startsAt.toISOString() });
}

const statusesOf = (responses: { status: number }[]) => responses.map((r) => r.status);
const count = (statuses: number[], status: number) => statuses.filter((s) => s === status).length;

describe("Agendamento: concorrência e integridade de horários", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("20 clientes disputando o mesmo horário: só um consegue agendar", async () => {
    const { establishment, service } = await createTenant();
    const startsAt = at(nextWeekday(1), 9);
    const clients = await Promise.all(Array.from({ length: 20 }, () => createCustomer(establishment.id)));

    const responses = await Promise.all(
      clients.map((c) => book(establishment.slug, c.cookie, service.id, startsAt))
    );

    const statuses = statusesOf(responses);
    expect(count(statuses, 201)).toBe(1);
    expect(count(statuses, 409)).toBe(19);
    for (const r of responses.filter((r) => r.status === 409)) {
      expect(r.body.code).toBe("SLOT_UNAVAILABLE");
    }
    expect(await prisma.appointment.count({ where: { establishmentId: establishment.id } })).toBe(1);
  });

  it("horários diferentes não se bloqueiam: um agendamento por horário", async () => {
    const { establishment, service } = await createTenant(); // 09:00-12:00, serviço de 60 min => 3 horários
    const monday = nextWeekday(1);
    const hours = [9, 10, 11];
    // Dois clientes disputam cada um dos três horários, tudo ao mesmo tempo.
    const attempts = await Promise.all(
      hours.flatMap((h) => [h, h]).map(async (h) => ({ h, client: await createCustomer(establishment.id) }))
    );

    const responses = await Promise.all(
      attempts.map(({ h, client }) => book(establishment.slug, client.cookie, service.id, at(monday, h)))
    );

    expect(count(statusesOf(responses), 201)).toBe(3);
    const booked = await prisma.appointment.findMany({ where: { establishmentId: establishment.id } });
    expect(booked.map((a) => a.startsAt.getHours()).sort((a, b) => a - b)).toEqual(hours);
  });

  it("estabelecimentos diferentes não competem pelo mesmo horário", async () => {
    const a = await createTenant();
    const b = await createTenant();
    const monday = nextWeekday(1);
    const attempts = [
      ...(await Promise.all(Array.from({ length: 5 }, () => createCustomer(a.establishment.id)))).map((c) => ({
        tenant: a,
        c,
      })),
      ...(await Promise.all(Array.from({ length: 5 }, () => createCustomer(b.establishment.id)))).map((c) => ({
        tenant: b,
        c,
      })),
    ];

    const responses = await Promise.all(
      attempts.map(({ tenant, c }) => book(tenant.establishment.slug, c.cookie, tenant.service.id, at(monday, 9)))
    );

    // Um vencedor por loja, e não um só no sistema inteiro.
    expect(count(statusesOf(responses), 201)).toBe(2);
    expect(await prisma.appointment.count({ where: { establishmentId: a.establishment.id } })).toBe(1);
    expect(await prisma.appointment.count({ where: { establishmentId: b.establishment.id } })).toBe(1);
  });

  it("horário fora da grade do serviço é recusado", async () => {
    const { establishment, service } = await createTenant();
    const client = await createCustomer(establishment.id);

    const res = await book(establishment.slug, client.cookie, service.id, at(nextWeekday(1), 10, 30));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SLOT_UNAVAILABLE");
  });

  it("dia sem expediente é recusado", async () => {
    const { establishment, service } = await createTenant(); // só abre às segundas
    const client = await createCustomer(establishment.id);

    const res = await book(establishment.slug, client.cookie, service.id, at(nextWeekday(2), 9));

    expect(res.status).toBe(409);
  });

  it("não permite agendar no passado", async () => {
    const { establishment, service } = await createTenant();
    const client = await createCustomer(establishment.id);
    const lastMonday = nextWeekday(1, -14);

    const res = await book(establishment.slug, client.cookie, service.id, at(lastMonday, 9));

    expect(res.status).toBe(409);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("horário bloqueado pelo dono é recusado", async () => {
    const { establishment, service } = await createTenant();
    const client = await createCustomer(establishment.id);
    const monday = nextWeekday(1);
    await prisma.blockedSlot.create({
      data: { establishmentId: establishment.id, startsAt: at(monday, 9), endsAt: at(monday, 10), reason: "Folga" },
    });

    const res = await book(establishment.slug, client.cookie, service.id, at(monday, 9));

    expect(res.status).toBe(409);
  });

  it("cancelar libera o horário para outro cliente", async () => {
    const { establishment, owner, service } = await createTenant();
    const monday = nextWeekday(1);
    const [first, second] = await Promise.all([createCustomer(establishment.id), createCustomer(establishment.id)]);

    const booked = await book(establishment.slug, first.cookie, service.id, at(monday, 9));
    expect(booked.status).toBe(201);
    expect((await book(establishment.slug, second.cookie, service.id, at(monday, 9))).status).toBe(409);

    const cancel = await request(app)
      .patch(`/admin/appointments/${booked.body.id}/cancel`)
      .set("Cookie", await adminCookie(owner.id));
    expect(cancel.status).toBe(200);

    expect((await book(establishment.slug, second.cookie, service.id, at(monday, 9))).status).toBe(201);
  });
});
