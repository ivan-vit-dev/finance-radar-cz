# Finance Radar – plán vývoje

Produktová specifikace: [specs.md](specs.md). Tento dokument popisuje, **jak** ji postavíme.

## ▶ Kde pokračovat (stav k 30. 10. 2026)

**Hotovo:**
- Kostra monorepa (web, functions, shared), build a lint prochází, emulátory naběhnou.
- Firebase projekt `finance-radar-cz` pod účtem `vvit2.developer@gmail.com` (Firebase CLI je v této složce přepnuté na tento účet). Tarif Blaze, přihlášení Googlem zapnuté.
- Firestore `(default)` v `europe-west3`, security rules nasazené, vlastník v kolekci `admins`.
- Secrets `ANTHROPIC_API_KEY` a `CNB_ARAD_API_KEY` v Secret Manageru, lokálně v `functions/.secret.local` (mimo git).
- Web běží na Vercelu, deployment řeší vlastník sám.
- **Fáze 0** téměř hotová: inventář zdrojů ([docs/zdroje.md](docs/zdroje.md)), prompty pro klasifikaci, extrakci a analýzu změřené na reálných datech ([docs/faze0-vysledky.md](docs/faze0-vysledky.md)).
- **Provozní model přestavěn na „analýzu na vyžádání“** (30. 10. 2026), viz sekce Provozní model.

**Další kroky (v tomto pořadí):**
1. **Fáze 2:** ingestion je hotová a otestovaná proti emulátoru. Zbývá nasadit (`firebase deploy --only functions,firestore`).
2. **Fáze 3:** ukazatele ČNB/ČSÚ/ARAD do `indicators`.
3. **Fáze 4:** klasifikace a extrakce nad uloženými dokumenty.

**Otevřené body:**
- Na Firebase Hostingu zůstala nasazená stará verze (`finance-radar-cz.web.app`). Rozhodnout, zda ji vypnout (`firebase hosting:disable`).
- Necommitnuté změny od prvního commitu (fáze 0).

## Rozhodnutí

| Oblast | Rozhodnutí |
|---|---|
| Backend | Žádný vlastní server. **Firebase** (tarif Blaze kvůli Cloud Functions, provoz v rámci free kvót) |
| Uživatelé | Malý uzavřený okruh: vlastník a později manželka. **Firebase Authentication – Google**, jednorázové přihlášení, session trvalá |
| Přístup k datům | Firestore rules pustí jen UID z kolekce `admins` (další uživatel = další dokument, pravidla beze změny). Sdílená data (události, ukazatele, briefingy) vidí všichni, osobní nastavení (alerty, preference, FCM tokeny) má každý v `users/{uid}`. Data pipeline zapisuje jen Cloud Functions (Admin SDK) |
| Frontend | **Next.js (React)**, **Tailwind CSS v4**, dark-first UI s gradienty a glow podle priority. Hosting **Vercel** (deployment řeší vlastník projektu sám) |
| Doručení | **Desktopová PWA** (instalace z Chrome/Edge), alerty jako nativní notifikace Windows přes FCM Web Push, briefing v aplikaci |
| Provozní model | **Sběr a klasifikace automaticky, drahá analýza jen na vyžádání.** Aplikace se nepoužívá denně, platí se za to, co se čte |
| AI | **Anthropic Claude**: Haiku 5.5 na klasifikaci a extrakci (automaticky), **Opus 5.5** na analýzu událostí, „pro poradce“ a briefing (na vyžádání) |
| Jazyk | TypeScript všude (web, functions, sdílené typy) |
| Region | `europe-west3` (Frankfurt) |

## Provozní model

Aplikace se neotevírá každý den. Proto se dělí na levnou část, která běží automaticky, a drahou část, která běží jen tehdy, když ji uživatel opravdu čte.

