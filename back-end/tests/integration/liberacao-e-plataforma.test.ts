import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import {
  adminCookie,
  at,
  createCustomer,
  createPlatformOwner,
  createTenant,
  nextWeekday,
  resetDatabase,
} from "./helpers/factories";

describe("Liberação de contas (PENDING / ACTIVE / BLOCKED)", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("conta liberada usa o painel", async () => {
    const { owner } = await createTenant({ status: "ACTIVE" });
    const res = await request(app).get("/admin/services").set("Cookie", await adminCookie(owner.id));
    expect(res.status).toBe(200);
  });

  it("conta pendente é barrada no painel com ACCOUNT_PENDING", async () => {
    const { owner } = await createTenant({ status: "PENDING" });
    const res = await request(app).get("/admin/services").set("Cookie", await adminCookie(owner.id));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_PENDING");
  });

  it("conta bloqueada é barrada no painel com ACCOUNT_BLOCKED", async () => {
    const { owner } = await createTenant({ status: "BLOCKED" });
    const res = await request(app).get("/admin/services").set("Cookie", await adminCookie(owner.id));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_BLOCKED");
  });

  it("bloqueio vale na hora, mesmo com a sessão do dono já aberta", async () => {
    const { owner } = await createTenant();
    const cookie = await adminCookie(owner.id);
    expect((await request(app).get("/admin/services").set("Cookie", cookie)).status).toBe(200);

    await prisma.user.update({ where: { id: owner.id }, data: { status: "BLOCKED" } });

    expect((await request(app).get("/admin/services").set("Cookie", cookie)).status).toBe(403);
  });

  it("conta bloqueada não consegue criar estabelecimento", async () => {
    const user = await prisma.user.create({ data: { email: "novo@teste.com", status: "BLOCKED" } });
    const res = await request(app)
      .post("/onboarding/establishment")
      .set("Cookie", await adminCookie(user.id))
      .send({ name: "Minha Loja", slug: "minha-loja" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_BLOCKED");
  });

  it("conta pendente ainda pode cadastrar a loja (para aparecer na fila de liberação)", async () => {
    const user = await prisma.user.create({ data: { email: "novo@teste.com", status: "PENDING" } });
    const res = await request(app)
      .post("/onboarding/establishment")
      .set("Cookie", await adminCookie(user.id))
      .send({ name: "Minha Loja", slug: "minha-loja" });
    expect(res.status).toBe(201);
  });

  it("slug reservado pelo sistema não pode virar loja", async () => {
    const user = await prisma.user.create({ data: { email: "novo@teste.com", status: "ACTIVE" } });
    const res = await request(app)
      .post("/onboarding/establishment")
      .set("Cookie", await adminCookie(user.id))
      .send({ name: "Plataforma", slug: "plataforma" });
    expect(res.status).toBe(400);
  });

  it("usuário criado por cadastro novo nasce pendente", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Maria Silva", email: "maria@teste.com", password: "senha-forte-123" });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "maria@teste.com" } });
    expect(user.status).toBe("PENDING");
  });

  describe("página pública do estabelecimento", () => {
    it("fica no ar com o dono liberado", async () => {
      const { establishment } = await createTenant({ status: "ACTIVE" });
      const res = await request(app).get(`/establishments/${establishment.slug}`);
      expect(res.status).toBe(200);
    });

    it.each(["PENDING", "BLOCKED"] as const)("sai do ar com o dono %s", async (status) => {
      const { establishment, service } = await createTenant({ status });
      const page = await request(app).get(`/establishments/${establishment.slug}`);
      const slots = await request(app).get(
        `/establishments/${establishment.slug}/availability?serviceId=${service.id}&date=2030-01-07`
      );
      expect(page.status).toBe(403);
      expect(page.body.code).toBe("ESTABLISHMENT_INACTIVE");
      expect(slots.status).toBe(403);
    });

    it("loja inexistente continua respondendo 404", async () => {
      expect((await request(app).get("/establishments/nao-existe")).status).toBe(404);
    });

    it("bloquear e liberar de novo não perde nenhum dado, e a página volta", async () => {
      const { establishment, owner, service } = await createTenant();
      const client = await createCustomer(establishment.id);
      const monday = nextWeekday(1);
      await prisma.appointment.create({
        data: {
          establishmentId: establishment.id,
          customerId: client.customer.id,
          serviceId: service.id,
          startsAt: at(monday, 9),
          endsAt: at(monday, 10),
          status: "CONFIRMED",
        },
      });
      const snapshot = async () => ({
        appointments: await prisma.appointment.count(),
        services: await prisma.service.count(),
        customers: await prisma.customer.count(),
        hours: await prisma.businessHour.count(),
      });
      const before = await snapshot();

      await prisma.user.update({ where: { id: owner.id }, data: { status: "BLOCKED" } });
      expect((await request(app).get(`/establishments/${establishment.slug}`)).status).toBe(403);
      await prisma.user.update({ where: { id: owner.id }, data: { status: "ACTIVE" } });

      expect((await request(app).get(`/establishments/${establishment.slug}`)).status).toBe(200);
      expect(await snapshot()).toEqual(before);
    });
  });
});

