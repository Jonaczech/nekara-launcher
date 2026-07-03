# ADR 0003: GitHub Releases updater a integrita instalace

## Stav

Přijato

## Kontext

Nekara Launcher potřebuje udržitelnou distribuční cestu pro desktopové
aktualizace. Každý nový build launcheru by měl být publikovatelný tak, aby
existující instalace launcheru uměly aktualizace automaticky najít a nainstalovat.

Launcher také připravuje lokální Minecraft klient, oficiální knihovny, assety
a později spravovaný Java runtime. Tyto operace nesmí vytvářet duplicitní
instalace ani dovolit, aby více souběžných launcher akcí poškodilo stejný
instalační adresář.

Projekt už má jednu podporovanou herní konfiguraci a jeden izolovaný herní
adresář. Díky tomu je praktické použít jeden autoritativní lokální install root
společně s přísnými kontrolami integrity místo duplikace na úrovni profilů.

## Rozhodnutí

Použij tuto strategii aktualizací a instalace:

1. Distribuuj release launcheru přes GitHub Releases.
2. Publikuj podepsané updater artefakty pro každou desktopovou platformu.
3. Vystav statický updater manifest pro každý release channel, který může
   launcher dotazovat při startu i v nastaveních.
4. Drž jeden autoritativní lokální Nekara installation root na uživatelský
   profil.
5. Zabraň souběžným install/repair operacím pomocí lock files v launcher dat.
6. Vyhýbej se duplicitnímu stahování souborů tím, že nejdřív zkontroluješ, zda
   už existují, a integritu ověříš před nahrazením.
7. Až bude zaveden Java runtime management, ukládej runtime do verzovaného
   launcher-owned adresáře a znovu používej odpovídající ověřený runtime místo
   reinstalace.

## Důsledky

### Pozitivní

- GitHub Releases stačí jako první update host pro privátní i veřejný
  distribuční flow launcheru.
- Release artefakty mohou zůstat sladěné s Tauri desktop build pipeline.
- Existující instalace launcheru mohou pokračovat bez ruční reinstalace.
- Jeden izolovaný lokální herní adresář zabrání náhodné duplikaci Minecraft
  instalací pro stejnou launcher konfiguraci.
- Lock files snižují riziko poškození, když uživatel spustí akci dvakrát nebo
  otevře více instancí launcheru.
- Integrity-first kontrola přirozeně podporuje repair bez zbytečného
  redownloadu už platných souborů.

### Negativní

- Updater podpora stále vyžaduje signing keys, release automatizaci a stabilní
  krok publikace manifestu.
- GitHub Releases by neměly být konečná odpověď, pokud budoucí škála, řízení
  přístupu nebo regionální výkon stahování budou vyžadovat dedikovaný distribuční
  backend.
- Lock files potřebují stale-lock handling, pokud je launcher ukončený během
  install operace.

## Směr implementace

### Launcher self-update

- Přidej Tauri updater plugin, jakmile bude připravené release signing a hosting
  manifestu.
- Definuj alespoň jeden update channel:
  - `stable`
- Publikuj release artefakty a updater metadata z CI.
- Kontroluj aktualizace:
  - po startu launcheru, jakmile je shell responzivní
  - ručně z nastavení
- Preferuj background download a apply on restart.

### Integrita instalace

- Použij existující izolovaný launcher data root pro všechny spravované soubory.
- Drž v aktivním produktovém scope vždy jen jednu podporovanou Minecraft verzi.
- Před každým downloadem zkontroluj, zda soubory už existují a odpovídají
  očekávané integritě.
- Drž install a repair operace za jedním launcher-side install lockem.
- Stejné pravidlo rozšiř na managed Java runtime, jakmile bude existovat.

### Deduplicace Java runtime

- Ukládej managed runtime pod launcher-owned cestu například:

```text
<launcher data>/runtime/java/<component>-<platform>-<majorVersion>
```

- Před stažením Java zkontroluj:
  - zda už existuje kompatibilní lokální systémová Java
  - zda už je přítomný a ověřený managed runtime s požadovanou verzí
- Runtime stahuj pouze tehdy, když obě kontroly selžou.

## Navazující práce

1. Přidat explicitní updater integraci do Tauri aplikace, jakmile bude
   připravené signing.
2. Přidat pravidla pro obnovu stale install locků.
3. Přidat progress a cancellation pro dlouhé install/update operace.
4. Zavést podporu managed Java runtime se stejným integrity a lock modelem.