| Vrstva | Kdy běží | Proč |
|---|---|---|
| **Sběr** (RSS, API ČNB/ČSÚ/ARAD, legislativa) | automaticky, podle frekvence zdroje | RSS drží jen posledních pár desítek položek. Bez průběžného sběru by po týdnu chyběla historie. Cena ~0 |
| **Ukazatele a jejich změny** | automaticky, po stažení nových dat | čistý kód, žádná AI |
| **Klasifikace + extrakce faktů** (Haiku 5.5) | kritické zdroje (ČNB, legislativa) **ihned**; ostatní **dávkově 2× denně přes Batch API (−50 %)** | potřeba pro skóre, deduplikaci a alerty; levné |
| **Deduplikace a clustering do událostí** | automaticky, po extrakci | embeddingy, bez Claude |
| **Alerty** | automaticky, když událost překročí práh uživatele | funguje i bez otevření aplikace |
| **Analýza a „pro poradce“** (Opus 5.5) | **při prvním otevření detailu události**; výsledek se uloží a příště se načte hned. Automaticky jen u kritických událostí (skóre ≥ 90), aby byly připravené | platí se jen za čtené události |
| **Briefing** (Opus 5.5) | **při prvním otevření aplikace v daný den**, shrnuje období od posledního briefingu (den i týden) | ve dny bez otevření se negeneruje |
| „Vysvětli jednoduše“, „Co říct klientovi“ | na kliknutí, streamuje se do UI | |

Kompromis: první otevření detailu nové události trvá zhruba 10–15 s (generuje se analýza). Briefing se při prvním otevření dne generuje zhruba 20–40 s. UI během toho ukazuje už hotová fakta a skóre.

### Odhad nákladů na AI (měsíčně)

| Položka | Odhad |
|---|---|
| Klasifikace + extrakce (~300 dokumentů denně, Batch API, změřeno ve fázi 0) | ~$3–4 |
| Analýza na vyžádání (Opus 5.5, $0,037 za událost; ~100–150 přečtených událostí) | ~$4–6 |
| Briefing (Opus 5.5, jen ve dny otevření) | ~$1–2 |
| Automatická analýza kritických událostí | < $1 |
| **Celkem** | **~$8–13** při běžném používání, méně při občasném |

Pojistky: denní limit nákladů v kódu (počítá se z `ai_runs`), spend limit v Anthropic Console, budget alert v Google Cloud.

## Architektura

```
Cloud Scheduler (1 job "dispatcher", každých 15 min)
        ↓
Cloud Functions (TypeScript, europe-west3)
  ├─ collectors: RSS / API / HTML / PDF                    automaticky
  ├─ normalizace + dedup (hash URL a obsahu)               automaticky
  ├─ indikátory (ČNB, ČSÚ, ARAD) – čistý kód               automaticky
  ├─ klasifikace + extrakce (Haiku): ihned / Batch 2× denně automaticky
  ├─ clustering do událostí + scoring + alerty (FCM)       automaticky
  └─ callable: analyzeEvent, getBriefing, explain (Opus)   na vyžádání z webu
        ↓
Firestore (metadata, události, fakta, uložené analýzy)  +  Cloud Storage (raw text, neměnný)
        ↓
Next.js PWA na Vercelu  ←  Firebase Auth (Google)
```

Zásady:

- **Jeden dispatcher místo cronu pro každý zdroj.** Cloud Scheduler má zdarma jen 3 joby. Tentýž dispatcher spouští i dávky Batch API (2× denně) a vyzvedává jejich výsledky.
- **Analýzy se generují jednou a ukládají.** Callable funkce nejdřív zkontroluje, jestli analýza pro aktuální verzi události a promptu už existuje. Když se událost změní (přibude zdroj nebo fakt), analýza se při příštím otevření přegeneruje.
- **Callable funkce ověřují, že volající je v `admins`**, a hlídají denní limit nákladů. Bez toho by kdokoli s Google účtem mohl utrácet kredit.
- **Dashboard čte předpočítané dokumenty** (`dashboard/today`, `briefings/{datum}`), ne stovky dotazů.
- **Raw data jsou neměnná** (bod 32 specifikace). AI výstupy se ukládají zvlášť, s modelem, verzí promptu a časem.
- **Matematiku, změny, trendy, prahy a stavy legislativy počítá kód, ne AI** (bod 31). Scoring je v `packages/shared`.

### Free kvóty vs. odhad provozu

| Služba | Free kvóta | Odhad |
|---|---|---|
| Firestore | 1 GiB, 50k čtení a 20k zápisů denně | stovky až nízké tisíce zápisů denně |
| Cloud Functions | 2M volání měsíčně | ~3–10k měsíčně |
| Cloud Scheduler | 3 joby | 1 job |
| Auth, FCM | zdarma | ✓ |

## AI pipeline (Claude)

