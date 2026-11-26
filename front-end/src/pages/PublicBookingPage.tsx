import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DateBlock } from "../components/booking/DateBlock";
import { DayPicker } from "../components/booking/DayPicker";
import { fullDayFmt, timeFmt, toDateValue } from "../components/booking/dates";
import { SlotPicker, type Slot } from "../components/booking/SlotPicker";
import { Alert, Button, Card, Field } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { brandTheme } from "../lib/brandTheme";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
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
  /** null quando o login com Google não está configurado no servidor. */
  googleClientId: string | null;
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
  const [date, setDate] = useState(() => toDateValue(new Date()));
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

  const theme = brandTheme(establishment.primaryColor);
  const initials = establishment.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <div className="booking flex flex-col" style={theme}>
      <header className="bg-(--brand) text-(--on-brand)">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-6">
          {establishment.logoUrl ? (
            <img src={establishment.logoUrl} alt="" className="h-16 w-16 rounded-2xl bg-white object-cover" />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-(--brand-ink)"
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-extrabold break-words">{establishment.name}</h1>
            <p className="text-sm">Agendamento online</p>
            {establishment.phone && (
              <a
                href={`tel:${establishment.phone.replace(/[^\d+]/g, "")}`}
                className="text-sm font-medium underline underline-offset-2"
              >
                {formatPhone(establishment.phone)}
              </a>
            )}
          </div>
        </div>
      </header>

      {customer && <CustomerNav view={view} onChangeView={setView} />}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {!customer && (
          <div className="flex flex-col items-center gap-6">
            <CustomerAuthGate slug={slug} googleClientId={establishment.googleClientId} />
            {establishment.services.length > 0 && (
              <section className="w-full max-w-md" aria-labelledby="services-preview">
                <h2 id="services-preview" className="mb-2 text-lg font-bold">
                  Serviços
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                  {establishment.services.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-sm text-muted">{s.durationMinutes} min</p>
                      </div>
                      <p className="font-bold">{brl.format(s.priceCents / 100)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {customer && view === "profile" && <CustomerProfile />}

        {customer &&
          view === "booking" &&
          (created ? (
            <Confirmation appointment={created} onReset={reset} />
          ) : (
            <div className="space-y-7">
              <section aria-labelledby="step-service">
                <h2 id="step-service" className="mb-3 text-xl font-bold">
                  O que você quer agendar?
                </h2>
                {establishment.services.length === 0 ? (
                  <p className="text-sm text-muted">Este estabelecimento ainda não cadastrou serviços.</p>
                ) : (
                  <ul className="space-y-2">
                    {establishment.services.map((s) => {
                      const selected = service?.id === s.id;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setService(s)}
                            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left ${
                              selected
                                ? "border-(--brand-ink) bg-(--brand-soft) ring-1 ring-(--brand-ink)"
                                : "border-line bg-white hover:border-(--brand-ink)"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                                selected ? "border-(--brand) bg-(--brand) text-(--on-brand)" : "border-line"
                              }`}
                            >
                              {selected && "✓"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{s.name}</span>
                              <span className="block text-sm text-muted">{s.durationMinutes} min</span>
                            </span>
                            <span className="font-bold">{brl.format(s.priceCents / 100)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {service && (
                <section aria-labelledby="step-when" className="space-y-5">
                  <h2 id="step-when" className="text-xl font-bold">
                    Quando?
                  </h2>
                  <DayPicker value={date} onChange={setDate} />
                  <SlotPicker slots={slots} selected={slot} onSelect={setSlot} />
                </section>
              )}
            </div>
          ))}
      </main>

      {/* Resumo fixo no rodapé: o agendamento vai se montando até a confirmação. */}
      {customer && view === "booking" && !created && service && (
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 border-t border-line bg-white shadow-[0_-8px_24px_-16px_rgba(22,32,47,0.35)]"
        >
          <div className="mx-auto max-w-2xl space-y-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {submitError && <Alert>{submitError}</Alert>}
            <div className="flex items-start justify-between gap-4" aria-live="polite">
              <div className="min-w-0">
                <p className="font-bold">{service.name}</p>
                <p className="text-sm text-muted">
                  {slot
                    ? `${fullDayFmt.format(new Date(slot.start))}, às ${timeFmt.format(new Date(slot.start))}`
                    : "Escolha o dia e o horário"}
                </p>
              </div>
              <p className="text-lg font-bold">{brl.format(service.priceCents / 100)}</p>
            </div>
            <button
              type="submit"
              disabled={!slot || submitting}
              className="min-h-12 w-full rounded-xl bg-(--brand) text-base font-bold text-(--on-brand) disabled:cursor-not-allowed disabled:bg-paper-dim disabled:text-muted"
            >
              {submitting ? "Confirmando..." : "Confirmar agendamento"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="booking flex items-center justify-center p-4 text-center text-muted">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6">{children}</div>
    </div>
  );
}

function CustomerNav({
  view,
  onChangeView,
}: {
  view: "booking" | "profile";
  onChangeView: (v: "booking" | "profile") => void;
}) {
  const { customer, logout } = useCustomerAuth();
  if (!customer) return null;
  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex items-center justify-between gap-3 pt-3">
          <p className="min-w-0 truncate text-sm text-ink-soft">
            Olá, <strong className="text-ink">{customer.name}</strong>
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
          >
            Sair
          </button>
        </div>
        <nav className="mt-1 flex gap-6">
          {(
            [
              { key: "booking", label: "Agendar" },
              { key: "profile", label: "Meus horários" },
            ] as const
          ).map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChangeView(tab.key)}
                className={`border-b-[3px] py-2.5 text-sm font-semibold ${
                  active ? "border-(--brand) text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
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
 * "Meus horários": agendamentos do cliente naquele estabelecimento (não é
 * agregado entre lojas diferentes) e os dados da conta.
 */
function CustomerProfile() {
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
    <div className="space-y-7">
      <section>
        <h2 className="mb-3 text-xl font-bold">Próximos horários</h2>
        {error ? (
          <Alert>{error}</Alert>
        ) : appointments === null ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            Você não tem horários marcados. Toque em “Agendar” para marcar um.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <AppointmentRow key={a.id} appointment={a} />
            ))}
          </ul>
        )}
      </section>

      {appointments !== null && past.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Anteriores e cancelados</h2>
          <ul className="space-y-2">
            {past.map((a) => (
              <AppointmentRow key={a.id} appointment={a} past />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Meus dados</h2>
        <dl className="divide-y divide-line rounded-2xl border border-line bg-white px-4 text-sm">
          {[
            ["Nome", customer.name],
            ["E-mail", customer.email],
            ["Telefone", formatPhone(customer.phone)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-3">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 font-semibold break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function AppointmentRow({ appointment, past = false }: { appointment: CustomerAppointment; past?: boolean }) {
  const start = new Date(appointment.startsAt);
  const cancelled = appointment.status === "CANCELLED";
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
      <DateBlock date={start} muted={past} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{appointment.service.name}</p>
        <p className="text-sm text-muted">
          <span className="sr-only">{fullDayFmt.format(start)}, </span>
          às {timeFmt.format(start)}
        </p>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          cancelled
            ? "bg-danger-light text-danger"
            : past
              ? "bg-paper-dim text-muted"
              : "bg-success-light text-success"
        }`}
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
type AuthMode = "login" | "register" | "forgot" | "reset" | "google-phone";

function CustomerAuthGate({
  slug,
  googleClientId,
}: {
  slug: string;
  googleClientId: string | null;
}) {
  const { login, register, loginWithGoogle } = useCustomerAuth();
  /** Conta Google nova aguardando o telefone. */
  const [google, setGoogle] = useState<{ credential: string; name: string; email: string } | null>(null);
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

  async function handleGoogle(credential: string) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const pending = await loginWithGoogle(credential);
      if (pending) {
        setGoogle({ credential, name: pending.name, email: pending.email });
        switchMode("google-phone");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
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
      } else if (mode === "google-phone") {
        await loginWithGoogle(google!.credential, phone);
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
    "google-phone": "Falta só o telefone",
  };

  return (
    <Card title={titles[mode]}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        {mode === "google-phone" && google && (
          <p className="text-sm text-ink-soft">
            Olá, <strong className="text-ink">{google.name}</strong> ({google.email}). Informe seu telefone para o
            estabelecimento falar com você.
          </p>
        )}

        {mode === "register" && (
          <Field
            label="Nome"
            name="name"
            required
            minLength={2}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        {(mode === "register" || mode === "google-phone") && (
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

        {(mode === "register" || mode === "google-phone") && (
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
          style={{ backgroundColor: "var(--brand)", color: "var(--on-brand)" }}
          className="min-h-12 w-full text-base hover:opacity-90"
        >
          {submitting
            ? "Aguarde..."
            : mode === "login"
              ? "Entrar"
              : mode === "register" || mode === "google-phone"
                ? "Criar conta"
                : mode === "forgot"
                  ? "Enviar link de redefinição"
                  : "Salvar nova senha"}
        </Button>
      </form>

      {googleClientId && (mode === "login" || mode === "register") && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            ou
            <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleSignInButton clientId={googleClientId} onCredential={(c) => void handleGoogle(c)} />
        </div>
      )}

      {mode === "google-phone" && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          <button type="button" className="font-medium text-teal hover:underline" onClick={() => switchMode("login")}>
            Voltar para o login
          </button>
        </p>
      )}

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

function Confirmation({ appointment, onReset }: { appointment: CreatedAppointment; onReset: () => void }) {
  const start = new Date(appointment.startsAt);
  const phone = appointment.establishment.phone;
  return (
    <section className="rounded-2xl border border-line bg-white p-6" role="status">
      <div
        aria-hidden="true"
        className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-(--brand) text-2xl font-bold text-(--on-brand)"
      >
        ✓
      </div>
      <h2 className="text-center text-2xl font-extrabold">Horário marcado</h2>
      <p className="mt-1 text-center text-ink-soft">
        {appointment.customer.name}, esperamos você em{" "}
        <strong className="text-ink">{appointment.establishment.name}</strong>.
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-line p-4">
        <DateBlock date={start} />
        <div className="min-w-0 flex-1">
          <p className="text-3xl leading-tight font-extrabold">{timeFmt.format(start)}</p>
          <p className="font-semibold">{appointment.service.name}</p>
          <p className="text-sm text-muted">{fullDayFmt.format(start)}</p>
        </div>
      </div>

      <div className="mt-3 flex justify-between px-1 text-sm">
        <span className="text-muted">Valor</span>
        <span className="font-bold">{brl.format(appointment.service.priceCents / 100)}</span>
      </div>

      {phone && (
        <p className="mt-5 text-center text-sm text-muted">
          Precisa remarcar? Ligue para{" "}
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-(--brand-ink) underline">
            {formatPhone(phone)}
          </a>
        </p>
      )}
      <button
        type="button"
        onClick={onReset}
        className="mt-5 min-h-12 w-full rounded-xl border border-line bg-white font-semibold hover:border-(--brand-ink)"
      >
        Marcar outro horário
      </button>
    </section>
  );
}
