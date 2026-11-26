export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

/**
 * fetch com as convenções do backend: JSON, `credentials: "include"` (envia
 * o cookie de sessão do Auth.js mesmo estando em outra origem) e erro
 * tipado com a mensagem/código que o backend devolve em `{ error, code }`.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Erro ${res.status}`, body?.code, body?.details);
  }
  return body as T;
}

/** Extrai uma mensagem legível de qualquer erro (ApiError, zod details, rede). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // Falha do servidor (5xx): o usuário não precisa ver o detalhe técnico.
    if (err.status >= 500) {
      return "Não foi possível concluir agora. Tente novamente em alguns instantes.";
    }
    const issues = err.details as { message?: string }[] | undefined;
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    return err.message;
  }
  if (err instanceof TypeError) return "Não foi possível conectar ao servidor.";
  return err instanceof Error ? err.message : "Erro inesperado.";
}
