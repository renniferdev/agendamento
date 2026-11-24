import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma";

/**
 * Páginas públicas só funcionam enquanto o dono do estabelecimento estiver
 * liberado (ACTIVE). Conta pendente ou bloqueada (ex: falta de pagamento)
 * tira a página de agendamento do ar. Slug inexistente passa adiante: a rota
 * seguinte responde o 404 de sempre.
 */
export const requireActiveEstablishment: RequestHandler = async (req, res, next) => {
  try {
    const establishment = await prisma.establishment.findUnique({
      where: { slug: req.params.slug },
      select: { users: { where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true }, take: 1 } },
    });
    if (establishment && establishment.users.length === 0) {
      res.status(403).json({
        error: "Esta página de agendamento está temporariamente indisponível.",
        code: "ESTABLISHMENT_INACTIVE",
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
};
