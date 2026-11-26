import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app";
import {
  InvalidGoogleCredentialError,
  verifyGoogleCredential,
  type GoogleIdentity,
} from "../../src/lib/googleIdentity";
import { prisma } from "../../src/lib/prisma";
import { createTenant, resetDatabase } from "./helpers/factories";

// A validação do token depende do Google; aqui ela é simulada e testamos as
// regras da nossa API.
vi.mock("../../src/lib/googleIdentity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/googleIdentity")>()),
  verifyGoogleCredential: vi.fn(),
}));

const identity: GoogleIdentity = {
  sub: "google-123",
  email: "ana@gmail.com",
  name: "Ana Souza",
  emailIsAuthoritative: true,
};

function googleLogin(slug: string, body: Record<string, string> = {}) {
  return request(app)
    .post(`/establishments/${slug}/customers/google`)
    .send({ credential: "token-do-google", ...body });
}

describe("Cliente final: entrar com Google", () => {
  // O limite de tentativas (10 por IP) vale para o arquivo inteiro: manter os
  // cenários enxutos.
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(verifyGoogleCredential).mockResolvedValue(identity);
  });
  afterAll(() => prisma.$disconnect());

  it("conta nova pede o telefone, depois cria, e o próximo acesso entra direto", async () => {
    const { establishment } = await createTenant();

    const first = await googleLogin(establishment.slug);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ needsPhone: true, email: identity.email });
    expect(await prisma.customer.count()).toBe(0);

    const created = await googleLogin(establishment.slug, { phone: "(11) 99999-8888" });
    expect(created.status).toBe(201);
    expect(created.body.phone).toBe("11999998888");
    expect(created.headers["set-cookie"][0]).toContain("customer_session=");

    const again = await googleLogin(establishment.slug);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(created.body.id);
  });

  it("vincula a conta de mesmo e-mail e invalida a senha antiga", async () => {
    const { establishment } = await createTenant();
    const existing = await prisma.customer.create({
      data: {
        establishmentId: establishment.id,
        name: "Ana",
        email: identity.email,
        phone: "11911112222",
        passwordHash: "hash-antigo",
      },
    });

    const res = await googleLogin(establishment.slug);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    const linked = await prisma.customer.findUniqueOrThrow({ where: { id: existing.id } });
    expect(linked.googleSub).toBe(identity.sub);
    expect(linked.passwordHash).toBeNull();

    const password = await request(app)
      .post(`/establishments/${establishment.slug}/customers/login`)
      .send({ email: identity.email, password: "qualquer-senha" });
    expect(password.status).toBe(401);
  });

  it("não vincula quando o Google não administra o e-mail", async () => {
    const { establishment } = await createTenant();
    await prisma.customer.create({
      data: {
        establishmentId: establishment.id,
        name: "Ana",
        email: identity.email,
        phone: "11911112222",
        passwordHash: "hash-antigo",
      },
    });
    vi.mocked(verifyGoogleCredential).mockResolvedValue({ ...identity, emailIsAuthoritative: false });

    const res = await googleLogin(establishment.slug);

    expect(res.status).toBe(409);
    expect((await prisma.customer.findFirstOrThrow()).passwordHash).toBe("hash-antigo");
  });

  it("a mesma conta Google é um cliente separado em cada loja", async () => {
    const a = await createTenant();
    const b = await createTenant();
    await googleLogin(a.establishment.slug, { phone: "11999998888" });

    const res = await googleLogin(b.establishment.slug);

    expect(res.body.needsPhone).toBe(true);
  });

  it("token inválido responde 401 com mensagem amigável", async () => {
    const { establishment } = await createTenant();
    vi.mocked(verifyGoogleCredential).mockRejectedValue(new InvalidGoogleCredentialError());

    const res = await googleLogin(establishment.slug);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/conta Google/);
  });

  it("loja bloqueada não aceita login", async () => {
    const { establishment } = await createTenant({ status: "BLOCKED" });
    expect((await googleLogin(establishment.slug)).status).toBe(403);
  });
});
