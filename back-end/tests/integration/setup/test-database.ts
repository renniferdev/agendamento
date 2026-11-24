/**
 * Banco usado pelos testes de integração. Padrão: o Postgres do
 * docker-compose.test.yml. Pode ser trocado por TEST_DATABASE_URL (ex: uma
 * branch descartável do Neon, no CI).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/agendamento_test";

/**
 * Trava de segurança: os testes apagam TODAS as tabelas entre um cenário e
 * outro. Por isso se recusam a rodar contra qualquer banco cujo nome não
 * contenha "test" ou que seja o mesmo DATABASE_URL do ambiente.
 */
export function assertSafeTestDatabase(url: string): void {
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Recusando rodar testes de integração: o banco "${databaseName}" não parece ser de teste ` +
        `(o nome precisa conter "test"). Esses testes apagam todas as tabelas.`
    );
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error("TEST_DATABASE_URL não pode ser igual a DATABASE_URL.");
  }
}
