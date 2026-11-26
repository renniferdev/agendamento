import { shortMonth, shortWeekday } from "./dates";

/** Folha de calendário compacta, usada na confirmação e na lista de horários. */
export function DateBlock({ date, muted = false }: { date: Date; muted?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ${
        muted ? "bg-paper-dim text-muted" : "bg-(--brand-soft) text-(--brand-ink)"
      }`}
    >
      <span className="text-xs font-medium">{shortWeekday(date)}</span>
      <span className="text-2xl leading-tight font-bold">{date.getDate()}</span>
      <span className="text-xs">{shortMonth(date)}</span>
    </div>
  );
}
