# Release Runbook

This runbook is the operational checklist for publishing Nekara Launcher
through GitHub Releases.

## Current Baseline

- Desktop stack: Tauri 2 + React + TypeScript + Rust
- Current release target after the updater/fabric fixes and launcher visual refresh: `0.1.9`
- Release trigger: Git tag matching `app-v*`
- Release workflow: `.github/workflows/release.yml`
- Updater endpoint: GitHub Releases `latest.json`

## One-Time Setup

1. Confirm GitHub Actions secrets exist in the repository:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
2. Confirm the public key in `src-tauri/tauri.conf.json` matches the public
   half of the signing key used by Actions.
3. Keep the signing private key outside the repository.
4. Keep a copy of the matching public key in a secure operator location for
   future verification and incident recovery.

## Release Steps

1. Merge or push the intended release commit to GitHub.
2. Verify local checks:
   - `cargo test` in `src-tauri/`
   - `pnpm typecheck`
   - `pnpm build`
3. Create the release tag:

```bash
git tag app-v0.1.9
git push origin app-v0.1.9
```

4. Wait for `.github/workflows/release.yml` to finish.
5. Confirm the release contains:
   - `latest.json`
   - NSIS installer
   - NSIS `.sig`
   - MSI installer
   - MSI `.sig`

## Post-Release Smoke Check

1. Open the published `latest.json`.
2. Confirm the version matches the release tag.
3. Confirm the launcher with the matching updater public key sees the release.
4. Install using the NSIS installer.
5. Open the launcher and verify:
   - update check succeeds
   - Fabric client preparation reaches ready state
   - Play starts Minecraft successfully

## Known Recovery Note

Launcher builds that shipped with the old updater public key cannot trust
releases signed by the corrected key. Those users need one manual reinstall
onto `0.1.8` or newer before automatic updates can work again. The first
recommended branded recovery installer is `0.1.9`.
