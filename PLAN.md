# Finance Radar – plán vývoje

Produktová specifikace: [specs.md](specs.md). Tento dokument popisuje, **jak** ji postavíme.

## ▶ Kde pokračovat (stav k 24. 10. 2026)

**Hotovo:**
- Kostra monorepa (web, functions, shared), lokální build a lint prochází, emulátory naběhnou.
- Firebase projekt `finance-radar-cz` pod účtem `vvit2.developer@gmail.com` (Firebase CLI je v této složce přepnuté na tento účet). Tarif Blaze, přihlášení Googlem zapnuté.
- Registrovaná webová aplikace „Finance Radar“, konfigurace v `apps/web/.env.production` (soubor je jen lokální, je v .gitignore).
- Frontend se bude hostovat na Vercelu, deployment řeší vlastník sám.
- Region Firestore **potvrzen: `europe-west3`**.

**Další kroky (v tomto pořadí):**
1. Založit Firestore databázi: `firebase firestore:databases:create "(default)" --location europe-west3`. Pak nasadit pravidla (`firebase deploy --only firestore`), ale až po odsouhlasení.
2. Po prvním přihlášení založit ve Firestore dokument `admins/{UID}`.
3. Nastavit secret `ANTHROPIC_API_KEY` (`firebase functions:secrets:set ANTHROPIC_API_KEY`).
4. **Fáze 0:** inventář zdrojů (RSS / API / HTML / PDF u každého), výběr 15–20 zdrojů pro MVP, vzorek článků a prototyp promptů.

**Otevřené body:**
- Na Firebase Hostingu zůstala nasazená verze (`finance-radar-cz.web.app`). Rozhodnout, zda ji vypnout (`firebase hosting:disable`).
- Zatím nic necommitnuto (větev `master`, žádné commity).

## Rozhodnutí

| Oblast | Rozhodnutí |
|---|---|
| Backend | Žádný vlastní server. **Firebase** (tarif Blaze kvůli Cloud Functions, provoz v rámci free kvót) |
| Uživatelé | Jeden uživatel. **Firebase Authentication – Google**, jednorázové přihlášení, session trvalá |
| Přístup k datům | Firestore rules pustí jen UID z kolekce `admins`. Data pipeline zapisuje jen Cloud Functions (Admin SDK) |
| Frontend | **Next.js (React)**, **Tailwind CSS v4**, dark-first UI s gradienty a glow podle priority. Hosting **Vercel** (deployment řeší vlastník projektu sám) |
| Doručení | **Desktopová PWA** (instalace z Chrome/Edge), alerty jako nativní notifikace Windows přes FCM Web Push, briefing v aplikaci |
| AI | **Anthropic Claude**: Haiku 5.5 na klasifikaci a extrakci, **Opus 5.5** na analýzu, vrstvu „pro poradce“ a briefing |
| Jazyk | TypeScript všude (web, functions, sdílené typy) |
| Region | `europe-west3` (Frankfurt) |

## Architektura

```
Cloud Scheduler (1 job "dispatcher", každých 15 min)
        ↓
Cloud Functions (TypeScript, europe-west3)
  ├─ collectors: RSS / API / HTML (cheerio) / PDF
  ├─ normalizace + dedup (hash URL a obsahu)
  ├─ AI pipeline (Firestore trigger na nový dokument)
  ├─ indikátory (ČNB, ČSÚ, kurzy) – čistý kód, žádná AI
  └─ briefing (6:45) + alerty (FCM)
        ↓
Firestore (metadata, události, fakta)  +  Cloud Storage (raw HTML/PDF/text – neměnné)
        ↓
Next.js PWA na Vercelu  ←  Firebase Auth (Google)
```

Zásady:

- **Jeden dispatcher místo cronu pro každý zdroj.** Cloud Scheduler má zdarma jen 3 joby.
- **Dashboard čte předpočítané dokumenty** (`dashboard/today`, `briefings/{datum}`), ne stovky dotazů.
- **Raw data jsou neměnná** (bod 32 specifikace). AI výstupy se ukládají zvlášť, s modelem, verzí promptu a časem.
- **Matematiku, změny, trendy, prahy a stavy legislativy počítá kód, ne AI** (bod 31). Scoring je v `packages/shared`.

### Free kvóty vs. odhad provozu

| Služba | Free kvóta | Odhad |
|---|---|---|
| Firestore | 1 GiB, 50k čtení a 20k zápisů denně | stovky až nízké tisíce zápisů denně |
| Cloud Functions | 2M volání měsíčně | ~3–10k měsíčně |
| Cloud Scheduler | 3 joby | 1–2 joby |
| Auth, FCM | zdarma | ✓ |

V Google Cloud nastavit **budget alert** (např. 5 USD) a v Anthropic Console **spend limit**.

## AI pipeline (Claude)

| Krok | Model | Poznámka |
|---|---|---|
| 1. Klasifikace a relevance | `claude-haiku-5-5` | všechny dokumenty, pod prahem relevance končí |
| 2. Extrakce faktů | `claude-haiku-5-5` | structured outputs: typ FAKT / ANALÝZA / ODHAD / NÁZOR, hodnota, jednotka, datum, citace |
| 3. Clustering do událostí | embeddingy + časové okno 48 h + entita | Firestore vector search |
| 4. Ověření | nejdřív kód (porovnání s `indicators` a primárním zdrojem), pak LLM | stavy 🟢🔵🟡🟠🔴, detekce rozporů |
| 5. Scoring | kód (`computeFinalScore`) | AI dodá jen dílčí hodnoty |
| 6. Analýza a „pro poradce“ | `claude-opus-5-5` | jen události se skóre ≥ 55 |
| Briefing, „Vysvětli jednoduše“, „Co říct klientovi“ | `claude-opus-5-5` | vysvětlení se streamuje do UI |

