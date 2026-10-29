Níže bych to už bral jako v1.0 produktové specifikace, podle které se dá aplikace následně skutečně naprogramovat.
FINANCE RADAR
Inteligentní monitor českého finančního trhu pro finančního poradce
Cíl: Každý den automaticky sledovat český finanční a ekonomický trh, vyhodnotit stovky nových informací, odstranit duplicity a balast, ověřit důležité informace proti primárním zdrojům a poradci zobrazit pouze to, co je pro jeho práci skutečně relevantní.
Aplikace nebude pouze agregátor zpráv. Hlavní hodnota bude v řetězci:
DATA → FILTRACE → OVĚŘENÍ → ANALÝZA → DOPAD → PRIORITA → AKCE

1. Co přesně má aplikace sledovat
Rozdělil bych obsah do 9 hlavních oblastí.
A. Hypotéky
hypoteční sazby
průměrné sazby
vývoj sazeb
objemy nových hypoték
refinancování
refixace
LTV
DTI/DSTI
podmínky bank
nové hypoteční produkty
změny metodik bank
vývoj cen nemovitostí
dostupnost bydlení
vývoj nájmů
Tohle bude pravděpodobně nejdůležitější kategorie.

B. Spotřebitelské úvěry
spotřebitelské úvěry
úrokové sazby
RPSN
konsolidace
úvěrová aktivita
zadlužení domácností
úvěrová rizika
změny pravidel poskytování úvěrů

C. ČNB
Velmi důležitá samostatná sekce.
Monitorovat:
rozhodnutí bankovní rady
repo sazbu
diskontní sazbu
lombardní sazbu
prognózy
inflaci
měnovou politiku
zápisy z jednání
projevy guvernéra
projevy viceguvernérů
finanční stabilitu
regulaci
dohled
doporučení bankám
statistiky
ČNB například vydává čtvrtletní Zprávu o měnové politice, která obsahuje prognózu ekonomiky, inflace a kontext měnověpolitických rozhodnutí. To je přesně typ primárního zdroje, který bych v systému považoval za velmi důležitý. (Czech National Bank)

D. Banky
Sledoval bych jednotlivé banky:
Česká spořitelna
ČSOB
Komerční banka
Raiffeisenbank
UniCredit Bank
MONETA
Air Bank
Fio
mBank
Trinity
další relevantní instituce
A monitoroval:
sazby
hypotéky
nové produkty
změny podmínek
akce
metodiky
tiskové zprávy
změny poplatků
změny procesů
nové technologie
výsledky bank

E. Nemovitosti
ceny bytů
ceny domů
ceny pozemků
nájmy
vývoj podle regionů
Praha
Brno
další velká města
novostavby
starší nemovitosti
stavebnictví
nabídka/poptávka
ČSÚ má například oficiální Index cen nemovitostí, takže pro některé ukazatele bychom nepoužívali mediální články, ale přímo statistická data. (Czech Statistical Office)

F. Pojištění
životní pojištění
majetkové pojištění
pojištění nemovitostí
pojištění domácnosti
odpovědnost
změny pojistných podmínek
regulace
pojistný trh
sazby/prémie, pokud jsou dostupné
trendy v pojišťovnictví

G. Ekonomika
inflace
HDP
nezaměstnanost
mzdy
maloobchod
průmysl
stavebnictví
spotřeba domácností
důvěra spotřebitelů
ekonomický sentiment
kurz CZK/EUR
EUR/USD
výnosy dluhopisů
sazby

H. Legislativa a regulace
Tady bych byl velmi důsledný.
Monitorovat:
Poslaneckou sněmovnu
Senát
vládu
MF ČR
ČNB
evropskou legislativu
zákony
vyhlášky
návrhy zákonů
schválené zákony
účinnost zákonů
metodiky
regulatorní doporučení
Například změna zákona o spotřebitelském úvěru může být pro poradce mnohem důležitější než deset článků v médiích. MF samo uvádí mezi oblastmi své finanční legislativy mimo jiné úvěry, pojištění a ochranu spotřebitele. (financnigramotnost.mfcr.cz)
A systém musí rozlišovat:
NÁVRH → SCHVÁLENO → VYHLÁŠENO → ÚČINNÉ
To je extrémně důležité.

