"use client";

import {
  alertMatches,
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_ALERT_RULES,
  type AlertRules,
  type Category,
} from "@finance-radar/shared";
import { collection, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth-gate";
import { SectionTitle } from "@/components/ui";
import { db, functions } from "@/lib/firebase";
import { disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push";

const THRESHOLDS = [
  { value: 90, label: "Jen kritické (90+)" },
  { value: 80, label: "Kritické a vysoká priorita (80+)" },
  { value: 75, label: "Vysoká priorita a výš (75+)" },
  { value: 55, label: "Vše důležité (55+)" },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Nastavení</h1>
        <p className="mt-1 text-sm text-muted">Alerty a notifikace platí jen pro tvůj účet.</p>
      </header>
      <NotificationsSection />
      <RulesSection />
      <InstallSection />
    </AppShell>
  );
}

function NotificationsSection() {
  const user = useUser();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    pushSupport().then(setSupport);
    return onSnapshot(collection(db, "users", user.uid, "devices"), (s) => setDevices(s.size));
  }, [user.uid]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const permission = typeof Notification !== "undefined" ? Notification.permission : "default";
  const enabledHere = permission === "granted" && devices > 0;

  return (
    <section aria-labelledby="notif-h" className="glass space-y-4 rounded-2xl p-5">
      <SectionTitle id="notif-h">Notifikace na tomto zařízení</SectionTitle>
      {support === "missing-key" && (
        <p className="text-sm text-high">Push notifikace ještě nejsou nastavené (chybí klíč VAPID v konfiguraci webu).</p>
      )}
      {support === "unsupported" && (
        <p className="text-sm text-muted">Tento prohlížeč push notifikace nepodporuje. Použij Chrome nebo Edge.</p>
      )}
      {support === "supported" && (
        <>
          <p className="text-sm text-muted">
            {enabledHere
              ? `Notifikace jsou zapnuté (registrovaných zařízení: ${devices}). Alerty chodí i se zavřeným oknem aplikace, pokud prohlížeč běží na pozadí.`
              : permission === "denied"
                ? "Notifikace jsou v prohlížeči zablokované. Povol je v nastavení webu (ikona zámku v adresním řádku)."
                : "Zapni notifikace, aby ti důležité události chodily jako upozornění Windows."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!enabledHere ? (
              <button
                type="button"
                disabled={busy || permission === "denied"}
                onClick={() =>
                  run(async () => {
                    await enablePush(user.uid);
                    return "Notifikace zapnuty. Zkus poslat zkušební upozornění.";
                  })
                }
                className="rounded-xl bg-gradient-to-r from-accent-from to-accent-to px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Zapnout notifikace
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await httpsCallable<unknown, { sent: number; failed: number }>(
                        functions,
                        "sendTestNotification",
                      )({});
                      return r.data.sent > 0
                        ? `Odesláno na ${r.data.sent} zařízení – mělo by se objevit upozornění.`
                        : "Upozornění se nepodařilo doručit.";
                    })
                  }
                  className="rounded-xl bg-surface-strong px-4 py-2 text-sm ring-1 ring-border hover:ring-accent-to disabled:opacity-50"
                >
                  Poslat zkušební upozornění
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await disablePush(user.uid);
                      return "Notifikace na tomto zařízení vypnuty.";
                    })
                  }
                  className="rounded-xl px-4 py-2 text-sm text-muted ring-1 ring-border hover:text-critical disabled:opacity-50"
                >
                  Vypnout na tomto zařízení
                </button>
              </>
            )}
          </div>
        </>
      )}
      {message && <p className="text-sm text-accent-to">{message}</p>}
    </section>
  );
}

