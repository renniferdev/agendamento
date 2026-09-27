import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CenteredPage, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { loginWithCredentials, register } from "../lib/auth";
import { errorMessage } from "../lib/api";

export function RegisterPage() {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(name, email, password);
      // Cadastro só cria o usuário; o login é o mesmo fluxo de sempre.
      await loginWithCredentials(email, password);
      // PublicOnly redireciona para /onboarding (usuário novo não tem estabelecimento).
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <CenteredPage>
      <Card title="Criar conta">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field
            label="Nome"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={8}
            hint="Mínimo de 8 caracteres."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-teal hover:underline">
            Entrar
          </Link>
        </p>
      </Card>
    </CenteredPage>
  );
}