I. Finanční trh obecně
investice
fondy
dluhopisy
akcie
kryptoměny
penzijní produkty
spoření
depozita
finanční podvody
kyberbezpečnost
ochrana spotřebitele

2. Odkud bude aplikace data získávat
Tady bych zavedl Source Hierarchy.
Ne všechny zdroje mají stejnou důvěryhodnost.
Tier 1 – primární zdroje
Nejvyšší priorita:
ČNB
ČSÚ
Ministerstvo financí
vláda
Poslanecká sněmovna
Senát
EUR-Lex / Evropská komise
oficiální banky
oficiální pojišťovny
ČBA
Například ČBA pravidelně zveřejňuje Hypomonitor a informace o hypotečním trhu; její newsletter obsahuje také komentáře k vývoji sazeb a bankovní statistice. (CBA Online)

Tier 2 – odborné zdroje
Například:
odborné finanční portály
realitní portály
ekonomické analýzy
odborné asociace
analytické společnosti

Tier 3 – média
Například:
Hospodářské noviny
E15
Seznam Zprávy
iDNES
Aktuálně
ČT
Forbes
další relevantní média

Tier 4 – ostatní
blogy
komentáře
sociální sítě
diskuse
Ty bychom používali pouze jako sekundární signál, nikoliv jako základ pro tvrzení typu „ČNB změnila pravidla“.

3. Jak se data dostanou do aplikace
Tady je klíčová architektura.
            INTERNET
                 │
     ┌───────────┼───────────┐
     ↓           ↓           ↓
    RSS         API       Web scraping
     │           │           │
     └───────────┼───────────┘
                 ↓
           DATA INGESTION
                 ↓
        NORMALIZACE DAT
                 ↓
        DUPLICITY / CLUSTER
                 ↓
          CLASSIFICATION
                 ↓
         IMPORTANCE SCORE
                 ↓
         FACT EXTRACTION
                 ↓
       SOURCE VERIFICATION
                 ↓
           AI ANALYSIS
                 ↓
          IMPACT ANALYSIS
                 ↓
          FINAL ARTICLE
                 ↓
        ┌────────┼────────┐
        ↓        ↓        ↓
    Dashboard  Alert   Morning
                        Brief

4. Data ingestion
Každý zdroj bude mít vlastní connector.
Například:
source_id: cnb
type: rss/web
frequency: 15 min
priority: 100
category:
  - cnb
  - regulation
  - mortgages
  - macro
Systém každých například 15 minut zkontroluje zdroj.
U některých zdrojů stačí:
RSS
U některých:
API
U některých:
HTML scraping
A u PDF:
PDF extraction → OCR/text extraction → AI processing

5. Každá informace bude mít vlastní datový objekt
Například:
{
  "id": "news_2026_001284",
  "title": "ČNB zveřejnila novou prognózu",
  "source": "ČNB",
  "source_type": "primary",
  "published_at": "2026-10-08T09:00:00",
  "url": "...",
  "category": [
    "cnb",
    "mortgages",
    "macro"
  ],
  "importance": 94,
  "confidence": 98,
  "impact": "high",
  "status": "verified"
}
Ale to je pouze základ.
K tomu budou přidány AI informace.

6. AI klasifikace
Každý nový obsah projde klasifikátorem.
AI odpoví například:
CATEGORY:
Hypotéky

SUBCATEGORY:
Úrokové sazby

RELEVANCE:
92/100

IMPACT:
High

SOURCE:
Primary

TIME SENSITIVITY:
High

TARGET:
Financial advisors

TYPE:
Market update

ACTION REQUIRED:
Possible

