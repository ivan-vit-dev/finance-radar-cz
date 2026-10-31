"use client";

import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  type DashboardSnapshot,
  type Priority,
  type Trend,
} from "@finance-radar/shared";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { RadarMark, useUser } from "@/components/auth-gate";
import { db } from "@/lib/firebase";

const PRIORITY_STYLES: Record<Priority, { dot: string; card: string }> = {
  critical: { dot: "bg-critical shadow-[0_0_12px_var(--critical)]", card: "glow-critical" },
  high: { dot: "bg-high shadow-[0_0_10px_var(--high)]", card: "glow-high" },
  important: { dot: "bg-important", card: "" },
  info: { dot: "bg-info", card: "" },
  low: { dot: "bg-low", card: "" },
};

const TREND_ICON: Record<Trend, string> = { up: "↑", down: "↓", flat: "→" };

const PLACEHOLDER_INDICATORS = ["Repo sazba", "Hypotéky", "Inflace", "EUR/CZK"];

const NAV = ["Dashboard", "Radar", "ČNB", "Hypotéky", "Nemovitosti", "Legislativa", "Briefing"];

function formatNumber(n: number, decimals: number): string {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** „2026-09“ -> „září 2026“, „2026-10-30“ -> „30. 10. 2026“. */
function formatPeriod(p: string): string {
  const [y, m, d] = p.split("-").map(Number);
  if (d) return new Date(y, m - 1, d).toLocaleDateString("cs-CZ");
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function greetingFor(hour: number): string {
  if (hour >= 4 && hour < 9) return "Dobré ráno";
  if (hour >= 9 && hour < 12) return "Dobré dopoledne";
  if (hour >= 12 && hour < 18) return "Dobré odpoledne";
  return "Dobrý večer";
}

/** Aktuální čas obnovovaný každou minutu – aplikace může zůstat otevřená celý den. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function DashboardPage() {
  const user = useUser();
  const now = useNow();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null | undefined>(undefined);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "dashboard", "today"),
        (s) => setSnapshot(s.exists() ? (s.data() as DashboardSnapshot) : null),
        () => setSnapshot(null),
      ),
    [],
  );

  const today = now.toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8">
      <aside className="glass sticky top-6 hidden h-[calc(100vh-3rem)] w-56 shrink-0 flex-col rounded-3xl p-4 lg:flex">
        <div className="flex items-center gap-3 px-2 py-2">
          <RadarMark className="size-8" />
          <span className="font-semibold tracking-tight">Finance Radar</span>
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          {NAV.map((item, i) => (
            <span
              key={item}
              className={
                i === 0
                  ? "rounded-xl bg-surface-strong px-3 py-2 font-medium text-foreground"
                  : "cursor-default rounded-xl px-3 py-2 text-muted/70"
              }
              title={i === 0 ? undefined : "Připravujeme"}
            >
              {item}
            </span>
          ))}
        </nav>
        <div className="mt-auto truncate px-2 text-xs text-muted">{user.email}</div>
      </aside>

      <main className="min-w-0 flex-1 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm capitalize text-muted">{today}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{greetingFor(now.getHours())}</h1>
          </div>
          <CriticalBadge count={snapshot?.criticalCount ?? 0} />
        </header>

        <section className="glass glow-accent relative overflow-hidden rounded-3xl p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-gradient-to-br from-accent-from/40 to-accent-to/30 blur-3xl" />
          <p className="text-sm font-medium text-accent-to">☕ Morning Briefing</p>
          <h2 className="mt-2 text-xl font-semibold">
            {snapshot ? "Briefing zatím připravujeme" : "Zatím nemáme žádná data"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {snapshot
              ? `Tržní ukazatele jsou živé, data aktualizována ${new Date(snapshot.updatedAt).toLocaleString("cs-CZ")}. Shrnutí nejdůležitějších událostí přibude s AI vrstvou.`
              : "Jakmile poběží sběr dat a AI pipeline, uvidíš tu nejdůležitější události dne, ověřená fakta a co z nich plyne pro tvou práci s klienty."}
          </p>
        </section>

        <section aria-labelledby="indicators-h">
          <h2 id="indicators-h" className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
            Tržní ukazatele
          </h2>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            {snapshot?.indicators?.length
              ? snapshot.indicators.map((ind) => (
                  <div key={ind.id} className="glass rounded-2xl p-4">
                    <p className="text-sm text-muted">{ind.label}</p>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                      {formatNumber(ind.value, ind.decimals)} <span className="text-base text-muted">{ind.unit}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
                      {ind.change !== undefined && (
                        <span className="text-foreground/80">
                          {ind.change > 0 ? "↑ +" : ind.change < 0 ? "↓ " : "→ "}
                          {formatNumber(ind.change, ind.changeUnit === "%" ? 1 : 2)} {ind.changeUnit}
                          {ind.changeLabel ? ` ${ind.changeLabel}` : ""}
                        </span>
                      )}
                      <span>{formatPeriod(ind.asOf)}</span>
                    </p>
                  </div>
                ))
              : PLACEHOLDER_INDICATORS.map((label) => (
                  <div key={label} className="glass rounded-2xl p-4">
                    <p className="text-sm text-muted">{label}</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-muted/50">—</p>
                  </div>
                ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-3">
          <section aria-labelledby="top-h" className="xl:col-span-2">
            <h2 id="top-h" className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
              Dnešní top zprávy
            </h2>
            {snapshot?.topEvents?.length ? (
              <ul className="space-y-3">
                {snapshot.topEvents.map((ev) => (
                  <li key={ev.id} className={`glass rounded-2xl p-4 ${PRIORITY_STYLES[ev.priority].card}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${PRIORITY_STYLES[ev.priority].dot}`} />
                      <div className="min-w-0">
                        <p className="font-medium">{ev.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {PRIORITY_LABELS[ev.priority]} · skóre {ev.finalScore} ·{" "}
                          {ev.categories.map((c) => CATEGORY_LABELS[c]).join(" / ")}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCard text="Zprávy se už sbírají. Důležité události se tu objeví, až je začne třídit AI." />
            )}
          </section>

          <section aria-labelledby="trends-h">
            <h2 id="trends-h" className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
              Trendy
            </h2>
            {snapshot?.categoryTrends?.length ? (
              <ul className="glass divide-y divide-border rounded-2xl">
                {snapshot.categoryTrends.map((t) => (
                  <li key={t.category} className="flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="text-sm">{CATEGORY_LABELS[t.category]}</span>
                      <span className="block text-xs text-muted">{t.label}</span>
                    </span>
                    <span className="font-mono text-lg">{TREND_ICON[t.trend]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCard text="Trendy se spočítají z historie ukazatelů." />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function CriticalBadge({ count }: { count: number }) {
  if (count === 0) {
    return <span className="glass rounded-full px-4 py-2 text-sm text-muted">Žádné kritické události</span>;
  }
  return (
    <span className="glow-critical flex items-center gap-2 rounded-full bg-critical/10 px-4 py-2 text-sm font-medium text-critical">
      <span className="size-2 animate-pulse rounded-full bg-critical" />
      {count} {count === 1 ? "kritická událost" : count < 5 ? "kritické události" : "kritických událostí"}
    </span>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="glass rounded-2xl border-dashed p-6 text-sm text-muted">{text}</div>;
}
