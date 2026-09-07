import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getOnboardingStatus, getSession, logout, type SessionUser } from "../lib/auth";

interface AuthState {
  /** true até a primeira consulta a /auth/session terminar. */
  loading: boolean;
  user: SessionUser | null;
  /** null enquanto não há usuário ou o status ainda não foi carregado. */
  onboarded: boolean | null;
  /** Reconsulta sessão + status de onboarding (chamar após login/onboarding). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const sessionUser = await getSession();
      setUser(sessionUser);
      if (sessionUser) {
        const status = await getOnboardingStatus();
        setOnboarded(status.onboarded);
      } else {
        setOnboarded(null);
      }
    } catch {
      // Backend fora do ar ou sessão inválida: trata como deslogado.
      setUser(null);
      setOnboarded(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
    setOnboarded(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ loading, user, onboarded, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
