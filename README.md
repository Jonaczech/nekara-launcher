# Nekara Launcher

Nekara Launcher is a custom desktop launcher for the Nekara Minecraft server.
It is built for one supported game configuration: Nekara.

The launcher is not intended to be a general-purpose Minecraft launcher,
modpack browser, server list, marketplace, forum, or community portal.

## Product Scope

The launcher should let a player:

1. Start the launcher.
2. Sign in with Microsoft or enter an offline player name.
3. Wait while the Nekara game installation is checked or prepared.
4. Press Play.

The application is responsible for:

- launcher self-update support,
- player identity for the launch session,
- isolated Nekara game directory management,
- official Minecraft base metadata, Fabric profile preparation, and client file integrity checks,
- Java runtime detection or preparation,
- file integrity validation and repair,
- launch command construction,
- Minecraft process start and monitoring,
- clear diagnostics when something fails.

The current scaffold already includes:

- a launcher status command,
- an official Minecraft base metadata check command,
- a Java runtime detection command,
- an installation plan command for the isolated Nekara Fabric client,
- an installation status command plus a repair action for the resolved
  `version.json`, client `.jar`, Fabric profile JSON, official libraries,
  Fabric libraries, asset index, and asset objects,
- a launch command that builds a real Minecraft process invocation
  from official metadata plus the Fabric loader profile and monitors its
  status,
- an offline player profile flow that stores the local player name in launcher
  data plus an in-memory Microsoft device-code sign-in flow for Minecraft Java
  ownership checks,
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

See [ADR 0004](docs/adr/0004-fabric-client-runtime.md) for the Fabric client
runtime decision.

## Current Repository Status

This repository is at the project foundation stage. The initial Tauri 2 +
React + TypeScript scaffold exists, with a player-facing launcher shell and
the first real runtime checks.

The launcher can now prepare the first full Fabric-backed client layer inside
the isolated Nekara directory: the resolved version metadata JSON, official
client jar, official libraries, Fabric profile JSON, Fabric libraries, asset
index, asset objects, and the approved Nekara Fabric mods manifest. Downloaded
files are verified before they are stored locally, launcher-managed mods are
repaired by SHA-512 and cleaned up when the approved manifest changes, and the
launcher reports how many libraries, assets, and mods are still missing.
During preparation, the launcher also writes a preset Nekara multiplayer
server entry into the client so the server appears directly inside Minecraft.

The launcher can also perform a first offline `Play` flow when the Fabric
client is prepared and a compatible Java runtime is available. The process
status and log path are surfaced back into the UI for diagnostics. The
settings drawer now stores the configured Minecraft RAM limit and keeps launch
failure hints plus a captured log excerpt available after unsuccessful starts.
It also accepts an optional custom Java executable path so the runtime can be
pinned instead of relying only on the system `PATH`. The settings page also
accepts an optional custom game installation directory so the isolated Nekara
client does not have to live under the default AppData location.

The player-facing UI and launcher diagnostics are localized to Czech, and the
launcher startup now staggers heavier runtime checks so the first window paint
is less likely to hang on Windows.

Launcher-side diagnostic logs are written under the user profile inside the
Nekara launcher data directory, in a dedicated `logs` folder, so update and
launch failures can be reviewed after the fact.

Launcher self-updates are wired to signed GitHub Releases. The updater checks a
release endpoint at startup and can install a newer build from the settings
drawer once release assets are published.

Brand source assets are organized under `brand/`, while generated Tauri app
icons live under `src-tauri/icons/`.

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

Microsoft sign-in requires a public client ID that is allowed to use desktop
authorization-code flow with a loopback redirect. The current implementation
reads it from the build/runtime environment variable
`NEKARA_MICROSOFT_CLIENT_ID`. The corresponding Microsoft app registration
must allow the redirect URI `http://localhost:39231/auth/callback`.

If the variable is missing, the launcher keeps the Microsoft account section
visible but reports that the flow is not configured yet, while offline launch
remains available.
