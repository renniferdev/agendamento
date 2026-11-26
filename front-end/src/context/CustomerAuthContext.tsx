import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getCustomerMe,
  googleSignInCustomer,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  type CustomerSession,
  type GooglePendingProfile,
} from "../lib/customerAuth";

interface CustomerAuthState {
  loading: boolean;
  customer: CustomerSession | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    phone: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<void>;
  /** Devolve o perfil pendente se faltar o telefone; senão entra e devolve null. */
  loginWithGoogle: (credential: string, phone?: string) => Promise<GooglePendingProfile | null>;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

/**
 * Conta do cliente final, escopada por estabelecimento (`slug`) — sessão
 * independente da do admin (`AuthContext`), outro cookie/JWT.
 *
 * Renderizado com `key={slug}` pela página pública (ver PublicBookingPage),
 * então trocar de barbearia no navegador sempre remonta este provider do
 * zero em vez de arrastar a sessão da barbearia anterior.
 */
export function CustomerAuthProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomerMe(slug)
      .then((c) => {
        if (!cancelled) setCustomer(c);
      })
      .catch(() => {
        if (!cancelled) setCustomer(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const login = useCallback(
    async (email: string, password: string) => {
      const c = await loginCustomer(slug, email, password);
      setCustomer(c);
    },
    [slug]
  );

  const register = useCallback(
    async (data: { name: string; phone: string; email: string; password: string; confirmPassword: string }) => {
      const c = await registerCustomer(slug, data);
      setCustomer(c);
    },
    [slug]
  );

  const loginWithGoogle = useCallback(
    async (credential: string, phone?: string) => {
      const result = await googleSignInCustomer(slug, credential, phone);
      if ("needsPhone" in result) return result;
      setCustomer(result);
      return null;
    },
    [slug]
  );

  const logout = useCallback(async () => {
    await logoutCustomer(slug);
    setCustomer(null);
  }, [slug]);

  return (
    <CustomerAuthContext.Provider value={{ loading, customer, login, register, loginWithGoogle, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthState {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth precisa estar dentro de <CustomerAuthProvider>");
  return ctx;
}
