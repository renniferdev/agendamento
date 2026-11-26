import { Field } from "../ui";
import { fullDayFmt, shortMonth, shortWeekday, toDateValue } from "./dates";

const DAYS_SHOWN = 14;

/**
 * Grade com os próximos dias, todos visíveis (sem rolagem lateral, que passa
 * despercebida por quem tem pouca intimidade com o celular). Um toque escolhe
 * a data; datas mais distantes ficam no campo abaixo.
 */
export function DayPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + i);
    return date;
  });
  const today = toDateValue(days[0]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="Escolha o dia">
        {days.map((day) => {
          const dayValue = toDateValue(day);
          const selected = dayValue === value;
          return (
            <button
              key={dayValue}
              type="button"
              aria-pressed={selected}
              aria-label={fullDayFmt.format(day)}
              onClick={() => onChange(dayValue)}
              className={`flex min-w-0 flex-col items-center rounded-xl border-2 py-2.5 ${
                selected
                  ? "border-(--brand) bg-(--brand) text-(--on-brand)"
                  : "border-line bg-white text-ink hover:border-(--brand-ink)"
              }`}
            >
              <span className="text-sm font-semibold">{dayValue === today ? "Hoje" : shortWeekday(day)}</span>
              <span className="text-2xl leading-tight font-bold">{day.getDate()}</span>
              <span className="text-sm">{shortMonth(day)}</span>
            </button>
          );
        })}
      </div>

      <div className="max-w-xs">
        <Field
          label="Quer uma data mais para frente? Escolha aqui"
          name="date"
          type="date"
          min={today}
          value={value}
          // Limpar o campo não deve deixar a data vazia.
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </div>

      <p className="rounded-xl bg-(--brand-soft) px-4 py-3 text-base text-ink" aria-live="polite">
        Dia escolhido: <strong>{fullDayFmt.format(new Date(`${value}T12:00:00`))}</strong>
      </p>
    </div>
  );
}
