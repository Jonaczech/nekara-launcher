# GitHub Release Setup

This file captures the minimum setup required to move Nekara Launcher toward
automatic self-updates through GitHub Releases.

## Goal

After the one-time setup is complete, a release should be publishable from CI
and the launcher should be able to discover newer signed versions automatically.

## Required Setup

1. Create a GitHub repository for the launcher source.
2. Decide the release channel strategy:
   - `stable`
3. Generate and safely store the updater signing key pair.
4. Store the private signing key in GitHub Actions secrets.
5. Decide where the updater metadata JSON will be hosted:
   - GitHub Pages
   - a dedicated static bucket
   - another static HTTPS endpoint
6. Publish desktop artifacts and updater metadata on every tagged release.

## Recommended Secrets

The final names can vary, but the release pipeline should expect at least:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

If release automation uploads metadata to a separate endpoint, add the
necessary deployment secret for that host as well.

## Release Artifacts

Each release should publish:

- Windows installer
- Windows updater bundle
- updater metadata JSON for the release channel

## Launcher-side Behavior

The launcher should:

1. Start and show the shell quickly.
2. Check for updates in the background.
3. Offer manual update control in settings.
4. Download verified update artifacts.
5. Apply the update on restart or user confirmation.

## Relationship To Client Installation

Launcher self-update and Minecraft client preparation must stay separate:

- launcher update:
  updates the desktop app itself
- client preparation:
  updates the isolated Minecraft files, libraries, assets, and later Java

This separation is important so the launcher does not reinstall the Minecraft
client unnecessarily when only the launcher binary changes.
