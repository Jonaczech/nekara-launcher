# Stav projektu

Tento soubor je předávací bod pro pokračování práce na Nekara Launcheru.
Aktualizuj ho vždy, když se pracovní relace posune jinam, dokončí milník nebo
zanechá důležitý navazující kontext.

## Poslední aktualizace

2026-07-02

## Současné zaměření

Projektový základ pro vlastní desktopový launcher určený pro Minecraft server
Nekara, s hráčsky orientovaným brandovaným shellem, podepsanými aktualizacemi
přes GitHub Releases, kontrolou oficiálních metadat, detekcí Java runtime,
přípravou oficiálních souborů pro základní Minecraft klient, knihovny a assety,
offline spouštěcím postupem a offline profilem hráče.

## Stav repozitáře

- Git repozitář existuje a má aktivní historii na `codex/github-bootstrap`.
- Existuje úvodní scaffold Tauri 2 + React + TypeScript.
- Dokumentační základ je aktivně používaný pro sledování releasů a roadmapy.
- `.codex/environments/environment.toml` existuje, je generovaný a je ignorovaný
  Gitem.
- `pnpm-lock.yaml` existuje.
- `pnpm-workspace.yaml` schvaluje instalační skript `esbuild`, který Vite
  potřebuje.
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
  stahování, správu procesů, logiku Java runtime, autentizační plumbing a
  skládání launch commandu.

## Ověřená fakta

- K 2026-06-30 byla `26.1.2` nalezena v oficiálním Mojang/Piston manifestu jako
  `release`.
- Při počátečních lokálních kontrolách byly dostupné Node.js, pnpm i npm.
- `pnpm format:check` prochází.
- `pnpm typecheck` prochází.
- `pnpm lint` prochází.
- `pnpm test` prochází.
- `pnpm build` prochází.
- `pnpm tauri build` prochází, pokud se spouští z Visual Studio Developer
  prostředí s `~/.cargo/bin` v `PATH`.
- Release artefakty byly dříve ověřené v
  `src-tauri/target/release/bundle/nsis/` a `src-tauri/target/release/`.
- Launcher UI už zobrazuje jak stav launcheru, tak stav kontroly oficiálních
  metadat.
- Launcher UI už používá custom frameless composition místo technického
  dashboardu.
- Launcher už při startu připravuje izolovaný herní adresář Nekary.
- Launcher už detekuje lokální Java runtime.
- Launcher už vytváří počáteční instalační plán pro izolovaného klienta Nekary.
- Launcher už kontroluje, zda jsou oficiální `version.json` a klientský `.jar`
  přítomné a validní uvnitř izolovaného herního adresáře.
- Launcher už stahuje a opravuje oficiální `version.json` a klientský `.jar`
  pro Minecraft `26.1.2`, včetně SHA-1 verifikace jaru.
- Launcher už stahuje a opravuje oficiální knihovny, asset index a asset
  objekty potřebné pro Minecraft `26.1.2`.
- Launcher už nepožaduje po frontendě vykreslování celého raw `version.json` a
  UI teď spoléhá na jeden instalační status query místo více duplicitních
  metadata requestů.
- Launcher už skládá první skutečný offline Minecraft launch command z
  oficiálních metadat a startuje Minecraft proces, když je klient připravený.
- Launcher už sleduje, jestli Minecraft startuje, běží nebo skončil, a ukládá
  launcher-side game log path pro diagnostiku.
- Launcher už aktualizuje instalační progress živě v UI během přípravy klienta.
- Launcher už používá install lock file, aby zabránil souběžným
  prepare/repair operacím nad stejným lokálním data directory.
- Launcher už ukládá nakonfigurovaný Minecraft RAM limit a volitelnou vlastní
  cestu k Java executable do launcher settings.
- Launcher už zobrazuje launch diagnostiku, včetně log excerptu, doporučené
  opravy a runtime summary po neúspěšném startu.
- Launcher už preferuje nakonfigurovanou Java executable path před fallbackem
  na systémový `PATH`.
- Launcher už obsahuje podepsaný updater plugin pro GitHub Releases a
  pracovní postup, který publikuje Windows artefakty z tagovaných buildů.
- Launcher při startu automaticky kontroluje novější release a pokud je
  dostupný, sám stáhne update, nainstaluje ho a restartuje se.
- ADR 0003 definuje GitHub Releases jako zamýšlenou první cestu pro
  samoupdatování launcheru a formalizuje strategii bez duplicitní instalace.
- Launcher už ukládá lokální offline jméno hráče do launcher dat.
- Microsoft přihlašovací flow bylo z launcheru odstraněné a podporovaná herní
  identita je teď výhradně offline profil hráče.
- Veřejný klíč updateru launcheru byl zarovnaný s podpisovým klíčem
  používaným v GitHub release pracovním postupu. Existující instalace, které
  vyšly se starým veřejným klíčem, potřebují jednorázovou reinstalaci, než
  začnou automatické aktualizace znovu důvěřovat podpisům.
- Výpočet Fabric installation readiness teď zahrnuje Fabric knihovny v celkovém
  ready library count, takže připravený klient může opustit pending stav.
- Brand source assets mají samostatný `brand/` workspace se složkami pro
  concepts, icons, logos a wallpapers.
- Browser preview fallback je připravený, takže `pnpm dev` renderuje bez chyb
  Tauri runtime.
- Desktopové i mobilní screenshoty byly úspěšně zachycené z browser preview.
- Launcher shell byl zjednodušen na kompozici inspirovanou REDlauncherem s
  Nekara brand wallpaper a ikonami z `brand/`.
- Tauri application icons byly regenerované z Nekara brand icon source.
- Příprava a spouštění Fabric `26.1.2` teď umí aktuální strukturu Fabric
  metadat, řeší Maven-style loader knihovny a před spuštěním spojuje základní
  Minecraft manifest s Fabric profilem.
- Launcher UI teď používá brand font `Caudex Regular` z `brand/`.
- První schválený manifest klientských modů pro Fabric `26.1.2` už existuje v
  `src-tauri/resources/client-package/`.

## Aktuální blokery

- Na tomto stroji nezbývají žádné blokující předpoklady pro build.

## Doporučené další kroky

1. Přidat strukturované error typy v Rust/Tauri vrstvě.
2. Přidat diagnostiku pro chybějící oprávnění nebo neplatné cesty.
3. Přidat progress reporting a cancellation pro dlouhé download operace.
4. Zavést podporu managed Java runtime se stejným integrity a lock modelem.
5. Publikovat `0.1.11` branded recovery release a spustit smoke check updateru
   proti GitHub Releases.

## Poznámky pro budoucí práci

- Nepřidávej selection profilů, výběr verzí, modpack browsing ani ruční správu
  modů.
- Nepoužívej neoficiální Minecraft metadata pro instalaci.
- Nevkládej do repository secrets, tokeny, client secrets ani private keys.
- Udržuj uživatelské chyby srozumitelné a diagnostické detaily strukturované.
- Herní identita launcheru je nyní vědomě offline-only a bez Microsoft
  integrace.
