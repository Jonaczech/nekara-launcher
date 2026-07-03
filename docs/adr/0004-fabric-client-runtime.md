# ADR 0004: Fabric klientský runtime pro Nekaru

## Stav

Přijato

## Datum

2026-06-30

## Kontext

Nekara Launcher potřebuje jednu podporovanou klientskou konfiguraci s mod
supportem. Projekt musí zůstat soustředěný na jednu Nekara herní cestu místo
toho, aby se změnil v obecný Minecraft launcher.

Základní Minecraft verze je centrálně fixovaná, ale launcher také potřebuje
loader, který umí podpořit mody a budoucí client-side distribuci obsahu Nekary.

## Rozhodnutí

Použij Fabric jako podporovaný klientský runtime nad pevně danou Minecraft
verzí.

Launcher by měl:

- dohledat oficiální Minecraft metadata pro základní verzi,
- dohledat Fabric loader/profile metadata pro stejnou verzi,
- nainstalovat Fabric profile JSON a Fabric knihovny vedle oficiálních
  Minecraft souborů,
- spouštět Minecraft přes Fabric-generated main class a argumenty,
- držet veškeré uživatelské wording v souladu s Fabric-backed Nekara klientem.

## Odůvodnění

Fabric dává launcheru lehký a dobře pochopitelný základ pro modding, aniž by
se aplikace změnila v generický modpack manager.

Drží klientský surface úzký:

- jedna podporovaná herní konfigurace,
- jedna podporovaná loader cesta,
- jeden launch profil,
- jeden izolovaný instalační root.

To lépe odpovídá scope projektu než přidávání podpory pro více loaderů nebo
uživatelsky volitelné Minecraft verze.

## Důsledky

### Pozitivní

- Launcher může podporovat mody přes známý klientský loader.
- Instalační flow zůstává integrity-driven a deterministický.
- Launch kód může dál používat oficiální Minecraft metadata jako základní vrstvu.
- UI může prezentovat jedinou Nekara play path místo odhalování interních
  launcher detailů.

### Negativní

- Instalační pipeline musí kromě oficiálních Minecraft souborů spravovat i
  Fabric profile metadata.
- Wording v release a diagnostice musí být synchronizovaný s volbou loaderu.
- Budoucí změny loaderu by vyžadovaly další architektonické rozhodnutí.

## Navazující práce

1. Přidat distribuci a synchronizaci klientských modů nad Fabric profilem.
2. Udržet launcher diagnostiku sladěnou s Fabric profilem a základní Minecraft
   verzí.
3. Rozšířit updater/install integrity pravidla, pokud se Fabric loader metadata
   změní formátem.
