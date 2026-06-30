# ADR 0002: Custom Frameless Launcher Shell

## Status

Accepted

## Date

2026-06-30

## Context

Nekara Launcher is a single-purpose desktop launcher for one supported game
configuration. The product should feel like a polished launcher for players,
not like a technical dashboard or a generic utility window.

The reference direction for the UI is a composition-focused launcher shell with
custom chrome, a prominent brand area, a primary action, and concise readiness
status.

## Decision

Use a frameless Tauri window with a React-rendered custom window bar and a
composition-first launcher layout.

The shell should:

- keep the native window controls inside the application UI,
- use layered gradients and geometry instead of copied wallpaper assets,
- keep technical diagnostics out of the main visual hierarchy,
- present the player flow as the primary experience.

## Rationale

A frameless shell gives the launcher a more coherent visual identity and keeps
the layout under our control across Windows and future platforms.

It also reduces the amount of OS chrome competing with the launcher's brand
composition and makes it easier to keep the UI focused on the player flow:

Start launcher -> sign in -> wait for preparation -> press Play

## Consequences

- The frontend must provide its own minimize, maximize, and close controls.
- The UI and spacing need to respect draggable regions and custom window
  controls.
- Visual polish becomes part of the application code rather than the OS frame.

## Follow-Up Work

- Add the temporary offline player profile flow to support early launch work.
- Add the actual official file download and repair workflow.
- Keep diagnostics available, but secondary to the main launcher surface.