function RulesSection() {
  const user = useUser();
  const [rules, setRules] = useState<AlertRules | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "users", user.uid)).then((s) =>
      setRules({ ...DEFAULT_ALERT_RULES, ...((s.data()?.alertRules as Partial<AlertRules>) ?? {}) }),
    );
  }, [user.uid]);

  if (!rules) return <p className="text-sm text-muted">Načítám pravidla…</p>;

  const update = (patch: Partial<AlertRules>) => {
    setRules({ ...rules, ...patch });
    setSaved(false);
  };
  const toggleCategory = (c: Category) =>
    update({
      categories: rules.categories.includes(c) ? rules.categories.filter((x) => x !== c) : [...rules.categories, c],
    });

  // Náhled pravidla na typických událostech – stejná funkce jako na backendu.
  const examples = [
    { label: "ČNB změnila repo sazbu (skóre 95)", e: { finalScore: 95, categories: ["cnb", "mortgages"] as Category[], bestTier: 1 as const } },
    { label: "Banka zdražila hypotéky (skóre 82)", e: { finalScore: 82, categories: ["mortgages", "banks"] as Category[], bestTier: 3 as const } },
    { label: "Tisková zpráva ČNB o statistice (skóre 45)", e: { finalScore: 45, categories: ["cnb"] as Category[], bestTier: 1 as const } },
    { label: "Ceny nemovitostí rostou (skóre 64)", e: { finalScore: 64, categories: ["real_estate"] as Category[], bestTier: 3 as const } },
  ];

  return (
    <section aria-labelledby="rules-h" className="glass space-y-5 rounded-2xl p-5">
      <SectionTitle id="rules-h">Pravidla alertů</SectionTitle>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={rules.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="size-4 accent-[var(--accent-to)]" />
        Posílat alerty
      </label>

      <fieldset disabled={!rules.enabled} className="space-y-5 disabled:opacity-50">
        <div>
          <legend className="text-sm font-medium">Upozornit od priority</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {THRESHOLDS.map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs ring-1 ${
                  rules.minScore === t.value ? "bg-surface-strong text-foreground ring-accent-to" : "text-muted ring-border"
                }`}
              >
                <input type="radio" name="minScore" className="sr-only" checked={rules.minScore === t.value} onChange={() => update({ minScore: t.value })} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Jen tyto oblasti</p>
          <p className="text-xs text-muted">Nic nevybráno = všechny oblasti.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label
                key={c}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs ring-1 ${
                  rules.categories.includes(c) ? "bg-surface-strong text-foreground ring-accent-to" : "text-muted ring-border"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={rules.categories.includes(c)} onChange={() => toggleCategory(c)} />
                {CATEGORY_LABELS[c]}
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={rules.anyCnb} onChange={(e) => update({ anyCnb: e.target.checked })} className="size-4 accent-[var(--accent-to)]" />
          Upozornit na jakoukoli zprávu přímo od ČNB (bez ohledu na skóre)
        </label>
      </fieldset>

      <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Náhled: dostal bys upozornění?</p>
        <ul className="mt-2 space-y-1 text-sm">
          {examples.map((x) => (
            <li key={x.label} className="flex justify-between gap-4">
              <span>{x.label}</span>
              <span className={alertMatches(rules, x.e) ? "text-info" : "text-muted"}>{alertMatches(rules, x.e) ? "ano" : "ne"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            await setDoc(doc(db, "users", user.uid), { alertRules: rules, updatedAt: new Date().toISOString() }, { merge: true });
            setSaved(true);
          }}
          className="rounded-xl bg-gradient-to-r from-accent-from to-accent-to px-4 py-2 text-sm font-medium text-white"
        >
          Uložit pravidla
        </button>
        {saved && <span className="text-sm text-info">Uloženo.</span>}
      </div>
    </section>
  );
}

function InstallSection() {
  return (
    <section aria-labelledby="install-h" className="glass space-y-2 rounded-2xl p-5">
      <SectionTitle id="install-h">Aplikace na ploše</SectionTitle>
      <p className="text-sm text-muted">
        V Chrome nebo Edge klikni v adresním řádku na ikonu „Nainstalovat aplikaci“ (případně menu ⋮ → Uložit a sdílet →
        Nainstalovat). Finance Radar se pak otevírá ve vlastním okně a na ikoně ukazuje počet kritických událostí.
      </p>
    </section>
  );
}
