import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Alert, Button, Card, CenteredPage, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { loginWithCredentials, signInWithGoogle } from "../lib/auth";
import { errorMessage } from "../lib/api";

export function LoginPage() {
  const { refresh } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Mensagem opcional vinda do cadastro (state.message).
  const flash = (location.state as { message?: string } | null)?.message;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithCredentials(email, password);
      // refresh() carrega sessão + status; o guard PublicOnly redireciona.
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await signInWithGoogle("/admin");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <CenteredPage>
      <Card title="Entrar">
        <form onSubmit={handleSubmit} className="space-y-4">
          {flash && !error && <Alert kind="success">{flash}</Alert>}
          {error && <Alert>{error}</Alert>}

          <Field
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          ou
          <div className="h-px flex-1 bg-line" />
        </div>

        <Button type="button" variant="secondary" className="w-full" onClick={handleGoogle}>
          Entrar com Google
        </Button>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Não tem conta?{" "}
          <Link to="/registro" className="font-medium text-teal hover:underline">
            Cadastre-se
          </Link>
        </p>
      </Card>
    </CenteredPage>
  );
}
