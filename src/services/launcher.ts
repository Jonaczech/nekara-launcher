import { invoke } from "@tauri-apps/api/core";
import type {
  GameLaunchStatus,
  GameDirectoryInfo,
  JavaRuntimeCheck,
  LauncherSettings,
  LauncherLogInfo,
  LauncherStatus,
  MinecraftInstallationPlan,
  MinecraftInstallationStatus,
  MinecraftMetadataCheck,
  OfflinePlayerStatus,
} from "../types/launcher";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const browserPreviewLauncherStatus: LauncherStatus = {
  productName: "Nekara Launcher",
  gameConfigurationId: "nekara",
  minecraftVersion: "26.1.2",
  phase: "foundation",
  checks: [
    {
      id: "configuration",
      label: "Jedna konfigurace Nekara",
      state: "ready",
    },
    {
      id: "minecraft-version",
      label: "Cílová verze Minecraftu je pevně daná",
      state: "ready",
    },
    {
      id: "metadata-resolution",
      label: "Metadata Minecraftu jsou dostupná",
      state: "pending",
    },
    {
      id: "runtime",
      label: "Detekce Java runtime",
      state: "blocked",
    },
    {
      id: "offline-player",
      label: "Offline hráčský profil",
      state: "blocked",
    },
  ],
};

const browserPreviewMetadataCheck: MinecraftMetadataCheck = {
  state: "blocked",
  targetVersion: "26.1.2",
  manifestUrl:
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
  latestRelease: null,
  latestSnapshot: null,
  versionType: null,
  versionUrl: null,
  requiredJavaMajor: null,
  clientDownloadUrl: null,
  clientDownloadSha1: null,
  assetIndexId: null,
  assetIndexUrl: null,
  assetIndexTotalSize: null,
  libraryCount: null,
  available: false,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro živé ověření metadat spusť aplikaci uvnitř Tauri.",
};

const browserPreviewGameDirectoryInfo: GameDirectoryInfo = {
  launcherDataDir: "Browser preview fallback",
  nekaraGameDir: "Browser preview fallback",
  minecraftDir: "Browser preview fallback",
  configuredGameDirectoryPath: null,
  exists: false,
  created: false,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro vytvoření herního adresáře Nekara spusť aplikaci uvnitř Tauri.",
};

const browserPreviewJavaRuntimeCheck: JavaRuntimeCheck = {
  state: "blocked",
  detected: false,
  source: "Browser preview",
  executablePath: null,
  versionLine: null,
  javaVersion: null,
  majorVersion: null,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro detekci Javy spusť aplikaci uvnitř Tauri.",
};

const browserPreviewMinecraftInstallationPlan: MinecraftInstallationPlan = {
  state: "blocked",
  targetVersion: "26.1.2",
  minecraftDir: "Browser preview fallback",
  versionJsonPath: "Browser preview fallback",
  clientJarPath: "Browser preview fallback",
  fabricProfileJsonPath: "Browser preview fallback",
  librariesDir: "Browser preview fallback",
  assetsDir: "Browser preview fallback",
  modsDir: "Browser preview fallback",
  fabricLoaderVersion: null,
  fabricProfileId: null,
  versionType: null,
  versionUrl: null,
  requiredJavaMajor: null,
  clientDownloadUrl: null,
  clientDownloadSha1: null,
  assetIndexId: null,
  assetIndexUrl: null,
  libraryCount: null,
  modCount: null,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro přípravu instalačních cest spusť aplikaci uvnitř Tauri.",
};

const browserPreviewMinecraftInstallationStatus: MinecraftInstallationStatus = {
  state: "pending",
  targetVersion: "26.1.2",
  manifestUrl:
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
  latestRelease: null,
  latestSnapshot: null,
  versionType: null,
  versionUrl: null,
  minecraftDir: "Browser preview fallback",
  versionJsonPath: "Browser preview fallback",
  clientJarPath: "Browser preview fallback",
  fabricProfileJsonPath: "Browser preview fallback",
  librariesDir: "Browser preview fallback",
  assetsDir: "Browser preview fallback",
  modsDir: "Browser preview fallback",
  assetIndexPath: "Browser preview fallback",
  versionJsonReady: false,
  clientJarReady: false,
  fabricProfileReady: false,
  assetIndexReady: false,
  libraryCountTotal: 0,
  libraryCountReady: 0,
  fabricLibraryCountTotal: 0,
  fabricLibraryCountReady: 0,
  assetCountTotal: 0,
  assetCountReady: 0,
  modCountTotal: 0,
  modCountReady: 0,
  fabricLoaderVersion: null,
  fabricProfileId: null,
  requiredJavaMajor: null,
  clientDownloadUrl: null,
  clientDownloadSha1: null,
  assetIndexId: null,
  assetIndexUrl: null,
  assetIndexTotalSize: null,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro přípravu Fabric klientských souborů spusť aplikaci uvnitř Tauri.",
};

const browserPreviewOfflinePlayerStatus: OfflinePlayerStatus = {
  state: "missing",
  playerName: null,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro uložení offline hráčského profilu spusť aplikaci uvnitř Tauri.",
};

