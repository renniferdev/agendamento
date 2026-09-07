import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500">
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

/** Exige login + onboarding concluído. Sem estabelecimento → /onboarding. */
export function RequireOnboarded() {
  const { loading, user, onboarded } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (onboarded === false) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Só para quem ainda NÃO fez onboarding. Já tem estabelecimento → /admin. */
export function RequireNotOnboarded() {
  const { loading, user, onboarded } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (onboarded === true) return <Navigate to="/admin" replace />;
  return <Outlet />;
}

/** Login/cadastro: quem já está logado é mandado para o lugar certo. */
export function PublicOnly() {
  const { loading, user, onboarded } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={onboarded ? "/admin" : "/onboarding"} replace />;
  return <Outlet />;
}
