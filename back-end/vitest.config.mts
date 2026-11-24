import { defineConfig } from "vitest/config";

// Testes unitários (sem banco). Os de integração têm config própria:
// ver vitest.integration.config.mts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
