import { useAuth } from "../context/AuthContext";
import { Button, Card, CenteredPage } from "./ui";

/** Mostrada no lugar do painel enquanto a conta não está liberada (ACTIVE). */
export function AccountStatusScreen({ status }: { status: "PENDING" | "BLOCKED" }) {
  const { user, refresh, signOut } = useAuth();
  const blocked = status === "BLOCKED";

  return (
    <CenteredPage>
      <Card title={blocked ? "Conta bloqueada" : "Cadastro em análise"}>
        <p className="mb-4 text-sm text-ink-soft">
          {blocked
            ? "O acesso desta conta está bloqueado e a sua página de agendamento está fora do ar. Entre em contato com o suporte para regularizar."
            : "Recebemos o seu cadastro. Assim que ele for liberado você poderá usar o painel e a sua página de agendamento ficará no ar."}
        </p>
        {user?.email && <p className="mb-5 text-xs text-muted">Conta: {user.email}</p>}
        <div className="flex gap-3">
          {!blocked && (
            <Button type="button" onClick={() => void refresh()}>
              Já fui liberado, verificar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </Card>
    </CenteredPage>
  );
}