describe("Área do dono da plataforma (/platform)", () => {
  beforeEach(resetDatabase);

  it("sem login: 401", async () => {
    expect((await request(app).get("/platform/merchants")).status).toBe(401);
  });

  it("dono de loja comum: 403", async () => {
    const { owner } = await createTenant();
    const res = await request(app).get("/platform/merchants").set("Cookie", await adminCookie(owner.id));
    expect(res.status).toBe(403);
  });

  it("e-mail igual ao do dono, mas sem login Google vinculado: 403", async () => {
    const impostor = await createPlatformOwner({ withGoogle: false });
    const res = await request(app).get("/platform/merchants").set("Cookie", await adminCookie(impostor.id));
    expect(res.status).toBe(403);
  });

  it("dono com Google: lista os comerciantes, sem incluir a si mesmo", async () => {
    const platformOwner = await createPlatformOwner({ withGoogle: true });
    const { owner } = await createTenant({ status: "PENDING" });

    const res = await request(app).get("/platform/merchants").set("Cookie", await adminCookie(platformOwner.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: owner.id, status: "PENDING", loginMethod: "email" });
    expect(res.body[0].establishment).toMatchObject({ name: expect.any(String), slug: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("dono libera e bloqueia contas, e o efeito aparece no painel do comerciante", async () => {
    const platformOwner = await createPlatformOwner({ withGoogle: true });
    const { owner } = await createTenant({ status: "PENDING" });
    const platformCookie = await adminCookie(platformOwner.id);
    const merchantCookie = await adminCookie(owner.id);

    const patch = (status: string) =>
      request(app).patch(`/platform/merchants/${owner.id}/status`).set("Cookie", platformCookie).send({ status });

    expect((await request(app).get("/admin/services").set("Cookie", merchantCookie)).status).toBe(403);
    expect((await patch("ACTIVE")).status).toBe(200);
    expect((await request(app).get("/admin/services").set("Cookie", merchantCookie)).status).toBe(200);
    expect((await patch("BLOCKED")).status).toBe(200);
    expect((await request(app).get("/admin/services").set("Cookie", merchantCookie)).status).toBe(403);
  });

  it("dono vê os clientes de cada loja, só daquela loja e sem dados de login", async () => {
    const platformOwner = await createPlatformOwner({ withGoogle: true });
    const a = await createTenant();
    const b = await createTenant();
    const { customer } = await createCustomer(a.establishment.id);
    await createCustomer(b.establishment.id);

    const res = await request(app)
      .get(`/platform/merchants/${a.owner.id}/customers`)
      .set("Cookie", await adminCookie(platformOwner.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: customer.id, email: customer.email, phone: customer.phone });
    expect(Object.keys(res.body[0]).sort()).toEqual(["createdAt", "email", "id", "name", "phone"]);
  });

  it("comerciante comum não acessa a lista de clientes pela plataforma, nem a da própria loja", async () => {
    const { owner } = await createTenant();
    const res = await request(app)
      .get(`/platform/merchants/${owner.id}/customers`)
      .set("Cookie", await adminCookie(owner.id));
    expect(res.status).toBe(403);
  });

  it("comerciante não consegue se liberar sozinho", async () => {
    const { owner } = await createTenant({ status: "PENDING" });
    const res = await request(app)
      .patch(`/platform/merchants/${owner.id}/status`)
      .set("Cookie", await adminCookie(owner.id))
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).status).toBe("PENDING");
  });

  it("dono não altera a própria conta e status inválido é rejeitado", async () => {
    const platformOwner = await createPlatformOwner({ withGoogle: true });
    const cookie = await adminCookie(platformOwner.id);

    const self = await request(app)
      .patch(`/platform/merchants/${platformOwner.id}/status`)
      .set("Cookie", cookie)
      .send({ status: "BLOCKED" });
    const invalid = await request(app)
      .patch(`/platform/merchants/${platformOwner.id}/status`)
      .set("Cookie", cookie)
      .send({ status: "SUPER" });
    const missing = await request(app)
      .patch("/platform/merchants/nao-existe/status")
      .set("Cookie", cookie)
      .send({ status: "ACTIVE" });

    expect(self.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});
