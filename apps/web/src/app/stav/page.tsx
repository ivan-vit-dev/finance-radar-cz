"use client";

import { MVP_SOURCES, type SourceState } from "@finance-radar/shared";
import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyCard, SectionTitle } from "@/components/ui";
import { db } from "@/lib/firebase";
import { formatNumber, formatPeriod, timeAgo } from "@/lib/format";

interface IndicatorStatus {
  id: string;
  label: string;
  source: string;
  unit: string;
  decimals: number;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  lastError?: string | null;
  consecutiveErrors?: number;
  stats?: { latest: { p: string; v: number } } | null;
}

interface UsageDay {
  date: string;
  usd: number;
  calls: number;
  byModel?: Record<string, number>;
}

type Health = "ok" | "warn" | "error";

const HEALTH: Record<Health, { icon: string; label: string; className: string }> = {
  ok: { icon: "🟢", label: "v pořádku", className: "text-info" },
  warn: { icon: "🟠", label: "pozor", className: "text-high" },
  error: { icon: "🔴", label: "chyba", className: "text-critical" },
};

/** Zdroj je „tichý“, když delší dobu nepřinesl nic nového (podle frekvence, min. 3 dny). */
function sourceHealth(frequencyMinutes: number, s: SourceState | undefined, now: number): { health: Health; note: string } {
  if (!s?.lastFetchedAt) return { health: "warn", note: "zatím nestaženo" };
  if (s.consecutiveErrors > 0) return { health: "error", note: s.lastError ?? "chyba" };
  const sinceSuccess = now - new Date(s.lastSuccessAt ?? s.lastFetchedAt).getTime();
  if (sinceSuccess > Math.max(frequencyMinutes * 4, 120) * 60_000) return { health: "warn", note: "dlouho nestaženo" };
  const quietLimit = 3 * 86_400_000;
  if (s.lastNewAt && now - new Date(s.lastNewAt).getTime() > quietLimit) {
    return { health: "warn", note: "víc než 3 dny nic nového" };
  }
  return { health: "ok", note: "" };
}

