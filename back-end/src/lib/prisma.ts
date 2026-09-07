import { PrismaClient } from "@prisma/client";

// Evita múltiplas instâncias do PrismaClient durante hot-reload em dev
// (cada `tsx watch` reload recriaria o client e esgotaria conexões).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
