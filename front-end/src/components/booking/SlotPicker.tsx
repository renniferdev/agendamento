import { timeFmt } from "./dates";

export interface Slot {
  start: string;
  end: string;
}

const PERIODS = [
  { label: "Manhã", from: 0, to: 12 },
  { label: "Tarde", from: 12, to: 18 },
  { label: "Noite", from: 18, to: 24 },
];

/** Horários livres do dia, separados por período. */
export function SlotPicker({
  slots,
  selected,
  onSelect,
}: {
  /** null enquanto os horários estão sendo buscados. */
  slots: Slot[] | null;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  if (slots === null) {
    return (
      <p className="text-sm text-muted" role="status">
        Buscando horários...
      </p>
    );
  }
  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
        Nenhum horário livre nesse dia. Escolha outra data.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {PERIODS.map((period) => {
        const inPeriod = slots.filter((s) => {
          const hour = new Date(s.start).getHours();
          return hour >= period.from && hour < period.to;
        });
        if (inPeriod.length === 0) return null;
        return (
          <div key={period.label}>
            <h3 className="mb-2 text-sm font-semibold text-ink-soft">{period.label}</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {inPeriod.map((s) => {
                const isSelected = selected?.start === s.start;
                return (
                  <button
                    key={s.start}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(s)}
                    className={`min-h-11 rounded-xl border text-base font-semibold ${
                      isSelected
                        ? "border-(--brand) bg-(--brand) text-(--on-brand)"
                        : "border-line bg-white text-ink hover:border-(--brand-ink)"
                    }`}
                  >
                    {timeFmt.format(new Date(s.start))}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
