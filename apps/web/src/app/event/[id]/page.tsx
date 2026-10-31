"use client";

import {
  MVP_SOURCES,
  PRIORITY_LABELS,
  type EventAnalysis,
  type EventFact,
  type ImpactLevel,
  type MarketEvent,
  type SourceDocument,
  type StatementType,
} from "@finance-radar/shared";
import { addDoc, collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth-gate";
import {
  CategoryList,
  EmptyCard,
  FactCheck,
  PRIORITY_STYLES,
  PriorityDot,
  SectionTitle,
  StatementBadge,
  VerificationBadge,
} from "@/components/ui";
import { db, functions } from "@/lib/firebase";
import { formatNumber, formatPeriod, timeAgo } from "@/lib/format";

type AnalysisState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const TYPE_ORDER: StatementType[] = ["fact", "interpretation", "forecast", "opinion"];

const IMPACT: Record<ImpactLevel, { label: string; className: string }> = {
  high: { label: "vysoký", className: "text-critical" },
  medium: { label: "střední", className: "text-high" },
  low: { label: "nízký", className: "text-info" },
  none: { label: "žádný", className: "text-muted" },
};

const IMPACT_AREAS: { key: keyof EventAnalysis["impact"]; label: string }[] = [
  { key: "mortgages", label: "Hypotéky" },
  { key: "consumerLoans", label: "Úvěry" },
  { key: "realEstate", label: "Nemovitosti" },
  { key: "insurance", label: "Pojištění" },
  { key: "investments", label: "Investice" },
];

const AFFECTED: Record<string, string> = {
  mortgage_client: "hypoteční klienti",
  borrower: "dlužníci",
  investor: "investoři",
  saver: "střadatelé",
  property_owner: "majitelé nemovitostí",
  tenant: "nájemníci",
  insured: "pojištěnci",
  entrepreneur: "podnikatelé",
};

const sourceName = (id: string) => MVP_SOURCES.find((s) => s.id === id)?.name ?? id;

export default function EventPage() {
  return (
    <AppShell>
      <EventDetail />
    </AppShell>
  );
}

function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<MarketEvent | null | undefined>(undefined);
  const [docs, setDocs] = useState<SourceDocument[]>([]);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ kind: "idle" });
  const requested = useRef<number | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "events", id),
        (s) => setEvent(s.exists() ? (s.data() as MarketEvent) : null),
        () => setEvent(null),
      ),
    [id],
  );

  // Zdrojové články (jen pár dokumentů na událost).
  const documentKey = event?.documentIds.join(",") ?? "";
  useEffect(() => {
    if (!documentKey) return;
    Promise.all(documentKey.split(",").map((d) => getDoc(doc(db, "documents", d)))).then((snaps) =>
      setDocs(snaps.filter((s) => s.exists()).map((s) => s.data() as SourceDocument)),
    );
  }, [documentKey]);

  // Analýza na vyžádání: při prvním otevření (nebo po změně události) se vygeneruje a uloží.
  useEffect(() => {
    if (!event || event.analysis?.revision === event.revision) return;
    if (requested.current === event.revision) return;
    requested.current = event.revision;
    setAnalysisState({ kind: "loading" });
    httpsCallable<{ eventId: string }, { status: string }>(functions, "analyzeEvent")({ eventId: event.id })
      .then(() => setAnalysisState({ kind: "idle" }))
      .catch((e: { message?: string }) => setAnalysisState({ kind: "error", message: e.message ?? String(e) }));
  }, [event]);

  if (event === undefined) return <p className="text-sm text-muted">Načítám událost…</p>;
  if (event === null) return <EmptyCard text="Událost neexistuje nebo byla odstraněna." />;

  const analysisCurrent = event.analysis?.revision === event.revision;
  const factsByType = TYPE_ORDER.map((t) => ({ type: t, facts: event.facts.filter((f) => f.t === t) })).filter(
    (g) => g.facts.length > 0,
  );

  return (
    <>
      <Link href="/radar" className="text-xs text-accent-to hover:underline">
        ← Zpět na radar
      </Link>

      <header className={`glass rounded-3xl p-6 ${PRIORITY_STYLES[event.priority].card}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className={`inline-flex items-center gap-1.5 font-medium ${PRIORITY_STYLES[event.priority].text}`}>
            <PriorityDot priority={event.priority} />
            {PRIORITY_LABELS[event.priority]} · skóre {event.finalScore}
          </span>
          <VerificationBadge status={event.verification} />
          <span>
            <CategoryList categories={event.categories} />
          </span>
          <span>poprvé {timeAgo(event.firstSeenAt)}</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</h1>
        <p className="mt-3 max-w-3xl text-muted">{event.summary}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section aria-labelledby="analysis-h">
            <SectionTitle id="analysis-h">Analýza pro poradce</SectionTitle>
            {event.analysis ? (
              <AnalysisView analysis={event.analysis} stale={!analysisCurrent} eventId={event.id} />
            ) : analysisState.kind === "error" ? (
              <EmptyCard text={`Analýzu se nepodařilo vytvořit: ${analysisState.message}`} />
            ) : (
              <AnalysisSkeleton />
            )}
            {event.analysis && !analysisCurrent && analysisState.kind === "loading" && (
              <p className="mt-2 text-xs text-muted">Událost se změnila, analýzu aktualizuji…</p>
            )}
          </section>

          <section aria-labelledby="facts-h">
            <SectionTitle id="facts-h">Tvrzení a jejich zdroje</SectionTitle>
            <div className="space-y-4">
              {factsByType.map((g) => (
                <ul key={g.type} className="glass divide-y divide-border rounded-2xl">
                  {g.facts.map((f, i) => (
                    <FactRow key={i} fact={f} docs={docs} />
                  ))}
                </ul>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="sources-h">
            <SectionTitle id="sources-h">Zdroje ({event.sourceIds.length})</SectionTitle>
            <ul className="glass divide-y divide-border rounded-2xl">
              {docs.map((d) => (
                <li key={d.id} className="p-4">
                  <p className="text-xs text-muted">
                    {sourceName(d.sourceId)} {d.tier === 1 && <span className="text-info">· primární zdroj</span>}
                  </p>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-sm font-medium hover:text-accent-to hover:underline"
                  >
                    {d.title} ↗
                  </a>
                  {d.publishedAt && <p className="mt-1 text-xs text-muted">{new Date(d.publishedAt).toLocaleString("cs-CZ")}</p>}
                </li>
              ))}
              {docs.length === 0 && <li className="p-4 text-sm text-muted">Načítám zdroje…</li>}
            </ul>
          </section>

          {event.entities.length > 0 && (
            <section aria-labelledby="entities-h">
              <SectionTitle id="entities-h">Týká se</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {event.entities.map((e) => (
                  <span key={e} className="rounded-full bg-surface px-3 py-1 text-xs text-muted ring-1 ring-border">
                    {e}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function FactRow({ fact, docs }: { fact: EventFact; docs: SourceDocument[] }) {
  const source = docs.find((d) => d.id === fact.doc);
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatementBadge type={fact.t} />
        {fact.v !== undefined && (
          <span className="font-mono text-sm tabular-nums">
            {formatNumber(fact.v, Number.isInteger(fact.v) ? 0 : 2)} {fact.u}
          </span>
        )}
        {fact.per && <span className="text-xs text-muted">{formatPeriod(fact.per)}</span>}
        <FactCheck chk={fact.chk} />
      </div>
      <p className="text-sm">{fact.s}</p>
      <blockquote className="border-l-2 border-border pl-3 text-xs italic text-muted">
        „{fact.q}“
        <span className="not-italic">
          {" "}
          — {fact.by ?? (source ? sourceName(source.sourceId) : "zdroj")}
          {source && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-accent-to hover:underline">
              originál ↗
            </a>
          )}
        </span>
      </blockquote>
    </li>
  );
}

function AnalysisView({ analysis, stale, eventId }: { analysis: EventAnalysis; stale: boolean; eventId: string }) {
  return (
    <div className={`glass glow-accent space-y-5 rounded-2xl p-5 ${stale ? "opacity-70" : ""}`}>
      <Block title="Co se stalo">{analysis.whatHappened}</Block>
      <Block title="Proč">{analysis.why}</Block>
      <Block title="Co to znamená">{analysis.meaning}</Block>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Dopad</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {IMPACT_AREAS.map((a) => (
              <div key={a.key} className="contents">
                <dt className="text-muted">{a.label}</dt>
                <dd className={IMPACT[analysis.impact[a.key]].className}>{IMPACT[analysis.impact[a.key]].label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Koho se týká</h3>
          <p className="mt-2 text-sm">{analysis.whoIsAffected.map((w) => AFFECTED[w] ?? w).join(", ") || "—"}</p>
          <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">Co sledovat</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {analysis.whatToWatch.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl bg-surface-strong p-4 ring-1 ring-accent-from/30">
        <h3 className="text-sm font-semibold">👨‍💼 Co to znamená pro poradce</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {analysis.forAdvisor.map((f) => (
            <li key={f.label + f.text}>
              <span className="font-medium text-accent-to">{f.label}:</span> {f.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
        <h3 className="text-sm font-semibold">💬 Jak to vysvětlit klientovi</h3>
        <p className="mt-2 text-sm">{analysis.clientExplanation}</p>
        <p className="mt-2 text-xs text-muted">Komunikační pomůcka, ne finanční doporučení.</p>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {analysis.model} · {new Date(analysis.generatedAt).toLocaleString("cs-CZ")} · AI analýza, fakta ověřuj ve zdrojích
        </span>
        <FeedbackButton eventId={eventId} revision={analysis.revision} />
      </footer>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="glass space-y-3 rounded-2xl p-5" aria-busy="true">
      <p className="text-sm text-muted">Generuji analýzu… obvykle 10–20 sekund. Fakta níže jsou k dispozici hned.</p>
      {[80, 95, 60].map((w) => (
        <div key={w} className="h-3 animate-pulse rounded bg-surface-strong" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** Označení chybné analýzy (bod 32 specifikace) – uloží se do `feedback`. */
function FeedbackButton({ eventId, revision }: { eventId: string; revision: number }) {
  const user = useUser();
  const [state, setState] = useState<"idle" | "open" | "sent">("idle");
  const [note, setNote] = useState("");

  if (state === "sent") return <span className="text-info">Díky, nahlášeno.</span>;
  if (state === "idle") {
    return (
      <button type="button" onClick={() => setState("open")} className="text-muted underline hover:text-critical">
        Označit chybnou analýzu
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        await addDoc(collection(db, "feedback"), {
          eventId,
          revision,
          uid: user.uid,
          note: note.trim().slice(0, 1000),
          createdAt: new Date().toISOString(),
        });
        setState("sent");
      }}
    >
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Co je špatně? (nepovinné)"
        className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-1.5 text-foreground ring-1 ring-border focus:outline-none focus:ring-accent-to sm:w-64"
      />
      <button type="submit" className="rounded-lg bg-critical/20 px-3 py-1.5 text-critical hover:bg-critical/30">
        Odeslat
      </button>
    </form>
  );
}
