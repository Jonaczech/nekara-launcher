# Nekara Launcher – projektové instrukce

## Přehled projektu

Nekara je vlastní launcher a budoucí ekosystém pro Minecraft MMORPG survival server inspirovaný atmosférou herní série Gothic.

Inspirace se týká především:

- atmosféry světa,
- postupu hráče,
- nebezpečí a obtížnosti,
- frakcí,
- společenské hierarchie,
- získávání reputace,
- přežívání,
- temného středověkého fantasy.

Nekopíruj chráněné názvy, postavy, loga, hudbu, textury, dialogy, příběhy, grafické prvky ani jiné konkrétní materiály ze hry Gothic nebo z jiných her.

Nekara musí mít vlastní původní identitu, vizuální jazyk, svět, příběh, lore, názvy, grafiku a značku.

Inspirace hrou Gothic nesmí vést k přímému kopírování jejího obsahu.

## Aktuální priorita projektu

Současnou prioritou je vývoj desktopové aplikace Nekara Launcher.

Pokud aktuální zadání výslovně neurčí jinak, neimplementuj:

- Minecraft server,
- serverové pluginy,
- veřejný web,
- internetový obchod,
- platební systém,
- uživatelský portál,
- fórum,
- vlastní sociální síť,
- administrační systém serveru.

Launcher má být nejprve určen pro operační systém Windows.

Architektura však nemá bezdůvodně znemožňovat budoucí podporu systémů Linux a macOS.

Primárním cílem je vytvořit stabilní, bezpečný a udržovatelný launcher, který dokáže připravit klientskou instalaci Nekary a spustit Minecraft.

## Hlavní produktové cíle

Launcher by měl postupně poskytovat následující funkce:

- bezpečné přihlášení pomocí účtu Microsoft,
- ověření přístupu k Minecraft Java Edition,
- zobrazení profilu přihlášeného hráče,
- samostatný a izolovaný herní adresář Nekary,
- instalaci požadované verze Minecraftu,
- instalaci vybraného mod loaderu,
- instalaci a synchronizaci klientského balíčku Nekary,
- distribuci schválených modů,
- distribuci konfiguračních souborů,
- distribuci resource packů,
- správu verzovaných vzdálených manifestů,
- kontrolu integrity souborů pomocí kryptografických hashů,
- opravu chybějících nebo poškozených souborů,
- odstranění zastaralých souborů podle pravidel manifestu,
- zobrazení průběhu stahování,
- možnost stahování zrušit,
- automatické opakování neúspěšných stahování,
- nastavení paměti RAM přidělené Minecraftu,
- detekci nainstalovaného prostředí Java,
- případnou správu vlastního Java runtime,
- sestavení JVM příkazu pro spuštění Minecraftu,
- spuštění herního procesu,
- sledování běžícího procesu Minecraftu,
- zobrazení stavu spuštěné hry,
- zpracování ukončení nebo pádu hry,
- uchovávání relevantních logů,
- zobrazování srozumitelných chybových zpráv,
- zobrazování stavu Minecraft serveru,
- zobrazování novinek a oznámení,
- automatickou aktualizaci launcheru,
- diagnostické nástroje pro řešení problémů.

## Základní technologický návrh

Před vytvořením produkční implementace připrav ADR dokument porovnávající realistické technologie pro vývoj launcheru.

Preferovaným výchozím kandidátem je:

- Tauri 2,
- React,
- TypeScript,
- Rust,
- Vite,
- pnpm.

Tento technologický stack neměň bez zdůvodnění.

Jiný technologický stack lze použít pouze tehdy, pokud:

- existuje konkrétní technický důvod,
- je řešení porovnáno s původním návrhem,
- jsou popsány výhody a nevýhody,
- je změna zaznamenána v ADR dokumentu.

Bez zdůvodnění nepřecházej například na Electron, .NET, JavaFX nebo jiný framework.

## Architektonické zásady

Jednotlivé části launcheru musí být od sebe logicky odděleny.

Minimálně odděl následující oblasti:

1. Uživatelské rozhraní
2. Autentizace
3. Instalace Minecraftu a správa verzí
4. Stahování souborů a kontrola jejich integrity
5. Synchronizace klientského balíčku
6. Správa Java runtime
7. Sestavení příkazu pro spuštění Minecraftu
8. Spuštění a sledování herního procesu
9. Aktualizace launcheru
10. Komunikace se vzdáleným API
11. Konfigurace aplikace
12. Bezpečné ukládání tokenů
13. Logování
14. Diagnostika
15. Zpracování chyb

Uživatelské rozhraní v Reactu nesmí přímo obsahovat logiku pro:

- autentizaci,
- instalaci Minecraftu,
- správu souborového systému,
- stahování souborů,
- práci s Java runtime,
- spouštění procesů,
- sestavování JVM příkazů,
- aktualizaci launcheru.

Systémové operace implementuj za typovaným aplikačním rozhraním v Rust/Tauri vrstvě.

React má zajišťovat především:

- zobrazení dat,
- interakci s uživatelem,
- navigaci,
- zobrazování stavů,
- zobrazování chyb,
- ovládání aplikačních operací prostřednictvím definovaného rozhraní.

Nepřesouvej kritickou systémovou logiku do frontendových komponent.

## Struktura zdrojového kódu

Preferuj strukturu rozdělenou podle odpovědností a domén.

Nevytvářej jeden rozsáhlý modul obsahující veškerou logiku launcheru.

Každý modul má mít jasně definovaný účel.

Doporučené oblasti projektu mohou zahrnovat například:

```text
src/
  app/
  components/
  features/
  pages/
  services/
  state/
  types/
  utils/

src-tauri/
  src/
    auth/
    config/
    diagnostics/
    downloads/
    errors/
    filesystem/
    game/
    java/
    launcher/
    logging/
    manifests/
    minecraft/
    processes/
    updates/
```

## Aktuální zpřesnění rozsahu launcheru

Launcher je samostatná desktopová aplikace výhradně pro server Nekara.

Nejde o obecný Minecraft launcher ani náhradu aplikací Modrinth App, Prism Launcher, CurseForge nebo oficiálního Minecraft Launcheru.

Launcher nemá umožňovat:

- správu více herních profilů,
- výběr různých verzí Minecraftu,
- instalaci veřejných modpacků,
- procházení katalogu modů,
- ruční správu modů,
- správu více Minecraft instancí,
- přidávání cizích serverů,
- správu vlastních klientských sestav,
- komunitní funkce,
- fórum,
- obchod,
- webový portál,
- administraci Minecraft serveru.

Existuje pouze jedna podporovaná herní konfigurace: Nekara.

Cílová verze Minecraftu je `26.1.2`. Tuto hodnotu definuj centrálně a nerozmisťuj ji na více míst zdrojového kódu.

Před implementací instalačního mechanismu ověř, že cílovou verzi lze získat prostřednictvím oficiálních metadat Minecraftu. Pokud ještě není dostupná nebo používá odlišný identifikátor, nevymýšlej náhradní URL ani neoficiální metadata. Připrav konfiguraci a problém jasně zdokumentuj.

Ideální uživatelský průchod launcherem je:

```text
Spustit launcher
→ přihlásit se
→ počkat na kontrolu nebo instalaci
→ stisknout tlačítko Hrát
```
