import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Field } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { CustomerAuthProvider, useCustomerAuth } from "../context/CustomerAuthContext";
import {
  forgotPasswordCustomer,
  getCustomerAppointments,
  resetPasswordCustomer,
  type CustomerAppointment,
  type CustomerAppointmentStatus,
} from "../lib/customerAuth";

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
  // `key={slug}` reseta a sessão de cliente ao trocar de barbearia na URL.
  return (
    <CustomerAuthProvider key={slug} slug={slug}>
      <BookingPageContent slug={slug} />
    </CustomerAuthProvider>
  );
}

function BookingPageContent({ slug }: { slug: string }) {
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState(todayInputValue);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAppointment | null>(null);

  const { loading: authLoading, customer } = useCustomerAuth();
  const [view, setView] = useState<"booking" | "profile">("booking");

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
        body: JSON.stringify({ serviceId: service.id, startsAt: slot.start }),
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
        <h1 className="font-display text-lg text-ink">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted">Confira o link que você recebeu do estabelecimento.</p>
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
  if (!establishment || authLoading) {
    return <Shell>Carregando...</Shell>;
  }

  const brand = establishment.primaryColor;

  return (
    <div className="min-h-screen bg-paper">
      <header style={{ backgroundColor: brand }} className="text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-7">
          {establishment.logoUrl && (
            <img
              src={establishment.logoUrl}
              alt=""
              className="h-14 w-14 rounded-full bg-white object-cover p-1"
            />
          )}
          <div>
            <h1 className="font-display text-2xl">{establishment.name}</h1>
            <p className="text-sm opacity-80">Agende seu horário online</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {!customer ? (
          <CustomerAuthGate brand={brand} slug={slug} />
        ) : (
          <CustomerBadge brand={brand} view={view} onChangeView={setView} />
        )}

        {customer && view === "profile" && <CustomerProfile brand={brand} />}

        {customer &&
          view === "booking" &&
          (created ? (
            <Confirmation appointment={created} brand={brand} onReset={reset} />
          ) : (
            <>
              <Step number={1} title="Escolha o serviço" brand={brand} done={!!service}>
                {establishment.services.length === 0 ? (
                  <p className="text-sm text-muted">Este estabelecimento ainda não cadastrou serviços.</p>
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
                            className="w-full rounded border border-line bg-white p-3 text-left hover:border-ink-soft/40"
                          >
                            <div className="font-medium text-ink">{s.name}</div>
                            <div className="font-mono text-sm text-muted">
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
                      <p className="text-sm text-muted">Buscando horários...</p>
                    ) : slots.length === 0 ? (
                      <p className="text-sm text-muted">Nenhum horário disponível nesse dia. Tente outra data.</p>
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
                              className="rounded border border-line bg-white px-2 py-2 font-mono text-sm font-medium text-ink hover:border-ink-soft/40"
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
                <Step number={3} title="Confirmar" brand={brand} done={false}>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <p className="rounded border border-line bg-paper-dim p-3 text-sm text-ink-soft">
                      <strong className="text-ink">{service.name}</strong> ·{" "}
                      <span className="font-mono">{longDateFmt.format(new Date(slot.start))}</span> ·{" "}
                      <span className="font-mono">{brl.format(service.priceCents / 100)}</span>
                    </p>
                    {submitError && <Alert>{submitError}</Alert>}
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ backgroundColor: brand }}
                      className="w-full rounded px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Confirmando..." : "Confirmar agendamento"}
                    </button>
                  </form>
                </Step>
              )}

              {submitError && !slot && service && <Alert>{submitError}</Alert>}
            </>
          ))}
      </main>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4 text-center text-muted">
      <div className="w-full max-w-md rounded border border-line bg-white p-6">{children}</div>
    </div>
  );
}

