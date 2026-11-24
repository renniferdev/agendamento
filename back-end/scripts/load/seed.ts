/**
 * Prepara o banco de TESTE para o teste de carga: 7 estabelecimentos (o porte
 * do primeiro lote de clientes), cada um com serviço, expediente de segunda a
 * sábado e uma base de clientes já autenticados. Os cookies de sessão dos
 * clientes são gravados em tokens.json para o k6 usar, o que evita passar
 * pelo cadastro (que tem limite de tentativas) a cada requisição.
 *
 *   npm run test:db:up
 *   DATABASE_URL=<banco de teste> npx prisma migrate deploy
 *   CUSTOMER_JWT_SECRET=carga-local npm run load:seed
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { TEST_DATABASE_URL, assertSafeTestDatabase } from "../../tests/integration/setup/test-database";

const TENANTS = 7;
const CUSTOMERS_PER_TENANT = 40;

async function main() {
  assertSafeTestDatabase(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.CUSTOMER_JWT_SECRET ??= "carga-local";

  const { prisma } = await import("../../src/lib/prisma");
  const { signCustomerJwt } = await import("../../src/lib/customerAuth");

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "appointments","customers","services","business_hours","blocked_slots","users","establishments" RESTART IDENTITY CASCADE'
  );

  const out: { slug: string; serviceId: string; tokens: string[] }[] = [];

  for (let t = 1; t <= TENANTS; t += 1) {
    const establishment = await prisma.establishment.create({
      data: {
        name: `Loja de carga ${t}`,
        slug: `loja-carga-${t}`,
        businessHours: {
          create: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "18:00" })),
        },
      },
    });
    await prisma.user.create({
      data: { email: `dono-carga-${t}@teste.com`, status: "ACTIVE", role: "ADMIN", establishmentId: establishment.id },
    });
    const service = await prisma.service.create({
      data: { establishmentId: establishment.id, name: "Corte", durationMinutes: 30, priceCents: 4000 },
    });

    const tokens: string[] = [];
    for (let c = 1; c <= CUSTOMERS_PER_TENANT; c += 1) {
      const customer = await prisma.customer.create({
        data: {
          establishmentId: establishment.id,
          name: `Cliente ${t}-${c}`,
          phone: `119${String(t).padStart(2, "0")}${String(c).padStart(5, "0")}`,
          email: `cliente-${t}-${c}@teste.com`,
          passwordHash: "hash-de-teste",
        },
      });
      tokens.push(signCustomerJwt({ customerId: customer.id, establishmentId: establishment.id }));
    }
    out.push({ slug: establishment.slug, serviceId: service.id, tokens });
  }

  writeFileSync(path.join(__dirname, "tokens.json"), JSON.stringify(out));
  console.log(`Seed pronto: ${TENANTS} lojas x ${CUSTOMERS_PER_TENANT} clientes (tokens.json).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
