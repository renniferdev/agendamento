import { API_URL, api } from "./api";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface OnboardingStatus {
  onboarded: boolean;
  establishmentId: string | null;
  role: "ADMIN" | "STAFF";
  accountStatus: "PENDING" | "ACTIVE" | "BLOCKED";
  /** Dono da plataforma (acessa /plataforma). */
  isPlatformAdmin: boolean;
  establishment: { name: string; slug: string } | null;
}

/**
 * O Auth.js exige um token CSRF (double-submit: vem no JSON e num cookie)
 * em todo POST de signin/signout. O cookie é gravado na origem do backend
 * por este mesmo request, graças ao `credentials: "include"` do `api()`.
 */
async function getCsrfToken(): Promise<string> {
  const { csrfToken } = await api<{ csrfToken: string }>("/auth/csrf");
  return csrfToken;
}

export async function getSession(): Promise<SessionUser | null> {
  const session = await api<{ user?: SessionUser } | null>("/auth/session");
  return session?.user ?? null;
}

export function getOnboardingStatus(): Promise<OnboardingStatus> {
  return api<OnboardingStatus>("/onboarding/status");
}

/**
 * Login por e-mail/senha. O Auth.js responde com 302 por padrão; o header
 * `X-Auth-Return-Redirect` faz ele devolver `{ url }` em JSON, e a URL de
 * destino indica sucesso (callbackUrl) ou falha (`?error=CredentialsSignin`).
 */
export async function loginWithCredentials(email: string, password: string): Promise<void> {
  const csrfToken = await getCsrfToken();

  const res = await fetch(`${API_URL}/auth/callback/credentials`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken, email, password }),
  });

  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!res.ok || !body?.url) throw new Error("Falha ao entrar. Tente novamente.");
  if (body.url.includes("error=")) throw new Error("E-mail ou senha incorretos.");
}

/**
 * Login com Google: navegação completa (não fetch), porque o Auth.js
 * redireciona o browser para o Google e depois de volta para `callbackUrl`.
 * Precisa ser POST com csrfToken, então montamos um <form> e enviamos.
 */
export async function signInWithGoogle(callbackPath = "/admin"): Promise<void> {
  const csrfToken = await getCsrfToken();

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_URL}/auth/signin/google`;

  const fields: Record<string, string> = {
    csrfToken,
    callbackUrl: `${window.location.origin}${callbackPath}`,
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export async function logout(): Promise<void> {
  const csrfToken = await getCsrfToken();
  await fetch(`${API_URL}/auth/signout`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken }),
  });
}

export function register(name: string, email: string, password: string) {
  return api<{ id: string; name: string; email: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}
