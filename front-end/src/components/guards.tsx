import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AccountStatusScreen } from "./AccountStatusScreen";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper text-muted">
      Carregando...
    </div>
  );
}

/** Exige login. Deslogado → /login. */
export function RequireAuth() {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Exige login + onboarding concluído + conta liberada.
 * Dono da plataforma → /plataforma. Sem estabelecimento → /onboarding.
 * Conta pendente/bloqueada → tela de aviso.
 */
export function RequireOnboarded() {
  const { loading, user, onboarded, accountStatus, isPlatformAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return <Navigate to="/plataforma" replace />;
  if (onboarded === false) return <Navigate to="/onboarding" replace />;
  if (accountStatus && accountStatus !== "ACTIVE") return <AccountStatusScreen status={accountStatus} />;
  return <Outlet />;
}

/** Só para quem ainda NÃO fez onboarding. Já tem estabelecimento → /admin. */
export function RequireNotOnboarded() {
  const { loading, user, onboarded, accountStatus, isPlatformAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return <Navigate to="/plataforma" replace />;
  if (onboarded === true) return <Navigate to="/admin" replace />;
  if (accountStatus === "BLOCKED") return <AccountStatusScreen status="BLOCKED" />;
  return <Outlet />;
}

/** Área do dono da plataforma. Qualquer outro usuário volta para o início. */
export function RequirePlatformAdmin() {
  const { loading, user, isPlatformAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Login/cadastro: quem já está logado é mandado para o lugar certo. */
export function PublicOnly() {
  const { loading, user, onboarded, isPlatformAdmin } = useAuth();
  if (loading) return <Loading />;
  if (user) {
    if (isPlatformAdmin) return <Navigate to="/plataforma" replace />;
    return <Navigate to={onboarded ? "/admin" : "/onboarding"} replace />;
  }
  return <Outlet />;
}
