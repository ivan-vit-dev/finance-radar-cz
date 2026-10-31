"use client";

import type { Briefing } from "@finance-radar/shared";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { db, functions } from "@/lib/firebase";

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
      <p className="relative text-sm font-medium text-accent-to">
        ☕ Briefing {briefing ? <span className="font-normal text-muted">{periodText(briefing)}</span> : null}
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
              <p className="text-xs font-medium uppercase tracking-wider text-critical">🔴 Největší událost</p>
              <p className="mt-1 font-medium">{briefing.topStory.title}</p>
              <p className="mt-2 text-sm text-muted">{briefing.topStory.text}</p>
              <p className="mt-2 text-xs text-foreground/80">Co sledovat: {briefing.topStory.watch}</p>
            </Link>
          )}

          {briefing.sections.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {briefing.sections.map((s) => (
                <div key={s.area} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-important">🟡 {s.area}</p>
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
              <p className="text-sm font-semibold">🎯 Co je dnes důležité pro poradce</p>
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
