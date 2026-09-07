import { useState, type FormEvent } from "react";
import { Alert, Button, Card, CenteredPage, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";

/** Mesma regra do backend (onboarding.ts): minúsculas, números e hífens. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function OnboardingPage() {
  const { user, refresh, signOut } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    // Sugere o slug a partir do nome até o usuário editar o slug manualmente.
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/onboarding/establishment", {
        method: "POST",
        body: JSON.stringify({ name, slug, phone: phone.trim() || undefined }),
      });
      // Atualiza onboarded=true; o guard RequireNotOnboarded manda para /admin.
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <CenteredPage>
      <Card title="Cadastre seu estabelecimento">
        <p className="mb-4 text-sm text-gray-600">
          Olá, {user?.name ?? user?.email}. Falta só um passo para acessar o painel.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field
            label="Nome do estabelecimento"
            name="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
          <Field
            label="Slug (endereço da sua página)"
            name="slug"
            required
            minLength={3}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            hint={`Sua página ficará em /${slug || "seu-slug"}. Só letras minúsculas, números e hífens.`}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
          <Field
            label="Telefone (opcional)"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Criando..." : "Criar estabelecimento"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 w-full text-center text-sm text-gray-500 hover:underline"
        >
          Sair
        </button>
      </Card>
    </CenteredPage>
  );
}
