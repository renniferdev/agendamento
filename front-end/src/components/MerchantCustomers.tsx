import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { Alert, Button } from "./ui";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** Clientes finais de uma loja, exibidos no painel da plataforma. */
export function MerchantCustomers({ merchantId }: { merchantId: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Customer[]>(`/platform/merchants/${merchantId}/customers`)
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  async function copyEmails(list: Customer[]) {
    const emails = list.map((c) => c.email).join(", ");
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
  if (customers.length === 0) return <p className="text-sm text-muted">Esta loja ainda não tem clientes.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          {customers.length === 1 ? "1 cliente" : `${customers.length} clientes`}
        </p>
        <Button type="button" variant="secondary" onClick={() => void copyEmails(customers)}>
          {copied ? "E-mails copiados" : "Copiar e-mails"}
        </Button>
      </div>
      <ul className="divide-y divide-line rounded border border-line">
        {customers.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-ink">{c.name}</p>
              <p className="break-all text-ink-soft">{c.email}</p>
            </div>
            <p className="text-xs text-muted">
              {c.phone}, desde {date.format(new Date(c.createdAt))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
