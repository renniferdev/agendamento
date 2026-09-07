import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

const links = [
  { to: "/admin", label: "Serviços", end: true },
  { to: "/admin/horarios", label: "Horários", end: false },
];

export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4">
            <span className="font-semibold text-gray-900">Painel</span>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `text-sm ${isActive ? "font-medium text-indigo-600" : "text-gray-600 hover:text-gray-900"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="hidden sm:inline">{user?.email}</span>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {children}
      </main>
    </div>
  );
}
