"use client";

import { MVP_SOURCES, PRIORITY_LABELS, SCORE_WEIGHTS, type Priority, type StatementType } from "@finance-radar/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { PriorityDot, STATEMENT_TYPE, StatementBadge, VERIFICATION } from "@/components/ui";

const PRIORITY_RANGES: { p: Priority; range: string; meaning: string }[] = [
  { p: "critical", range: "90–100", meaning: "Zásadní změna s přímým dopadem na klienty (např. změna repo sazby). Analýza se připraví automaticky." },
  { p: "high", range: "75–89", meaning: "Důležité pro práci poradce, stojí za přečtení ještě dnes." },
  { p: "important", range: "55–74", meaning: "Užitečný kontext k trhu a produktům." },
  { p: "info", range: "30–54", meaning: "Informativní, pro přehled." },
  { p: "low", range: "0–29", meaning: "Okrajové; na dashboardu se neukazuje." },
];

const INDICATORS = [
  { name: "Repo sazba ČNB", source: "ČNB (historie repo sazby)", when: "kontrola každých 6 h; mění se po rozhodnutí bankovní rady" },
  { name: "Sazba nových hypoték", source: "ČNB ARAD – průměrná sazba nově sjednaných úvěrů na bydlení", when: "měsíčně, data za měsíc vychází zhruba koncem následujícího měsíce" },
  { name: "Objem nových hypoték", source: "ČNB ARAD", when: "měsíčně (jako výše)" },
  { name: "Sazba spotřebitelských úvěrů", source: "ČNB ARAD", when: "měsíčně (jako výše)" },
  { name: "Sazba spořicích účtů", source: "ČNB ARAD – úsporné vklady domácností", when: "měsíčně (jako výše)" },
  { name: "Inflace (meziročně)", source: "ČSÚ DataStat", when: "měsíčně, obvykle kolem 10. dne" },
  { name: "EUR/CZK", source: "ČNB – kurzy devizového trhu", when: "pracovní dny po 14:30, kontrola každé 3 h" },
];

const TOC = [
  ["jak-to-funguje", "Jak aplikace funguje"],
  ["obnova", "Jak často se data obnovují"],
  ["zdroje", "Zdroje"],
  ["priority", "Barvy a skóre"],
  ["overeni", "Důvěryhodnost a ověření"],
  ["tvrzeni", "Fakta, analýzy, odhady, názory"],
  ["ukazatele", "Tržní ukazatele"],
  ["legislativa", "Legislativa"],
  ["ai", "Co dělá AI a co ne"],
  ["alerty", "Briefing, alerty, instalace"],
  ["provoz", "Náklady, limity a pauza"],
] as const;

const freq = (min: number) => (min >= 60 ? `každé ${min / 60} h` : `každých ${min} min`);

