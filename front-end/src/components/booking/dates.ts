/** Formatação de datas usada na página pública. */

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

export const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const fullDayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

const withoutDot = (text: string) => text.replace(".", "");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const shortWeekday = (date: Date) => capitalize(withoutDot(weekdayFmt.format(date)));
export const shortMonth = (date: Date) => withoutDot(monthFmt.format(date));

/** YYYY-MM-DD no fuso local (formato do input de data e da API). */
export function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
