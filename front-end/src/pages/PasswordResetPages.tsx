import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, CenteredPage, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";

/** "Esqueci minha senha" do admin — POST /auth/forgot-password. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      // Mensagem genérica do backend: nunca revela se o e-mail existe.
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredPage>
      <Card title="Esqueci minha senha">
        {sent ? (
          <Alert kind="success">Se existir uma conta com este e-mail, enviamos um link de redefinição.</Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          Lembrou a senha?{" "}
          <Link to="/login" className="font-medium text-teal hover:underline">
            Entrar
          </Link>
        </p>
      </Card>
    </CenteredPage>
  );
}

/** Redefinição a partir do link do e-mail — /redefinir-senha?token=... */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredPage>
      <Card title="Redefinir senha">
        {!token ? (
          <Alert>Link inválido. Solicite um novo em "Esqueci minha senha".</Alert>
        ) : done ? (
          <>
            <Alert kind="success">Senha redefinida com sucesso.</Alert>
            <Link to="/login" className="mt-4 block text-center text-sm font-medium text-teal hover:underline">
              Ir para o login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <Field
              label="Nova senha"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              hint="Mínimo de 8 caracteres."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Field
              label="Confirmar nova senha"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </Card>
    </CenteredPage>
  );
}
