# Stav projektu

Tento soubor je předávací bod pro pokračování práce na Nekara Launcheru.
Aktualizuj ho vždy, když se práce posune jinam, dokončí se milník nebo vznikne
užitečný navazující kontext.

## Poslední aktualizace

2026-07-06

## Současné zaměření

Projektový základ pro vlastní desktopový launcher určený pro Minecraft server
Nekara, s hráčsky orientovaným brandovaným shellem, podepsanými aktualizacemi
přes GitHub Releases, kontrolou oficiálních metadat, detekcí Java runtime,
přípravou oficiálních souborů pro základní Minecraft klient, knihovny a assety,
offline spouštěcím postupem, offline profilem hráče a izolovanou herní složkou
`AppData\Roaming\Nekara`.

## Stav repozitáře

- Git repozitář existuje a má aktivní historii na `codex/github-bootstrap`.
- Existuje úvodní scaffold Tauri 2 + React + TypeScript.
- Dokumentační základ je aktivně používaný pro sledování releasů a roadmapy.
- `pnpm-lock.yaml` existuje.
- `pnpm-workspace.yaml` schvaluje instalační skript `esbuild`, který Vite potřebuje.
- `rust-toolchain.toml` připíná Rust toolchain na stable pro budoucí buildy.
- Rust toolchain a MSVC Build Tools jsou lokálně nainstalované.

## Důležitá rozhodnutí

- Launcher je jen pro server Nekara.
- Launcher se nesmí změnit v obecný Minecraft launcher.
- Existuje přesně jedna podporovaná herní konfigurace: Nekara.
- Cílová verze Minecraftu je `26.1.2`.
- Verze Minecraftu musí být při budoucí implementaci definovaná centrálně.
- Preferovaný stack je Tauri 2, React, TypeScript, Rust, Vite a pnpm.
- React má obsluhovat UI a interakci s uživatelem.
- Rust/Tauri mají obsluhovat systémové operace, práci se souborovým systémem,
  stahování, správu procesů, logiku Java runtime a skládání launch commandu.

## Ověřená fakta

- `26.1.2` byla nalezena v oficiálním Mojang/Piston manifestu jako `release`.
- `pnpm format:check` prochází.
- `pnpm typecheck` prochází.
- `pnpm lint` prochází.
- `pnpm test` prochází.
- `pnpm build` prochází.
- `pnpm tauri build` prochází, pokud se spouští z Visual Studio Developer prostředí s `~/.cargo/bin` v `PATH`.
- Release artefakty byly dříve ověřené v `src-tauri/target/release/bundle/nsis/` a `src-tauri/target/release/`.
- Launcher UI už zobrazuje stav launcheru, stav kontroly oficiálních metadat a brandované hlavní plátno.
- Launcher už při startu připravuje izolovaný herní adresář Nekary.
- Launcher už detekuje lokální Java runtime.
- Launcher už vytváří počáteční instalační plán pro izolovaného klienta Nekary.
- Launcher už kontroluje, zda jsou oficiální `version.json` a klientský `.jar` přítomné a validní uvnitř izolovaného herního adresáře.
- Launcher už stahuje a opravuje oficiální knihovny, asset index a asset objekty potřebné pro Minecraft `26.1.2`.
- Launcher už ukazuje živý download progress během přípravy klienta, včetně zbývajících MB a rychlosti stahování.
- Launcher už automaticky přesouvá starou výchozí instalaci z `AppData\Local` do nového izolovaného `AppData\Roaming\Nekara`, pokud uživatel nepoužívá vlastní cestu.
- Launcher už skládá první skutečný offline Minecraft launch command z oficiálních metadat a startuje Minecraft proces, když je klient připravený.
- Launcher už sleduje, jestli Minecraft startuje, běží nebo skončil, a ukládá launcher-side game log path pro diagnostiku.
- Launcher už ukládá nakonfigurovaný Minecraft RAM limit a volitelnou vlastní cestu k Java executable do launcher settings.
- Launcher už zobrazuje launch diagnostiku, včetně log excerptu, doporučené opravy a runtime summary po neúspěšném startu.
- Launcher už preferuje nakonfigurovanou Java executable path před fallbackem na systémový `PATH`.
- Launcher už obsahuje podepsaný updater plugin pro GitHub Releases a pracovní postup, který publikuje Windows artefakty z tagovaných buildů.
- Launcher při startu automaticky kontroluje novější release a pokud je dostupný, sám stáhne update, nainstaluje ho a restartuje se.
- Nejnovější publikovaný release je `app-v0.1.20`.
- ADR 0003 definuje GitHub Releases jako zamýšlenou první cestu pro samoupdatování launcheru.
- Launcher už ukládá lokální offline jméno hráče do launcher dat.
- Microsoft přihlašovací flow bylo z launcheru odstraněné a podporovaná herní identita je nyní výhradně offline profil hráče.
- Veřejný klíč updateru launcheru byl zarovnaný s podpisovým klíčem používaným v GitHub release workflow.
- Výpočet Fabric installation readiness teď zahrnuje Fabric knihovny v total ready count.
- Brand source assets mají samostatný `brand/` workspace se složkami pro concepts, icons, logos a wallpapers.
- Browser preview fallback je připravený, takže `pnpm dev` renderuje bez chyb Tauri runtime.
- Desktopové i mobilní screenshoty byly úspěšně zachyceny z browser preview.
- Launcher shell byl zjednodušen na kompozici inspirovanou REDlauncherem s Nekara brand wallpaper a ikonami z `brand/`.
- Tauri application icons byly regenerované z Nekara brand icon source.
- Příprava a spouštění Fabric `26.1.2` teď umí aktuální strukturu Fabric metadat, řeší Maven-style loader knihovny a před spuštěním spojuje základní Minecraft manifest s Fabric profilem.
- Launcher UI teď používá brand font `Caudex Regular` z `brand/`.
- První schválený manifest klientských modů pro Fabric `26.1.2` už existuje v `src-tauri/resources/client-package/`.

## Aktuální blokery

- Na tomto stroji nezbývají žádné blokující předpoklady pro build.

## Doporučené další kroky

1. Zlepšit diagnostiku pro blokovaná metadata, oprávnění filesystemu a rozbité lokální cesty.
2. Zobrazit identitu hráče a stav profilu výrazněji v UI.
3. Rozhodnout, zda launcher někdy spravuje vlastní Java runtime.
4. Pokračovat ve vrstvě synchronizace klientského balíčku Nekary pro další typy manifestů.
5. Přidat robustnější reporting chyb pro updater a přípravu klienta, pokud se objeví nové reálné edge casy.
6. Navrhnout první verzi webové prezentace a server integrace, aby launcher, web a backend server sdílely stejný produktový směr.

## Poznámky pro budoucí práci

- Nepřidávej selection profilů, výběr verzí, modpack browsing ani ruční správu modů.
- Nepoužívej neoficiální Minecraft metadata pro instalaci.
- Nevkládej do repository secrets, tokeny, client secrets ani private keys.
- Udržuj uživatelské chyby srozumitelné a diagnostické detaily strukturované.
- Herní identita launcheru je nyní vědomě offline-only a bez Microsoft integrace.
