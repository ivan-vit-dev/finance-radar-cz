"use client";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  type Category,
  type DashboardSnapshot,
  type MarketEvent,
} from "@finance-radar/shared";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CATEGORY_ICONS, IconBadge } from "@/components/icons";
import { themeVars } from "@/lib/category-theme";
import { IndicatorCard, SECTION_INDICATORS } from "@/components/indicator-card";
import { Clock, Flame, Layers, Newspaper, Radar as RadarIcon, type LucideIcon } from "lucide-react";
import { CategoryList, EmptyCard, PRIORITY_STYLES, PriorityDot, VerificationBadge } from "@/components/ui";
import { db } from "@/lib/firebase";
import { timeAgo } from "@/lib/format";

const DAYS = 7;
/** Události v radaru (karty bez faktů a analýzy se čtou levně – jeden dotaz při otevření). */
const MAX_EVENTS = 80;

const MIN_SCORES = [
  { label: "Vše", value: 0 },
  { label: "Důležité a výš", value: 55 },
  { label: "Vysoká priorita", value: 75 },
];

type RadarEvent = Pick<
  MarketEvent,
  "id" | "title" | "summary" | "categories" | "priority" | "finalScore" | "verification" | "updatedAt" | "sourceIds"
>;

export default function RadarPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <p className="text-sm text-muted">Načítám…</p>
        </AppShell>
      }
    >
      <Radar />
    </Suspense>
  );
}

function Radar() {
  const router = useRouter();
  const params = useSearchParams();
  const category = (CATEGORIES as readonly string[]).includes(params.get("c") ?? "") ? (params.get("c") as Category) : null;
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState<"time" | "score">("time");
  const [events, setEvents] = useState<RadarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indicators, setIndicators] = useState<DashboardSnapshot["indicators"]>([]);

  // Ukazatele k sekci se berou z předpočítaného dashboardu (1 čtení).
  useEffect(
    () =>
      onSnapshot(doc(db, "dashboard", "today"), (s) =>
        setIndicators((s.data() as DashboardSnapshot | undefined)?.indicators ?? []),
      ),
    [],
  );
  const sectionIndicators = (category ? (SECTION_INDICATORS[category] ?? []) : [])
    .map((id) => indicators.find((i) => i.id === id))
    .filter((i): i is DashboardSnapshot["indicators"][number] => !!i);

  useEffect(() => {
    const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
    const q = query(
      collection(db, "events"),
      where("updatedAt", ">=", since),
      orderBy("updatedAt", "desc"),
      limit(MAX_EVENTS),
    );
    return onSnapshot(
      q,
      (snap) => setEvents(snap.docs.map((d) => d.data() as RadarEvent)),
      (e) => setError(e.message),
    );
  }, []);

  const shown = useMemo(() => {
    const list = (events ?? []).filter(
      (e) => e.finalScore >= minScore && (!category || e.categories.includes(category)),
    );
    return sortBy === "score" ? [...list].sort((a, b) => b.finalScore - a.finalScore) : list;
  }, [events, minScore, category, sortBy]);

  const setCategory = (c: Category | null) => router.replace(c ? `/radar?c=${c}` : "/radar");

  return (
    <AppShell theme={category}>
      <header>
        <p className="text-sm text-muted">Události za posledních {DAYS} dní</p>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <IconBadge icon={category ? CATEGORY_ICONS[category] : RadarIcon} />
          {category ? CATEGORY_LABELS[category] : "Radar"}
        </h1>
      </header>

      {sectionIndicators.length > 0 && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {sectionIndicators.map((ind) => (
            <IndicatorCard key={ind.id} ind={ind} />
          ))}
        </div>
      )}

      <div className="glass flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kategorie">
          <Chip active={!category} onClick={() => setCategory(null)} icon={Layers}>
            Všechny oblasti
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)} icon={CATEGORY_ICONS[c]} theme={c}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {MIN_SCORES.map((m) => (
            <Chip key={m.value} active={minScore === m.value} onClick={() => setMinScore(m.value)}>
              {m.label}
            </Chip>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <Chip active={sortBy === "time"} onClick={() => setSortBy("time")} icon={Clock}>
            Nejnovější
          </Chip>
          <Chip active={sortBy === "score"} onClick={() => setSortBy("score")} icon={Flame}>
            Nejdůležitější
          </Chip>
        </div>
      </div>

      {error && <EmptyCard text={`Události se nepodařilo načíst: ${error}`} />}
      {!error && events === null && <p className="text-sm text-muted">Načítám události…</p>}
      {events !== null && shown.length === 0 && (
        <EmptyCard text="Žádné události neodpovídají filtru. Zkus jinou oblast nebo nižší prioritu." />
      )}

      <ul className="space-y-3">
        {shown.map((ev) => (
          <li key={ev.id}>
            <Link
              href={`/event/${ev.id}`}
              className={`glass block rounded-2xl p-4 transition hover:bg-surface-strong ${PRIORITY_STYLES[ev.priority].card}`}
            >
              <div className="flex items-start gap-3">
                <span className="relative">
                  <IconBadge
                    icon={ev.categories[0] ? CATEGORY_ICONS[ev.categories[0]] : Newspaper}
                    category={primaryCategory(ev.categories, category)}
                  />
                  <span className="absolute -right-0.5 -top-0.5">
                    <PriorityDot priority={ev.priority} />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium">{ev.title}</p>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(ev.updatedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{ev.summary}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className={PRIORITY_STYLES[ev.priority].text}>{PRIORITY_LABELS[ev.priority]}</span>
                    <span>· skóre {ev.finalScore}</span>
                    <span>
                      · <CategoryList categories={ev.categories} />
                    </span>
                    <span>
                      · {ev.sourceIds.length} {ev.sourceIds.length === 1 ? "zdroj" : ev.sourceIds.length < 5 ? "zdroje" : "zdrojů"}
                    </span>
                    <VerificationBadge status={ev.verification} compact />
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

/** Barva ikony události: v sekci její barva (když do ní událost patří), jinak první oblast události. */
function primaryCategory(categories: Category[], section: Category | null): Category | null {
  if (section && categories.includes(section)) return section;
  return categories[0] ?? null;
}

function Chip({
  active,
  onClick,
  children,
  icon: Icon,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: LucideIcon;
  /** Oblast – filtr má její barvy (funguje i jako barevná legenda). */
  theme?: Category;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={themeVars(theme)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
        active
          ? "bg-gradient-to-r from-accent-from/80 to-accent-to/80 text-white shadow-[0_0_16px_-4px_var(--accent-glow)]"
          : "bg-surface text-muted ring-1 ring-border hover:text-foreground"
      }`}
    >
      {Icon && <Icon size={13} aria-hidden className={!active && theme ? "text-accent-to" : undefined} />}
      {children}
    </button>
  );
}
