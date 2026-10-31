import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  type Category,
  type EventFact,
  type Priority,
  type StatementType,
  type VerificationStatus,
} from "@finance-radar/shared";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const PRIORITY_STYLES: Record<Priority, { dot: string; card: string; text: string }> = {
  critical: { dot: "bg-critical shadow-[0_0_12px_var(--critical)]", card: "glow-critical", text: "text-critical" },
  high: { dot: "bg-high shadow-[0_0_10px_var(--high)]", card: "glow-high", text: "text-high" },
  important: { dot: "bg-important", card: "", text: "text-important" },
  info: { dot: "bg-info", card: "", text: "text-info" },
  low: { dot: "bg-low", card: "", text: "text-low" },
};

export function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${PRIORITY_STYLES[priority].dot}`}
      title={PRIORITY_LABELS[priority]}
    />
  );
}

/** Důvěryhodnost podle bodu 33 specifikace. */
export const VERIFICATION: Record<VerificationStatus, { icon: string; label: string; className: string }> = {
  verified_primary: { icon: "🟢", label: "Ověřeno primárním zdrojem", className: "text-info" },
  confirmed_multiple: { icon: "🔵", label: "Potvrzeno více zdroji", className: "text-accent-to" },
  secondary: { icon: "🟡", label: "Sekundární zdroj", className: "text-important" },
  pending: { icon: "🟠", label: "Čeká na ověření", className: "text-high" },
  conflict: { icon: "🔴", label: "Rozpor mezi zdroji", className: "text-critical" },
};

export function VerificationBadge({ status, compact }: { status: VerificationStatus; compact?: boolean }) {
  const v = VERIFICATION[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${v.className}`} title={v.label}>
      <span aria-hidden>{v.icon}</span>
      {compact ? <span className="sr-only">{v.label}</span> : v.label}
    </span>
  );
}

/** FAKT / ANALÝZA / ODHAD / NÁZOR – bod 10 specifikace. */
export const STATEMENT_TYPE: Record<StatementType, { label: string; className: string }> = {
  fact: { label: "FAKT", className: "bg-info/15 text-info ring-info/30" },
  interpretation: { label: "ANALÝZA", className: "bg-accent-to/15 text-accent-to ring-accent-to/30" },
  forecast: { label: "ODHAD", className: "bg-important/15 text-important ring-important/30" },
  opinion: { label: "NÁZOR", className: "bg-low/15 text-low ring-low/30" },
};

export function StatementBadge({ type }: { type: StatementType }) {
  const t = STATEMENT_TYPE[type];
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1 ${t.className}`}>
      {t.label}
    </span>
  );
}

export function FactCheck({ chk }: { chk: EventFact["chk"] }) {
  if (!chk) return null;
  return chk === "ok" ? (
    <span className="text-xs text-info" title="Hodnota sedí s daty ČNB/ČSÚ">
      ✓ ověřeno proti datům
    </span>
  ) : (
    <span className="text-xs text-critical" title="Hodnota nesedí s daty ČNB/ČSÚ">
      ⚠ nesedí s daty ČNB/ČSÚ
    </span>
  );
}

export function CategoryList({ categories }: { categories: Category[] }) {
  return <>{categories.map((c) => CATEGORY_LABELS[c]).join(" / ")}</>;
}

export function SectionTitle({ id, children, icon: Icon }: { id?: string; children: ReactNode; icon?: LucideIcon }) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
      {Icon && <Icon size={16} className="text-accent-to" aria-hidden />}
      {children}
    </h2>
  );
}

export function EmptyCard({ text }: { text: string }) {
  return <div className="glass rounded-2xl border-dashed p-6 text-sm text-muted">{text}</div>;
}
