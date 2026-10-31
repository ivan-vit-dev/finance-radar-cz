"use client";

import type { Briefing } from "@finance-radar/shared";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_ICONS, IconBadge } from "@/components/icons";
import { db, functions } from "@/lib/firebase";
import { Coffee, Newspaper, Siren, Target, type LucideIcon } from "lucide-react";

/** Ikona oddílu briefingu podle názvu oblasti, který volí model („ČNB“, „Hypotéky a nemovitosti“…). */
function areaIcon(area: string): LucideIcon {
  const a = area.toLowerCase();
  if (a.includes("čnb") || a.includes("centrální")) return CATEGORY_ICONS.cnb;
  if (a.includes("hypot")) return CATEGORY_ICONS.mortgages;
  if (a.includes("nemovit") || a.includes("bydlen")) return CATEGORY_ICONS.real_estate;
  if (a.includes("úvěr")) return CATEGORY_ICONS.consumer_loans;
  if (a.includes("pojiš")) return CATEGORY_ICONS.insurance;
  if (a.includes("regul") || a.includes("legisl") || a.includes("zákon")) return CATEGORY_ICONS.legislation;
  if (a.includes("invest") || a.includes("trh") || a.includes("spoř")) return CATEGORY_ICONS.markets;
  if (a.includes("bank")) return CATEGORY_ICONS.banks;
  if (a.includes("ekonom") || a.includes("inflac")) return CATEGORY_ICONS.economy;
  return Newspaper;
}

/** Pražské datum YYYY-MM-DD – stejný klíč jako na backendu. */
function pragueDate(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);
}

function periodText(b: Briefing): string {
  const from = new Date(b.coversFrom);
  const to = new Date(b.coversTo);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 1) return "za posledních 24 hodin";
  return `od ${from.toLocaleDateString("cs-CZ")} (${days} ${days < 5 ? "dny" : "dní"})`;
}

/**
 * Briefing se vytváří při prvním otevření aplikace v daný den (backend `getBriefing`)
 * a shrnuje období od předchozího briefingu.
 */
export function BriefingCard() {
  const date = pragueDate();
  const [briefing, setBriefing] = useState<Briefing | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "briefings", date),
        (s) => {
          const data = s.data() as (Briefing & { requestedAt?: string }) | undefined;
          setBriefing(data?.generatedAt ? data : null);
        },
        (e) => setError(e.message),
      ),
    [date],
  );

  useEffect(() => {
    if (briefing !== null || requested.current) return;
    requested.current = true;
    httpsCallable(functions, "getBriefing")({}).catch((e: { message?: string }) => setError(e.message ?? String(e)));
  }, [briefing]);

  const titleOf = (id: string) => briefing?.events.find((e) => e.id === id)?.title ?? "událost";

  return (
    <section className="glass glow-accent relative overflow-hidden rounded-3xl p-6" aria-labelledby="briefing-h">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-gradient-to-br from-accent-from/40 to-accent-to/30 blur-3xl" />
      <p className="relative flex items-center gap-2 text-sm font-medium text-accent-to">
        <IconBadge icon={Coffee} size="sm" />
        Briefing {briefing ? <span className="font-normal text-muted">{periodText(briefing)}</span> : null}
      </p>

      {error && !briefing && <p className="relative mt-2 text-sm text-muted">Briefing se nepodařilo připravit: {error}</p>}

      {!error && !briefing && (
        <div className="relative mt-3 space-y-3" aria-busy="true">
          <p className="text-sm text-muted">Připravuji briefing od tvé poslední návštěvy… obvykle 20–40 sekund.</p>
          {[90, 70, 80].map((w) => (
            <div key={w} className="h-3 animate-pulse rounded bg-surface-strong" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {briefing && (
        <div className="relative mt-2 space-y-5">
          <h2 id="briefing-h" className="max-w-3xl text-xl font-semibold leading-snug">
            {briefing.headline}
          </h2>

          {briefing.topStory && (
            <Link
              href={`/event/${briefing.topStory.eventId}`}
              className="block rounded-2xl bg-surface-strong p-4 ring-1 ring-critical/30 transition hover:ring-critical/60"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-critical">
                <Siren size={14} aria-hidden /> Největší událost
              </p>
              <p className="mt-1 font-medium">{briefing.topStory.title}</p>
              <p className="mt-2 text-sm text-muted">{briefing.topStory.text}</p>
              <p className="mt-2 text-xs text-foreground/80">Co sledovat: {briefing.topStory.watch}</p>
            </Link>
          )}

          {briefing.sections.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {briefing.sections.map((s) => (
                <div key={s.area} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-important">
                    <IconBadge icon={areaIcon(s.area)} size="sm" tone="muted" />
                    {s.area}
                  </p>
                  <p className="mt-2 text-sm">{s.text}</p>
                  {s.eventIds.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-x-3 text-xs">
                      {s.eventIds.map((id) => (
                        <Link key={id} href={`/event/${id}`} className="text-accent-to hover:underline">
                          {titleOf(id)} →
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {briefing.forAdvisor.length > 0 && (
            <div className="rounded-2xl bg-surface-strong p-4 ring-1 ring-accent-from/30">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Target size={16} className="text-accent-to" aria-hidden /> Co je dnes důležité pro poradce
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {briefing.forAdvisor.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted">
            {briefing.kind === "ai"
              ? `AI shrnutí (${briefing.model}) z ${briefing.events.length} ověřených událostí, ${new Date(briefing.generatedAt).toLocaleString("cs-CZ")}. Čísla viz Tržní ukazatele níže.`
              : "Bez důležitých událostí, shrnutí nebylo potřeba."}
          </p>
        </div>
      )}
    </section>
  );
}
