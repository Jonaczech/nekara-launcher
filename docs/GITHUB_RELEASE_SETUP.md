# Nastavení GitHub Release

Tento soubor shrnuje minimum kroků potřebných k tomu, aby Nekara Launcher mohl
automaticky aktualizovat přes GitHub Releases.

Repozitář je už připojený k GitHubu a obsahuje updater plugin i úvodní release
pracovní postup. Zbývající kroky níže popisují produkční nastavení, které je potřeba
dokončit před ostrým použitím.

Po jednorázovém nastavení by mělo být možné release publikovat z CI a launcher
by měl být schopný automaticky objevit novější podepsané verze.

## Požadované kroky

1. Vytvoř GitHub repozitář pro zdrojový kód launcheru.
2. Rozhodni strategii release kanálů:
   - `stable` jako výchozí kanál.
3. Vygeneruj a bezpečně ulož signing key pair pro updater.
4. Ulož soukromý podpisový klíč do GitHub Actions secrets.
5. Rozhodni, kde bude hostované updater metadata JSON:
   - GitHub Releases
   - GitHub Pages
6. Publikuj desktop artefakty a updater metadata při každém tagovaném release.

## Očekávané artefakty

Konečná jména se mohou lišit, ale release pipeline by měla očekávat alespoň:

- instalační balíček pro Windows,
- updater metadata JSON,
- podpisy pro release artefakty,
- kontrolní soubory nebo metadata potřebná pro ověření integrity.

Pokud release automatizace nahrává metadata na samostatný endpoint, přidej
odkaz na tento endpoint i do dokumentace release procesu.

## Co má release publikovat

Každý release by měl obsahovat:

- podepsaný Windows installer,
- updater metadata JSON pro daný release kanál,
- podpisy a další artefakty potřebné pro ověření.

## Chování launcheru

Launcher by měl:

1. Spustit se a rychle zobrazit shell.
2. Kontrolovat aktualizace na pozadí.
3. Nabídnout ruční kontrolu aktualizace v nastaveních.
4. Stahovat ověřené update artefakty.
5. Aplikovat aktualizaci po restartu nebo po potvrzení uživatelem.

## Současný stav

- Updater endpoint aktuálně míří na GitHub Releases `latest`.
- Release pracovní postup se spouští na tagy, které odpovídají `app-v*`.
- Podepisovací soukromý klíč a jeho heslo musí být v GitHub Actions dostupné
  přes `TAURI_SIGNING_PRIVATE_KEY` a `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Veřejný klíč v `src-tauri/tauri.conf.json` musí odpovídat veřejné části
  signing key, který používá GitHub Actions. K 2026-07-01 byl lokální veřejný
  klíč `C:\Users\jonac\.tauri\nekara-launcher.key.pub` spárovaný s posledním
  podepsaným GitHub releasem a zkopírovaný do konfigurace launcheru.
- Instalace, které byly vydané se starým veřejným klíčem updateru, už
  nepřimějí podpisy z aktuálního klíče. Tyto instalace potřebují jednorázovou
  manuální reinstalaci, pak už se budou aktualizovat normálně.
- Na Windows má updater JSON preferovat NSIS, protože launcher se hráčům
  distribuuje přes `setup.exe` instalátor.
- Release pracovní postup je zatím jen pro Windows, což odpovídá současné podporované
  platformě launcheru.

## Oddělení odpovědností

Samoupdatování launcheru a příprava Minecraft klienta musí zůstat oddělené:

- update launcheru:
  aktualizuje samotnou desktopovou aplikaci
- update Minecraft klienta:
  aktualizuje izolované Minecraft soubory, knihovny, assety a později Java
  runtime

Toto oddělení je důležité proto, aby launcher zbytečně neinstaloval Minecraft
klienta znovu pokaždé, když se změní jen binárka launcheru.
