import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { appendLauncherLogEntry, clearLauncherUpdaterCache } from "./launcher";
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
    "Je aktivní náhradní režim pro prohlížeč. Pro kontrolu aktualizací launcheru spusť aplikaci uvnitř Tauri.",
};

function toUpdateStatus(
  update: Awaited<ReturnType<typeof check>>,
): LauncherUpdateStatus {
  if (update == null) {
    return {
      available: false,
      version: null,
      date: null,
      body: null,
      message: "Launcher je aktuální.",
    };
  }

  return {
    available: true,
    version: update.version,
    date: update.date ?? null,
    body: update.body ?? null,
    message: `Dostupná aktualizace launcheru ${update.version}.`,
  };
}

function formatUpdaterError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
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

  await logUpdate("updater", "Kontroluji aktualizace launcheru.");

  try {
    const update = await check();
    await logUpdate(
      "updater",
      update == null
        ? "Žádná aktualizace launcheru není dostupná."
        : `Dostupná aktualizace launcheru ${update.version}.`,
    );
    return toUpdateStatus(update);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Neznámá chyba aktualizátoru.";
    await logUpdate(
      "updater",
      `Kontrola aktualizace launcheru selhala: ${errorMessage}`,
    );
    throw new Error(`Kontrola aktualizace launcheru selhala: ${errorMessage}`);
  }
}

export async function installLauncherUpdate() {
  if (!isTauriRuntime()) {
    return {
      ...browserPreviewUpdateStatus,
      message:
        "Náhradní režim pro prohlížeč neumí instalovat aktualizace. Spusť aplikaci uvnitř Tauri.",
    };
  }

  let update: Awaited<ReturnType<typeof check>> | null = null;

  try {
    update = await check();
    if (update == null) {
      await logUpdate(
        "updater",
        "Byla vyžádána instalace aktualizace, ale žádná nebyla dostupná.",
      );
      return {
        available: false,
        version: null,
        date: null,
        body: null,
        message: "Launcher je už aktuální.",
      };
    }

    await logUpdate(
      "updater",
      "Před instalací čistím zastaralou mezipaměť aktualizátoru.",
    );
    await clearLauncherUpdaterCache();
    await logUpdate(
      "updater",
      `Stahuji aktualizaci launcheru ${update.version}.`,
    );
    await update.downloadAndInstall();
    await logUpdate(
      "updater",
      `Aktualizace launcheru ${update.version} byla úspěšně nainstalována. Spouštím znovu.`,
    );
    await relaunch();
  } catch (error: unknown) {
    const errorMessage = formatUpdaterError(error);
    await logUpdate(
      "updater",
      update == null
        ? `Instalace aktualizace launcheru selhala ještě před zahájením stahování: ${errorMessage}`
        : `Aktualizace launcheru ${update.version} selhala: ${errorMessage}`,
    );
    throw new Error(`Aktualizace launcheru selhala: ${errorMessage}`);
  }

  return toUpdateStatus(update);
}
