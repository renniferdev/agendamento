import { TEST_DATABASE_URL, assertSafeTestDatabase } from "./test-database";

/**
 * Roda no início de cada arquivo de teste, ANTES de qualquer import do app.
 * O Prisma lê DATABASE_URL na primeira query, e o vitest não carrega o .env
 * do projeto — então nada daqui encosta no banco real.
 */
assertSafeTestDatabase(TEST_DATABASE_URL);

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.NEXTAUTH_SECRET = "segredo-somente-para-testes-0123456789abcdef";
process.env.CUSTOMER_JWT_SECRET = "segredo-clientes-somente-para-testes-0123456789";
process.env.AUTH_TRUST_HOST = "true";
process.env.PLATFORM_ADMIN_EMAIL = "dono@plataforma.test";
// Definir (mesmo vazio) impede o Prisma de preencher a partir do .env local:
// sem chave do Resend nenhum e-mail real é enviado durante os testes.
process.env.RESEND_API_KEY = "";
process.env.GOOGLE_CLIENT_ID = "teste";
process.env.GOOGLE_CLIENT_SECRET = "teste";
process.env.FRONTEND_URL = "http://localhost:5173";