7. Deduplikace
Tohle je velmi důležité.
Představ si:
08:03 ČNB zveřejní zprávu.
Potom:
08:12 ČTK
08:19 E15
08:31 HN
08:44 Seznam
09:10 další web
Ve skutečnosti jde o jednu událost.
Aplikace tedy nesmí zobrazit pět různých zpráv.
Udělá:
EVENT #3481

"ČNB změnila..."
│
├── ČNB – primární zdroj
├── ČTK
├── HN
├── E15
└── Seznam
Uživatel vidí:
1 událost / 5 zdrojů

8. Event intelligence
Tohle bych považoval za jednu z nejdůležitějších částí celé aplikace.
Nechci ukládat jen články.
Chci ukládat události.
Například:
EVENT
ČNB ponechala repo sazbu na 3,75 %

FACTS
- repo: 3,75 %
- rozhodnutí: beze změny
- datum: 8. 10. 2026

SOURCES
- ČNB
- tisková konference
- zápis

IMPACT
Hypotéky: vysoký
Spotřebitelské úvěry: střední
Pojištění: nízký

TREND
neutrální
Tím se aplikace začne chovat jako finanční analytický systém, ne jako RSS čtečka.

9. Ověřování informací
AI nesmí mít poslední slovo.
Zavedl bych systém:
FACT CHECK ENGINE
Každé důležité tvrzení musí mít:
Claim
Repo sazba je 3,75 %.
Evidence
ČNB – rozhodnutí bankovní rady
Source
oficiální dokument
Confidence
99 %

Pokud AI najde například článek:
„Banky budou od listopadu poskytovat hypotéky za 3 %.“
A nenajde primární potvrzení:
nepustí to do Morning Briefingu jako fakt.
Může zobrazit:
⚠️ NEOVĚŘENO

10. AI nesmí zaměňovat fakta a interpretaci
Tohle bych technicky oddělil.
FACT
ČNB ponechala sazbu na X.
INTERPRETATION
To může omezovat prostor pro rychlý pokles hypotečních sazeb.
FORECAST
Sazby mohou v dalších měsících…
OPINION
Analytik XY očekává…
Každý typ bude mít jiný badge.
Například:
FAKT
ANALÝZA
ODHAD
NÁZOR
To je důležité kvůli důvěryhodnosti.

11. AI analýza
Po ověření přijde druhý AI krok.
Model dostane:
původní dokument
další potvrzené zdroje
historický kontext
relevantní statistiky
předchozí události
A musí vytvořit:
1. Co se stalo
max 2–3 věty.
2. Proč se to stalo
max 3–5 vět.
3. Co to znamená
praktický dopad.
4. Koho se to týká
hypoteční klient
investor
spotřebitel
majitel nemovitosti
podnikatel
5. Co sledovat dál
například:
Další rozhodnutí ČNB.

12. Impact Score
Každá událost dostane skóre.
Například:
RELEVANCE          0–100
URGENCY            0–100
MARKET IMPACT      0–100
ADVISOR IMPACT     0–100
CONFIDENCE         0–100
A potom:
FINAL SCORE =
35 % advisor impact
25 % market impact
20 % urgency
10 % relevance
10 % confidence
Výsledek:
🔴 90–100
KRITICKÉ
🟠 75–89
VYSOKÁ PRIORITA
🟡 55–74
DŮLEŽITÉ
🟢 30–54
INFORMATIVNÍ
⚪ 0–29
NÍZKÁ PRIORITA

13. Ale skóre bych ještě upravil podle uživatele
Protože ty nejsi ekonomický novinář.
Jsi finanční poradce.
Takže systém bude mít:
Advisor Relevance
Například:
Událost
Relevance
změna repo sazby
100
změna hypoték
100
nový zákon o úvěrech
98
ceny nemovitostí
95
pojišťovací regulace
85
HDP
65
průmyslová výroba
40
politická zpráva bez finančního dopadu
5

