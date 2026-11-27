import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { StoreQrCode } from "./StoreQrCode";
import { Button } from "./ui";

const links = [
  { to: "/admin", label: "Serviços", end: true },
  { to: "/admin/horarios", label: "Horários", end: false },
  { to: "/admin/agendamentos", label: "Agendamentos", end: false },
  { to: "/admin/clientes", label: "Clientes", end: false },
];

export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, establishment, signOut } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const publicUrl = establishment ? `${window.location.origin}/${establishment.slug}` : null;

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o link da sua página:", publicUrl);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-display text-lg text-ink">Painel</span>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `border-b-2 pb-0.5 text-sm ${
                    isActive ? "border-teal font-medium text-ink" : "border-transparent text-muted hover:text-ink-soft"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{user?.email}</span>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </div>
        {establishment && publicUrl && (
          <div className="border-t border-line bg-brass-light">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <span className="text-ink-soft">Link de agendamento dos seus clientes:</span>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-brass underline underline-offset-2"
              >
                {publicUrl}
              </a>
              <button type="button" onClick={() => void copyLink()} className="text-brass hover:underline">
                {copied ? "Copiado ✓" : "Copiar"}
              </button>
              <button
                type="button"
                aria-expanded={showQr}
                onClick={() => setShowQr((open) => !open)}
                className="text-brass hover:underline"
              >
                {showQr ? "Fechar QR Code" : "Ver QR Code"}
              </button>
            </div>
            {showQr && (
              <div className="mx-auto max-w-3xl px-4 pb-4 text-sm">
                <StoreQrCode url={publicUrl} fileName={`qrcode-${establishment.slug}.png`} />
              </div>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        {children}
      </main>
    </div>
  );
}
