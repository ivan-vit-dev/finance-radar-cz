"use client";

import {
  LEGISLATION_PHASE_LABELS,
  LEGISLATION_PHASES,
  type LegislationItem,
  type LegislationPhase,
} from "@finance-radar/shared";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { IconBadge } from "@/components/icons";
import { CircleCheck, CircleX, FileCheck2, Gavel, Landmark, PenLine, Scale, type LucideIcon } from "lucide-react";
import { EmptyCard } from "@/components/ui";
import { db } from "@/lib/firebase";

type Filter = "active" | "recent" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Projednává se / čeká na účinnost" },
  { id: "recent", label: "Účinné za posledních 6 měsíců" },
  { id: "all", label: "Vše" },
];

const STEP_LABELS: Record<(typeof LEGISLATION_PHASES)[number], string> = {
  snemovna: "Sněmovna",
  senat: "Senát",
  prezident: "Prezident",
  vyhlaseno: "Vyhlášeno",
  ucinne: "Účinné",
};

const PHASE_ICONS: Record<LegislationPhase, LucideIcon> = {
  snemovna: Landmark,
  senat: Scale,
  prezident: PenLine,
  vyhlaseno: FileCheck2,
  ucinne: CircleCheck,
  ukonceno: CircleX,
};

const czDate =(iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("cs-CZ") : "—");

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function isActive(it: LegislationItem): boolean {
  return it.phase !== "ucinne" && it.phase !== "ukonceno";
}

function isRecent(it: LegislationItem): boolean {
  return it.phase === "ucinne" && !!it.effectiveFrom && daysUntil(it.effectiveFrom) > -183;
}

export default function LegislationPage() {
  const [items, setItems] = useState<LegislationItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, "legislation"))
      .then((s) => setItems(s.docs.map((d) => d.data() as LegislationItem)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const list = (items ?? []).filter((it) =>
      filter === "all" ? true : filter === "active" ? isActive(it) : isRecent(it),
    );
    return list.sort((a, b) => (b.lastStepAt ?? b.submittedAt ?? "").localeCompare(a.lastStepAt ?? a.submittedAt ?? ""));
  }, [items, filter]);

  const counts = useMemo(() => {
    const c: Partial<Record<LegislationPhase, number>> = {};
    for (const it of items ?? []) c[it.phase] = (c[it.phase] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <AppShell theme="legislation">
      <header>
        <p className="text-sm text-muted">Zákony relevantní pro finanční poradenství · data Poslanecké sněmovny a e-Sbírky</p>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <IconBadge icon={Gavel} />
          Legislativa
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[...LEGISLATION_PHASES, "ukonceno" as const].map((p) => (
          <div key={p} className="glass flex items-start gap-2.5 rounded-2xl p-3">
            <IconBadge icon={PHASE_ICONS[p]} size="sm" tone={p === "ukonceno" ? "muted" : p === "ucinne" ? "info" : "accent"} />
            <div className="min-w-0">
              <p className="text-xs text-muted">{LEGISLATION_PHASE_LABELS[p]}</p>
              <p className="mt-0.5 text-xl font-semibold">{items ? (counts[p] ?? 0) : "…"}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              filter === f.id
                ? "bg-gradient-to-r from-accent-from/80 to-accent-to/80 text-white"
                : "bg-surface text-muted ring-1 ring-border hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        <Link href="/radar?c=legislation" className="ml-auto text-xs text-accent-to hover:underline">
          Zprávy o legislativě v radaru →
        </Link>
      </div>

      {error && <EmptyCard text={`Legislativu se nepodařilo načíst: ${error}`} />}
      {!error && items === null && <p className="text-sm text-muted">Načítám zákony…</p>}
      {items !== null && shown.length === 0 && <EmptyCard text="Žádný zákon neodpovídá filtru." />}

      <ul className="space-y-3">
        {shown.map((it) => (
          <li key={it.id} className={`glass rounded-2xl p-5 ${it.phase === "vyhlaseno" ? "glow-high" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{it.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{it.fullTitle}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">
                tisk {it.tisk} · {it.proposer || "navrhovatel neuveden"}
              </span>
            </div>

            <PhaseStepper phase={it.phase} />

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span>Předloženo: {czDate(it.submittedAt)}</span>
              <span>Poslední krok: {czDate(it.lastStepAt)}</span>
              {it.stateLabel && it.phase !== "ucinne" && it.phase !== "vyhlaseno" && <span>Stav: {it.stateLabel}</span>}
              {it.sbirka && (
                <span>
                  Sbírka: {it.sbirka.cislo}/{it.sbirka.rok} Sb. (vyhlášeno {czDate(it.sbirka.publishedAt)})
                </span>
              )}
              {it.effectiveFrom && (
                <span className={daysUntil(it.effectiveFrom) > 0 ? "font-medium text-high" : "text-info"}>
                  Účinnost od {czDate(it.effectiveFrom)}
                  {daysUntil(it.effectiveFrom) > 0 ? ` (za ${daysUntil(it.effectiveFrom)} dní)` : ""}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {it.matched.map((m) => (
                <span key={m} className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted ring-1 ring-border">
                  {m}
                </span>
              ))}
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-accent-to hover:underline">
                psp.cz ↗
              </a>
              {it.sbirka && (
                <a
                  href={`https://www.e-sbirka.cz/sb/${it.sbirka.rok}/${it.sbirka.cislo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-to hover:underline"
                >
                  e-Sbírka ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

/** NÁVRH → SENÁT → PREZIDENT → VYHLÁŠENO → ÚČINNÉ (bod 23 specifikace). */
function PhaseStepper({ phase }: { phase: LegislationPhase }) {
  if (phase === "ukonceno") {
    return <p className="mt-3 text-xs font-medium text-critical">● Projednávání skončilo bez schválení</p>;
  }
  const current = LEGISLATION_PHASES.indexOf(phase);
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={`Fáze: ${LEGISLATION_PHASE_LABELS[phase]}`}>
      {LEGISLATION_PHASES.map((p, i) => (
        <li key={p} className="space-y-1">
          <span
            className={`block h-1.5 rounded-full ${
              i < current ? "bg-accent-to/60" : i === current ? "bg-gradient-to-r from-accent-from to-accent-to shadow-[0_0_10px_var(--accent-glow)]" : "bg-surface-strong"
            }`}
          />
          <span className={`block text-[11px] ${i === current ? "font-medium text-foreground" : "text-muted"}`}>{STEP_LABELS[p]}</span>
        </li>
      ))}
    </ol>
  );
}
