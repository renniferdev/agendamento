import type { Request } from "express";
import rateLimit from "express-rate-limit";

/**
 * Limites das rotas de login/cadastro/reset de senha, para dificultar força
 * bruta e abuso. Aplicados só nos endpoints sensíveis, nunca de forma global.
 */

const OPTIONS = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
};

/**
 * Por IP. É folgado de propósito: atrás dos proxies (e do Wi-Fi de uma loja)
 * várias pessoas podem chegar com o mesmo endereço.
 */
export const authLimiter = rateLimit({ ...OPTIONS, limit: 60 });

function emailOf(req: Request): string {
  const email: unknown = req.body?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Por conta (e-mail dentro da loja). Não depende do IP: trocar de endereço não
 * dá novas tentativas contra a mesma senha. Cada chamada tem contador próprio.
 */
export function accountLimiter() {
  return rateLimit({
    ...OPTIONS,
    limit: 10,
    keyGenerator: (req) => `${req.params?.slug ?? ""}|${emailOf(req)}`,
    skip: (req) => !emailOf(req),
  });
}
