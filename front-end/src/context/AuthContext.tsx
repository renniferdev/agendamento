import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getOnboardingStatus, getSession, logout, type SessionUser } from "../lib/auth";

interface AuthState {
  /** true até a primeira consulta a /auth/session terminar. */
  loading: boolean;
  user: SessionUser | null;
  /** null enquanto não há usuário ou o status ainda não foi carregado. */
  onboarded: boolean | null;
  /** Liberação da conta pelo dono da plataforma. */
  accountStatus: "PENDING" | "ACTIVE" | "BLOCKED" | null;
  isPlatformAdmin: boolean;
  /** Estabelecimento do usuário (para o link público no painel); null antes do onboarding. */
  establishment: { name: string; slug: string } | null;
  /** Reconsulta sessão + status de onboarding (chamar após login/onboarding). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [accountStatus, setAccountStatus] = useState<AuthState["accountStatus"]>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [establishment, setEstablishment] = useState<AuthState["establishment"]>(null);

  const refresh = useCallback(async () => {
    try {
      const sessionUser = await getSession();
      setUser(sessionUser);
      if (sessionUser) {
        const status = await getOnboardingStatus();
        setOnboarded(status.onboarded);
        setAccountStatus(status.accountStatus);
        setIsPlatformAdmin(status.isPlatformAdmin);
        setEstablishment(status.establishment);
      } else {
        setOnboarded(null);
        setAccountStatus(null);
        setIsPlatformAdmin(false);
        setEstablishment(null);
      }
    } catch {
      // Backend fora do ar ou sessão inválida: trata como deslogado.
      setUser(null);
      setOnboarded(null);
      setAccountStatus(null);
      setIsPlatformAdmin(false);
      setEstablishment(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
    setOnboarded(null);
    setAccountStatus(null);
    setIsPlatformAdmin(false);
    setEstablishment(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ loading, user, onboarded, accountStatus, isPlatformAdmin, establishment, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
