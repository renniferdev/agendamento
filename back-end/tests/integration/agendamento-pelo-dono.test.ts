import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { adminCookie, at, createCustomer, createTenant, nextWeekday, resetDatabase } from "./helpers/factories";

const walkIn = { name: "João do Balcão", phone: "(11) 98888-7777" };

describe("Agendamento feito pelo dono", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  async function setup() {
    const tenant = await createTenant();
    const cookie = await adminCookie(tenant.owner.id);
    const monday = nextWeekday(1);
    const book = (body: Record<string, unknown>, hour = 9) =>
      request(app)
        .post("/admin/appointments")
        .set("Cookie", cookie)
        .send({ serviceId: tenant.service.id, startsAt: at(monday, hour).toISOString(), ...body });
    return { ...tenant, monday, book };
  }

  it("marca para cliente novo sem e-mail", async () => {
    const { establishment, book } = await setup();

    const res = await book({ customer: { ...walkIn, email: "" } });

    expect(res.status).toBe(201);
    const customer = await prisma.customer.findFirstOrThrow({ where: { establishmentId: establishment.id } });
    expect(customer).toMatchObject({ name: walkIn.name, phone: "11988887777", email: null, passwordHash: null });
  });

  it("telefone já cadastrado reaproveita o cliente sem sobrescrever os dados", async () => {
    const { book } = await setup();
    await book({ customer: walkIn }, 9);

    const res = await book({ customer: { name: "Outro nome", phone: walkIn.phone } }, 10);

    expect(res.status).toBe(201);
    expect(await prisma.customer.count()).toBe(1);
    expect(res.body.customer.name).toBe(walkIn.name);
  });

  it("marca para um cliente já cadastrado", async () => {
    const { establishment, book } = await setup();
    const { customer } = await createCustomer(establishment.id);

    const res = await book({ customerId: customer.id });

    expect(res.status).toBe(201);
    expect(await prisma.appointment.count({ where: { customerId: customer.id } })).toBe(1);
  });

  it("não marca para cliente nem com serviço de outra loja", async () => {
    const { book } = await setup();
    const other = await createTenant();
    const stranger = await createCustomer(other.establishment.id);

    expect((await book({ customerId: stranger.customer.id })).status).toBe(404);
    expect((await book({ customer: walkIn, serviceId: other.service.id })).status).toBe(404);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("horário ocupado é recusado e não deixa cadastro órfão", async () => {
    const { book } = await setup();
    await book({ customer: walkIn });

    const res = await book({ customer: { name: "Segundo", phone: "11977776666" } });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SLOT_UNAVAILABLE");
    expect(await prisma.customer.count()).toBe(1);
  });

  it("dono e cliente disputando o mesmo horário: só um consegue", async () => {
    const { establishment, service, monday, book } = await setup();
    const clients = await Promise.all(Array.from({ length: 5 }, () => createCustomer(establishment.id)));

    const responses = await Promise.all([
      book({ customer: walkIn }),
      ...clients.map((c) =>
        request(app)
          .post(`/establishments/${establishment.slug}/appointments`)
          .set("Cookie", c.cookie)
          .send({ serviceId: service.id, startsAt: at(monday, 9).toISOString() })
      ),
    ]);

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("exige exatamente um cliente e login de dono", async () => {
    const { establishment, book } = await setup();
    const { customer, cookie } = await createCustomer(establishment.id);

    expect((await book({})).status).toBe(400);
    expect((await book({ customer: walkIn, customerId: customer.id })).status).toBe(400);
    expect((await request(app).post("/admin/appointments").set("Cookie", cookie).send({})).status).toBe(401);
  });

  it("cliente marcado pelo dono consegue criar conta depois, sem ver o histórico anterior", async () => {
    const { establishment, service, monday, book } = await setup();
    await book({ customer: walkIn });
    const slug = establishment.slug;

    const register = await request(app).post(`/establishments/${slug}/customers/register`).send({
      name: "João",
      phone: walkIn.phone,
      email: "joao@teste.com",
      password: "senha-forte-123",
      confirmPassword: "senha-forte-123",
    });
    expect(register.status).toBe(201);
    expect(await prisma.customer.count()).toBe(1);

    const cookie = register.headers["set-cookie"][0];
    const mine = () => request(app).get(`/establishments/${slug}/customers/me/appointments`).set("Cookie", cookie);
    expect((await mine()).body).toHaveLength(0);

    await request(app)
      .post(`/establishments/${slug}/appointments`)
      .set("Cookie", cookie)
      .send({ serviceId: service.id, startsAt: at(monday, 10).toISOString() });
    expect((await mine()).body).toHaveLength(1);
  });

  it("não assume cadastro com e-mail diferente do que o dono registrou", async () => {
    const { establishment, book } = await setup();
    await book({ customer: { ...walkIn, email: "dono-anotou@teste.com" } });

    const res = await request(app).post(`/establishments/${establishment.slug}/customers/register`).send({
      name: "Impostor",
      phone: walkIn.phone,
      email: "outro@teste.com",
      password: "senha-forte-123",
      confirmPassword: "senha-forte-123",
    });

    expect(res.status).toBe(409);
    expect((await prisma.customer.findFirstOrThrow()).passwordHash).toBeNull();
  });
});
