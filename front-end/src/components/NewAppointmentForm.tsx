import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError, errorMessage } from "../lib/api";
import { brandTheme } from "../lib/brandTheme";
import { DayPicker } from "./booking/DayPicker";
import { fullDayFmt, timeFmt, toDateValue } from "./booking/dates";
import { SlotPicker, type Slot } from "./booking/SlotPicker";
import { CustomerPicker, type PickableCustomer } from "./CustomerPicker";
import { Alert, Button, Field } from "./ui";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

const selectClass =
  "w-full rounded border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal-light";

/** O dono marca um horário para quem ligou, mandou mensagem ou está no balcão. */
export function NewAppointmentForm({
  onCreated,
  onCancel,
}: {
  onCreated: (message: string) => void;
  onCancel: () => void;
}) {
  const slug = useAuth().establishment?.slug;

  const [services, setServices] = useState<Service[] | null>(null);
  const [customers, setCustomers] = useState<PickableCustomer[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [customerMode, setCustomerMode] = useState<"new" | "existing">("new");
  const [customer, setCustomer] = useState<PickableCustomer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(() => toDateValue(new Date()));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api<Service[]>("/admin/services"), api<PickableCustomer[]>("/admin/customers")])
      .then(([serviceList, customerList]) => {
        setServices(serviceList.filter((s) => s.active));
        setCustomers([...customerList].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const fetchSlots = useCallback(
    () =>
      api<{ slots: Slot[] }>(`/establishments/${slug}/availability?serviceId=${serviceId}&date=${date}`).then(
        (r) => r.slots
      ),
    [slug, serviceId, date]
  );

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setSlots(null);
    setSlot(null);
    fetchSlots()
      .then((list) => {
        if (!cancelled) setSlots(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, fetchSlots]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const isNew = customerMode === "new";
    if (!slot || (!isNew && !customer)) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ customer: { name: string } }>("/admin/appointments", {
        method: "POST",
        body: JSON.stringify({
          serviceId,
          startsAt: slot.start,
          ...(isNew ? { customer: { name, phone, email } } : { customerId: customer!.id }),
        }),
      });
      const when = new Date(slot.start);
      onCreated(`Agendado: ${created.customer.name}, ${fullDayFmt.format(when)}, às ${timeFmt.format(when)}.`);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === "SLOT_UNAVAILABLE") {
        setSlot(null);
        setSlots(await fetchSlots().catch(() => []));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    // Os seletores de dia e horário usam as variáveis de cor da página pública.
    <form
      onSubmit={handleSubmit}
      style={brandTheme("#1f5f5b")}
      className="space-y-6 rounded border border-line bg-white p-4"
    >
      <h2 className="font-display text-lg text-ink">Novo agendamento</h2>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-sm text-ink-soft">Cliente</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "new", label: "Cliente novo" },
              { value: "existing", label: "Já cadastrado" },
            ] as const
          ).map((option) => {
            const active = customerMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setCustomerMode(option.value)}
                className={`min-h-11 rounded border-2 px-3 text-sm font-medium ${
                  active ? "border-teal bg-teal text-white" : "border-line bg-white text-ink-soft hover:border-teal"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {customerMode === "existing" && (
          <CustomerPicker customers={customers} selected={customer} onSelect={setCustomer} />
        )}
      </fieldset>

      {customerMode === "new" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" name="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          <Field
            label="Telefone (WhatsApp)"
            name="phone"
            type="tel"
            required
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Field label="E-mail (opcional)" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">Serviço</span>
        <select className={selectClass} required value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="" disabled>
            {services === null ? "Carregando..." : "Escolha o serviço"}
          </option>
          {services?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMinutes} min)
            </option>
          ))}
        </select>
      </label>

      {serviceId && (
        <div className="space-y-5">
          <DayPicker value={date} onChange={setDate} />
          <SlotPicker slots={slots} selected={slot} onSelect={setSlot} />
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!slot || saving || (customerMode === "existing" && !customer)}>
          {saving
            ? "Salvando..."
            : customerMode === "existing" && !customer
              ? "Escolha o cliente"
              : slot
                ? `Agendar às ${timeFmt.format(new Date(slot.start))}`
                : "Escolha um horário"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
