# Fáze 0 – výsledky prototypu AI pipeline

Běh 30. 10. 2026, 48 reálných článků z 8 RSS zdrojů (ČNB TZ, čnBlog, MF TZ, MF makro, HN, iDNES, ČT24, Měšec), 6 nejnovějších z každého.
Spuštění: `npm run phase0 -w functions -- --per-source 6`. Data a report jdou do `functions/.phase0-data/` (mimo git, obsahuje cizí texty).

## Kód

| Modul | Účel |
|---|---|
| [functions/src/collectors/http.ts](../functions/src/collectors/http.ts) | stahování s detekcí kódování (windows-1250) a finální URL |
| [functions/src/collectors/rss.ts](../functions/src/collectors/rss.ts) | RSS 2.0 / Atom; chyba, když místo kanálu přijde HTML |
| [functions/src/collectors/article.ts](../functions/src/collectors/article.ts) | hlavní text článku (Readability), max. 15 000 znaků |
| [functions/src/ai/classify.ts](../functions/src/ai/classify.ts) | klasifikace a skóre, `claude-haiku-5-5`, effort `low` |
| [functions/src/ai/extract.ts](../functions/src/ai/extract.ts) | extrakce událostí a tvrzení (FAKT / ANALÝZA / ODHAD / NÁZOR) s doslovnou citací, `claude-haiku-5-5`, effort `medium` |
| [functions/src/sources.ts](../functions/src/sources.ts) | registr zdrojů MVP-0 |
| [functions/scripts/phase0-sample.ts](../functions/scripts/phase0-sample.ts) | běh na vzorku a report |

Výstupy obou AI kroků jsou vynucené Zod schématem (structured outputs). Skóre 0–100 ořezává kód. Finální skóre a prioritu počítá kód ze `packages/shared` (bod 12 specifikace).

## Výsledky (classify-v1, extract-v2)

| Metrika | Hodnota |
|---|---|
| Klasifikováno | 48 / 48, 0 chyb |
| Relevantní pro poradce | 25 |
| Extrahováno (relevance ≥ 50) | 12 událostí, 89 tvrzení |
| Typy tvrzení | ~57 % fakta, ~22 % odhady, ~11 % interpretace, ~6 % názory |
| **Citace nenalezené ve zdrojovém textu** | **0** (kód ověřuje, že citace v textu doslova je) |
| Číselná tvrzení s určeným obdobím | 44 / 47 (v1: 30 / 45; zbytek období opravdu nemá) |
| Cena celého běhu | **$0,038** |
| Odhad provozu (300 dokumentů denně) | **~$7 měsíčně** za klasifikaci + extrakci |
| Prompt caching | ~50 % vstupních tokenů čteno z cache |

Priority vzorku: 1× vysoká (rozhodnutí bankovní rady ČNB, skóre 88), 3× důležité (predikce MF, regulace cen PHM), 20× informativní, 24× nízká (sport, krimi, zahraniční politika, personálie ČNB).

## Zjištění

1. **Řazení odpovídá specifikaci.** Nahoře je rozhodnutí ČNB o sazbách a makro predikce, dole personálie ČNB („Halloween v trezoru“, jmenování ředitele) a zprávy bez finančního dopadu.
2. **Deduplikace je nutná.** Zdražení energií od ČEZ je ve vzorku 3× (iDNES, ČT24, HN) a srpnová predikce MF 2× (TZ i makro kanál). Clustering do událostí (fáze 4) to musí sloučit.
3. **RSS vrací i staré položky** (čnBlog ze srpna). Ingestion musí deduplikovat podle URL a hashe a zpracovat jen nové.
4. **Období u čísel:** model potřebuje datum vydání. Ve v2 se předává a relativní údaje („v červnu“, „letos“) převádí správně. Kumulativní údaje („za prvních 7 měsíců“) se ukládají jako koncový měsíc, ve fázi 3 je potřeba rozlišit kumulativní a měsíční hodnoty.
5. **E15 blokuje neprohlížečový user-agent** (vrací HTML „stránka dočasně nedostupná“ se stavem 200). Zdroj je vypnutý a blokace se neobchází. Collector teď v takovém případě hlásí chybu místo tichých 0 položek.
6. **Text článků** se podařilo získat u 48 / 48 (i HN a iDNES). U článků za paywallem počítat s částečným textem.

## Analýza a „pro poradce“: Opus 5.5 vs. Sonnet 5.5

Modul [functions/src/ai/analyze.ts](../functions/src/ai/analyze.ts) (`analyze-v2`, effort `medium`, serverový fallback při odmítnutí). Vstupem jsou tvrzení z extrakce a **tržní kontext spočítaný kódem** ze skutečných dat ČNB ([collectors/cnb.ts](../functions/src/collectors/cnb.ts), [collectors/arad.ts](../functions/src/collectors/arad.ts)): repo 3,75 %, EUR/CZK, sazba hypoték 5,05 % (+0,11 p. b. m/m), objem hypoték, sazba spotřebitelských úvěrů. Výstup: co se stalo, proč, co to znamená, koho se týká, dopad podle oblastí, co sledovat, pro poradce, pro klienta.

Spuštění: `npm run phase0:analysis -w functions` (bere poslední běh `phase0`).

| 12 událostí | Opus 5.5 | Sonnet 5.5 |
|---|---|---|
| Chyby / fallback | 0 / 0 | 0 / 0 |
| Cena za událost | $0,037 | **$0,014** |
| Čas za událost | 15,6 s | 9,1 s |
| Čísla ve výstupu, která nebyla na vstupu | 0 | 0 |
| Tržní kontext vložený do nesouvisející události (v1 → v2) | 7 → 0 | 5 → 1 |
| Odhad měsíčně (15 událostí denně) | ~$17 | ~$6 |

Kód kontroluje, že výstup neobsahuje čísla, která nebyla na vstupu (převody jednotek jako „386 000 000 000 Kč“ → „386 mld. Kč“ rozpozná).

**Kvalita:** oba modely správně oddělují fakta od prognóz („jde o prognózu ČNB, ne jistotu“). Oba samy upozorňují, ať se nezaměňují nabídkové a skutečně sjednané sazby (bod 18 specifikace), a u nesouvisejících událostí nic nevymýšlejí. Opus je o něco pečlivější v souvislostech (všimne si stáří článku, přidá praktický bod „Refixace“). Rozdíl je malý.

**Změna v2:** v1 vkládala tržní ukazatele i do nesouvisejících událostí (podvody, minimální mzda). v2 je používá jen u souvisejících událostí a u starších článků uvede datum.

## Další kroky

- ~~Rozhodnout model pro analýzu~~ Rozhodnuto 30. 10. 2026: analýza běží jen na vyžádání (při otevření detailu), proto **Opus 5.5**. Rozdíl v ceně je při placení jen za čtené události zanedbatelný. Viz PLAN.md, sekce Provozní model.
- Clustering událostí (embeddingy + časové okno + entity) a ukládání do Firestore (fáze 2 a 4).
