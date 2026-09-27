import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

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

export function Field({ label, hint, id, ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1.5 block text-sm text-ink-soft">{label}</span>
      <input
        id={inputId}
        className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal-light disabled:bg-paper-dim"
        {...props}
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
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