| Krok | Model | Kdy | Poznámka |
|---|---|---|---|
| 1. Klasifikace a relevance | `claude-haiku-5-5` | automaticky | `classify-v1`; pod prahem relevance končí |
| 2. Extrakce faktů | `claude-haiku-5-5` | automaticky | `extract-v2`; FAKT / ANALÝZA / ODHAD / NÁZOR, hodnota, jednotka, období, doslovná citace (kód ověřuje) |
| 3. Clustering do událostí | embeddingy + časové okno 48 h + entity | automaticky | Firestore vector search |
| 4. Ověření | kód (porovnání s `indicators` a primárním zdrojem), pak případně LLM | automaticky | stavy 🟢🔵🟡🟠🔴, detekce rozporů |
| 5. Scoring | kód (`computeFinalScore`) | automaticky | AI dodá jen dílčí hodnoty |
| 6. Analýza a „pro poradce“ | `claude-opus-5-5` | **na vyžádání**; automaticky jen při skóre ≥ 90 | `analyze-v2`; tržní kontext spočítaný kódem, kontrola čísel mimo vstup |
| Briefing | `claude-opus-5-5` | **při prvním otevření dne** | shrnuje období od posledního briefingu |
| „Vysvětli jednoduše“, „Co říct klientovi“ | `claude-opus-5-5` | na kliknutí | streamuje se do UI |

Šetření nákladů: Batch API pro nekritické zdroje, prompt caching systémových promptů, deduplikace před extrakcí (stejná zpráva z 5 médií se extrahuje jednou), denní limit nákladů.

Embeddingy: Anthropic embedding model nenabízí. Pro dedup a RAG použijeme externí embedding API (rozhodnout ve fázi 0).

## Fáze

### Fáze 0 – Průzkum zdrojů a prompty (~1 týden)
- [x] Inventář primárních zdrojů, médií a legislativy, viz [docs/zdroje.md](docs/zdroje.md) (30. 10. 2026)
- [x] Návrh ~12 zdrojů pro MVP-0 (v docs/zdroje.md)
- [x] ČNB ARAD: klíč uložen (`CNB_ARAD_API_KEY`), ID řad sazeb a objemů hypoték, spotřebitelských úvěrů a vkladů dohledána a ověřena (docs/zdroje.md)
- [ ] Inventář bank a pojišťoven (po MVP-0)
- [x] Vzorek 48 reálných článků, prompty pro klasifikaci a extrakci (Haiku 5.5), viz [docs/faze0-vysledky.md](docs/faze0-vysledky.md): 0 nepodložených citací
- [x] Analytický prompt (`analyze-v2`) a porovnání Opus 5.5 vs. Sonnet 5.5 na 12 událostech: kvalita téměř stejná. Rozhodnutí: Opus 5.5 na vyžádání (při placení jen za čtené události je rozdíl v ceně zanedbatelný)
- [x] Embedding model: pro fázi 2 není potřeba (dedup přes URL). Pro clustering ve fázi 4 doporučen Gemini embedding přes Vertex AI ve stejném GCP projektu (česky, bez dalšího klíče), ověří se na vzorku ve fázi 4

### Fáze 1 – Kostra ✅
- [x] Monorepo (npm workspaces): `apps/web`, `functions`, `packages/shared`
- [x] Firebase konfigurace, emulátory (demo projekt), security rules
- [x] Next.js, Tailwind v4, design tokeny, přihlášení Googlem, prázdný dashboard
- [x] Firebase projekt `finance-radar-cz` (Blaze), Google provider v Auth, registrovaná webová aplikace
- [x] Firestore databáze v `europe-west3`, pravidla nasazená
- [x] Secrets `ANTHROPIC_API_KEY`, `CNB_ARAD_API_KEY`
- [ ] Budget alert v Google Cloud (ověřit, zda existuje)

### Fáze 2 – Ingestion (~1–2 týdny)

**Šetrné ukládání (rozhodnuto 30. 10. 2026):** plné texty článků se neukládají vůbec (ani Firestore, ani Storage). Text se stáhne jen při zpracování AI a zahodí se. Jako důkaz slouží odkaz a doslovné citace u faktů. Dokument má jen titulek, perex (max. 300 znaků), URL, zdroj, datum a stav, ~700 B. Nerelevantní dokumenty se mažou po 30 dnech (TTL na poli `expireAt`). Dlouhá textová pole se neindexují. Konfigurace zdrojů zůstává v kódu ([functions/src/sources.ts](functions/src/sources.ts)), ve Firestore je jen provozní stav `sourceState/{id}`. Cloud Storage se nepoužívá.

