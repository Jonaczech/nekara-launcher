import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { appendLauncherLogEntry } from "./launcher";
import type { LauncherUpdateStatus } from "../types/launcher";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const browserPreviewUpdateStatus: LauncherUpdateStatus = {
  available: false,
  version: null,
  date: null,
  body: null,
  message:
    "Browser preview fallback is active. Run the app inside Tauri to check launcher updates.",
};

function toUpdateStatus(update: Awaited<ReturnType<typeof check>>): LauncherUpdateStatus {
  if (update == null) {
    return {
      available: false,
      version: null,
      date: null,
      body: null,
      message: "Launcher is up to date.",
    };
  }

  return {
    available: true,
    version: update.version,
    date: update.date ?? null,
    body: update.body ?? null,
    message: `Launcher update ${update.version} is available.`,
  };
}

async function logUpdate(scope: string, message: string) {
  try {
    await appendLauncherLogEntry(scope, message);
  } catch {
    // Logging must never block update checks or installations.
  }
}

export async function checkLauncherUpdate() {
  if (!isTauriRuntime()) {
    return browserPreviewUpdateStatus;
  }

  await logUpdate("updater", "Checking for launcher updates.");

  try {
    const update = await check();
    await logUpdate(
      "updater",
      update == null
        ? "No launcher update is available."
        : `Launcher update ${update.version} is available.`,
    );
    return toUpdateStatus(update);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown updater failure.";
    await logUpdate("updater", `Launcher update check failed: ${errorMessage}`);
    throw new Error(`Launcher update check failed: ${errorMessage}`);
  }
}

export async function installLauncherUpdate() {
  if (!isTauriRuntime()) {
    return {
      ...browserPreviewUpdateStatus,
      message:
        "Browser preview fallback cannot install updates. Run the app inside Tauri.",
    };
  }

  let update: Awaited<ReturnType<typeof check>> | null = null;

  try {
    update = await check();
    if (update == null) {
      await logUpdate(
        "updater",
        "Update installation requested, but no update was available.",
      );
      return {
        available: false,
        version: null,
        date: null,
        body: null,
        message: "Launcher is already up to date.",
      };
    }

    await logUpdate("updater", `Downloading launcher update ${update.version}.`);
    await update.downloadAndInstall();
    await logUpdate("updater", `Launcher update ${update.version} installed successfully. Relaunching.`);
    await relaunch();
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown updater failure.";
    await logUpdate(
      "updater",
      update == null
        ? `Launcher update installation failed before download started: ${errorMessage}`
        : `Launcher update ${update.version} failed: ${errorMessage}`,
    );
    throw new Error(`Launcher update failed: ${errorMessage}`);
  }

  return toUpdateStatus(update);
}