Tím se ti nebude plnit dashboard balastem.

14. Historický kontext
Tohle bych určitě přidal.
Když přijde:
„Hypoteční sazby vzrostly.“
aplikace automaticky doplní:
DNES       5,79 %
PŘED MĚSÍCEM 5,52 %
PŘED ROKEM  4,XX %
MINIMUM     X,XX %
MAXIMUM     X,XX %
A zobrazí graf.
Ještě lepší:
+0,27 p. b. meziměsíčně
A:
+X % od začátku roku

15. Trend Engine
Aplikace nebude sledovat jen jednotlivé zprávy.
Bude hledat trendy.
Například:
Posledních 30 dní

Hypoteční sazby       ↑
Repo sazba             →
Inflace                ↑
Ceny nemovitostí       ↑
Objem hypoték          ↓
A potom:
TREND
Financování bydlení mírně zdražuje.
To je mnohem hodnotnější než 20 jednotlivých článků.

16. Morning Briefing
Tohle bude hlavní produkt aplikace.
Každé ráno třeba v 7:00:
☕ MORNING BRIEFING
🔴 1. Největší událost
Hypoteční sazby pokračují v růstu
2–3 věty.
Dopad pro poradce: vysoký
Co sledovat: …

🟠 2. ČNB
Krátké shrnutí.

🟠 3. Nemovitosti
Krátké shrnutí.

🟡 4. Úvěry
Krátké shrnutí.

🟡 5. Regulace
Krátké shrnutí.

📊 Dnešní čísla
Repo sazba       3,75 %
Inflace          X,X %
Hypotéky         X,XX %
EUR/CZK          XX,XX
Nemovitosti      +X,X %

🎯 Co je dnes důležité pro poradce
3–5 bodů.
Tohle je podle mě nejhodnotnější část celého systému.

17. Detail zprávy
Klikneš na zprávu.
Otevře se:
ČNB ponechala sazby
Důležitost: 🔴 vysoká
Důvěryhodnost: 🟢 ověřeno
Kategorie: ČNB / hypotéky
Publikováno: 8. 10. 2026
Co se stalo
Krátké shrnutí.
Proč je to důležité
Analýza.
Dopad
Oblast
Dopad
Hypotéky
🔴 vysoký
Úvěry
🟠 střední
Pojištění
🟢 nízký
Nemovitosti
🟠 střední

Co sledovat
další rozhodnutí ČNB
vývoj IRS
hypoteční sazby
Zdroje
Primární: ČNB
Sekundární: ČBA
Komentář: …
A každý fakt by měl být dohledatelný až k původnímu zdroji.

18. „Pro poradce“
Na každé důležité zprávě bych měl samostatnou kartu:
👨‍💼 CO TO ZNAMENÁ PRO PORADCE
Například:
Hypotéky:
Vyšší sazby mohou zhoršovat dostupnost financování.
Klient:
U klientů s nižší rezervou je důležitější pracovat se scénáři.
Pozor:
Nezaměňovat nabídkové sazby s reálně sjednanými sazbami.

19. „Vysvětli mi to“
Další velmi dobrá funkce.
Uživatel klikne:
🤖 Vysvětlit jednoduše
AI odpoví:
„Repo sazba je sazba, za kterou ČNB ovlivňuje cenu peněz v ekonomice. Když se mění, může se časem promítnout do sazeb, které banky nabízejí klientům. Neznamená to ale, že změna repo sazby automaticky znamená stejnou změnu hypotečních sazeb.“

20. „Co říct klientovi“
Na důležitých zprávách:
💬 Vysvětlení pro klienta
AI vytvoří jednoduchou formulaci bez odborných výrazů.
Například:
„Aktuální vývoj sazeb znamená, že bych při plánování hypotéky nepočítal pouze s dnešní splátkou. Doporučuji podívat se i na variantu, kdy sazba zůstane vyšší.“
Pozor: Tohle bych prezentoval jako komunikační pomůcku, ne jako automatické finanční doporučení.

