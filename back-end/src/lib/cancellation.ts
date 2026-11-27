/**
 * Regra de cancelamento pelo cliente. Dentro do prazo mínimo ele precisa falar
 * com o estabelecimento; o dono pode cancelar a qualquer momento pelo painel.
 */
export const CANCEL_NOTICE_HOURS = 2;

/** Só agendamentos que começam depois deste instante podem ser cancelados pelo cliente. */
export function cancellationDeadline(now = new Date()): Date {
  return new Date(now.getTime() + CANCEL_NOTICE_HOURS * 60 * 60 * 1000);
}

export function customerCanCancel(appointment: { status: string; startsAt: Date }, now = new Date()): boolean {
  const open = appointment.status === "PENDING" || appointment.status === "CONFIRMED";
  return open && appointment.startsAt > cancellationDeadline(now);
}
