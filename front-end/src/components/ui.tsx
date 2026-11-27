import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-md rounded border border-line bg-white p-6">
      <h1 className="mb-5 font-display text-2xl font-medium text-ink">{title}</h1>
      {children}
    </div>
  );
}

export function CenteredPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-paper p-4">{children}</div>;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, id, type, ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);

  // O botão fica fora do <label> para não entrar no nome do campo.
  return (
    <div className="block">
      <label htmlFor={inputId} className="mb-1.5 block text-sm text-ink-soft">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={isPassword && visible ? "text" : type}
          className={`w-full rounded border border-line bg-white py-2 pl-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal-light disabled:bg-paper-dim ${
            isPassword ? "pr-12" : "pr-3"
          }`}
          // Com a senha visível o celular não deve corrigir nem capitalizar o texto.
          {...(isPassword && { autoCapitalize: "none", spellCheck: false })}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            title={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
          >
            <EyeIcon crossed={visible} />
          </button>
        )}
      </div>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-teal text-white hover:bg-teal-dark",
    secondary: "border border-line bg-white text-ink-soft hover:border-ink-soft/40",
    danger: "bg-danger text-white hover:bg-danger/90",
  }[variant];
  return (
    <button
      className={`rounded px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success"; children: ReactNode }) {
  const styles =
    kind === "error" ? "border-danger/25 bg-danger-light text-danger" : "border-success/25 bg-success-light text-success";
  return <div className={`rounded border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
