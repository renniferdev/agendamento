import { defineConfig } from "vitest/config";

// Testes de integração: API real (supertest) + Postgres de teste.
// Arquivos rodam em sequência porque compartilham o mesmo banco.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/setup/global-setup.ts"],
    setupFiles: ["tests/integration/setup/env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
