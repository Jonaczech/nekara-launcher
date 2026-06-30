# Nekara Launcher Roadmap

This roadmap tracks the initial path from an empty repository to a usable
custom launcher for the Nekara server.

## Phase 0: Project Foundation

- [x] Capture project instructions.
- [x] Document launcher scope and non-goals.
- [x] Create the initial technology ADR.
- [x] Create a persistent project state handoff file.
- [ ] Install or make available the Rust toolchain locally.
- [x] Scaffold the Tauri 2 + React + TypeScript + Vite + pnpm application.
- [x] Add initial typecheck and frontend build commands.
- [ ] Add formatter, lint, and test commands.

## Phase 1: Walking Skeleton

- [x] Create the frontend application shell.
- [x] Create the Rust/Tauri backend module structure.
- [x] Define a typed boundary between React and Rust commands.
- [x] Add a launcher status command.
- [x] Add a Minecraft version metadata check command.
- [x] Display launcher status and diagnostics in the UI.

Exit criteria:

- The launcher starts in development mode.
- The UI calls at least one real Tauri command.
- The launcher can report whether the configured Minecraft version is present
  in official metadata.

## Phase 2: Configuration and Local Directories

- [x] Define the central Nekara game configuration.
- [x] Define the single supported Minecraft version in one place.
- [x] Resolve platform-specific application and game directories.
- [x] Create the isolated Nekara game directory.
- [ ] Add diagnostics for missing permissions or invalid paths.

Exit criteria:

- The launcher can show the configured game directory and create it safely.
- No user-managed profiles or version selection exist.

## Phase 3: Official Minecraft Metadata and Files

- [x] Download official Minecraft version metadata.
- [x] Resolve required client files from official metadata.
- [x] Model isolated installation paths for the Nekara client.
- [x] Download the first official Minecraft files for the configured client.
- [ ] Download files with progress reporting.
- [x] Verify file hashes.
- [x] Repair missing or corrupted files.
- [ ] Record clear diagnostics for unavailable or invalid metadata.
- [x] Prepare official libraries, asset index, and asset objects.
- [ ] Prepare the remaining runtime files required for launch.

Exit criteria:

- The launcher can prepare official Minecraft files for the configured Nekara
  version.

## Phase 4: Java Runtime

- [x] Detect compatible local Java runtimes.
- [ ] Decide whether to manage a bundled runtime.
- [x] Prepare a runtime compatibility check.
- [x] Surface actionable diagnostics when Java is missing or incompatible.

Exit criteria:

- The launcher can identify a valid runtime path for launching Minecraft.

## Phase 5: Player Identity

- [x] Add an offline player profile flow.
- [x] Store the offline player name in launcher data.
- [ ] Decide when to reintroduce Microsoft authentication.
- [ ] Define how online entitlement should coexist with offline mode.
- [ ] Surface player identity and profile diagnostics clearly.

Exit criteria:

- A user can set a local player identity and the launcher can use it for a
  launch session.

## Phase 6: Launch and Process Monitoring

- [x] Build the Minecraft JVM command.
- [x] Start the Minecraft process.
- [x] Stream or persist relevant logs.
- [x] Track running, exited, and crashed states.
- [x] Show user-readable failure diagnostics.

Exit criteria:

- A user with a prepared installation can press Play and launch
  Minecraft.

## Later Phases

- Launcher self-update flow through signed GitHub Releases.
- Nekara client package synchronization.
- Approved mods, configs, and resource packs.
- Server status and announcements.
- Advanced repair and support diagnostics.
