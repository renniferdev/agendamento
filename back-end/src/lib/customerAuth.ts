import jwt from "jsonwebtoken";

/**
 * Sessão de login do cliente final. Independente do Auth.js usado pelo
 * `User` (admin/staff) — JWT próprio, secret próprio, cookie próprio. Nunca
 * misturar com `NEXTAUTH_SECRET` nem com o cookie de sessão do admin.
 */

export interface CustomerJwtPayload {
  customerId: string;
  establishmentId: string;
}

export const CUSTOMER_SESSION_COOKIE = "customer_session";
const EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function secret(): string {
  const value = process.env.CUSTOMER_JWT_SECRET;
  if (!value) throw new Error("CUSTOMER_JWT_SECRET não configurada.");
  return value;
}

export function signCustomerJwt(payload: CustomerJwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: EXPIRES_IN_SECONDS });
}

/** Lança se o token for inválido/expirado. */
export function verifyCustomerJwt(token: string): CustomerJwtPayload {
  return jwt.verify(token, secret()) as CustomerJwtPayload;
}

/**
 * Em produção o front e o back normalmente ficam em domínios diferentes
 * (cross-site) e só é possível enviar cookie nesse caso com
 * `SameSite=None; Secure` — que por sua vez exige HTTPS. Em dev, front e
 * back são portas diferentes do mesmo `localhost` (same-site), então
 * `Lax` já basta e evita depender de HTTPS local.
 */
export function customerSessionCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    maxAge: EXPIRES_IN_SECONDS * 1000,
    path: "/",
  };
}
