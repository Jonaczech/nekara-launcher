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
      label: "Single Nekara configuration",
      state: "ready",
    },
    {
      id: "minecraft-version",
      label: "Target Minecraft version locked",
      state: "ready",
    },
    {
      id: "metadata-resolution",
      label: "Minecraft metadata available",
      state: "pending",
    },
    {
      id: "runtime",
      label: "Java runtime detection",
      state: "blocked",
    },
    {
      id: "offline-player",
      label: "Offline player profile",
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
    "Browser preview fallback is active. Run the app inside Tauri for live metadata verification.",
};

const browserPreviewGameDirectoryInfo: GameDirectoryInfo = {
  launcherDataDir: "Browser preview fallback",
  nekaraGameDir: "Browser preview fallback",
  minecraftDir: "Browser preview fallback",
  exists: false,
  created: false,
  message:
    "Browser preview fallback is active. Run the app inside Tauri to create the Nekara game directory.",
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
    "Browser preview fallback is active. Run the app inside Tauri to detect Java.",
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
  message:
    "Browser preview fallback is active. Run the app inside Tauri to prepare install paths.",
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
  fabricLoaderVersion: null,
  fabricProfileId: null,
  requiredJavaMajor: null,
  clientDownloadUrl: null,
  clientDownloadSha1: null,
  assetIndexId: null,
  assetIndexUrl: null,
  assetIndexTotalSize: null,
  message:
    "Browser preview fallback is active. Run the app inside Tauri to prepare Fabric client files.",
};

const browserPreviewOfflinePlayerStatus: OfflinePlayerStatus = {
  state: "missing",
  playerName: null,
  message:
    "Browser preview fallback is active. Run the app inside Tauri to save an offline player profile.",
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
    "Browser preview fallback is active. Run the app inside Tauri to launch Minecraft.",
};

const browserPreviewLauncherSettings: LauncherSettings = {
  maxRamMb: 4096,
  javaExecutablePath: null,
  minRamMb: 2048,
  maxAllowedRamMb: 12288,
  ramStepMb: 512,
  message: "Browser preview fallback uses 4096 MB as the RAM limit.",
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

  return invoke<MinecraftInstallationStatus>("get_minecraft_installation_status");
}

export function prepareMinecraftInstallation() {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      ...browserPreviewMinecraftInstallationStatus,
      state: "ready" as const,
      versionJsonReady: true,
      clientJarReady: true,
      message: "Browser preview fallback simulated a prepared installation.",
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
      message: "Browser preview fallback simulated a running Minecraft session.",
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
) {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      ...browserPreviewLauncherSettings,
      maxRamMb,
      javaExecutablePath,
      message: `Browser preview fallback saved ${maxRamMb} MB as the RAM limit.`,
    });
  }

  return invoke<LauncherSettings>("save_launcher_settings", {
    maxRamMb,
    javaExecutablePath,
  });
}

export function saveOfflinePlayerProfile(playerName: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve({
      state: "ready" as const,
      playerName,
      message: `Offline player ${playerName} is ready.`,
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
