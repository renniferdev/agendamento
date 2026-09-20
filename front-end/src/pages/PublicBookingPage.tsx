import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Alert, Field } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

interface Establishment {
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl: string | null;
  phone: string | null;
  services: Service[];
}

interface Slot {
  start: string;
  end: string;
}

interface CreatedAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  service: Service;
  customer: { name: string; phone: string };
  establishment: { name: string; phone: string | null };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const longDateFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PublicBookingPage() {
  const { slug = "" } = useParams();
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState(todayInputValue);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAppointment | null>(null);

  useEffect(() => {
    api<Establishment>(`/establishments/${slug}`)
      .then((e) => {
        setEstablishment(e);
        document.title = `Agendar — ${e.name}`;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(errorMessage(err));
      });
  }, [slug]);

  // Recarrega os horários sempre que serviço ou data mudam.
  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setSlots(null);
    setSlot(null);
    api<{ slots: Slot[] }>(`/establishments/${slug}/availability?serviceId=${service.id}&date=${date}`)
      .then((r) => {
        if (!cancelled) setSlots(r.slots);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setSubmitError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, service, date]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!service || !slot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<CreatedAppointment>(`/establishments/${slug}/appointments`, {
        method: "POST",
        body: JSON.stringify({
          serviceId: service.id,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          startsAt: slot.start,
        }),
      });
      setCreated(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLOT_UNAVAILABLE") {
        // Outro cliente pegou o horário: volta para a escolha com a lista atualizada.
        setSubmitError(err.message);
        setSlot(null);
        const r = await api<{ slots: Slot[] }>(
          `/establishments/${slug}/availability?serviceId=${service.id}&date=${date}`
        ).catch(() => ({ slots: [] }));
        setSlots(r.slots);
      } else {
        setSubmitError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setCreated(null);
    setService(null);
    setSlot(null);
    setSlots(null);
    setSubmitError(null);
  }

  if (notFound) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-900">Página não encontrada</h1>
        <p className="mt-2 text-sm text-gray-600">Confira o link que você recebeu do estabelecimento.</p>
      </Shell>
    );
  }
  if (loadError) {
    return (
      <Shell>
        <Alert>{loadError}</Alert>
      </Shell>
    );
  }
  if (!establishment) {
    return <Shell>Carregando...</Shell>;
  }

  const brand = establishment.primaryColor;

  return (
    <div className="min-h-screen bg-gray-50">
      <header style={{ backgroundColor: brand }} className="text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-6">
          {establishment.logoUrl && (
            <img
              src={establishment.logoUrl}
              alt=""
              className="h-14 w-14 rounded-full bg-white object-cover p-1"
            />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{establishment.name}</h1>
            <p className="text-sm opacity-90">Agende seu horário online</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {created ? (
          <Confirmation appointment={created} brand={brand} onReset={reset} />
        ) : (
          <>
            <Step number={1} title="Escolha o serviço" brand={brand} done={!!service}>
              {establishment.services.length === 0 ? (
                <p className="text-sm text-gray-500">Este estabelecimento ainda não cadastrou serviços.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {establishment.services.map((s) => {
                    const selected = service?.id === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setService(s)}
                          style={selected ? { borderColor: brand, boxShadow: `0 0 0 1px ${brand}` } : undefined}
                          className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-400"
                        >
                          <div className="font-medium text-gray-900">{s.name}</div>
                          <div className="text-sm text-gray-500">
                            {s.durationMinutes} min · {brl.format(s.priceCents / 100)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Step>

            {service && (
              <Step number={2} title="Escolha a data e o horário" brand={brand} done={!!slot}>
                <div className="max-w-xs">
                  <Field
                    label="Data"
                    name="date"
                    type="date"
                    min={todayInputValue()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="mt-3">
                  {slots === null ? (
                    <p className="text-sm text-gray-500">Buscando horários...</p>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Nenhum horário disponível nesse dia. Tente outra data.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {slots.map((s) => {
                        const selected = slot?.start === s.start;
                        return (
                          <button
                            key={s.start}
                            type="button"
                            onClick={() => setSlot(s)}
                            style={selected ? { backgroundColor: brand, borderColor: brand, color: "#fff" } : undefined}
                            className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-800 hover:border-gray-500"
                          >
                            {timeFmt.format(new Date(s.start))}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Step>
            )}

            {service && slot && (
              <Step number={3} title="Seus dados" brand={brand} done={false}>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                    <strong>{service.name}</strong> · {longDateFmt.format(new Date(slot.start))} ·{" "}
                    {brl.format(service.priceCents / 100)}
                  </p>
                  {submitError && <Alert>{submitError}</Alert>}
                  <Field
                    label="Nome"
                    name="customerName"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Field
                    label="Telefone (WhatsApp)"
                    name="customerPhone"
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Field
                    label="E-mail (opcional)"
                    name="customerEmail"
                    type="email"
                    autoComplete="email"
                    hint="Para receber a confirmação por e-mail."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ backgroundColor: brand }}
                    className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Confirmando..." : "Confirmar agendamento"}
                  </button>
                </form>
              </Step>
            )}

            {submitError && !slot && service && <Alert>{submitError}</Alert>}
          </>
        )}
      </main>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-600">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center">{children}</div>
    </div>
  );
}

function Step({
  number,
  title,
  brand,
  done,
  children,
}: {
  number: number;
  title: string;
  brand: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
        <span
          style={{ backgroundColor: brand }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
        >
          {done ? "✓" : number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Confirmation({
  appointment,
  brand,
  onReset,
}: {
  appointment: CreatedAppointment;
  brand: string;
  onReset: () => void;
}) {
  return (
    <section className="rounded-lg border border-green-200 bg-white p-6 text-center">
      <div
        style={{ backgroundColor: brand }}
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white"
      >
        ✓
      </div>
      <h2 className="text-xl font-semibold text-gray-900">Agendamento confirmado!</h2>
      <p className="mt-2 text-gray-700">
        {appointment.customer.name}, seu horário em <strong>{appointment.establishment.name}</strong> está marcado.
      </p>
      <dl className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Serviço</dt>
          <dd className="font-medium">{appointment.service.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Quando</dt>
          <dd className="font-medium">{longDateFmt.format(new Date(appointment.startsAt))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Valor</dt>
          <dd className="font-medium">{brl.format(appointment.service.priceCents / 100)}</dd>
        </div>
      </dl>
      {appointment.establishment.phone && (
        <p className="mt-4 text-sm text-gray-500">
          Precisa remarcar? Fale com o estabelecimento: {appointment.establishment.phone}
        </p>
      )}
      <button type="button" onClick={onReset} className="mt-6 text-sm text-gray-600 underline">
        Fazer outro agendamento
      </button>
    </section>
  );
}
