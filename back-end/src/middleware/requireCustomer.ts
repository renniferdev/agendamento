import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../lib/prisma";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerJwt } from "../lib/customerAuth";

export interface CustomerAuth {
  customerId: string;
  establishmentId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: CustomerAuth;
    }
  }
}

/**
 * Exige sessão de cliente válida PARA O ESTABELECIMENTO da rota atual
 * (`:slug`). O ponto crítico é a checagem final: um token emitido para a
 * barbearia A não pode ser aceito numa rota da barbearia B, mesmo sendo o
 * mesmo `customerId` (contas de cliente são isoladas por estabelecimento).
 */
export const requireCustomer: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.[CUSTOMER_SESSION_COOKIE] as string | undefined;
    if (!token) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    let payload;
    try {
      payload = verifyCustomerJwt(token);
    } catch {
      res.status(401).json({ error: "Sessão inválida ou expirada." });
      return;
    }

    const establishment = await prisma.establishment.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    });
    if (!establishment || payload.establishmentId !== establishment.id) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    req.customer = payload;
    next();
  } catch (err) {
    next(err);
  }
};
