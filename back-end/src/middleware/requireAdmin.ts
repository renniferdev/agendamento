import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getSession } from "@auth/express";
import type { Role } from "@prisma/client";
import { authConfig } from "../lib/auth";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** null enquanto o usuário ainda não completou o onboarding. */
  establishmentId: string | null;
}

export interface AdminUser extends AuthUser {
  establishmentId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      adminUser?: AdminUser;
    }
  }
}

/**
 * Camada 1 — exige apenas uma sessão Auth.js válida.
 *
 * `role` e `establishmentId` são SEMPRE lidos do banco, não do token JWT:
 * o token é gerado no login e ficaria desatualizado depois do onboarding
 * (o usuário criaria o estabelecimento e continuaria "sem vínculo" até
 * relogar). Uma query por requisição é o preço de manter isso correto.
 *
 * Usado por rotas acessíveis antes do onboarding (ex: /onboarding).
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const session = await getSession(req, authConfig);
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

    if (!sessionUserId) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, email: true, role: true, establishmentId: true },
    });

    if (!user) {
      // Sessão válida apontando para usuário apagado do banco.
      res.status(401).json({ error: "Sessão inválida." });
      return;
    }

    req.authUser = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Camada 2 — exige `requireAuth` + vínculo com um estabelecimento.
 *
 * As rotas do painel admin (CRUD de serviços etc.) NUNCA devem confiar em
 * um `establishmentId` vindo do body/query do cliente, apenas em
 * `req.adminUser.establishmentId` — essa é a garantia real do isolamento
 * entre tenants.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);

    const user = req.authUser!;

    if (!user.establishmentId) {
      res.status(403).json({
        error: "Complete o cadastro do seu estabelecimento antes de acessar o painel.",
        code: "ONBOARDING_REQUIRED",
      });
      return;
    }

    req.adminUser = { ...user, establishmentId: user.establishmentId };
    next();
  });
};