21. Dashboard
Hlavní obrazovka:
┌─────────────────────────────────────────────┐
│ FINANCE RADAR              8. 10. 2026      │
├─────────────────────────────────────────────┤
│                                             │
│ 🔴 3 KRITICKÉ UDÁLOSTI                     │
│                                             │
│ 🏠 HYPOTÉKY                                  │
│ sazby ↑                                     │
│                                             │
│ 🏦 ČNB                                      │
│ repo →                                      │
│                                             │
│ 🏘 NEMOVITOSTI                              │
│ ceny ↑                                     │
│                                             │
├─────────────────────────────────────────────┤
│ DNEŠNÍ TOP ZPRÁVY                           │
│                                             │
│ 🔴 ...                                      │
│ 🟠 ...                                      │
│ 🟡 ...                                      │
│                                             │
├─────────────────────────────────────────────┤
│ 📊 TRŽNÍ UKAZATELE                          │
│                                             │
│ Repo       3,75 %                           │
│ Hypotéky   X,XX %                           │
│ Inflace    X,X %                            │
│ EUR/CZK    XX,XX                            │
└─────────────────────────────────────────────┘

22. Samostatná stránka „Trh“
Tady už bych udělal něco podobného Bloomberg-lite.
Úrokové sazby
graf:
3M → 1Y → 3Y → 5Y
Hypotéky
průměrná sazba
objem
počet
vývoj
ČNB
repo
diskont
lombard
Nemovitosti
Praha
Brno
ČR
byty
domy
Makro
inflace
HDP
nezaměstnanost
mzdy

23. Legislativa
Samostatný modul.
Každá změna:
🔴 NOVELA
Zákon o spotřebitelském úvěru
Stav:
NÁVRH → SCHVÁLENO → SENÁT → VYHLÁŠENO → ÚČINNÉ
Aplikace musí zobrazovat:
co se mění
koho se to týká
od kdy
jak moc je to relevantní
odkaz na původní dokument
To je velmi důležité, protože legislativní informace se nesmí prezentovat stylem „AI si myslí, že zákon bude platit“.

24. Alert systém
Uživatel si nastaví:
Alerty
☑ ČNB
☑ hypotéky
☑ sazby
☑ legislativa
☑ nemovitosti
☑ banky
A například:
Upozorni mě pouze při důležitosti > 80.
Nebo:
Upozorni mě při jakékoliv změně ČNB.

25. Denní / týdenní / měsíční režim
Nejen Morning Briefing.
Denní
5–10 nejdůležitějších událostí.
Týdenní
TÝDEN NA FINANČNÍM TRHU
co se stalo
největší změny
nové trendy
co sledovat příští týden
Měsíční
FINANČNÍ TRH – ZÁŘÍ 2026
sazby
hypotéky
nemovitosti
ČNB
regulace
ekonomika

26. AI chatbot nad databází
Tohle bych přidal až po základní verzi, ale bude to skvělé.
Uživatel se zeptá:
„Co se za poslední 3 měsíce změnilo u hypoték?“
AI neodpoví pouze z obecných znalostí.
Vyhledá v naší vlastní databázi.
Nebo:
„Proč letos rostou hypoteční sazby?“
A dostane:
data
graf
relevantní události
ČNB
ČBA
časovou osu

27. Časová osa
Například:
LEDEN
│
├─ ČNB ponechala sazby
│
ÚNOR
│
├─ Hypomonitor
│
BŘEZEN
│
├─ změna bankovních sazeb
│
DUBEN
│
├─ nová prognóza ČNB
│
...
Uživatel pak může vidět:
Jak jsme se dostali k dnešní situaci?

