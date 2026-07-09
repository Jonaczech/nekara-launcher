# Runbook Vydání

Tento runbook je provozní checklist pro publikování Nekara Launcheru přes
GitHub Releases.

## Výchozí údaje

- Aktuální cílový release po popup update oznámení: `0.1.26`
- Release workflow: `.github/workflows/release.yml`
- Updater endpoint: GitHub Releases `latest.json`

## Příprava před releasem

1. Ověř, že v repository existují GitHub Actions secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
2. Ověř, že veřejný klíč v `src-tauri/tauri.conf.json` odpovídá veřejné části
   signing key, který používá Actions.
3. Uchovávej soukromý podpisový klíč mimo repository.
4. Uchovávej kopii odpovídajícího veřejného klíče na bezpečném místě pro
   budoucí ověření a incident recovery.

## Publikace releasu

1. Slouč nebo pushni zamýšlený release commit do GitHubu.
2. Ujisti se, že pracovní strom je čistý.
3. Vytvoř release tag:

```bash
git tag app-v0.1.26
git push origin app-v0.1.26
```

4. Počkej, až doběhne `.github/workflows/release.yml`.
5. Ověř, že release obsahuje:
   - Windows installer,
   - updater metadata,
   - podpisové soubory,
   - artefakty potřebné pro instalaci a aktualizaci.

## Smoke test po releasu

1. Otevři publikovaný `latest.json`.
2. Ověř, že verze odpovídá release tagu.
3. Ověř, že launcher s odpovídajícím veřejným klíčem updateru release vidí.
4. Nainstaluj launcher přes NSIS installer.
5. Otevři launcher a ověř:
   - kontrola aktualizace proběhne úspěšně,
   - updater nabídne správnou verzi,
   - podepisovací kontrola projde,
   - launcher zůstane použitelný po restartu.

## Poznámky k migraci starých instalací

Launcher buildy vydané se starým veřejným klíčem updateru nedokážou důvěřovat
releaseům podepsaným opraveným klíčem. Tyto instalace potřebují jednu ruční
reinstalaci na `0.1.8` nebo novější, než budou automatické aktualizace znovu
fungovat. První releasy po opravě je vhodné testovat na čisté instalaci i na
instalaci po migraci.
