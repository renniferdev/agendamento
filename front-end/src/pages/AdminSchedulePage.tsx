import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { Alert, Button, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface BlockedSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };

type RunAction = (action: () => Promise<unknown>) => Promise<ActionResult>;

/** Feedback local de um card: "Salvo" some sozinho; erro fica até a próxima ação. */
function useFeedback() {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  function apply(result: ActionResult) {
    if (result.ok) {
      setError(null);
      setSaved(true);
    } else {
      setSaved(false);
      setError(result.error);
    }
  }

  return { saved, error, apply, clear: () => setError(null) };
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Valor de <input type="datetime-local"> ("2026-09-08T09:00") -> ISO local sem fuso. */
function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** Default para o form de bloqueio: amanhã às 09:00, no formato do datetime-local. */
function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminSchedulePage() {
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [blocked, setBlocked] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([
        api<BusinessHour[]>("/admin/business-hours"),
        api<BlockedSlot[]>("/admin/blocked-slots"),
      ]);
      setHours(h);
      setBlocked(b);
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

  /**
   * Executa uma ação e recarrega. Devolve o erro (se houver) para quem
   * chamou, para que o feedback apareça no card onde o usuário clicou —
   * um erro no topo da página passa despercebido em cards mais abaixo.
   */
  async function run(action: () => Promise<unknown>): Promise<ActionResult> {
    setError(null);
    try {
      await action();
      await load();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  return (
    <AdminLayout title="Horários de funcionamento e bloqueios">
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <>
          <BusinessHoursSection hours={hours} onChange={run} />
          <BlockedSlotsSection slots={blocked} onChange={run} />
        </>
      )}
    </AdminLayout>
  );
}

// ---------------------------------------------------------------------------
// Horários de funcionamento: um card por dia da semana
// ---------------------------------------------------------------------------

function BusinessHoursSection({
  hours,
  onChange,
}: {
  hours: BusinessHour[];
  onChange: RunAction;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg text-ink">Horários de funcionamento</h2>
      <p className="text-sm text-muted">
        Dias sem janela não recebem agendamentos. Não há botão "salvar": cada janela é gravada
        assim que você clica em "+".
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {DAYS.map((name, day) => (
          <DayCard
            key={day}
            day={day}
            name={name}
            windows={hours.filter((h) => h.dayOfWeek === day)}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function DayCard({
  day,
  name,
  windows,
  onChange,
}: {
  day: number;
  name: string;
  windows: BusinessHour[];
  onChange: RunAction;
}) {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [adding, setAdding] = useState(false);
  const feedback = useFeedback();

  async function add(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    feedback.clear();
    const result = await onChange(() =>
      api("/admin/business-hours", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: day, startTime: start, endTime: end }),
      })
    );
    feedback.apply(result);
    setAdding(false);
  }

  async function remove(id: string) {
    feedback.clear();
    feedback.apply(await onChange(() => api(`/admin/business-hours/${id}`, { method: "DELETE" })));
  }

  return (
    <div
      className={`rounded border bg-white p-3 transition-colors duration-500 ${
        feedback.saved ? "border-success/40 bg-success-light" : "border-line"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-ink">{name}</span>
        {feedback.saved ? (
          <span className="text-xs font-medium text-success">Salvo ✓</span>
        ) : windows.length === 0 ? (
          <span className="text-xs text-muted">Fechado</span>
        ) : null}
      </div>

      <ul className="mb-2 space-y-1">
        {windows.map((w) => (
          <li key={w.id} className="flex items-center justify-between text-sm">
            <span className="font-mono">
              {w.startTime} – {w.endTime}
            </span>
            <button className="text-xs text-danger hover:underline" onClick={() => void remove(w.id)}>
              Remover
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex items-end gap-2">
        <Field
          label="Início"
          name={`start-${day}`}
          type="time"
          step={300}
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <Field
          label="Fim"
          name={`end-${day}`}
          type="time"
          step={300}
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={adding} title="Adicionar janela">
          {adding ? "..." : "+"}
        </Button>
      </form>

      {feedback.error && <p className="mt-2 text-xs text-danger">{feedback.error}</p>}

      <p className="mt-2 text-xs text-muted">
        Cada janela é salva na hora ao clicar em "+". Para intervalo de almoço, cadastre duas
        janelas separadas (ex: 09:00–12:00 e 13:00–18:00) em vez de uma única.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloqueios administrativos
// ---------------------------------------------------------------------------

function BlockedSlotsSection({
  slots,
  onChange,
}: {
  slots: BlockedSlot[];
  onChange: RunAction;
}) {
  const [startsAt, setStartsAt] = useState(() => tomorrowAt(9));
  const [endsAt, setEndsAt] = useState(() => tomorrowAt(10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    feedback.clear();
    const result = await onChange(() =>
      api("/admin/blocked-slots", {
        method: "POST",
        body: JSON.stringify({
          startsAt: localInputToIso(startsAt),
          endsAt: localInputToIso(endsAt),
          reason: reason.trim() || undefined,
        }),
      })
    );
    feedback.apply(result);
    if (result.ok) setReason("");
    setSaving(false);
  }

  async function remove(id: string) {
    feedback.clear();
    feedback.apply(await onChange(() => api(`/admin/blocked-slots/${id}`, { method: "DELETE" })));
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg text-ink">Bloqueios</h2>
      <p className="text-sm text-muted">
        Folgas, feriados, manutenção. O período bloqueado some da disponibilidade mesmo dentro do horário de funcionamento.
      </p>

      <form
        onSubmit={add}
        className="grid gap-3 rounded border border-line bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <Field
          label="Início"
          name="blockStart"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <Field
          label="Fim"
          name="blockEnd"
          type="datetime-local"
          required
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
        <Field
          label="Motivo (opcional)"
          name="reason"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Bloquear"}
        </Button>
      </form>

      {feedback.saved && <p className="text-xs font-medium text-success">Salvo ✓</p>}
      {feedback.error && <p className="text-xs text-danger">{feedback.error}</p>}

      <div className="rounded border border-line bg-white">
        {slots.length === 0 ? (
          <p className="p-3 text-sm text-muted">Nenhum bloqueio futuro.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {slots.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-mono">
                    {dateTimeFmt.format(new Date(s.startsAt))} → {dateTimeFmt.format(new Date(s.endsAt))}
                  </span>
                  {s.reason && <span className="ml-2 text-muted">({s.reason})</span>}
                </div>
                <button className="text-xs text-danger hover:underline" onClick={() => void remove(s.id)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
