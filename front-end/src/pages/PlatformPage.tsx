import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
import { Alert, Button } from "../components/ui";

type Status = "PENDING" | "ACTIVE" | "BLOCKED";

interface Merchant {
  id: string;
  name: string | null;
  email: string;
  status: Status;
  createdAt: string;
  loginMethod: "google" | "email";
  establishment: { name: string; slug: string } | null;
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Pendente",
  ACTIVE: "Liberado",
  BLOCKED: "Bloqueado",
};

const STATUS_STYLE: Record<Status, string> = {
  PENDING: "bg-brass-light text-brass",
  ACTIVE: "bg-success-light text-success",
  BLOCKED: "bg-danger-light text-danger",
};

type Filter = "ALL" | Status;

const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** Painel do dono da plataforma: todos os cadastros, liberar e bloquear. */
export function PlatformPage() {
  const { user, signOut } = useAuth();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMerchants(await api<Merchant[]>("/platform/merchants"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(m: Merchant, status: Status) {
    if (status === "BLOCKED" && !window.confirm(`Bloquear ${m.email}? A página de agendamento sai do ar.`)) return;
    setBusyId(m.id);
    try {
      await api(`/platform/merchants/${m.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMerchants((list) => list.map((x) => (x.id === m.id ? { ...x, status } : x)));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: merchants.length, PENDING: 0, ACTIVE: 0, BLOCKED: 0 };
    for (const m of merchants) c[m.status] += 1;
    return c;
  }, [merchants]);

  const visible = filter === "ALL" ? merchants : merchants.filter((m) => m.status === filter);

  const tabs: { key: Filter; label: string }[] = [
    { key: "ALL", label: "Todos" },
    { key: "PENDING", label: "Pendentes" },
    { key: "ACTIVE", label: "Liberados" },
    { key: "BLOCKED", label: "Bloqueados" },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="font-display text-lg text-ink">Painel da plataforma</span>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{user?.email}</span>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-ink">Comerciantes</h1>
          <Button variant="secondary" onClick={() => void load()}>
            Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`rounded border px-3 py-1.5 text-sm ${
                filter === t.key ? "border-teal bg-teal-light text-ink" : "border-line bg-white text-muted hover:text-ink-soft"
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>

        {error && <Alert>{error}</Alert>}

        {loading ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted">Nenhum cadastro nesta lista.</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((m) => (
              <li key={m.id} className="rounded border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium text-ink">
                      {m.establishment?.name ?? <span className="text-muted">Ainda sem estabelecimento</span>}
                    </p>
                    <p className="truncate text-sm text-ink-soft">
                      {m.name ?? "—"} · {m.email}
                    </p>
                    <p className="text-xs text-muted">
                      Cadastro em {date.format(new Date(m.createdAt))} ·{" "}
                      {m.loginMethod === "google" ? "login Google" : "e-mail e senha"}
                      {m.establishment && (
                        <>
                          {" · "}
                          <a
                            href={`/${m.establishment.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-brass underline underline-offset-2"
                          >
                            /{m.establishment.slug}
                          </a>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[m.status]}`}>
                      {STATUS_LABEL[m.status]}
                    </span>
                    {m.status !== "ACTIVE" && (
                      <Button disabled={busyId === m.id} onClick={() => void setStatus(m, "ACTIVE")}>
                        Liberar
                      </Button>
                    )}
                    {m.status !== "BLOCKED" && (
                      <Button variant="danger" disabled={busyId === m.id} onClick={() => void setStatus(m, "BLOCKED")}>
                        Bloquear
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
