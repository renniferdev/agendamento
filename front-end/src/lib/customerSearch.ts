/** Busca de clientes usada na lista e no agendamento feito pelo dono. */

/** Sem diferenciar maiúsculas nem acentos ("jose" encontra "José"). */
const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filterCustomers<T extends { name: string; phone: string; email?: string | null }>(
  customers: T[],
  search: string
): T[] {
  const term = normalize(search.trim());
  if (!term) return customers;
  // Só trata como telefone quando a busca não tem letras ("(31) 98416" vira dígitos).
  const digits = /[a-z]/.test(term) ? "" : term.replace(/\D/g, "");
  return customers.filter(
    (c) =>
      normalize(`${c.name} ${c.email ?? ""}`).includes(term) || (digits.length > 0 && c.phone.includes(digits))
  );
}

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}
