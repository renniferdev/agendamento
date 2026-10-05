import rateLimit from "express-rate-limit";

/**
 * Limita tentativas nas rotas de login/cadastro/reset de senha por IP —
 * dificulta força bruta de senha e enumeração de contas. Aplicado só nos
 * endpoints sensíveis (não em /me, /logout etc.), nunca de forma global.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
