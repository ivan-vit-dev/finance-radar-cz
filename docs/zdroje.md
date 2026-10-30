# Inventář zdrojů (fáze 0)

Ověřeno 30. 10. 2026 přímými dotazy z Node.js (`fetch`, stejný TLS stack jako Cloud Functions).
Tier a priorita podle bodů 2 a 37 specifikace.

Legenda stavu: ✅ ověřeno, funguje · ⚠️ funguje s omezením · ❌ nepoužitelné · ⏳ zatím neověřeno

## Tier 1 – primární zdroje

### ČNB (priorita 100)

| Zdroj | Typ | URL | Frekvence | Stav | Poznámka |
|---|---|---|---|---|---|
| Tiskové zprávy | RSS | `https://www.cnb.cz/cs/.content/rss-feed/rss-feed_tz.rss` | 15 min | ✅ | rozhodnutí bankovní rady, regulace, dohled |
| čnBlog | RSS | `https://www.cnb.cz/cs/.content/rss-feed/rss-feed_00023.rss` | 60 min | ✅ | komentáře a projevy členů bankovní rady |
| Kurzy devizového trhu | API (JSON) | `https://api.cnb.cz/cnbapi/exrates/daily?lang=EN` | 1× denně po 14:30 | ✅ | EUR/CZK, USD/CZK; bez klíče |
| Kurzy (záloha) | TXT | `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt` | 1× denně | ✅ | oddělovač `\|`, desetinná čárka |
| Historie repo sazby | TXT | `https://www.cnb.cz/cs/faq/vyvoj_repo_historie.txt` | 1× denně | ✅ | celá historie od 1995; diskont a lombard dohledat obdobně |
| ARAD (statistiky, vč. sazeb nových úvěrů na bydlení) | API (CSV) | `https://www.cnb.cz/aradb/api/v1/data` | 1× denně | ✅ | klíč v secretu `CNB_ARAD_API_KEY` (lokálně `functions/.secret.local`). Řady viz níže |
| Zápisy z jednání bankovní rady | HTML | `https://www.cnb.cz/cs/menova-politika/br-zapisy-z-jednani/` | 60 min | ⏳ | odkazy chodí i v RSS tiskových zpráv |

#### ČNB ARAD – technické poznámky

