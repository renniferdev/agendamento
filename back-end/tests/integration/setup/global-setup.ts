import { execSync } from "node:child_process";
import { TEST_DATABASE_URL, assertSafeTestDatabase } from "./test-database";

/** Uma vez por execução: aplica as migrations no banco de teste. */
export default function setup(): void {
  assertSafeTestDatabase(TEST_DATABASE_URL);

  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });
  } catch (err) {
    const output = String((err as { stderr?: Buffer }).stderr ?? err);
    throw new Error(
      "Não foi possível preparar o banco de teste.\n" +
        "Suba o Postgres de teste com:\n" +
        "  docker compose -f docker-compose.test.yml up -d --wait\n\n" +
        output
    );
  }
}
