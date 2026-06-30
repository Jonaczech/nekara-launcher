import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
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

export async function checkLauncherUpdate() {
  if (!isTauriRuntime()) {
    return browserPreviewUpdateStatus;
  }

  const update = await check();
  return toUpdateStatus(update);
}

export async function installLauncherUpdate() {
  if (!isTauriRuntime()) {
    return {
      ...browserPreviewUpdateStatus,
      message:
        "Browser preview fallback cannot install updates. Run the app inside Tauri.",
    };
  }

  const update = await check();
  if (update == null) {
    return {
      available: false,
      version: null,
      date: null,
      body: null,
      message: "Launcher is already up to date.",
    };
  }

  await update.downloadAndInstall();
  await relaunch();

  return toUpdateStatus(update);
}