- Dokumentace: [arad_rest_api_cs.pdf](https://www.cnb.cz/docs/arad20/dokumentace/arad_rest_api_cs.pdf). Služby `/indicators` (metadata), `/data` (časové řady), `/updates` (datum poslední aktualizace řady).
- Odpověď je CSV oddělené středníkem, kódování **windows-1250**, konce řádků CRLF. Parametr `decimal_separator=point` vrátí desetinnou tečku.
- `/data?indicator_id_list=A,B,C&months_before=N`: víc řad v jednom dotazu. Řádek má tvar `indicator_id;snapshot_id;period(YYYYMMDD);value`.
- **Objemy chodí v jednotkách (CZK)**, přestože metadata uvádějí řád „milióny“. Neplést si to.
- ČNB blokuje uživatele při nadměrné zátěži. Nejdřív se zeptat na `/updates` a data stahovat jen při změně.
- Data za měsíc M vycházejí zhruba na konci měsíce M+1 (k 30. 10. 2026 jsou poslední data za září).

#### ČNB ARAD – vybrané řady (měsíční)

| Ukazatel | `indicator_id` | Jednotka | Ověřená hodnota (září 2026) |
|---|---|---|---|
| **Sazba nových úvěrů na bydlení**, obyvatelstvo | `SMIRNOOBUVMIRS405CZK011111` | % | 5,05 |
| Sazba čistých nových úvěrů na bydlení (bez refinancování) | `SMIRNOOBUVMIRS305CZK013111` | % | 5,27 |
| RPSN nových úvěrů na bydlení | `SMIRNOOBUVMRPS405CZK011111` | % | 5,42 |
| Sazby na bydlení podle fixace: do 1 roku / 1–5 let / 5–10 let / nad 10 let | `SMIRNOOBUVMIRS305CZK05…`, `…03…`, `…06…`, `…07…` (suffix `1111`) | % | – |
| **Objem nových úvěrů na bydlení**, obyvatelstvo | `SMIRNOOBUVMOBJ405CZK011111` | CZK | 70,6 mld. |
| Objem čistých nových úvěrů na bydlení | `SMIRNOOBUVMOBJ305CZK013111` | CZK | 30,5 mld. |
| Objem refinancovaných úvěrů na bydlení | `SMIRNOOBUVMOBJ305CZK012111` | CZK | 5,5 mld. |
| **Sazba nových spotřebitelských úvěrů**, obyvatelstvo | `SMIRNOOBUVMIRS404CZK011111` | % | 7,96 |
| Sazba úsporných vkladů (vč. spořicích účtů), obyvatelstvo | `SMIRNOOBVKMIRS405CZK1` | % | – |
| Sazba termínovaných vkladů, obyvatelstvo | `SMIRNOOBVKMIRS406CZK1` | % | – |

Kontrola proti jinému zdroji: ČBA Hypomonitor za září 2026 uvádí „5,1 %“ a ARAD 5,05 %. Sedí to.

### ČSÚ – DataStat API (priorita 98)

Veřejné REST API bez klíče. Katalog: `https://data.csu.gov.cz/api/katalog/v1/sady` (1044 datových sad), data: `https://data.csu.gov.cz/api/dotaz/v1`. DataStat od září 2026 nahrazuje Veřejnou databázi, která končí koncem roku 2026.

| Ukazatel | Kód sady | Periodicita |
|---|---|---|
| Míra inflace | `CEN0101H` | měsíc |
| Index spotřebitelských cen (COICOP 2018, od 2026) | `CEN0101E` | měsíc |
| Indexy cen nemovitostí (data ČÚZK, od 2015) | `CEN0401` | čtvrtletí |
| Průměrné kupní ceny nemovitostí (ČÚZK) | `CEN0402` | rok |
| HDP – čtvrtletní odhady, TOP ukazatele | `WNUC01A` | čtvrtletí |
| Nezaměstnanost (měsíční) | `ZAM05` | měsíc |
| Průměrné hrubé mzdy | `MZDQ1` | čtvrtletí |
| Index stavební produkce | `STA04B` | měsíc |
| Saldo indikátorů důvěry | `KPR2` | měsíc |
| Tržby v maloobchodě (sezónně očištěno) | `OBC01C` | měsíc |

Stav: ✅ katalog ověřen. Dotazy na konkrétní data (`dotaz/v1`) se odladí ve fázi 3.

### Ministerstvo financí (priorita 97)

| Zdroj | Typ | URL | Frekvence | Stav |
|---|---|---|---|---|
| Tiskové zprávy | RSS | `https://mf.gov.cz/cs/rss/tiskove-zpravy-rss` | 30 min | ✅ |
| Makroekonomika (predikce MF) | RSS | `https://mf.gov.cz/cs/rss/makroekonomika` | 60 min | ✅ |
| Materiály na jednání vlády | RSS | `https://mf.gov.cz/cs/rss/materialy-na-jednani-vlady-rss` | 60 min | ✅ |
| Daňové a celní aktuality | RSS | `https://mf.gov.cz/cs/rss/danove-a-celni-aktuality-rss` | 60 min | ✅ |

Přehled všech kanálů MF: `https://mf.gov.cz/cs/rss`.

### Legislativa (priorita 100)

| Zdroj | Typ | URL | Frekvence | Stav | Poznámka |
|---|---|---|---|---|---|
| Sněmovna – sněmovní tisky | Open data (ZIP, UNL) | `https://www.psp.cz/eknih/cdrom/opendata/tisky.zip` | 1× denně | ✅ | stav projednávání návrhů zákonů (NÁVRH → SCHVÁLENO → SENÁT); přehled dat: `https://www.psp.cz/sqw/hp.sqw?k=1300` |
| e-Sbírka – otevřená data | SPARQL | `https://opendata.eselpoint.gov.cz/sparql` | 1× denně | ✅ | bez klíče; VYHLÁŠENO → ÚČINNÉ. REST API e-Sbírky je jen pro schválené žadatele |
| Senát | – | – | – | ⏳ | RSS nenalezeno (`/rss/` vrací 404); stav projednání lze brát i ze sněmovních tisků |
| Vláda – tiskové zprávy | HTML | `https://vlada.gov.cz/cz/media-centrum/tiskove-zpravy/` | 60 min | ⚠️ | RSS nenalezeno, nutné parsování HTML |
| EUR-Lex | – | – | – | ⏳ | až po MVP |

### ČBA (priorita 95)

| Zdroj | Typ | URL | Frekvence | Stav | Poznámka |
|---|---|---|---|---|---|
| ČBA Hypomonitor (měsíční průměrná sazba a objem hypoték) | HTML | `https://www.cbaonline.cz/newsletter-cba-news` | 1× denně | ⚠️ | bez RSS; články se načítají JavaScriptem a `/api/` je zakázané v robots.txt. Titulky s čísly jsou přímo v HTML newsletteru. Číselná data o sazbách brát primárně z ČNB ARAD |

## Tier 2 – odborné zdroje

| Zdroj | Typ | URL | Priorita | Stav | Poznámka |
|---|---|---|---|---|---|
| Fincentrum Hypoindex | HTML | `https://www.hypoindex.cz/hypoindex-vyvoj/` | 75 | ❌ | **blokuje automatický přístup firewallem (WAF)**. Neobcházet; případně požádat o svolení nebo data licencovat |
| Měšec.cz | RSS | `https://www.mesec.cz/rss/clanky/` | 75 | ✅ | osobní finance, hypotéky, pojištění |
| Peníze.cz | RSS | `https://www.penize.cz/rss` | 75 | ✅ | |

## Tier 3 – média (priorita 65 ekonomická, 45 ostatní)

| Zdroj | RSS | Priorita | Stav |
|---|---|---|---|
| Hospodářské noviny | `https://hn.cz/?m=rss` | 65 | ✅ |
| Ekonom | `https://ekonom.cz/?m=rss` | 65 | ✅ |
| E15 | `https://www.e15.cz/rss` | 65 | ❌ vydavatel (CNC) blokuje neprohlížečový user-agent, neobcházet |
| Forbes CZ | `https://forbes.cz/feed/` | 65 | ✅ |
| iDNES – Ekonomika | `https://servis.idnes.cz/rss.aspx?c=ekonomikah` | 45 | ✅ |
| ČT24 – Ekonomika | `https://ct24.ceskatelevize.cz/rss/rubrika/ekonomika-17` | 45 | ✅ |
| iROZHLAS – Ekonomika | `https://www.irozhlas.cz/rss/irozhlas/section/ekonomika` | 45 | ✅ |
| Aktuálně – Ekonomika | `https://zpravy.aktualne.cz/rss/ekonomika/` | 45 | ✅ |
| Seznam Zprávy | `https://www.seznamzpravy.cz/rss` | 45 | ✅ |
| Novinky.cz | `https://www.novinky.cz/rss` | 45 | ✅ |

Frekvence médií: 15–30 min. Seznam Zprávy a Novinky mají jen celkový kanál, ne ekonomický, takže v nich bude víc šumu a klasifikátor (Haiku) ho musí odfiltrovat.

## Zatím neinventarizováno (po MVP-0)

- **Banky** (ČS, ČSOB, KB, RB, UniCredit, MONETA, Air Bank, Fio, mBank, Trinity): tiskové zprávy a sazebníky, typicky HTML bez RSS.
- **Pojišťovny a ČAP**, **Senát**, **EUR-Lex**, realitní portály.

## Zjištění pro implementaci

- **TLS:** Node.js se připojí ke všem zdrojům. Curl z Git Bash u některých webů (ČSÚ, MF, ČBA, Hypoindex) selže na neúplném řetězci certifikátů. Při ladění proto testovat přes Node, ne curl.
- **Kódování:** psp.cz posílá `windows-1250`, ČNB TXT soubory používají desetinnou čárku. Normalizace musí obojí řešit.
- **Redirecty:** `mfcr.cz` → `mf.gov.cz`, `vlada.cz` → `vlada.gov.cz`. Ukládat finální URL.
- **Podmínky použití:** RSS a média ukládat jen jako metadata, perex a odkaz. Plný text článků zpracovat pro AI, ale nezobrazovat ani nepublikovat (aplikace je pro 2 osoby, neveřejná). robots.txt respektovat.

## Návrh zdrojů pro MVP-0 (~12)

1. ČNB – tiskové zprávy (RSS)
2. ČNB – kurzy (API)
3. ČNB – repo sazba (TXT)
4. ČNB – ARAD, sazby nových hypoték (API, po získání klíče)
5. ČSÚ – inflace `CEN0101H`
6. ČSÚ – ceny nemovitostí `CEN0401`
7. MF – tiskové zprávy (RSS)
8. ČBA – Hypomonitor (HTML newsletter)
9. HN (RSS)
10. ~~E15 (RSS)~~ blokuje roboty, náhradou je Měšec.cz (RSS)
11. iDNES Ekonomika (RSS)
12. ČT24 Ekonomika (RSS)