- [x] Dispatcher ([functions/src/ingest/ingest.ts](functions/src/ingest/ingest.ts)) podle `frequencyMinutes` a `lastFetchedAt`, backoff při opakovaných chybách
- [x] Dedup přes kanonickou URL (bez `utm_*` a fragmentu): 1 čtení na zdroj (seznam viděných URL ve `sourceState`), čtou se jen noví kandidáti
- [x] Dokumenty `documents/{hash URL}`, max. 3 dny staré položky, TTL a indexy v `firestore.indexes.json`
- [x] Stav a chyby zdrojů v `sourceState` (poslední úspěch, chyba, počet chyb v řadě, počet nových)
- [x] Unit testy (`npm test -w functions`) a běh proti emulátoru (`npm run ingest:emulator -w functions`): 130 dokumentů z 8 zdrojů, opakovaný běh 0 duplicit
- [x] Build přes esbuild (sdílený balíček se zabalí do `lib/index.js`, jinak by deploy v cloudu selhal)
- [ ] **Nasazení:** `firebase deploy --only functions,firestore` (čeká na odsouhlasení)
- [ ] Konektory HTML (vláda, ČBA) a API zdroje (ARAD, ČSÚ) – ARAD a ČNB patří do fáze 3

### Fáze 3 – Tržní ukazatele, deterministicky (~1 týden)
- [ ] `indicators/{id}/values`: repo / diskont / lombard, EUR/CZK, ARAD (sazby a objemy hypoték, spotřebitelské úvěry, vklady), ČSÚ (inflace, ceny nemovitostí, HDP, nezaměstnanost, mzdy)
- [ ] ARAD stahovat jen po změně (`/updates`), ne naslepo
- [ ] Výpočet změn (m/m, r/r, od začátku roku), minim, maxim a trendů v kódu; rozlišit kumulativní a měsíční údaje

### Fáze 4 – Automatická AI vrstva (~2 týdny)
- [ ] Klasifikace + extrakce: kritické zdroje ihned, ostatní přes Batch API 2× denně (odeslání a vyzvednutí výsledků řídí dispatcher)
- [ ] Clustering do událostí, scoring, ověření faktů proti `indicators`
- [ ] Automatická analýza jen pro události se skóre ≥ 90
- [ ] Audit `ai_runs` (model, verze promptu, tokeny, cena, čas) a denní limit nákladů

### Fáze 5 – UI a analýza na vyžádání (~2–3 týdny)
- [ ] Dashboard napojený na `dashboard/today`
- [ ] Radar (seznam událostí s fakty a skóre, bez AI textu)
- [ ] Detail události `/event/[id]`: fakta hned; analýza přes callable `analyzeEvent` (uložená, příště okamžitě), stav „generuji analýzu“
- [ ] „Vysvětli jednoduše“, „Co říct klientovi“ (streamované), „Označit chybnou analýzu“
- [ ] Sekce ČNB, Hypotéky, Nemovitosti
- [ ] Legislativa: NÁVRH → SCHVÁLENO → SENÁT → VYHLÁŠENO → ÚČINNÉ (stav nastavuje kód podle psp.cz a e-Sbírky)

### Fáze 6 – Briefing a alerty (~1 týden)
- [ ] Briefing při prvním otevření dne (callable `getBriefing`): období od posledního briefingu, uložený v `briefings/{datum}`
- [ ] PWA service worker, FCM Web Push, badge s počtem kritických událostí
- [ ] Pravidla alertů v `users/{uid}/alertRules`; alert obsahuje fakta a skóre (bez nutnosti AI analýzy)

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
npm run phase0 -w functions              # vzorek článků -> klasifikace + extrakce (reálné API, ~$0,04)
npm run phase0:analysis -w functions     # analýza Opus vs. Sonnet na posledním vzorku (~$0,6)
```

`apps/web/.env.development.local` (jen `next dev`) míří na emulátory a demo projekt `demo-finance-radar`, který se nikdy nespojí s produkcí. `apps/web/.env.production` (jen `next build`) obsahuje konfiguraci projektu `finance-radar-cz`. Nepoužívej `.env.local`: v Next.js má přednost i při produkčním buildu.

Klíče pro lokální skripty a emulátor jsou v `functions/.secret.local` (`ANTHROPIC_API_KEY`, `CNB_ARAD_API_KEY`), soubor je mimo git.

V emulátoru (a později v produkci) je po prvním přihlášení potřeba ve Firestore ručně založit dokument `admins/{UID}`. Bez něj security rules nepustí čtení dat.
