import crypto from "node:crypto";

/** Validade do link de "esqueci minha senha", para admin e cliente. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Gera o token enviado por e-mail (`token`, nunca gravado no banco) e o hash
 * gravado em `tokenHash` — mesma lógica de nunca guardar a senha em texto
 * puro, aplicada aqui porque quem tiver acesso de leitura ao banco não pode
 * forjar um reset de senha a partir da tabela de tokens.
 */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