const browserPreviewGameLaunchStatus: GameLaunchStatus = {
  state: "idle",
  targetVersion: "26.1.2",
  playerName: null,
  javaExecutable: null,
  javaMajorVersion: null,
  requiredJavaMajor: null,
  mainClass: null,
  workingDirectory: null,
  logPath: null,
  pid: null,
  classpathEntryCount: 0,
  startedAtUnixMs: null,
  finishedAtUnixMs: null,
  exitCode: null,
  configuredMaxRamMb: 4096,
  diagnosticSummary: null,
  suggestedFix: null,
  logExcerpt: null,
  message:
    "Je aktivní náhradní režim pro prohlížeč. Pro spuštění Minecraftu spusť aplikaci uvnitř Tauri.",
};

const browserPreviewLauncherSettings: LauncherSettings = {
  maxRamMb: 4096,
  javaExecutablePath: null,
  gameDirectoryPath: null,
  minRamMb: 2048,
  maxAllowedRamMb: 12288,
  ramStepMb: 512,
  message: "Náhradní režim pro prohlížeč používá limit RAM 4096 MB.",
};

const browserPreviewLauncherLogInfo: LauncherLogInfo = {
  logDir: "Browser preview fallback",
  logFile: "Browser preview fallback",
};

export function getLauncherStatus() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewLauncherStatus);
  }

  return invoke<LauncherStatus>("get_launcher_status");
}

export function checkMinecraftVersionMetadata() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewMetadataCheck);
  }

  return invoke<MinecraftMetadataCheck>("check_minecraft_version_metadata");
}

export function ensureNekaraGameDirectory() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewGameDirectoryInfo);
  }

  return invoke<GameDirectoryInfo>("ensure_nekara_game_directory");
}

export function checkJavaRuntime() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewJavaRuntimeCheck);
  }

  return invoke<JavaRuntimeCheck>("check_java_runtime");
}

export function getMinecraftInstallationPlan() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewMinecraftInstallationPlan);
  }

  return invoke<MinecraftInstallationPlan>("get_minecraft_installation_plan");
}

export function getMinecraftInstallationStatus() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewMinecraftInstallationStatus);
  }

  return invoke<MinecraftInstallationStatus>(
    "get_minecraft_installation_status",
  );
}

export function prepareMinecraftInstallation() {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      ...browserPreviewMinecraftInstallationStatus,
      state: "ready" as const,
      versionJsonReady: true,
      clientJarReady: true,
      message:
        "Náhradní režim pro prohlížeč nasimuloval připravenou instalaci.",
    });
  }

  return invoke<MinecraftInstallationStatus>("prepare_minecraft_installation");
}

export function getOfflinePlayerStatus() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewOfflinePlayerStatus);
  }

  return invoke<OfflinePlayerStatus>("get_offline_player_status");
}

export function getGameLaunchStatus() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewGameLaunchStatus);
  }

  return invoke<GameLaunchStatus>("get_game_launch_status");
}

export function launchMinecraft() {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      ...browserPreviewGameLaunchStatus,
      state: "running" as const,
      message:
        "Náhradní režim pro prohlížeč nasimuloval běžící relaci Minecraftu.",
    });
  }

  return invoke<GameLaunchStatus>("launch_minecraft");
}

export function getLauncherSettings() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewLauncherSettings);
  }

  return invoke<LauncherSettings>("get_launcher_settings");
}

export function saveLauncherSettings(
  maxRamMb: number,
  javaExecutablePath: string | null,
  gameDirectoryPath: string | null,
) {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      ...browserPreviewLauncherSettings,
      maxRamMb,
      javaExecutablePath,
      gameDirectoryPath,
      message: `Náhradní režim pro prohlížeč uložil ${maxRamMb} MB jako limit RAM.`,
    });
  }

  return invoke<LauncherSettings>("save_launcher_settings", {
    maxRamMb,
    javaExecutablePath,
    gameDirectoryPath,
  });
}

export function saveOfflinePlayerProfile(playerName: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      state: "ready" as const,
      playerName,
      message: `Offline hráč ${playerName} je připraven.`,
    });
  }

  return invoke<OfflinePlayerStatus>("save_offline_player_profile", {
    playerName,
  });
}

export function clearOfflinePlayerProfile() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewOfflinePlayerStatus);
  }

  return invoke<OfflinePlayerStatus>("clear_offline_player_profile");
}

export function clearLauncherUpdaterCache() {
  if (!isTauriRuntime()) {
    return Promise.resolve(false);
  }

  return invoke<boolean>("clear_launcher_updater_cache");
}

export function getLauncherLogInfo() {
  if (!isTauriRuntime()) {
    return Promise.resolve(browserPreviewLauncherLogInfo);
  }

  return invoke<LauncherLogInfo>("get_launcher_log_info");
}

export function appendLauncherLogEntry(scope: string, message: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  return invoke<void>("append_launcher_log", {
    scope,
    message,
  });
}
