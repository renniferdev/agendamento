import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import {
  adminCookie,
  at,
  createCustomer,
  createTenant,
  dateParam,
  nextWeekday,
  resetDatabase,
} from "./helpers/factories";

/**
 * Multi-tenant: um estabelecimento nunca pode ler nem alterar dados de outro,
 * mesmo conhecendo os IDs. Aqui o "atacante" é o dono da empresa A tentando
 * alcançar os recursos da empresa B.
 */
describe("Isolamento entre empresas (multi-tenant)", () => {
  let a: Awaited<ReturnType<typeof seedTenant>>;
  let b: Awaited<ReturnType<typeof seedTenant>>;
  let cookieA: string;

  async function seedTenant() {
    const tenant = await createTenant();
    const monday = nextWeekday(1);
    const client = await createCustomer(tenant.establishment.id);
    const appointment = await prisma.appointment.create({
      data: {
        establishmentId: tenant.establishment.id,
        customerId: client.customer.id,
        serviceId: tenant.service.id,
        startsAt: at(monday, 9),
        endsAt: at(monday, 10),
        status: "CONFIRMED",
      },
    });
    const blocked = await prisma.blockedSlot.create({
      data: { establishmentId: tenant.establishment.id, startsAt: at(monday, 11), endsAt: at(monday, 12) },
    });
    const hour = await prisma.businessHour.findFirstOrThrow({
      where: { establishmentId: tenant.establishment.id },
    });
    return { ...tenant, client, appointment, blocked, hour };
  }

  beforeAll(async () => {
    await resetDatabase();
    a = await seedTenant();
    b = await seedTenant();
    cookieA = await adminCookie(a.owner.id);
  });
  afterAll(() => prisma.$disconnect());

  const asA = (method: "get" | "post" | "put" | "patch" | "delete", url: string) =>
    request(app)[method](url).set("Cookie", cookieA);

  describe("listagens do painel só devolvem dados da própria empresa", () => {
    it("serviços", async () => {
      const res = await asA("get", "/admin/services");
      expect(res.status).toBe(200);
      expect(res.body.map((s: { id: string }) => s.id)).toEqual([a.service.id]);
    });

    it("horários de funcionamento", async () => {
      const res = await asA("get", "/admin/business-hours");
      expect(res.status).toBe(200);
      expect(res.body.map((h: { id: string }) => h.id)).toEqual([a.hour.id]);
    });

    it("bloqueios de agenda", async () => {
      const res = await asA("get", "/admin/blocked-slots");
      expect(res.status).toBe(200);
      expect(res.body.map((x: { id: string }) => x.id)).toEqual([a.blocked.id]);
    });

    it("clientes, sem dados de login", async () => {
      const res = await asA("get", "/admin/customers");
      expect(res.status).toBe(200);
      expect(res.body.map((c: { id: string }) => c.id)).toEqual([a.client.customer.id]);
      expect(Object.keys(res.body[0]).sort()).toEqual(["createdAt", "email", "id", "name", "phone"]);
    });

    it("agendamentos", async () => {
      const res = await asA("get", `/admin/appointments?from=${dateParam(new Date())}`);
      expect(res.status).toBe(200);
      expect(res.body.map((x: { id: string }) => x.id)).toEqual([a.appointment.id]);
    });
  });

  describe("recursos de outra empresa respondem 404 e permanecem intactos", () => {
    it("serviço: ler, editar, ativar/desativar e excluir", async () => {
      expect((await asA("get", `/admin/services/${b.service.id}`)).status).toBe(404);
      expect(
        (await asA("put", `/admin/services/${b.service.id}`).send({ name: "Invadido", durationMinutes: 5, priceCents: 1 }))
          .status
      ).toBe(404);
      expect((await asA("patch", `/admin/services/${b.service.id}/toggle-active`)).status).toBe(404);
      expect((await asA("delete", `/admin/services/${b.service.id}`)).status).toBe(404);

      const untouched = await prisma.service.findUniqueOrThrow({ where: { id: b.service.id } });
      expect(untouched.name).toBe(b.service.name);
      expect(untouched.active).toBe(true);
    });

    it("horário de funcionamento: editar e excluir", async () => {
      expect(
        (await asA("put", `/admin/business-hours/${b.hour.id}`).send({ dayOfWeek: 2, startTime: "08:00", endTime: "09:00" }))
          .status
      ).toBe(404);
      expect((await asA("delete", `/admin/business-hours/${b.hour.id}`)).status).toBe(404);
      expect(await prisma.businessHour.count({ where: { id: b.hour.id } })).toBe(1);
    });

    it("bloqueio de agenda: excluir", async () => {
      expect((await asA("delete", `/admin/blocked-slots/${b.blocked.id}`)).status).toBe(404);
      expect(await prisma.blockedSlot.count({ where: { id: b.blocked.id } })).toBe(1);
    });

    it("agendamento: cancelar", async () => {
      expect((await asA("patch", `/admin/appointments/${b.appointment.id}/cancel`)).status).toBe(404);
      const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointment.id } });
      expect(untouched.status).toBe("CONFIRMED");
    });
  });

  it("establishmentId enviado no corpo é ignorado: o serviço nasce na empresa do token", async () => {
    const res = await asA("post", "/admin/services").send({
      name: "Tentativa de injeção",
      durationMinutes: 30,
      priceCents: 1000,
      establishmentId: b.establishment.id,
    });

    expect(res.status).toBe(201);
    const created = await prisma.service.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(created.establishmentId).toBe(a.establishment.id);
  });

  describe("página pública e sessão de cliente", () => {
    it("disponibilidade da loja A não aceita serviço da loja B", async () => {
      const res = await request(app).get(
        `/establishments/${a.establishment.slug}/availability?serviceId=${b.service.id}&date=${dateParam(nextWeekday(1))}`
      );
      expect(res.status).toBe(404);
    });

    it("agendar na loja A com serviço da loja B é recusado", async () => {
      const res = await request(app)
        .post(`/establishments/${a.establishment.slug}/appointments`)
        .set("Cookie", a.client.cookie)
        .send({ serviceId: b.service.id, startsAt: at(nextWeekday(1, 14), 9).toISOString() });
      expect(res.status).toBe(404);
    });

    it("sessão de cliente da loja A não vale na loja B", async () => {
      const res = await request(app)
        .post(`/establishments/${b.establishment.slug}/appointments`)
        .set("Cookie", a.client.cookie)
        .send({ serviceId: b.service.id, startsAt: at(nextWeekday(1, 14), 9).toISOString() });
      expect(res.status).toBe(401);
    });

    it("cliente da loja A não lê o perfil nem os agendamentos de outra loja", async () => {
      const me = await request(app).get(`/establishments/${b.establishment.slug}/customers/me`).set("Cookie", a.client.cookie);
      const list = await request(app)
        .get(`/establishments/${b.establishment.slug}/customers/me/appointments`)
        .set("Cookie", a.client.cookie);
      expect(me.status).toBe(401);
      expect(list.status).toBe(401);
    });
  });

  describe("sem login não há acesso ao painel", () => {
    it.each([
      ["get", "/admin/services"],
      ["post", "/admin/services"],
      ["get", "/admin/business-hours"],
      ["get", "/admin/blocked-slots"],
      ["get", "/admin/appointments"],
      ["get", "/admin/customers"],
    ] as const)("%s %s responde 401", async (method, url) => {
      expect((await request(app)[method](url)).status).toBe(401);
    });
  });
});