export default function StatusPage() {
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [indicators, setIndicators] = useState<IndicatorStatus[]>([]);
  const [usage, setUsage] = useState<UsageDay[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pausedUntil, setPausedUntil] = useState<string | null | undefined>(undefined);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Jednorázové načtení (stránka se otevírá zřídka, živý odběr není potřeba).
    (async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const [stateSnap, indSnap, usageSnap, runtime, ...statusCounts] = await Promise.all([
        getDocs(collection(db, "sourceState")),
        getDocs(collection(db, "indicators")),
        getDocs(query(collection(db, "aiUsage"), where(documentId(), ">=", since), orderBy(documentId(), "desc"), limit(30))),
        getDoc(doc(db, "config", "runtime")),
        ...["pending", "classified", "discarded", "error"].map((s) =>
          getCountFromServer(query(collection(db, "documents"), where("status", "==", s))),
        ),
        getCountFromServer(collection(db, "events")),
      ]);
      setStates(Object.fromEntries(stateSnap.docs.map((d) => [d.id, d.data() as SourceState])));
      setIndicators(indSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IndicatorStatus, "id">) })));
      setUsage(usageSnap.docs.map((d) => ({ date: d.id, ...(d.data() as Omit<UsageDay, "date">) })));
      setPausedUntil((runtime.data()?.pausedUntil as string | undefined) ?? null);
      const names = ["pending", "classified", "discarded", "error", "events"];
      setCounts(Object.fromEntries(statusCounts.map((c, i) => [names[i], c.data().count])));
      setLoadedAt(Date.now());
    })().catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <AppShell>
        <EmptyCard text={`Stav se nepodařilo načíst: ${error}`} />
      </AppShell>
    );
  }

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthUsd = usage.filter((u) => u.date.startsWith(monthPrefix)).reduce((s, u) => s + u.usd, 0);
  const maxUsd = Math.max(0.01, ...usage.map((u) => u.usd));
  const sources = MVP_SOURCES.filter((s) => s.enabled);
  const sourceRows = sources.map((s) => ({ s, st: states[s.id], ...sourceHealth(s.frequencyMinutes, states[s.id], loadedAt) }));
  const problems = sourceRows.filter((r) => r.health !== "ok").length + indicators.filter((i) => (i.consecutiveErrors ?? 0) > 0).length;

  return (
    <AppShell>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Stav systému</h1>
        <p className="mt-1 text-sm text-muted">Sběr dat, ukazatele a útrata za AI. Data se načetla při otevření stránky.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Provoz" value={pausedUntil ? `pozastaven do ${pausedUntil}` : pausedUntil === null ? "běží" : "…"} tone={pausedUntil ? "warn" : "ok"} />
        <Stat label="Problémy" value={loadedAt ? String(problems) : "…"} tone={problems ? "warn" : "ok"} />
        <Stat label="AI tento měsíc" value={`$${formatNumber(monthUsd, 2)}`} tone="ok" />
        <Stat label="Události / články" value={counts.events !== undefined ? `${counts.events} / ${(counts.classified ?? 0) + (counts.discarded ?? 0) + (counts.pending ?? 0)}` : "…"} tone="ok" />
      </div>

      <section aria-labelledby="sources-h">
        <SectionTitle id="sources-h">Zdroje ({sources.length})</SectionTitle>
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="p-3 font-medium">Zdroj</th>
                <th className="p-3 font-medium">Kontrola</th>
                <th className="p-3 font-medium">Naposledy staženo</th>
                <th className="p-3 font-medium">Naposledy nové</th>
                <th className="p-3 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sourceRows.map(({ s, st, health, note }) => (
                <tr key={s.id}>
                  <td className="p-3">
                    {s.name}
                    <span className="block text-xs text-muted">
                      {s.kind.toUpperCase()} · tier {s.tier}
                    </span>
                  </td>
                  <td className="p-3 text-muted">každých {s.frequencyMinutes >= 60 ? `${s.frequencyMinutes / 60} h` : `${s.frequencyMinutes} min`}</td>
                  <td className="p-3 text-muted">{st?.lastSuccessAt ? timeAgo(st.lastSuccessAt) : "—"}</td>
                  <td className="p-3 text-muted">{st?.lastNewAt ? timeAgo(st.lastNewAt) : "—"}</td>
                  <td className={`p-3 ${HEALTH[health].className}`} title={note}>
                    {HEALTH[health].icon} {note || HEALTH[health].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="ind-h">
        <SectionTitle id="ind-h">Ukazatele</SectionTitle>
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="p-3 font-medium">Ukazatel</th>
                <th className="p-3 font-medium">Poslední hodnota</th>
                <th className="p-3 font-medium">Kontrolováno</th>
                <th className="p-3 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {indicators.map((i) => {
                const health: Health = (i.consecutiveErrors ?? 0) > 0 ? "error" : "ok";
                return (
                  <tr key={i.id}>
                    <td className="p-3">
                      {i.label}
                      <span className="block text-xs text-muted">{i.source}</span>
                    </td>
                    <td className="p-3 font-mono tabular-nums">
                      {i.stats ? `${formatNumber(i.stats.latest.v, i.decimals)} ${i.unit}` : "—"}
                      {i.stats && <span className="block font-sans text-xs text-muted">{formatPeriod(i.stats.latest.p)}</span>}
                    </td>
                    <td className="p-3 text-muted">{i.lastCheckedAt ? timeAgo(i.lastCheckedAt) : "—"}</td>
                    <td className={`p-3 ${HEALTH[health].className}`} title={i.lastError ?? ""}>
                      {HEALTH[health].icon} {health === "error" ? i.lastError : HEALTH[health].label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="ai-h">
        <SectionTitle id="ai-h">Útrata za AI (posledních 30 dní)</SectionTitle>
        <div className="glass space-y-2 rounded-2xl p-4">
          {usage.length === 0 && <p className="text-sm text-muted">Zatím žádná volání.</p>}
          {usage.map((u) => (
            <div key={u.date} className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-3 text-sm">
              <span className="text-muted">{new Date(u.date).toLocaleDateString("cs-CZ")}</span>
              <span className="h-2 rounded-full bg-surface-strong">
                <span
                  className="block h-2 rounded-full bg-gradient-to-r from-accent-from to-accent-to"
                  style={{ width: `${Math.max(2, (u.usd / maxUsd) * 100)}%` }}
                  title={Object.entries(u.byModel ?? {})
                    .map(([m, v]) => `${m}: $${v.toFixed(3)}`)
                    .join(", ")}
                />
              </span>
              <span className="text-right font-mono tabular-nums">${formatNumber(u.usd, 3)}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted">
            Limity: automatické zpracování max. $1 denně, celkem včetně analýz na vyžádání max. $3 denně.
          </p>
        </div>
      </section>

      <section aria-labelledby="docs-h">
        <SectionTitle id="docs-h">Články v databázi</SectionTitle>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Stat label="Čeká na zpracování" value={String(counts.pending ?? "…")} tone="ok" />
          <Stat label="Zařazeno do událostí" value={String(counts.classified ?? "…")} tone="ok" />
          <Stat label="Nerelevantní (smažou se po 30 dnech)" value={String(counts.discarded ?? "…")} tone="ok" />
          <Stat label="Chyba zpracování" value={String(counts.error ?? "…")} tone={counts.error ? "warn" : "ok"} />
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Health }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "ok" ? "" : HEALTH[tone].className}`}>{value}</p>
    </div>
  );
}
