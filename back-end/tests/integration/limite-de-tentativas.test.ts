import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";

/**
 * O limitador é em memória e por processo; como o vitest isola os módulos por
 * arquivo, este arquivo começa sempre com o contador zerado.
 */
describe("Limite de tentativas nas rotas sensíveis", () => {
  afterAll(() => prisma.$disconnect());

  it("cadastro: a 11ª tentativa em 15 minutos recebe 429", async () => {
    const send = () => request(app).post("/auth/register").send({ name: "x", email: "invalido", password: "1" });

    const first = [];
    for (let i = 0; i < 10; i += 1) first.push(await send());

    // Dados inválidos (400), mas ainda dentro do limite.
    expect(first.every((r) => r.status === 400)).toBe(true);

    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/muitas tentativas/i);
    expect(blocked.headers["ratelimit-remaining"]).toBe("0");
  });

  it("rotas sem limitador, como a página pública, não são afetadas", async () => {
    const res = await request(app).get("/establishments/nao-existe");
    expect(res.status).toBe(404);
  });
});
