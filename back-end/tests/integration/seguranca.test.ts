import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { authConfig } from "../../src/lib/auth";
import { prisma } from "../../src/lib/prisma";
import { adminCookie, createTenant, googleIdToken, resetDatabase } from "./helpers/factories";

const PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL!;

/** Faz o login por e-mail e senha como o navegador: token CSRF + formulário. */
async function loginOwner(email: string, password: string) {
  const agent = request.agent(app);
  const { body } = await agent.get("/auth/csrf");
  const res = await agent
    .post("/auth/callback/credentials")
    .set("X-Auth-Return-Redirect", "1")
    .type("form")
    .send({ csrfToken: body.csrfToken, email, password });
  return { agent, res };
}

describe("Segurança", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  describe("vínculo de conta Google", () => {
    const link = (userId: string, email: string) =>
      authConfig.adapter.linkAccount!({
        userId,
        type: "oidc",
        provider: "google",
        providerAccountId: `google-${email}`,
        id_token: googleIdToken(email),
      });

    it("recusa pendurar o Google de outra pessoa numa conta", async () => {
      const { owner } = await createTenant();

      await expect(link(owner.id, "invasor@gmail.com")).rejects.toThrow(/recusado/);
      expect(await prisma.account.count()).toBe(0);
    });

    it("aceita o Google do mesmo e-mail", async () => {
      const { owner } = await createTenant();

      await link(owner.id, owner.email.toUpperCase());

      expect(await prisma.account.count()).toBe(1);
    });

    it("não vira dono da plataforma com um Google de outro e-mail já vinculado", async () => {
      const impostor = await prisma.user.create({
        data: {
          email: PLATFORM_EMAIL,
          status: "ACTIVE",
          accounts: {
            create: {
              type: "oidc",
              provider: "google",
              providerAccountId: "google-invasor",
              id_token: googleIdToken("invasor@gmail.com"),
            },
          },
        },
      });

      const res = await request(app).get("/platform/merchants").set("Cookie", await adminCookie(impostor.id));

      expect(res.status).toBe(403);
    });
  });

  it("login por e-mail e senha continua funcionando, com cookie protegido", async () => {
    const { owner } = await createTenant();
    await prisma.user.update({
      where: { id: owner.id },
      data: { passwordHash: await bcrypt.hash("senha-correta-123", 10) },
    });

    const { agent, res } = await loginOwner(owner.email, "senha-correta-123");

    const session = [res.headers["set-cookie"]].flat().find((c) => c?.startsWith("authjs.session-token="));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect((await agent.get("/admin/services")).status).toBe(200);
  });

  it("dados do painel não ficam em cache", async () => {
    const { owner } = await createTenant();
    const res = await request(app).get("/admin/customers").set("Cookie", await adminCookie(owner.id));
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("login do dono: 10 tentativas por conta, sem travar as outras contas", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await loginOwner("alvo@teste.com", "errada")).res.status).not.toBe(429);
    }

    expect((await loginOwner("ALVO@teste.com", "errada")).res.status).toBe(429);
    expect((await loginOwner("outra@teste.com", "errada")).res.status).not.toBe(429);
  });

  it("login do cliente: o limite vale por conta e também pelo caminho /api", async () => {
    const { establishment } = await createTenant();
    const login = (prefix: string) =>
      request(app)
        .post(`${prefix}/establishments/${establishment.slug}/customers/login`)
        .send({ email: "cliente@teste.com", password: "errada" });

    for (let i = 0; i < 10; i += 1) expect((await login(i % 2 ? "/api" : "")).status).toBe(401);

    expect((await login("/api")).status).toBe(429);
    expect((await login("")).status).toBe(429);
  });
});
