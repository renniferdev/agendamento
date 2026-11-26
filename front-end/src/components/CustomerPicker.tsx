import { useState } from "react";
import { filterCustomers, formatPhone } from "../lib/customerSearch";
import { Button, Field } from "./ui";

export interface PickableCustomer {
  id: string;
  name: string;
  phone: string;
}

const MAX_RESULTS = 8;

/**
 * Encontrar um cliente já cadastrado digitando o nome (ou o telefone). Os
 * resultados aparecem na própria página, sem caixa com rolagem.
 */
export function CustomerPicker({
  customers,
  selected,
  onSelect,
}: {
  customers: PickableCustomer[];
  selected: PickableCustomer | null;
  onSelect: (customer: PickableCustomer | null) => void;
}) {
  const [search, setSearch] = useState("");

  if (selected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-teal bg-teal-light px-3 py-3">
        <p className="min-w-0 text-ink">
          <strong>{selected.name}</strong>
          <span className="block text-sm text-ink-soft">{formatPhone(selected.phone)}</span>
        </p>
        <Button type="button" variant="secondary" onClick={() => onSelect(null)}>
          Trocar cliente
        </Button>
      </div>
    );
  }

  const results = search.trim() ? filterCustomers(customers, search) : [];

  return (
    <div className="space-y-2">
      <Field
        label="Digite o nome ou o telefone do cliente"
        name="customerSearch"
        type="search"
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        // Enter na busca não deve enviar o agendamento.
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />

      <div aria-live="polite">
        {customers.length === 0 ? (
          <p className="text-sm text-muted">Você ainda não tem clientes cadastrados. Use “Cliente novo”.</p>
        ) : !search.trim() ? null : results.length === 0 ? (
          <p className="text-sm text-muted">Nenhum cliente encontrado. Confira o nome ou use “Cliente novo”.</p>
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded border border-line">
              {results.slice(0, MAX_RESULTS).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      onSelect(c);
                    }}
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-4 px-3 py-3 text-left hover:bg-teal-light"
                  >
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="text-sm text-muted">{formatPhone(c.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {results.length > MAX_RESULTS && (
              <p className="mt-2 text-sm text-muted">
                Mostrando {MAX_RESULTS} de {results.length}. Digite mais letras para encontrar.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