Šetření nákladů: prompt caching pro systémové prompty, **Batch API (−50 %)** pro nespěchající zpracování, okamžité zpracování jen u kritických zdrojů (ČNB, legislativa), denní limit nákladů v kódu.

**Orientační odhad** (~300 dokumentů a ~15 analyzovaných událostí denně): Haiku vrstva ~3–5 USD měsíčně, Opus vrstva ~30–50 USD měsíčně, s Batch API zhruba poloviční. Ověřit měřením ve fázi 0.

Embeddingy: Anthropic embedding model nenabízí. Pro dedup a RAG použijeme externí embedding API (rozhodnout ve fázi 0).

## Fáze

### Fáze 0 – Průzkum zdrojů a prompty (~1 týden)
- [ ] Inventář zdrojů: typ (RSS / API / HTML / PDF), frekvence, robots.txt a podmínky použití
- [ ] Výběr 15–20 zdrojů pro MVP: ČNB (tiskové zprávy, ARAD, kurzy), ČSÚ, MF, ČBA / Hypomonitor, Fincentrum Hypoindex, e-Sbírka, psp.cz, 4–5 bank, 4–5 médií
- [ ] Vzorek ~50 reálných článků, prototyp promptů pro klasifikaci a extrakci
- [ ] Porovnání Opus 5.5 vs. Sonnet 5.5 na analýze vzorku (kvalita a cena)
- [ ] Volba embedding modelu

### Fáze 1 – Kostra ✅ (založena)
- [x] Monorepo (npm workspaces): `apps/web`, `functions`, `packages/shared`
- [x] Firebase konfigurace, emulátory (demo projekt), security rules
- [x] Next.js, Tailwind v4, design tokeny, přihlášení Googlem, prázdný dashboard
- [x] Firebase projekt `finance-radar-cz` (Blaze), Google provider v Auth, registrovaná webová aplikace
- [ ] Firestore databáze v `europe-west3` (region potvrzen, databáze zatím nezaložena)
- [ ] Budget alert v Google Cloud (ověřit, zda existuje)
- [ ] Secret `ANTHROPIC_API_KEY` v Secret Manageru

### Fáze 2 – Ingestion (~1–2 týdny)
- [ ] Collector interface + konektory RSS, HTML, API, PDF
- [ ] Dispatcher podle `sources.frequencyMinutes` a `lastFetchedAt`
- [ ] Normalizace do `source_documents`, raw obsah do Cloud Storage, dedup přes hash
- [ ] Log běhů a chyb zdrojů

### Fáze 3 – Tržní ukazatele, deterministicky (~1 týden)
- [ ] `indicators/{id}/values`: repo / diskont / lombard, EUR/CZK, inflace, hypoteční sazby, index cen nemovitostí
- [ ] Výpočet změn (m/m, r/r, od začátku roku), minim, maxim a trendů v kódu

### Fáze 4 – AI pipeline (~2–3 týdny)
- [ ] Kroky 1–6 z tabulky výše
- [ ] Audit: `ai_runs` (model, verze promptu, tokeny, cena, čas)

### Fáze 5 – UI pro MVP (~2–3 týdny)
- [ ] Dashboard napojený na `dashboard/today`
- [ ] Radar (seznam událostí), detail události `/event/[id]`
- [ ] Sekce ČNB, Hypotéky, Nemovitosti
- [ ] Legislativa: NÁVRH → SCHVÁLENO → SENÁT → VYHLÁŠENO → ÚČINNÉ (stav nastavuje kód podle psp.cz a e-Sbírky)
- [ ] „Vysvětli jednoduše“, „Co říct klientovi“, „Označit chybnou analýzu“

### Fáze 6 – Morning Briefing a alerty (~1 týden)
- [ ] Scheduled function v 6:45, notifikace v 7:00
- [ ] PWA service worker, FCM Web Push, badge s počtem kritických událostí
- [ ] Pravidla alertů v `users/{uid}/alertRules`

### Fáze 7 – Zpevnění (~1 týden)
- [ ] Monitoring zdrojů, sledování nákladů AI, retence raw dat

**Doporučení k rozsahu:** nejdřív „MVP-0“ (ČNB + hypotéky + ukazatele + briefing, ~10 zdrojů) a 2–3 týdny ho používat naostro. Teprve pak přidávat banky, pojištění a legislativu.

### V2
Stránka Trh s grafy, týdenní a měsíční reporty, časová osa, chatbot s RAG nad vlastní databází, pokročilé preference.

### V3
Trendové signály a scénáře, vždy označené jako ODHAD.

## Lokální vývoj

```bash
npm install
npm run build -w @finance-radar/shared   # sdílené typy (web i functions je importují z dist/)
npm run emulators                        # Auth + Firestore + Functions + Storage, UI na http://localhost:4000
npm run dev                              # web na http://localhost:3000
```

`apps/web/.env.development.local` (jen `next dev`) míří na emulátory a demo projekt `demo-finance-radar`, který se nikdy nespojí s produkcí. `apps/web/.env.production` (jen `next build`) obsahuje konfiguraci projektu `finance-radar-cz`. Nepoužívej `.env.local`: v Next.js má přednost i při produkčním buildu.

V emulátoru (a později v produkci) je po prvním přihlášení potřeba ve Firestore ručně založit dokument `admins/{tvoje UID}`. Bez něj security rules nepustí čtení dat.
