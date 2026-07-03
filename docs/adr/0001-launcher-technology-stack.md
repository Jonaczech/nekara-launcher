# ADR 0001: Technologický stack launcheru

## Stav

Přijato

## Datum

2026-06-30

## Kontext

Nekara Launcher je vlastní desktopová aplikace pro přípravu a spuštění jedné
podporované Minecraft konfigurace: Nekara.

Launcher potřebuje přístup k desktopovým možnostem, jako je správa souborového
systému, spouštění procesů, logging, bezpečné ukládání tokenů, stahování,
kontrola integrity a platformově specifické aplikační adresáře.

Počáteční cílová platforma je Windows, ale architektura by neměla zbytečně
bránit budoucí podpoře Linuxu nebo macOS.

UI launcheru má zůstat soustředěné na jednoduchý hráčský průchod:

```text
Spustit launcher -> přihlásit se -> počkat na kontrolu nebo instalaci -> stisknout Hrát
```

## Rozhodnutí

Použij tento stack:

- Tauri 2 pro desktopový shell aplikace a nativní integraci.
- Rust pro důvěryhodné backendové a systémové operace.
- React pro uživatelské rozhraní.
- TypeScript pro typovaný frontendový aplikační kód.
- Vite pro frontendový vývoj a bundlování.
- pnpm pro správu JavaScriptových balíčků.

## Odůvodnění

Tauri 2 je silná volba, protože poskytuje malý desktopový shell, Rust backend
a jasnou hranici příkazů mezi UI kódem a privilegovanými systémovými
operacemi.

Rust je vhodný pro:

- operace se souborovým systémem,
- stahování a kontrolu integrity,
- spouštění a sledování procesů,
- explicitní modelování chyb,
- cross-platform systémové hranice,
- budoucí bezpečnostně citlivé tokenové a konfigurační zpracování.

React a TypeScript poskytují produktivní UI vrstvu a zároveň drží systémovou
logiku mimo frontendové komponenty.

Vite a pnpm poskytují rychlý a běžně používaný frontendový toolchain s
predikovatelnou správou balíčků.

## Zvažované alternativy

### Electron

Electron má vyspělý ekosystém a široké desktopové rozšíření. Nebyl vybrán,
protože obvykle přináší větší runtime footprint a podporuje Node.js backendový
model. Nekara Launcher těží z menšího nativního shellu a Rust systémové vrstvy.

### .NET Desktop

.NET umí vytvářet robustní Windows desktop aplikace, ale méně odpovídá
preferovanému cross-platform frontend stacku a odvedl by projekt od požadovaného
směru Tauri/React.

### JavaFX

JavaFX by znovu využil Java ekosystém, ale není ideální pro moderní custom
launcher UI a přidal by tření kolem balení, nativní integrace a dlouhodobé
frontendové iterace.

### Flutter Desktop

Flutter umí stavět cross-platform desktopová UI, ale přinesl by samostatný jazyk
a UI ekosystém. Projekt teď více těží z Reactu, TypeScriptu a Rustu.

## Důsledky

- Projekt vyžaduje funkční Rust toolchain pro desktop build a backendovou
  verifikaci.
- Frontendový kód nesmí přímo provádět privilegované launcher operace.
- Tauri command API má být typované a používané jako aplikační hranice.
- Build a test příkazy musí po vzniku scaffoldu pokrýt frontend i Rust vrstvy.

## Navazující práce

- Naskafoldovat aplikaci Tauri 2.
- Přidat počáteční frontendovou a Rust modulovou strukturu.
- Definovat centrální konfiguraci Nekara launcheru.
- Přidat první Tauri command pro stav launcheru a diagnostiku.
