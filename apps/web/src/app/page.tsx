"use client";

import { CATEGORY_LABELS, PRIORITY_LABELS, type DashboardSnapshot, type Trend } from "@finance-radar/shared";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BriefingCard } from "@/components/briefing-card";
import {
  CategoryList,
  EmptyCard,
  PRIORITY_STYLES,
  PriorityDot,
  SectionTitle,
  VerificationBadge,
} from "@/components/ui";
import { CATEGORY_ICONS, IconBadge } from "@/components/icons";
import { IndicatorCard } from "@/components/indicator-card";
import {
  ChartColumn,
  Flame,
  MoveRight,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";

const TREND: Record<Trend, { icon: LucideIcon; label: string; className: string }> = {
  // Neutrální barvy: růst není vždy špatně (spoření) ani pokles vždy dobře.
  up: { icon: TrendingUp, label: "roste", className: "text-accent-to" },
  down: { icon: TrendingDown, label: "klesá", className: "text-accent-to" },
  flat: { icon: MoveRight, label: "beze změny", className: "text-muted" },
};

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

  // Počet kritických událostí na ikoně nainstalované aplikace (Chrome/Edge).
  const critical = snapshot?.criticalCount ?? 0;
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    (critical > 0 ? navigator.setAppBadge(critical) : navigator.clearAppBadge()).catch(() => {});
  }, [critical]);

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

      <BriefingCard />

      <section aria-labelledby="indicators-h">
        <SectionTitle id="indicators-h" icon={ChartColumn}>
          Tržní ukazatele
        </SectionTitle>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {snapshot?.indicators?.length
            ? snapshot.indicators.map((ind) => <IndicatorCard key={ind.id} ind={ind} />)
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
            <SectionTitle id="top-h" icon={Flame}>
              Dnešní top zprávy
            </SectionTitle>
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
                      <span className="relative">
                        <IconBadge icon={ev.categories[0] ? CATEGORY_ICONS[ev.categories[0]] : Flame} category={ev.categories[0]} />
                        <span className="absolute -right-0.5 -top-0.5">
                          <PriorityDot priority={ev.priority} />
                        </span>
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
          <SectionTitle id="trends-h" icon={TrendingUp}>
            Trendy
          </SectionTitle>
          {snapshot?.categoryTrends?.length ? (
            <ul className="glass divide-y divide-border rounded-2xl">
              {snapshot.categoryTrends.map((t) => {
                const tr = TREND[t.trend];
                return (
                  <li key={t.category} className="flex items-center gap-3 px-4 py-3">
                    <IconBadge icon={CATEGORY_ICONS[t.category]} size="sm" category={t.category} />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm">{CATEGORY_LABELS[t.category]}</span>
                      <span className="block text-xs text-muted">{t.label}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs ${tr.className}`}>
                      <tr.icon size={18} aria-hidden />
                      {tr.label}
                    </span>
                  </li>
                );
              })}
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
    return (
      <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted">
        <ShieldCheck size={16} className="text-info" aria-hidden />
        Žádné kritické události
      </span>
    );
  }
  return (
    <span className="glow-critical flex items-center gap-2 rounded-full bg-critical/10 px-4 py-2 text-sm font-medium text-critical">
      <ShieldAlert size={16} className="animate-pulse" aria-hidden />
      {count} {count === 1 ? "kritická událost" : count < 5 ? "kritické události" : "kritických událostí"}
    </span>
  );
}
