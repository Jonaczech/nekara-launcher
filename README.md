# Nekara Launcher

Nekara Launcher je vlastní desktopový launcher pro Minecraft server Nekara.
Je navržen pro jednu podporovanou herní konfiguraci: Nekara.

Launcher není určen jako obecný Minecraft launcher, prohlížeč modpacků,
seznam serverů, tržiště, fórum ani komunitní portál.

## Rozsah produktu

Launcher má hráči umožnit:

1. Spustit launcher.
2. Přihlásit se pomocí lokálního offline jména hráče.
3. Počkat, až se instalace Nekary zkontroluje nebo připraví.
4. Stisknout tlačítko Hrát.

Za aplikaci odpovídá zejména:

- samoupdatování launcheru,
- identita hráče pro danou spouštěcí relaci,
- izolovaná správa herního adresáře Nekary,
- práce s oficiálními Minecraft metadaty, příprava Fabric profilu a kontrola integrity klientských souborů,
- detekce nebo příprava Java běhového prostředí,
- validace a oprava souborů,
- sestavení spouštěcího příkazu,
- spuštění a sledování procesu Minecraftu,
- srozumitelná diagnostika při chybách.

Současná kostra už obsahuje:

- příkaz pro stav launcheru,
- příkaz pro kontrolu oficiálních Minecraft metadat,
- příkaz pro detekci Java běhového prostředí,
- příkaz pro instalační plán izolovaného Fabric klienta Nekary,
- příkaz pro stav instalace a opravnou akci pro vyhodnocený
  `version.json`, klientský `.jar`, Fabric profil JSON, oficiální knihovny,
  Fabric knihovny, index assetů a objekty assetů,
- příkaz pro spuštění, který skládá skutečné Minecraft spuštění z oficiálních
  metadat a Fabric profilu a sleduje jeho stav,
- offline profil hráče, který ukládá lokální jméno hráče pro spouštěcí relaci,
- bezrámový React shell launcheru, který zobrazuje aktuální stav připravenosti.

## Mimo rozsah

Launcher nesmí poskytovat:

- více herních profilů,
- výběr Minecraft verzí,
- instalaci veřejných modpacků,
- procházení katalogu modů,
- ruční správu modů,
- více Minecraft instancí,
- správu vlastních serverů,
- komunitní funkce,
- fórum, obchod nebo webový portál,
- administraci Minecraft serveru.

## Cílová verze Minecraftu

Podporovaná verze Minecraftu je definovaná centrálně jako:

```text
26.1.2
```

Před implementací instalačního mechanismu musí být tato verze dohledaná přes
oficiální Minecraft metadata. Nevymýšlej neoficiální URL ani náhradní metadata.

K 2026-06-30 byla tato verze ověřena v oficiálním manifestu Mojang/Piston jako
`release`.

## Technologický směr

Preferovaný stack je:

- Tauri 2
- React
- TypeScript
- Rust
- Vite
- pnpm

Viz [ADR 0001](docs/adr/0001-launcher-technology-stack.md) pro původní
technologické rozhodnutí.

Viz [ADR 0003](docs/adr/0003-github-releases-updater-and-install-integrity.md)
pro současný směr aktualizací a integrity instalace.

Viz [ADR 0004](docs/adr/0004-fabric-client-runtime.md) pro rozhodnutí o
Fabric klientském runtime.

## Aktuální stav repozitáře

Repozitář je ve fázi projektového základu. Existuje počáteční kostra Tauri 2 +
React + TypeScript, hráčsky orientovaný launcher shell a první skutečné
běhové kontroly.

Launcher už umí připravit první plnou vrstvu Fabric klienta v izolovaném
adresáři Nekary: vyhodnocené `version.json`, oficiální klientský `.jar`,
oficiální knihovny, Fabric profil JSON, Fabric knihovny, asset index, asset
objekty a schválený manifest modů pro Fabric klienta Nekary. Stažené soubory
se před uložením ověřují, mody spravované launcherem se opravují pomocí
SHA-512 a při změně schváleného manifestu se čistí, a launcher hlásí, kolik
knihoven, assetů a modů ještě chybí. Během přípravy se navíc do klienta zapisuje
přednastavený multiplayer server Nekary, aby se server zobrazil přímo v
Minecraftu.

Launcher také umí první offline průchod `Hrát`, pokud je Fabric klient
připravený a je k dispozici kompatibilní Java běhové prostředí. Stav procesu a
cesta k logu se vrací zpět do UI pro diagnostiku. V nastaveních se ukládá limit
RAM pro Minecraft a po neúspěšném spuštění zůstává k dispozici nápověda k
opravě i výřez logu. Nastavení navíc přijímá volitelnou vlastní cestu ke
spustitelnému souboru Javy, takže běhové prostředí lze připnout místo
spoléhání jen na systémový `PATH`. Stejné nastavení také přijímá volitelný
vlastní adresář hry, aby izolovaný klient Nekary nemusel ležet pod výchozím
`AppData`.

Uživatelské rozhraní i diagnostika launcheru jsou lokalizované do češtiny a
start aplikace nyní rozkládá těžší běhové kontroly, takže se první vykreslení
okna na Windows méně zasekává.

Diagnostické logy launcheru se zapisují pod uživatelský profil do datového
adresáře Nekara Launcheru, do samostatné složky `logs`, aby bylo možné zpětně
procházet chyby aktualizace i spuštění.

Samoupdaty launcheru jsou napojené na podepsané GitHub Releases. Updater při
startu automaticky kontroluje koncový bod releasu, jakmile jsou release
artefakty dostupné.

Zdrojové brand assets jsou organizované v `brand/`, zatímco generované ikony
aplikace Tauri jsou v `src-tauri/icons/`.

Známý stav lokálních závislostí:

- Node.js: dostupný
- pnpm: dostupný
- Rust toolchain: dostupný lokálně a ověřený přes Visual Studio Developer
  Command Prompt

## Poznámky k vývoji

Instalace JavaScriptových závislostí:

```bash
pnpm install
```

Kontrola TypeScript typů:

```bash
pnpm typecheck
```

Kontrola formátování:

```bash
pnpm format:check
```

Lint:

```bash
pnpm lint
```

Testy:

```bash
pnpm test
```

Sestavení frontendu:

```bash
pnpm build
```

Kompletní ověřovací průchod:

```bash
pnpm check
```

Spuštění Tauri příkazů:

```bash
pnpm tauri
```

Desktopový vývoj a desktopové buildy vyžadují, aby byl Rust toolchain dostupný
v `PATH`.

Na Windows Tauri buildy také vyžadují prostředí Visual Studio C++ Build Tools.
V tomto repozitáři bylo `pnpm tauri build` ověřeno z Visual Studio Developer
Command Promptu s `~/.cargo/bin` v `PATH`.

Současný pnpm workspace výslovně schvaluje instalační skript `esbuild`, který
Vite potřebuje.
