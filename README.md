# Nekara Launcher

Nekara Launcher is a custom desktop launcher for the Nekara Minecraft server.
It is built for one supported game configuration: Nekara.

The launcher is not intended to be a general-purpose Minecraft launcher,
modpack browser, server list, marketplace, forum, or community portal.

## Product Scope

The launcher should let a player:

1. Start the launcher.
2. Enter an offline player name.
3. Wait while the Nekara game installation is checked or prepared.
4. Press Play.

The application is responsible for:

- launcher self-update support,
- player identity for the launch session,
- isolated Nekara game directory management,
- official Minecraft metadata and file preparation,
- Java runtime detection or preparation,
- file integrity validation and repair,
- launch command construction,
- Minecraft process start and monitoring,
- clear diagnostics when something fails.

The current scaffold already includes:

- a launcher status command,
- an official Minecraft metadata check command,
- a Java runtime detection command,
- an installation plan command for the isolated Nekara client,
- an installation status command plus a repair action for the official
  `version.json`, client `.jar`, official libraries, asset index, and asset
  objects,
- an offline launch command that builds a real Minecraft process invocation
  from official metadata and monitors its status,
- an offline player profile flow that stores the local player name in launcher
  data,
- a frameless React launcher shell that renders the current readiness state.

## Non-Goals

The launcher must not provide:

- multiple game profiles,
- user-selectable Minecraft versions,
- public modpack installation,
- mod catalog browsing,
- manual mod management,
- multiple Minecraft instances,
- custom server management,
- community features,
- forum, store, or web portal features,
- Minecraft server administration.

## Target Minecraft Version

The supported Minecraft version is centrally defined as:

```text
26.1.2
```

Before implementing the installation mechanism, this version must be resolved
through official Minecraft metadata. Do not invent unofficial URLs or fallback
metadata.

As of 2026-06-30, the version was verified in the official Mojang/Piston
version manifest as a `release`.

## Technology Direction

The preferred stack is:

- Tauri 2
- React
- TypeScript
- Rust
- Vite
- pnpm

See [ADR 0001](docs/adr/0001-launcher-technology-stack.md) for the initial
technology decision.

See [ADR 0003](docs/adr/0003-github-releases-updater-and-install-integrity.md)
for the current update and installation integrity direction.

## Current Repository Status

This repository is at the project foundation stage. The initial Tauri 2 +
React + TypeScript scaffold exists, with a player-facing launcher shell and
the first real runtime checks.

The launcher can now prepare the first full official Minecraft layer inside the
isolated Nekara directory: the resolved version metadata JSON, official client
jar, official libraries, asset index, and asset objects. Downloaded files are
verified before they are stored locally, and the launcher reports how many
libraries and assets are still missing.

The launcher can also perform a first offline `Play` flow when the client is
prepared and a compatible Java runtime is available. The process status and log
path are surfaced back into the UI for diagnostics. The settings drawer now
stores the configured Minecraft RAM limit and keeps launch failure hints plus a
captured log excerpt available after unsuccessful starts. It also accepts an
optional custom Java executable path so the runtime can be pinned instead of
relying only on the system `PATH`.

Static UI assets are organized under `src/assets/` with separate folders for
backgrounds, logos, fonts, and icons.

Known local prerequisite status:

- Node.js: available
- pnpm: available
- Rust toolchain: available locally and verified through the Visual Studio
  developer command prompt

## Development Notes

Install JavaScript dependencies:

```bash
pnpm install
```

Run frontend typechecking:

```bash
pnpm typecheck
```

Build the frontend:

```bash
pnpm build
```

Run Tauri commands through:

```bash
pnpm tauri
```

Desktop development and desktop builds require the Rust toolchain to be
available in PATH.

On Windows, Tauri builds also require the Visual Studio C++ build tools
environment. In this repository, `pnpm tauri build` was verified from the
Visual Studio developer command prompt with `~/.cargo/bin` on PATH.

The current pnpm workspace explicitly approves the `esbuild` install script,
which is required by Vite.

The current launcher flow uses a local offline player name instead of Microsoft
sign-in so installation and launch work can continue without account
integration.