28. Jak bych řešil AI technicky
Nedával bych všechno jednomu AI modelu.
Použil bych několik kroků.
Model 1 — Classification
„O čem tento dokument je?“
Model 2 — Extraction
„Jaká konkrétní fakta obsahuje?“
Model 3 — Verification
„Lze tvrzení potvrdit zdrojem?“
Model 4 — Analysis
„Co to znamená?“
Model 5 — Summarization
„Vytvoř krátké shrnutí.“
Model 6 — Advisor layer
„Co z toho potřebuje vědět finanční poradce?“
To výrazně sníží riziko, že jeden prompt vyrobí krásně napsaný nesmysl.

29. RAG
AI bych napojil na vlastní databázi pomocí RAG.
Takže když se zeptáš:
„Jaký byl vývoj hypotečních sazeb za posledních 12 měsíců?“
systém nejprve vyhledá relevantní:
statistiky
články
ČNB dokumenty
ČBA data
a až potom AI vytvoří odpověď.
AI tedy nebude „hádat“.

30. Databáze
Navrhoval bych například:
users
sources
source_documents
articles
events
facts
claims
categories
entities
market_indicators
indicator_values
legislation
alerts
ai_analyses
daily_briefings
weekly_reports
Důležitá tabulka:
facts
fact_id
event_id
statement
value
unit
date
source_id
confidence
verified
Takže například:
fact:
repo_rate

value:
3.75

unit:
%

date:
2026-10-08

source:
CNB

verified:
true
To umožní později dělat grafy a výpočty bez AI.

31. Co musí být AI a co nesmí být AI
Tohle je důležité.
AI:
shrnutí
klasifikace
hledání souvislostí
vysvětlení
kategorizace
sentiment
dopad
tvorba briefingů
Klasický software:
matematika
procenta
grafy
historické změny
databázové dotazy
datumy
alerty
thresholdy
Například:
+0,32 procentního bodu
se nemá počítat pomocí AI.
Musí to spočítat program.

32. Bezpečnost a důvěryhodnost
Aplikace pracuje s finančními informacemi, takže bych od začátku udělal:
audit log
historii změn
zdroj u každého faktu
timestamp
verzi AI analýzy
confidence score
oddělení faktu a interpretace
možnost otevřít originální dokument
možnost označit chybnou analýzu
A především:
AI nikdy nesmí změnit původní fakt.
Pokud ČNB vydá dokument, originální data uložíme neměnná.

33. Jak bych zobrazil důvěryhodnost
Každá informace:
🟢 Ověřeno primárním zdrojem
🔵 Potvrzeno více zdroji
🟡 Sekundární zdroj
🟠 Čeká na ověření
🔴 Rozpor mezi zdroji
A když se dva zdroje rozcházejí:
⚠️ ROZPOR
Zdroj A uvádí X.
Zdroj B uvádí Y.
Primární zdroj zatím nepotvrdil ani jednu hodnotu.
Tohle bych považoval za jednu z nejdůležitějších funkcí.

34. Co bych naopak NEDĚLAL
Nedělal bych:
❌ 500 zpráv denně
❌ klasický news feed
❌ clickbait titulky
❌ automatické „predikce“ vydávané za fakta
❌ nekontrolované AI shrnutí
❌ spoléhání pouze na média
❌ doporučování finančních produktů pouze podle AI
❌ komplikované sociální funkce
Cíl je:
„Otevřu aplikaci a za 5 minut vím, co je důležité.“

35. Doporučená technická architektura
Pokud bychom to programovali dnes, šel bych například:
FRONTEND
Next.js / React
        │
        ↓
BACKEND API
Python / FastAPI
        │
 ┌──────┼────────┐
 ↓      ↓        ↓
Postgres Redis   Queue
 │
 ↓
AI PIPELINE
 │
 ├── Classification
 ├── Extraction
 ├── Verification
 ├── Analysis
 └── Summarization
 │
 ↓
VECTOR DATABASE
 │
 ↓
RAG
Pro scraping:
RSS
APIs
Playwright
BeautifulSoup
PDF extraction
OCR
Pro plánování:
Scheduler
      ↓
Collectors
      ↓