function CustomerBadge({
  brand,
  view,
  onChangeView,
}: {
  brand: string;
  view: "booking" | "profile";
  onChangeView: (v: "booking" | "profile") => void;
}) {
  const { customer, logout } = useCustomerAuth();
  if (!customer) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-white px-4 py-3">
      <div className="flex items-center gap-5">
        <span className="text-sm text-ink-soft">
          Olá, <strong className="text-ink">{customer.name}</strong>
        </span>
        <nav className="flex items-center gap-4">
          {(
            [
              { key: "booking", label: "Agendar" },
              { key: "profile", label: "Meus dados" },
            ] as const
          ).map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onChangeView(tab.key)}
                style={active ? { borderColor: brand } : undefined}
                className={`border-b-2 pb-0.5 text-sm ${
                  active ? "font-medium text-ink" : "border-transparent text-muted hover:text-ink-soft"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      <Button variant="secondary" onClick={() => void logout()}>
        Sair
      </Button>
    </div>
  );
}

const STATUS_LABEL: Record<CustomerAppointmentStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
};

/**
 * "Meus dados": dados da conta do cliente + histórico de agendamentos
 * naquele estabelecimento (não é agregado entre barbearias diferentes).
 */
function CustomerProfile({ brand }: { brand: string }) {
  const { customer } = useCustomerAuth();
  const { slug = "" } = useParams();
  const [appointments, setAppointments] = useState<CustomerAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomerAppointments(slug)
      .then((list) => {
        if (!cancelled) setAppointments(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!customer) return null;

  const now = Date.now();
  const upcoming = (appointments ?? [])
    .filter((a) => new Date(a.startsAt).getTime() >= now && a.status !== "CANCELLED")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const past = (appointments ?? [])
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  return (
    <div className="space-y-4">
      <section className="rounded border border-line bg-white p-4">
        <h2 className="mb-3 font-display text-lg text-ink">Meus dados</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between border-b border-line/60 py-1.5">
            <dt className="text-muted">Nome</dt>
            <dd className="font-medium text-ink">{customer.name}</dd>
          </div>
          <div className="flex justify-between border-b border-line/60 py-1.5">
            <dt className="text-muted">E-mail</dt>
            <dd className="font-medium text-ink">{customer.email}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted">Telefone</dt>
            <dd className="font-mono font-medium text-ink">{formatPhone(customer.phone)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded border border-line bg-white p-4">
        <h2 className="mb-3 font-display text-lg text-ink">Próximos agendamentos</h2>
        {error ? (
          <Alert>{error}</Alert>
        ) : appointments === null ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted">Você não tem agendamentos futuros.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <AppointmentRow key={a.id} appointment={a} brand={brand} />
            ))}
          </ul>
        )}
      </section>

      {appointments !== null && past.length > 0 && (
        <section className="rounded border border-line bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-ink">Histórico</h2>
          <ul className="space-y-2">
            {past.map((a) => (
              <AppointmentRow key={a.id} appointment={a} brand={brand} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AppointmentRow({ appointment, brand }: { appointment: CustomerAppointment; brand: string }) {
  return (
    <li className="flex items-center justify-between rounded border border-line/60 px-3 py-2 text-sm">
      <div>
        <div className="font-medium text-ink">{appointment.service.name}</div>
        <div className="font-mono text-muted">{longDateFmt.format(new Date(appointment.startsAt))}</div>
      </div>
      <span
        style={{ color: appointment.status === "CANCELLED" ? undefined : brand }}
        className={appointment.status === "CANCELLED" ? "text-xs font-semibold text-muted" : "text-xs font-semibold"}
      >
        {STATUS_LABEL[appointment.status]}
      </span>
    </li>
  );
}

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

/**
 * Tela de login/cadastro do cliente final — exibida antes de liberar o
 * fluxo de agendamento. A conta é escopada por estabelecimento (ver
 * CustomerAuthContext), então este formulário chama sempre as rotas
 * `/establishments/:slug/customers/*`.
 */
type AuthMode = "login" | "register" | "forgot" | "reset";

function CustomerAuthGate({ brand, slug }: { brand: string; slug: string }) {
  const { login, register } = useCustomerAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get("resetToken");

  const [mode, setMode] = useState<AuthMode>(resetToken ? "reset" : "login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: AuthMode) {
    setError(null);
    setNotice(null);
    setMode(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "register" && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (mode === "reset" && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "register") {
        await register({ name, phone, email, password, confirmPassword });
      } else if (mode === "forgot") {
        const { message } = await forgotPasswordCustomer(slug, email);
        setNotice(message);
      } else {
        await resetPasswordCustomer(slug, { token: resetToken!, password, confirmPassword });
        setNotice("Senha redefinida com sucesso. Entre com sua nova senha.");
        setSearchParams((params) => {
          params.delete("resetToken");
          return params;
        });
        setPassword("");
        setConfirmPassword("");
        switchMode("login");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const titles: Record<AuthMode, string> = {
    login: "Entre para agendar",
    register: "Crie sua conta para agendar",
    forgot: "Esqueci minha senha",
    reset: "Redefinir senha",
  };

  return (
    <Card title={titles[mode]}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        {mode === "register" && (
          <>
            <Field
              label="Nome"
              name="name"
              required
              minLength={2}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="Telefone (WhatsApp)"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </>
        )}

        {(mode === "login" || mode === "register" || mode === "forgot") && (
          <Field
            label="E-mail"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}

        {(mode === "login" || mode === "register" || mode === "reset") && (
          <Field
            label={mode === "reset" ? "Nova senha" : "Senha"}
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            hint={mode !== "login" ? "Mínimo de 8 caracteres." : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {(mode === "register" || mode === "reset") && (
          <Field
            label="Confirmar senha"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        )}

        {mode === "login" && (
          <button
            type="button"
            className="-mt-2 block text-right text-xs text-teal hover:underline"
            onClick={() => switchMode("forgot")}
          >
            Esqueceu a senha?
          </button>
        )}

        {mode === "register" && (
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-teal"
            />
            <span>
              Li e concordo com os{" "}
              <Link to="/termos" target="_blank" className="font-medium text-teal hover:underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link to="/privacidade" target="_blank" className="font-medium text-teal hover:underline">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
        )}

        <Button
          type="submit"
          disabled={submitting}
          style={{ backgroundColor: brand }}
          className="w-full hover:opacity-90"
        >
          {submitting
            ? "Aguarde..."
            : mode === "login"
              ? "Entrar"
              : mode === "register"
                ? "Criar conta"
                : mode === "forgot"
                  ? "Enviar link de redefinição"
                  : "Salvar nova senha"}
        </Button>
      </form>

      {(mode === "login" || mode === "register") && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          {mode === "login" ? "Ainda não tem conta aqui?" : "Já tem conta aqui?"}{" "}
          <button
            type="button"
            className="font-medium text-teal hover:underline"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Cadastre-se" : "Entrar"}
          </button>
        </p>
      )}
      {mode === "forgot" && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          <button type="button" className="font-medium text-teal hover:underline" onClick={() => switchMode("login")}>
            Voltar para o login
          </button>
        </p>
      )}
    </Card>
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
    <section className="rounded border border-line bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2.5 font-display text-lg text-ink">
        <span
          style={{ backgroundColor: brand }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm font-mono text-xs font-semibold text-white"
        >
          {done ? "✓" : number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Renderizado como um talão de agendamento: canhoto perfurado (traço
 * pontilhado + recortes) separando o carimbo de confirmação dos dados do
 * horário, no lugar do card de sucesso genérico.
 */
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
    <section className="overflow-hidden rounded border border-line bg-white">
      <div className="p-6 text-center">
        <div
          style={{ backgroundColor: brand }}
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full text-xl text-white"
        >
          ✓
        </div>
        <h2 className="font-display text-xl text-ink">Agendamento confirmado</h2>
        <p className="mt-2 text-ink-soft">
          {appointment.customer.name}, seu horário em <strong className="text-ink">{appointment.establishment.name}</strong>{" "}
          está marcado.
        </p>
      </div>

      <div className="relative border-t border-dashed border-line">
        <span className="absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full bg-paper" />
        <span className="absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full bg-paper" />
      </div>

      <dl className="mx-auto max-w-sm space-y-1.5 p-6 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Serviço</dt>
          <dd className="font-medium text-ink">{appointment.service.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Quando</dt>
          <dd className="font-mono font-medium text-ink">{longDateFmt.format(new Date(appointment.startsAt))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Valor</dt>
          <dd className="font-mono font-medium text-ink">{brl.format(appointment.service.priceCents / 100)}</dd>
        </div>
      </dl>
      {appointment.establishment.phone && (
        <p className="px-6 text-center text-sm text-muted">
          Precisa remarcar? Fale com o estabelecimento: <span className="font-mono">{appointment.establishment.phone}</span>
        </p>
      )}
      <div className="p-6 pt-4 text-center">
        <button type="button" onClick={onReset} className="text-sm text-ink-soft underline">
          Fazer outro agendamento
        </button>
      </div>
    </section>
  );
}