export default function HelpPage() {
  return (
    <AppShell>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Nápověda</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Finance Radar každý den sleduje český finanční trh, třídí stovky zpráv, ověřuje je proti primárním zdrojům a
          ukazuje jen to, co je důležité pro práci finančního poradce. Nemusíš číst všechno – potřebuješ vědět, co je
          důležité.
        </p>
      </header>

      <nav className="glass flex flex-wrap gap-x-4 gap-y-2 rounded-2xl p-4 text-sm" aria-label="Obsah nápovědy">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-accent-to hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="jak-to-funguje" title="Jak aplikace funguje">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <b>Sběr.</b> Každých 15 minut se zkontrolují zdroje (RSS kanály, tiskové zprávy, data ČNB, ČSÚ, Sněmovny). Ukládá
            se jen titulek, krátký perex a odkaz – plné texty článků se neukládají.
          </li>
          <li>
            <b>Třídění.</b> AI (model Claude Haiku) u každého článku určí oblast (hypotéky, úvěry, ČNB, pojištění…) a ohodnotí,
            jak je důležitý pro poradce. Nerelevantní články (sport, krimi, zahraniční politika) se vyřadí a po 30 dnech samy
            smažou.
          </li>
          <li>
            <b>Fakta.</b> Z relevantních článků AI vytáhne jednotlivá tvrzení s doslovnou citací. Program ověří, že citace v
            článku opravdu je – vymyšlené tvrzení tak neprojde.
          </li>
          <li>
            <b>Události.</b> Stejná zpráva z více médií se sloučí do jedné události („1 událost / 5 zdrojů“).
          </li>
          <li>
            <b>Ověření a skóre.</b> Program porovná čísla s daty ČNB/ČSÚ, určí důvěryhodnost a spočítá skóre a prioritu.
          </li>
          <li>
            <b>Analýza na vyžádání.</b> Podrobnou analýzu „pro poradce“ (model Claude Opus) vytvoří aplikace, až když
            událost otevřeš – platí se jen za to, co čteš. Uloží se, takže příště se načte hned. U kritických událostí se
            připraví předem.
          </li>
          <li>
            <b>Briefing a alerty.</b> Při prvním otevření dne vznikne briefing za období od tvé poslední návštěvy; důležité
            události ti mohou chodit jako notifikace.
          </li>
        </ol>
      </Section>

      <Section id="obnova" title="Jak často se data obnovují">
        <ul className="list-disc space-y-1 pl-5">
          <li>Kontrola zdrojů běží každých 15 minut; každý zdroj má vlastní interval (viz tabulka zdrojů).</li>
          <li>Nové články se AI zpracují postupně, nejvýš 20 za běh – nová zpráva je v radaru obvykle do 15–30 minut.</li>
          <li>Ukazatele: kurz každé 3 h, repo sazba každých 6 h, měsíční statistiky ČNB a ČSÚ dvakrát denně.</li>
          <li>Legislativa: data Sněmovny se aktualizují jednou za noc, aplikace je kontroluje dvakrát denně.</li>
          <li>Dashboard i radar se aktualizují živě – není potřeba obnovovat stránku.</li>
        </ul>
      </Section>

      <Section id="zdroje" title="Zdroje">
        <p>
          Ne všechny zdroje mají stejnou váhu. <b>Tier 1</b> jsou primární zdroje (ČNB, ministerstva, Sněmovna, asociace),
          <b> tier 2</b> odborné portály, <b>tier 3</b> média. Primární zdroj má při ověřování přednost.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Zdroj</th>
                <th className="py-2 pr-3 font-medium">Tier</th>
                <th className="py-2 pr-3 font-medium">Typ</th>
                <th className="py-2 pr-3 font-medium">Kontrola</th>
                <th className="py-2 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MVP_SOURCES.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-to hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className="py-2 pr-3">{s.tier}</td>
                  <td className="py-2 pr-3 text-muted">{s.kind.toUpperCase()}</td>
                  <td className="py-2 pr-3 text-muted">{freq(s.frequencyMinutes)}</td>
                  <td className="py-2 text-muted">{s.enabled ? "sleduje se" : "vypnuto (blokuje automatický přístup)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Aktuální stav zdrojů (kdy se naposledy stáhly, zda nehlásí chybu) najdeš na stránce{" "}
          <Link href="/stav" className="text-accent-to hover:underline">
            Stav systému
          </Link>
          .
        </p>
      </Section>

      <Section id="priority" title="Barvy a skóre">
        <ul className="space-y-2">
          {PRIORITY_RANGES.map((r) => (
            <li key={r.p} className="flex items-start gap-3">
              <span className="mt-1.5">
                <PriorityDot priority={r.p} />
              </span>
              <span>
                <b>
                  {PRIORITY_LABELS[r.p]} ({r.range})
                </b>{" "}
                – {r.meaning}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Skóre počítá program ze čtyř hodnocení AI a z důvěryhodnosti zdroje:{" "}
          <span className="font-mono text-xs">
            {Math.round(SCORE_WEIGHTS.advisorImpact * 100)} % dopad na poradce + {Math.round(SCORE_WEIGHTS.marketImpact * 100)} % dopad
            na trh + {Math.round(SCORE_WEIGHTS.urgency * 100)} % naléhavost + {Math.round(SCORE_WEIGHTS.relevance * 100)} % relevance +{" "}
            {Math.round(SCORE_WEIGHTS.confidence * 100)} % důvěryhodnost
          </span>
          . Svítící okraj karty (glow) mají jen kritické a vysoce prioritní události.
        </p>
      </Section>

      <Section id="overeni" title="Důvěryhodnost a ověření">
        <ul className="space-y-1">
          {Object.entries(VERIFICATION).map(([k, v]) => (
            <li key={k}>
              <span aria-hidden>{v.icon}</span> <b className={v.className}>{v.label}</b>
              {k === "verified_primary" && " – zpráva pochází přímo od instituce (ČNB, MF, Sněmovna, ČAP…)."}
              {k === "confirmed_multiple" && " – o téže věci píše víc nezávislých zdrojů."}
              {k === "secondary" && " – zatím jen jedno médium nebo odborný portál."}
              {k === "pending" && " – zdroj s nízkou vahou, čeká na potvrzení."}
              {k === "conflict" && " – číslo ve zprávě nesedí s oficiálními daty ČNB/ČSÚ. Ber s rezervou."}
            </li>
          ))}
        </ul>
        <p className="mt-3">
          U jednotlivých tvrzení může být značka <span className="text-info">✓ ověřeno proti datům</span> (repo sazba, inflace a
          kurz sedí s daty ČNB/ČSÚ) nebo <span className="text-critical">⚠ nesedí s daty</span>.
        </p>
      </Section>

      <Section id="tvrzeni" title="Fakta, analýzy, odhady, názory">
        <ul className="space-y-2">
          {(Object.keys(STATEMENT_TYPE) as StatementType[]).map((t) => (
            <li key={t} className="flex items-start gap-3">
              <StatementBadge type={t} />
              <span>
                {t === "fact" && "Ověřitelný údaj nebo rozhodnutí („ČNB ponechala repo sazbu na 3,75 %“)."}
                {t === "interpretation" && "Výklad souvislostí („to může omezovat pokles sazeb hypoték“)."}
                {t === "forecast" && "Odhad budoucího vývoje – vždy s uvedením, kdo ho tvrdí. Nikdy jistota."}
                {t === "opinion" && "Názor konkrétní osoby nebo analytika."}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3">U každého tvrzení je doslovná citace a odkaz na originální článek.</p>
      </Section>

      <Section id="ukazatele" title="Tržní ukazatele">
        <ul className="space-y-2">
          {INDICATORS.map((i) => (
            <li key={i.name}>
              <b>{i.name}</b> – {i.source}. <span className="text-muted">{i.when}.</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Změny (např. „+0,11 p. b. m/m“) a trendy počítá program, ne AI. <b>p. b.</b> = procentní bod, <b>m/m</b> = proti
          předchozímu měsíci, <b>d/d</b> = proti předchozímu dni. Sazby hypoték z ČNB jsou průměry skutečně sjednaných úvěrů, ne
          nabídkové sazby bank.
        </p>
      </Section>

      <Section id="legislativa" title="Legislativa">
        <p>
          Zákony se berou z otevřených dat Poslanecké sněmovny (stav projednávání) a z e-Sbírky (datum účinnosti). Fáze:{" "}
          <b>Sněmovna → Senát → Prezident → Vyhlášeno → Účinné</b>. Fázi určuje program z oficiálních dat, ne AI.
        </p>
        <p className="mt-2">
          Sledují se návrhy zákonů z aktuálního volebního období, jejichž název obsahuje témata: úvěry, hypotéky, pojištění
          (kromě zdravotního a sociálního), banky a platby, daně, penze a spoření, investice, insolvence a exekuce, bydlení a
          nemovitosti, finanční trh. Z minulého období ty, které vyšly ve Sbírce za poslední 2 roky. Když zákon postoupí do další
          fáze (schválen, vyhlášen, nabývá účinnosti), vznikne událost v radaru a může přijít alert.
        </p>
      </Section>

      <Section id="ai" title="Co dělá AI a co ne">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-medium">AI dělá</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>třídění a hodnocení zpráv</li>
              <li>vytažení tvrzení s citacemi</li>
              <li>slučování stejných zpráv</li>
              <li>analýzu, vysvětlení a briefing</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Počítá program (bez AI)</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>všechna čísla, změny a trendy ukazatelů</li>
              <li>skóre a prioritu</li>
              <li>ověření čísel proti datům ČNB/ČSÚ</li>
              <li>fáze zákonů a data účinnosti</li>
              <li>pravidla alertů</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-muted">
          AI výstupy jsou pomůcka, ne finanční doporučení. Fakta vždy ověřuj v originálních zdrojích (odkazy jsou u každé
          události). Chybnou analýzu můžeš nahlásit tlačítkem v detailu události.
        </p>
      </Section>

      <Section id="alerty" title="Briefing, alerty, instalace">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Briefing</b> vznikne při prvním otevření aplikace v daný den a shrne období od předchozího briefingu (nejvýš týden).
            Když se nic důležitého nestalo, AI se nevolá.
          </li>
          <li>
            <b>Alerty</b> si zapneš v{" "}
            <Link href="/nastaveni" className="text-accent-to hover:underline">
              Nastavení
            </Link>
            : od jaké priority, z jakých oblastí a zda chceš vše přímo od ČNB. Na jednu událost přijde nejvýš jedna notifikace.
          </li>
          <li>
            <b>Instalace:</b> v Chrome nebo Edge ikona „Nainstalovat aplikaci“ v adresním řádku. Aplikace pak běží ve vlastním
            okně a na ikoně ukazuje počet kritických událostí.
          </li>
        </ul>
      </Section>

      <Section id="provoz" title="Náklady, limity a pauza">
        <ul className="list-disc space-y-2 pl-5">
          <li>Sběr dat a databáze se vejdou do bezplatných limitů Google Firebase.</li>
          <li>
            Platí se jen za AI: třídění zpráv řádově desítky centů měsíčně, analýzy a briefingy podle toho, kolik čteš (cca $0,04
            za analýzu, $0,06 za briefing, $0,01 za vysvětlení).
          </li>
          <li>Pojistky: automatika max. $1 denně, celkem max. $3 denně. Útratu vidíš na stránce Stav systému.</li>
          <li>
            <b>Pauza:</b> ve Firebase konzoli → Firestore → <span className="font-mono text-xs">config/runtime</span>, pole{" "}
            <span className="font-mono text-xs">pausedUntil</span> = datum ve tvaru{" "}
            <span className="font-mono text-xs">2027-01-01</span>. Do té doby se nic nestahuje ani neanalyzuje; ten den se provoz
            sám obnoví. Smazáním pole se obnoví hned.
          </li>
        </ul>
      </Section>
    </AppShell>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="glass scroll-mt-6 rounded-2xl p-5 text-sm leading-relaxed">
      <h2 id={`${id}-h`} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
