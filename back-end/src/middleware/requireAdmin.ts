import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getSession } from "@auth/express";
import type { AccountStatus, Role } from "@prisma/client";
import { authConfig } from "../lib/auth";
import { googleAccountEmail } from "../lib/googleAccount";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** Liberação da conta pelo dono da plataforma (PENDING até ele aprovar). */
  status: AccountStatus;
  /**
   * Dono da plataforma: e-mail igual a PLATFORM_ADMIN_EMAIL E uma conta Google
   * vinculada com esse mesmo e-mail (confirmado pelo Google, não só digitado).
   */
  isPlatformAdmin: boolean;
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
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        establishmentId: true,
        accounts: { where: { provider: "google" }, select: { id_token: true } },
      },
    });

    if (!user) {
      // Sessão válida apontando para usuário apagado do banco.
      res.status(401).json({ error: "Sessão inválida." });
      return;
    }

    const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const isPlatformAdmin =
      !!platformEmail &&
      user.email.toLowerCase() === platformEmail &&
      user.accounts.some((a) => googleAccountEmail(a.id_token) === platformEmail);

    req.authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      establishmentId: user.establishmentId,
      isPlatformAdmin,
    };
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

    if (user.status === "BLOCKED") {
      res.status(403).json({
        error: "Sua conta está bloqueada. Entre em contato com o suporte.",
        code: "ACCOUNT_BLOCKED",
      });
      return;
    }
    if (user.status !== "ACTIVE") {
      res.status(403).json({
        error: "Sua conta ainda está aguardando liberação.",
        code: "ACCOUNT_PENDING",
      });
      return;
    }

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

/**
 * Exige o dono da plataforma. Só existe UM: o e-mail de PLATFORM_ADMIN_EMAIL
 * logado via Google. Sem a variável definida, ninguém acessa.
 */
export const requirePlatformAdmin: RequestHandler = (req, res, next) => {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.authUser!.isPlatformAdmin) {
      res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
      return;
    }
    next();
  });
};
