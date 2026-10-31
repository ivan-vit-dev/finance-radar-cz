export function formatNumber(n: number, decimals: number): string {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** „2026-09“ -> „září 2026“, „2026-10-30“ -> „30. 10. 2026“, „2027-Q1“ -> „1. čtvrtletí 2027“. */
export function formatPeriod(p: string): string {
  const q = /^(\d{4})-Q([1-4])$/.exec(p);
  if (q) return `${q[2]}. čtvrtletí ${q[1]}`;
  const [y, m, d] = p.split("-").map(Number);
  if (!m) return String(y);
  if (d) return new Date(y, m - 1, d).toLocaleDateString("cs-CZ");
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

/** Relativní čas: „před 5 min“, „před 3 h“, „včera“, jinak datum. */
export function timeAgo(iso: string, now = new Date()): string {
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "právě teď";
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  if (h < 48) return "včera";
  return new Date(iso).toLocaleDateString("cs-CZ");
}
