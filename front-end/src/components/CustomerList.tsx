import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { filterCustomers, formatPhone } from "../lib/customerSearch";
import { Alert, Button, Field } from "./ui";

interface Customer {
  id: string;
  name: string;
  /** null para quem foi marcado pelo dono sem informar e-mail. */
  email: string | null;
  phone: string;
  createdAt: string;
}

const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/**
 * Total, busca e lista de clientes. Usada pelo dono da loja (seus clientes) e
 * pelo dono da plataforma (clientes de cada loja); `endpoint` define a origem.
 */
export function CustomerList({ endpoint }: { endpoint: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Customer[]>(endpoint)
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  async function copyEmails(list: Customer[]) {
    const emails = list.flatMap((c) => c.email ?? []).join(", ");
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie os e-mails:", emails);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!customers) return <p className="text-sm text-muted">Carregando clientes...</p>;
  if (customers.length === 0) {
    return <p className="text-sm text-muted">Nenhum cliente cadastrado ainda.</p>;
  }

  const visible = filterCustomers(customers, search);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          <strong className="text-2xl text-ink">{customers.length}</strong>{" "}
          {customers.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}
        </p>
        {visible.some((c) => c.email) && (
          <Button type="button" variant="secondary" onClick={() => void copyEmails(visible)}>
            {copied ? "E-mails copiados" : "Copiar e-mails"}
          </Button>
        )}
      </div>

      <Field
        label="Buscar por nome, e-mail ou telefone"
        name={`search-${endpoint}`}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Nenhum cliente encontrado.</p>
      ) : (
        <ul className="divide-y divide-line rounded border border-line bg-white">
          {visible.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink">{c.name}</p>
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="break-all text-ink-soft hover:underline">
                    {c.email}
                  </a>
                ) : (
                  <span className="text-muted">Sem e-mail</span>
                )}
              </div>
              <div className="text-right">
                <a href={`tel:${c.phone}`} className="font-medium text-ink-soft hover:underline">
                  {formatPhone(c.phone)}
                </a>
                <p className="text-xs text-muted">Cliente desde {date.format(new Date(c.createdAt))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
