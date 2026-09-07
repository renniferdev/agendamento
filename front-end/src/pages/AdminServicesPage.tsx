import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { Alert, Button, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
}

interface FormState {
  name: string;
  durationMinutes: string;
  price: string; // em reais, como o usuário digita ("35,00")
}

const emptyForm: FormState = { name: "", durationMinutes: "30", price: "" };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function reaisToCents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(normalized) * 100);
}

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function AdminServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setServices(await api<Service[]>("/admin/services"));
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

  function startEdit(service: Service) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      durationMinutes: String(service.durationMinutes),
      price: centsToReais(service.priceCents),
    });
    window.scrollTo({ top: 0 });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      name: form.name,
      durationMinutes: Number(form.durationMinutes),
      priceCents: reaisToCents(form.price),
    };

    if (!Number.isInteger(payload.priceCents) || payload.priceCents < 0) {
      setError("Preço inválido.");
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await api(`/admin/services/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/admin/services", { method: "POST", body: JSON.stringify(payload) });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service: Service) {
    setError(null);
    try {
      await api(`/admin/services/${service.id}/toggle-active`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(service: Service) {
    if (!window.confirm(`Excluir "${service.name}" permanentemente?`)) return;
    setError(null);
    try {
      await api(`/admin/services/${service.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      // 409 quando há agendamentos: o backend orienta a desativar.
      setError(errorMessage(err));
    }
  }

  return (
    <AdminLayout title="Serviços">
        {error && <Alert>{error}</Alert>}

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-medium text-gray-900">
            {editingId ? "Editar serviço" : "Novo serviço"}
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <Field
              label="Nome"
              name="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Field
              label="Duração (min)"
              name="durationMinutes"
              type="number"
              min={5}
              step={5}
              required
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
            <Field
              label="Preço (R$)"
              name="price"
              inputMode="decimal"
              placeholder="35,00"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar" : "Adicionar"}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={cancelEdit}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </section>

        <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Carregando...</p>
          ) : services.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nenhum serviço cadastrado ainda.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Duração</th>
                  <th className="px-4 py-2">Preço</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {services.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "text-gray-400"}>
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2">{s.durationMinutes} min</td>
                    <td className="px-4 py-2">{brl.format(s.priceCents / 100)}</td>
                    <td className="px-4 py-2">{s.active ? "Ativo" : "Inativo"}</td>
                    <td className="space-x-2 px-4 py-2 text-right whitespace-nowrap">
                      <button className="text-indigo-600 hover:underline" onClick={() => startEdit(s)}>
                        Editar
                      </button>
                      <button className="text-gray-600 hover:underline" onClick={() => void toggleActive(s)}>
                        {s.active ? "Desativar" : "Ativar"}
                      </button>
                      <button className="text-red-600 hover:underline" onClick={() => void remove(s)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
    </AdminLayout>
  );
}
