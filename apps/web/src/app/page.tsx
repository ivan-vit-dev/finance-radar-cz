"use client";

import { CATEGORY_LABELS, PRIORITY_LABELS, type DashboardSnapshot, type Trend } from "@finance-radar/shared";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  CategoryList,
  EmptyCard,
  PRIORITY_STYLES,
  PriorityDot,
  SectionTitle,
  VerificationBadge,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import { formatNumber, formatPeriod } from "@/lib/format";

const TREND_ICON: Record<Trend, string> = { up: "↑", down: "↓", flat: "→" };

const PLACEHOLDER_INDICATORS = ["Repo sazba", "Hypotéky", "Inflace", "EUR/CZK"];

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
    <AppShell>
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
            ? `Data aktualizována ${new Date(snapshot.updatedAt).toLocaleString("cs-CZ")}. Ranní shrnutí přibude brzy; mezitím najdeš důležité události níže a v Radaru.`
            : "Jakmile poběží sběr dat a AI pipeline, uvidíš tu nejdůležitější události dne, ověřená fakta a co z nich plyne pro tvou práci s klienty."}
        </p>
      </section>

      <section aria-labelledby="indicators-h">
        <SectionTitle id="indicators-h">Tržní ukazatele</SectionTitle>
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
          <div className="flex items-baseline justify-between">
            <SectionTitle id="top-h">Dnešní top zprávy</SectionTitle>
            <Link href="/radar" className="text-xs text-accent-to hover:underline">
              Celý radar →
            </Link>
          </div>
          {snapshot?.topEvents?.length ? (
            <ul className="space-y-3">
              {snapshot.topEvents.map((ev) => (
                <li key={ev.id}>
                  <Link
                    href={`/event/${ev.id}`}
                    className={`glass block rounded-2xl p-4 transition hover:bg-surface-strong ${PRIORITY_STYLES[ev.priority].card}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5">
                        <PriorityDot priority={ev.priority} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{ev.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <span>
                            {PRIORITY_LABELS[ev.priority]} · skóre {ev.finalScore} · <CategoryList categories={ev.categories} />
                          </span>
                          <VerificationBadge status={ev.verification} compact />
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyCard text="Zprávy se sbírají a třídí. Důležité události se tu objeví, jakmile je AI vyhodnotí." />
          )}
        </section>

        <section aria-labelledby="trends-h">
          <SectionTitle id="trends-h">Trendy</SectionTitle>
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
    </AppShell>
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
