# ADR 0002: Vlastní frameless shell launcheru

## Stav

Přijato

## Datum

2026-06-30

## Kontext

Nekara Launcher je jednoúčelový desktopový launcher pro jednu podporovanou
herní konfiguraci. Produkt má působit jako uhlazený launcher pro hráče, ne jako
technický dashboard nebo obecné utilitní okno.

Směr UI je kompozičně orientovaný launcher shell s vlastním chrome, výraznou
brand zónou, primární akcí a stručným stavem připravenosti.

## Rozhodnutí

Použij frameless Tauri window s Reactem renderovaným custom window barem a
layoutem zaměřeným na kompozici.

Shell má:

- držet nativní window controls uvnitř aplikace,
- používat vrstvené gradienty a geometrii místo kopírovaných wallpaper assetů,
- držet technickou diagnostiku mimo hlavní vizuální hierarchii,
- prezentovat hráčský průchod jako hlavní zkušenost.

## Odůvodnění

Frameless shell dává launcheru soudržnější vizuální identitu a nechává layout
pod naší kontrolou na Windows i v budoucích platformách.

Také snižuje množství OS chrome, které soutěží s brand kompozicí launcheru, a
usnadňuje držet UI soustředěné na hráčský flow:

Spustit launcher -> přihlásit se -> počkat na přípravu -> stisknout Hrát

## Důsledky

- Frontend musí poskytnout vlastní minimize, maximize a close controls.
- UI a spacing musí respektovat draggable regions a custom window controls.
- Vizuální polish se stává součástí aplikačního kódu, ne OS frame.

## Navazující práce

- Přidat dočasný offline profil hráče pro podporu rané launch práce.
- Přidat skutečný workflow stahování a opravy oficiálních souborů.
- Udržet diagnostiku dostupnou, ale sekundární vůči hlavní launcher surface.
