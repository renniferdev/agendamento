import { prisma } from "./prisma";

/**
 * Clientes de um estabelecimento, para o painel do dono e o da plataforma.
 * Seleção explícita: nunca expor hash de senha nem identificador do Google.
 */
export function listEstablishmentCustomers(establishmentId: string) {
  return prisma.customer.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });
}
