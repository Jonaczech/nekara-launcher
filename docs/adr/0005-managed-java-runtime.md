# ADR 0005: Launcher-owned Java runtime

## Stav

Přijato

## Datum

2026-07-07

## Kontext

Launcher musí hráči pomoci i v situaci, kdy v systému není kompatibilní Java
běhové prostředí. Spoléhat pouze na systémovou instalaci nebo ruční nastavení
cesty je pro běžného hráče křehké a často znamená, že se launcher tváří
"zaseknutě", i když mu ve skutečnosti chybí jen runtime.

Projekt zároveň drží jednu podporovanou herní konfiguraci a jeden izolovaný
herní adresář. To dělá z launcher-owned runtime logický doplněk: runtime patří
launcheru stejně jako ostatní spravované soubory.

## Rozhodnutí

Na Windows používej launcher-owned Java runtime jako automaticky spravovaný
fallback:

- stáhni oficiální Temurin JRE ZIP z Adoptium,
- ověř stažený archiv přes SHA-256 z oficiálního checksum endpointu,
- rozbal runtime do launcher dat do verzovaného adresáře,
- preferuj managed runtime před systémovým `PATH`, pokud není nastavená vlastní
  Java cesta,
- ponech ručně nastavenou cestu jako explicitní override pro pokročilé uživatele.

Pro tuto první verzi používej pouze Windows balíček. Pro cross-platform
podporu se může rozhodnout později samostatným ADR.

## Odůvodnění

Launcher-owned runtime snižuje počet kroků, které hráč musí vyřešit před
spuštěním hry. Odpadá závislost na tom, jestli je Java nainstalovaná systémově,
v jaké verzi a kde přesně leží `java.exe`.

Výběr Adoptium Temurin JRE ZIPu je vhodný, protože:

- jde o oficiální, veřejně dostupný balíček,
- ZIP varianta se dá uložit do launcher dat bez systémové instalace,
- SHA-256 checksum umožní jednoduchou integritní kontrolu,
- JRE stačí pro spuštění hry, takže není nutné tahat plný JDK.

MSI instalátor by naopak vedl k per-machine instalaci a často k vyšším
požadavkům na oprávnění, což je pro launcher horší UX.

## Důsledky

### Pozitivní

- Launcher umí hráči chybějící Javu doinstalovat sám.
- Instalace zůstává izolovaná a přenosná v rámci launcher dat.
- Hra se dá spustit i na počítači bez předchozí Java instalace.
- Checksum kontrola snižuje riziko poškozeného nebo podvrženého archivu.

### Negativní

- Launcher musí spravovat další download, extract a lock flow.
- Managed runtime zabírá vlastní diskové místo.
- Implementace je zatím Windows-only a bude potřebovat další rozhodnutí pro
  Linux a macOS.

## Navazující práce

1. Přidat vyčištění starých nebo nekompatibilních managed runtime verzí.
2. Rozšířit strategii na další platformy, pokud to bude produktově potřeba.
3. Zvažovat, zda launcher v budoucnu nabídne i explicitní volbu mezi managed a
   systémovou Javou.
