# ADR 0004: Fabric Client Runtime For Nekara

## Status

Accepted

## Date

2026-06-30

## Context

Nekara Launcher needs a single supported client configuration with mod support.
The project must stay focused on one Nekara game path instead of becoming a
general-purpose Minecraft launcher.

The base Minecraft version is centrally fixed, but the launcher also needs a
loader that can support mods and future client-side distribution of Nekara
content.

## Decision

Use Fabric as the supported client runtime on top of the fixed Minecraft
version.

The launcher should:

- resolve official Minecraft metadata for the base version,
- resolve the Fabric loader/profile metadata for the same version,
- install the Fabric profile JSON and Fabric libraries alongside the official
  Minecraft files,
- launch Minecraft through the Fabric-generated main class and arguments,
- keep all user-facing wording aligned with the Fabric-backed Nekara client.

## Rationale

Fabric gives the launcher a lightweight and well-understood modding foundation
without turning the app into a generic modpack manager.

It keeps the client surface narrow:

- one supported game configuration,
- one supported loader path,
- one launch profile,
- one isolated installation root.

That matches the project scope better than adding support for multiple loaders
or user-selectable Minecraft versions.

## Consequences

### Positive

- The launcher can support mods through a known client loader.
- The installation flow still remains integrity-driven and deterministic.
- The launch code can continue to use official Minecraft metadata as the base
  layer.
- The UI can present a single Nekara play path instead of exposing complex
  launcher internals.

### Negative

- The install pipeline now needs to manage Fabric profile metadata in addition
  to official Minecraft files.
- Release and diagnostics wording must stay synchronized with the loader
  choice.
- Future loader changes would require another architecture decision.

## Follow-Up Work

1. Add client mod distribution and synchronization on top of the Fabric
   profile.
2. Keep launcher diagnostics aligned with the Fabric profile and base Minecraft
   version.
3. Extend the updater/install integrity rules if Fabric loader metadata changes
   format.
