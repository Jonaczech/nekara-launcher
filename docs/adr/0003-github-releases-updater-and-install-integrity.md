# ADR 0003: GitHub Releases Updater And Install Integrity

## Status

Accepted

## Context

Nekara Launcher needs a sustainable distribution path for desktop updates.
Every new launcher build should be publishable in a way that lets existing
launcher installations discover and install updates automatically.

The launcher also prepares a local Minecraft client, official libraries,
assets, and later a managed Java runtime. These operations must not create
duplicate installs or let multiple concurrent launcher actions corrupt the same
installation directory.

The project already has a single supported game configuration and one isolated
game directory. That makes it practical to use one authoritative local install
root plus strict integrity checks instead of profile-level duplication.

## Decision

Use the following update and install strategy:

1. Distribute launcher releases through GitHub Releases.
2. Publish signed updater artifacts for each desktop platform.
3. Expose a static updater manifest per release channel that the launcher can
   query at startup and from settings.
4. Keep one authoritative local Nekara installation root per user profile.
5. Prevent concurrent install/repair operations with lock files inside launcher
   data.
6. Avoid duplicate file downloads by checking for existing files first and
   verifying integrity before replacement.
7. When Java runtime management is introduced, store runtimes in a versioned
   launcher-owned directory and reuse a matching verified runtime instead of
   reinstalling it.

## Consequences

### Positive

- GitHub Releases are sufficient as the first update host for a private or
  public launcher distribution flow.
- Release artifacts can stay aligned with the Tauri desktop build pipeline.
- Existing launcher installs can move forward without manual reinstalls.
- One isolated local game directory avoids accidental duplicate Minecraft
  installs for the same launcher configuration.
- Lock files reduce corruption risk when a user double-clicks actions or opens
  multiple launcher instances.
- Integrity-first checks naturally support repair without redownloading files
  that are already valid.

### Negative

- Updater support still requires signing keys, release automation, and a stable
  manifest publishing step.
- GitHub Releases should not be the final answer if future scale, access
  control, or regional download performance requires a dedicated distribution
  backend.
- Lock files need stale-lock handling if the launcher is terminated during an
  install operation.

## Implementation Direction

### Launcher self-update

- Add the Tauri updater plugin once release signing and manifest hosting are
  ready.
- Define at least one update channel:
  - `stable`
- Publish release artifacts plus updater metadata from CI.
- Check for updates:
  - on launcher startup after the shell is responsive
  - manually from settings
- Prefer background download and apply on restart.

### Install integrity

- Use the existing isolated launcher data root for all managed files.
- Keep one supported Minecraft version at a time in the active product scope.
- Check whether files already exist and match expected integrity before any
  download.
- Keep install and repair operations behind one launcher-side install lock.
- Extend the same rule to managed Java runtime installation once it exists.

### Java runtime deduplication

- Store managed runtimes under a launcher-owned path such as:

```text
<launcher data>/runtime/java/<component>-<platform>-<majorVersion>
```

- Before downloading Java, check:
  - whether a compatible local system Java already exists
  - whether a managed runtime with the required version is already present and
    verified
- Only download a runtime if both checks fail.

## Follow-up Work

1. Add explicit updater integration to the Tauri app once signing is prepared.
2. Add stale install-lock recovery rules.
3. Add progress and cancellation for long install/update operations.
4. Introduce managed Java runtime support using the same integrity and lock
   model.
