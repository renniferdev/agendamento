import { OAuth2Client } from "google-auth-library";

/**
 * Validação do ID token do botão "Continuar com Google" (Google Identity
 * Services), usado pelo cliente final. É independente do login do painel, que
 * passa pelo Auth.js.
 */

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  /** true quando o Google administra o endereço (Gmail ou domínio Workspace). */
  emailIsAuthoritative: boolean;
}

export class InvalidGoogleCredentialError extends Error {
  constructor() {
    super("Não foi possível confirmar sua conta Google. Tente novamente.");
  }
}

const client = new OAuth2Client();

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("GOOGLE_CLIENT_ID não configurada.");

  let payload;
  try {
    // Confere assinatura, emissor, validade e se o token foi emitido para ESTE app.
    const ticket = await client.verifyIdToken({ idToken: credential, audience });
    payload = ticket.getPayload();
  } catch {
    throw new InvalidGoogleCredentialError();
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new InvalidGoogleCredentialError();
  }

  const email = payload.email.toLowerCase();
  return {
    sub: payload.sub,
    email,
    name: payload.name?.trim() || email.split("@")[0],
    emailIsAuthoritative: email.endsWith("@gmail.com") || !!payload.hd,
  };
}