Processing queue

36. Jak často sbírat data
Není potřeba všechno každou minutu.
Kritické zdroje
ČNB:
5–15 minut
Banky
30–60 minut
Média
15–30 minut
Statistiky
Podle zveřejnění:
1× denně / týdně / měsíčně
Legislativa
30–60 minut

37. Prioritní systém zdrojů
Já bych nastavil například:
ČNB                  100
ČSÚ                    98
MF                     97
Oficiální legislativa 100
ČBA                    95
Banka                  90
Odborný portál         75
Ekonomické médium      65
Ostatní médium         45
Blog                   20
Sociální síť           10
Neznamená to, že médium je špatné.
Znamená to, že primární zdroj má větší váhu při ověřování faktu.

38. Největší „killer feature“
Za mě není největší výhoda:
„Máme 100 zdrojů.“
To dokáže Google.
Ani:
„Máme AI shrnutí.“
To dokáže spousta aplikací.
Killer feature je:
Advisor Impact Engine
Každou událost převést z:
„Co se stalo ve světě?“
na:
„Co to znamená pro člověka, který dnes sedí s klientem a řeší hypotéku, úvěr nebo pojištění?“
Například:
ČNB
 ↓
nové rozhodnutí
 ↓
dopad na trh
 ↓
dopad na hypotéky
 ↓
dopad na poradce
 ↓
co sledovat
 ↓
jak to vysvětlit klientovi
To je přesně ta vrstva, kterou bych kolem celého produktu postavil.

39. MVP – první verze
Abychom se neutopili ve vývoji, první verze nemusí obsahovat všechno výše uvedené.
Postavil bych:
V1
Dashboard
News Radar
ČNB monitor
Hypoteční monitor
Nemovitosti
Legislativa
AI shrnutí
Importance score
Source verification
Deduplikace
Morning Briefing
Alerty
Detail zprávy
Zdroje + odkazy
historie událostí
To už je plnohodnotná aplikace.

40. V2
Potom:
Market Dashboard
grafy
historické trendy
AI chatbot
RAG
týdenní report
měsíční report
pokročilé alerty
personalizované preference

41. V3
Až potom:
pokročilá predikční analytika
například:
„Hypoteční sazby za poslední 3 měsíce vykazují…“
ale vždy jako modelový scénář / analytický signál, nikoliv jako jistou předpověď.

Jak bych to pojmenoval jako produkt
Pracovní název:
FINANCE RADAR
Podtitul:
Váš přehled českého finančního trhu. Každý den.
A hlavní filozofie aplikace:
Nemusíš číst všechno. Potřebuješ vědět, co je důležité.

Jedna věc, kterou bych změnil oproti původnímu nápadu
Nestavěl bych to jako „portál zpráv“.
Stavěl bych to jako intelligence platformu pro finančního poradce, která náhodou obsahuje zprávy.
Protože skutečná hodnota není v tom, že ti aplikace řekne „ČNB něco zveřejnila“. Hodnota je v tom, že ti řekne:
„ČNB něco zveřejnila → tady je původní dokument → tady jsou ověřená fakta → tady je změna proti minulosti → tady je dopad na hypotéky → tady je význam pro poradce → a tady je to, co má smysl dnes sledovat.“
To je podle mě produkt, za který by finanční poradce mohl mít důvod platit.
A technicky je to navíc dobře rozšiřitelné. ČNB už dnes publikuje prognózy, podkladová data a další materiály včetně XLSX/PDF, ČSÚ má strukturované statistické ukazatele a ČBA publikuje pravidelné hypoteční a bankovní statistiky. (Czech National Bank)
Pokud bychom to měli opravdu začít stavět, další krok bych udělal jako „Technical Design v1“: přesně bych nadefinoval databázové tabulky, API endpointy, jednotlivé cron joby/workery, AI prompty, scoring algoritmus a strukturu každé obrazovky. Z toho už se dá přímo přejít k programování.

