import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { at, createCustomer, createTenant, nextWeekday, resetDatabase } from "./helpers/factories";

describe("Cancelamento pelo cliente", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  async function setup(startsAt = at(nextWeekday(1), 9)) {
    const tenant = await createTenant();
    const client = await createCustomer(tenant.establishment.id);
    const appointment = await prisma.appointment.create({
      data: {
        establishmentId: tenant.establishment.id,
        customerId: client.customer.id,
        serviceId: tenant.service.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        status: "CONFIRMED",
      },
    });
    const cancel = (cookie: string, slug = tenant.establishment.slug, id = appointment.id) =>
      request(app).patch(`/establishments/${slug}/customers/me/appointments/${id}/cancel`).set("Cookie", cookie);
    const status = async () =>
      (await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status;
    return { ...tenant, client, appointment, cancel, status };
  }

  it("cancela o próprio horário e ele volta a ficar disponível", async () => {
    const { establishment, service, client, appointment, cancel, status } = await setup();

    expect((await cancel(client.cookie)).status).toBe(204);
    expect(await status()).toBe("CANCELLED");

    const other = await createCustomer(establishment.id);
    const rebook = await request(app)
      .post(`/establishments/${establishment.slug}/appointments`)
      .set("Cookie", other.cookie)
      .send({ serviceId: service.id, startsAt: appointment.startsAt.toISOString() });
    expect(rebook.status).toBe(201);
  });

  it("não cancela o horário de outro cliente da mesma loja", async () => {
    const { establishment, cancel, status } = await setup();
    const intruder = await createCustomer(establishment.id);

    expect((await cancel(intruder.cookie)).status).toBe(404);
    expect(await status()).toBe("CONFIRMED");
  });

  it("sessão de outra loja ou sem login não cancela", async () => {
    const { cancel, status } = await setup();
    const other = await createTenant();
    const stranger = await createCustomer(other.establishment.id);

    expect((await cancel(stranger.cookie)).status).toBe(401);
    expect((await cancel(stranger.cookie, other.establishment.slug)).status).toBe(404);
    expect((await cancel("")).status).toBe(401);
    expect(await status()).toBe("CONFIRMED");
  });

  it("horário que já passou não pode ser cancelado", async () => {
    const { client, cancel, status } = await setup(at(nextWeekday(1, -14), 9));

    const res = await cancel(client.cookie);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_CANCELLABLE");
    expect(await status()).toBe("CONFIRMED");
  });

  it.each([
    { minutes: 119, allowed: false },
    { minutes: 130, allowed: true },
  ])("faltando $minutes minutos, cancelamento permitido: $allowed", async ({ minutes, allowed }) => {
    const { establishment, client, cancel, status } = await setup(new Date(Date.now() + minutes * 60 * 1000));

    const list = await request(app)
      .get(`/establishments/${establishment.slug}/customers/me/appointments`)
      .set("Cookie", client.cookie);
    expect(list.body[0].canCancel).toBe(allowed);

    expect((await cancel(client.cookie)).status).toBe(allowed ? 204 : 409);
    expect(await status()).toBe(allowed ? "CANCELLED" : "CONFIRMED");
  });

  it("cancelar duas vezes ao mesmo tempo só vale uma", async () => {
    const { client, cancel } = await setup();

    const responses = await Promise.all([cancel(client.cookie), cancel(client.cookie)]);

    expect(responses.map((r) => r.status).sort()).toEqual([204, 409]);
  });

  it("conta que assumiu cadastro do dono não cancela o que veio antes dela", async () => {
    const { client, cancel, status } = await setup();
    await prisma.customer.update({
      where: { id: client.customer.id },
      data: { claimedAt: new Date(Date.now() + 1000) },
    });

    expect((await cancel(client.cookie)).status).toBe(404);
    expect(await status()).toBe("CONFIRMED");
  });
});
