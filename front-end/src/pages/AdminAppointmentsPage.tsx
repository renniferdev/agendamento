import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { Alert, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";

type Status = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: Status;
  customer: { name: string; phone: string; email: string | null };
  service: { name: string; durationMinutes: number; priceCents: number };
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatPhone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export function AdminAppointmentsPage() {
  const [from, setFrom] = useState(todayInputValue);
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Appointment[]>(`/admin/appointments?from=${from}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(a: Appointment) {
    const when = `${dateFmt.format(new Date(a.startsAt))} ${timeFmt.format(new Date(a.startsAt))}`;
    if (!window.confirm(`Cancelar o agendamento de ${a.customer.name} em ${when}? O horário volta a ficar disponível.`)) return;
    setError(null);
    try {
      await api(`/admin/appointments/${a.id}/cancel`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AdminLayout title="Agendamentos">
      {error && <Alert>{error}</Alert>}

      <div className="max-w-xs">
        <Field label="A partir de" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>

      <section className="overflow-x-auto rounded border border-line bg-white">
        {loading ? (
          <p className="p-4 text-sm text-muted">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nenhum agendamento a partir dessa data.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Serviço</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((a) => {
                const inactive = a.status === "CANCELLED" || a.status === "COMPLETED";
                return (
                  <tr key={a.id} className={inactive ? "text-muted" : ""}>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">
                      <div className="font-medium text-ink">{dateFmt.format(new Date(a.startsAt))}</div>
                      <div>
                        {timeFmt.format(new Date(a.startsAt))} – {timeFmt.format(new Date(a.endsAt))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{a.customer.name}</div>
                      <div className="text-xs">{formatPhone(a.customer.phone)}</div>
                      {a.customer.email && <div className="text-xs">{a.customer.email}</div>}
                    </td>
                    <td className="px-4 py-2">
                      <div>{a.service.name}</div>
                      <div className="text-xs">
                        {a.service.durationMinutes} min · {brl.format(a.service.priceCents / 100)}
                      </div>
                    </td>
                    <td className="px-4 py-2">{STATUS_LABEL[a.status]}</td>
                    <td className="px-4 py-2 text-right">
                      {!inactive && (
                        <button className="text-danger hover:underline" onClick={() => void cancel(a)}>
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </AdminLayout>
  );
}
