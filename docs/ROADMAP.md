# Roadmapa Nekara Launcheru

Tato roadmapa sleduje počáteční cestu od prázdného repozitáře k použitelnému
vlastnímu launcheru pro server Nekara.

## Fáze 0: Základ projektu

- [x] Zachytit projektové instrukce.
- [x] Zdokumentovat rozsah launcheru a co do něj nepatří.
- [x] Vytvořit úvodní technologické ADR.
- [x] Vytvořit trvalý handoff soubor se stavem projektu.
- [ ] Nainstalovat nebo lokálně zpřístupnit Rust toolchain.
- [x] Naskafoldovat aplikaci Tauri 2 + React + TypeScript + Vite + pnpm.
- [x] Přidat počáteční příkazy pro typecheck a build frontendu.
- [x] Přidat formatter, lint a test příkazy.

## Fáze 1: Walking skeleton

- [x] Vytvořit frontendový shell aplikace.
- [x] Vytvořit Rust/Tauri backend modulovou strukturu.
- [x] Definovat typizovanou hranici mezi Reactem a Rust příkazy.
- [x] Přidat příkaz pro stav launcheru.
- [x] Přidat příkaz pro kontrolu Minecraft version metadata.
- [x] Zobrazit stav launcheru a diagnostiku v UI.

Exit criteria:

- Launcher se spustí v development módu.
- UI volá alespoň jeden skutečný Tauri command.
- Launcher umí říct, jestli je cílová Minecraft verze přítomná v oficiálních
  metadatech.

## Fáze 2: Konfigurace a lokální adresáře

- [x] Definovat centrální konfiguraci Nekary.
- [x] Definovat jednu podporovanou Minecraft verzi na jednom místě.
- [x] Vyřešit platformově specifické aplikační a herní adresáře.
- [x] Vytvořit izolovaný herní adresář Nekary.
- [ ] Přidat diagnostiku pro chybějící oprávnění nebo neplatné cesty.

Exit criteria:

- Launcher umí ukázat nakonfigurovaný herní adresář a bezpečně jej vytvořit.
- Neexistují žádné uživatelsky spravované profily ani výběr verzí.

## Fáze 3: Oficiální Minecraft metadata a soubory

- [x] Stáhnout oficiální Minecraft version metadata.
- [x] Získat potřebné client files z oficiálních metadat.
- [x] Modelovat izolované instalační cesty pro klienta Nekary.
- [x] Stáhnout první oficiální Minecraft soubory pro nastaveného klienta.
- [ ] Stahovat soubory s reportováním průběhu.
- [x] Ověřovat hash souborů.
- [x] Opravovat chybějící nebo poškozené soubory.
- [ ] Zapsat jasnou diagnostiku pro nedostupná nebo neplatná metadata.
- [x] Připravit oficiální knihovny, asset index a asset objekty.
- [ ] Připravit zbývající runtime soubory potřebné pro spuštění.

Exit criteria:

- Launcher umí připravit oficiální Minecraft soubory pro nastavenou verzi
  Nekary.

## Fáze 4: Java runtime

- [x] Detekovat kompatibilní lokální Java runtime.
- [ ] Rozhodnout, zda budeme spravovat přibalený runtime.
- [x] Připravit kontrolu kompatibility runtime.
- [x] Zobrazit použitelnou diagnostiku, když Java chybí nebo je nekompatibilní.

Exit criteria:

- Launcher umí najít platnou runtime cestu pro spuštění Minecraftu.

## Fáze 5: Identita hráče

- [x] Přidat offline flow pro profil hráče.
- [x] Ukládat offline jméno hráče do dat launcheru.
- [ ] Zobrazit identitu hráče a diagnostiku profilu jasněji.

Exit criteria:

- Uživatel si umí nastavit lokální identitu a launcher ji umí použít pro
  spouštěcí relaci.

## Fáze 6: Spuštění a sledování procesu

- [x] Sestavit Minecraft JVM command.
- [x] Spustit Minecraft proces.
- [x] Průběžně streamovat nebo ukládat relevantní logy.
- [x] Sledovat stavy running, exited a crashed.
- [x] Zobrazovat uživatelsky srozumitelnou diagnostiku chyb.

Exit criteria:

- Uživatel s připravenou instalací může stisknout Hrát a spustit Minecraft.

## Pozdější fáze

- Self-update launcheru přes podepsané GitHub Releases.
- Synchronizace klientského balíčku Nekary.
- Schválené mody, konfigurace a resource packy.
- Stav serveru a oznámení.
- Pokročilá oprava a support diagnostika.

## Okamžitá release roadmapa

Toto je nejkratší praktická cesta od současného stavu repozitáře ke stabilnímu
release launcheru, který se umí aktualizovat sám.

### 1. Obnova releasu

- [x] Zarovnat veřejný klíč updateru launcheru s signing key, který aktuálně
      používá GitHub Releases.
- [x] Opravit stav připravenosti Fabric instalace tak, aby připravený klient
      mohl opustit pending stav.
- [x] Zvýšit verzi launcheru na `0.1.11`.
- [ ] Publikovat `app-v0.1.11` z CI, aby si hráči mohli nainstalovat opravený
      updater key.
- [ ] Nahradit všechny lokálně nainstalované buildy starší než `0.1.8` novým
      installerem, jakmile bude release publikovaný.

### 2. Zpevnění releasu

- [x] Přidat zdokumentovaný release runbook pro tagování, CI publikaci a smoke
      verifikaci.
- [ ] Přidat post-release smoke test, který ověří objevení updateru z předchozí
      veřejné verze.
- [ ] Přidat srozumitelnější updater error surface v UI, když selže validace
      podpisu.
- [ ] Přidat automatické desktop smoke checky, aby se snížila
      regresní chybovost releasů.

### 3. Připravenost launcheru

- [ ] Přidat reportování průběhu pro dlouhé download operace místo jen
      agregované readiness bar.
- [ ] Zlepšit instalační diagnostiku pro blokovaná metadata, oprávnění
      filesystemu a rozbité lokální cesty.
- [ ] Rozhodnout a implementovat strategii pro Java runtime:
  - pouze systémová Java, nebo
  - spravovaný Nekara runtime.
- [ ] Spustit vrstvu synchronizace klientského balíčku Nekary:
      schválené mody, konfigurace, resource packy a verzované manifesty.
