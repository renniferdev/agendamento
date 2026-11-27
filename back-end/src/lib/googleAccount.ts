/**
 * E-mail confirmado pelo Google no ID token gravado ao vincular a conta. O token
 * vem direto do Google para o servidor (nunca do navegador), então basta ler o
 * conteúdo. Devolve null se não houver e-mail verificado.
 */
export function googleAccountEmail(idToken: string | null | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.email_verified === true && typeof claims.email === "string"
      ? claims.email.toLowerCase()
      : null;
  } catch {
    return null;
  }
}
