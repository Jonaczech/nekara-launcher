export type LauncherPhase = "foundation";

export type CheckState = "ready" | "pending" | "blocked";

export interface LauncherCheck {
  id: string;
  label: string;
  state: CheckState;
}

export interface LauncherStatus {
  productName: string;
  gameConfigurationId: string;
  minecraftVersion: string;
  phase: LauncherPhase;
  checks: LauncherCheck[];
}

export type MetadataCheckState = "ready" | "blocked";

export interface MinecraftMetadataCheck {
  state: MetadataCheckState;
  targetVersion: string;
  manifestUrl: string;
  latestRelease: string | null;
  latestSnapshot: string | null;
  versionType: string | null;
  versionUrl: string | null;
  requiredJavaMajor: number | null;
  clientDownloadUrl: string | null;
  clientDownloadSha1: string | null;
  assetIndexId: string | null;
  assetIndexUrl: string | null;
  assetIndexTotalSize: number | null;
  libraryCount: number | null;
  available: boolean;
  message: string;
}

export interface GameDirectoryInfo {
  launcherDataDir: string;
  nekaraGameDir: string;
  minecraftDir: string;
  configuredGameDirectoryPath: string | null;
  resolvedLocationKind: "custom" | "appDataRoaming";
  exists: boolean;
  created: boolean;
  message: string;
}

export type JavaRuntimeState = "ready" | "blocked";

export interface JavaRuntimeCheck {
  state: JavaRuntimeState;
  detected: boolean;
  source: string;
  executablePath: string | null;
  versionLine: string | null;
  javaVersion: string | null;
  majorVersion: number | null;
  message: string;
}

export interface JavaRuntimeInstallProgress {
  active: boolean;
  currentStep: string | null;
  currentDownloadLabel: string | null;
  totalBytes: number;
  downloadedBytes: number;
  remainingBytes: number;
  bytesPerSecond: number | null;
}

export type MinecraftInstallationPlanState = "ready" | "blocked";

export interface MinecraftInstallationPlan {
  state: MinecraftInstallationPlanState;
  targetVersion: string;
  minecraftDir: string;
  versionJsonPath: string;
  clientJarPath: string;
  fabricProfileJsonPath: string;
  librariesDir: string;
  assetsDir: string;
  modsDir: string;
  fabricLoaderVersion: string | null;
  fabricProfileId: string | null;
  versionType: string | null;
  versionUrl: string | null;
  requiredJavaMajor: number | null;
  clientDownloadUrl: string | null;
  clientDownloadSha1: string | null;
  assetIndexId: string | null;
  assetIndexUrl: string | null;
  libraryCount: number | null;
  modCount: number | null;
  message: string;
}

export type MinecraftInstallationState = "ready" | "pending" | "blocked";

export interface MinecraftInstallationStatus {
  state: MinecraftInstallationState;
  targetVersion: string;
  manifestUrl: string;
  latestRelease: string | null;
  latestSnapshot: string | null;
  versionType: string | null;
  versionUrl: string | null;
  minecraftDir: string;
  versionJsonPath: string;
  clientJarPath: string;
  fabricProfileJsonPath: string;
  librariesDir: string;
  assetsDir: string;
  modsDir: string;
  assetIndexPath: string;
  versionJsonReady: boolean;
  clientJarReady: boolean;
  fabricProfileReady: boolean;
  assetIndexReady: boolean;
  libraryCountTotal: number;
  libraryCountReady: number;
  fabricLibraryCountTotal: number;
  fabricLibraryCountReady: number;
  assetCountTotal: number;
  assetCountReady: number;
  modCountTotal: number;
  modCountReady: number;
  fabricLoaderVersion: string | null;
  fabricProfileId: string | null;
  requiredJavaMajor: number | null;
  clientDownloadUrl: string | null;
  clientDownloadSha1: string | null;
  assetIndexId: string | null;
  assetIndexUrl: string | null;
  assetIndexTotalSize: number | null;
  message: string;
}

export interface MinecraftInstallationProgress {
  active: boolean;
  currentStep: string | null;
  currentDownloadLabel: string | null;
  totalBytes: number;
  downloadedBytes: number;
  remainingBytes: number;
  bytesPerSecond: number | null;
}

export type OfflinePlayerState = "missing" | "ready";

export interface OfflinePlayerStatus {
  state: OfflinePlayerState;
  playerName: string | null;
  message: string;
}

export type GameLaunchState =
  "idle" | "launching" | "running" | "exited" | "failed";

export interface GameLaunchStatus {
  state: GameLaunchState;
  targetVersion: string;
  playerName: string | null;
  javaExecutable: string | null;
  javaMajorVersion: number | null;
  requiredJavaMajor: number | null;
  mainClass: string | null;
  workingDirectory: string | null;
  logPath: string | null;
  pid: number | null;
  classpathEntryCount: number;
  startedAtUnixMs: number | null;
  finishedAtUnixMs: number | null;
  exitCode: number | null;
  configuredMaxRamMb: number | null;
  diagnosticSummary: string | null;
  suggestedFix: string | null;
  logExcerpt: string | null;
  message: string;
}

export interface LauncherSettings {
  maxRamMb: number;
  javaExecutablePath: string | null;
  gameDirectoryPath: string | null;
  minRamMb: number;
  maxAllowedRamMb: number;
  ramStepMb: number;
  message: string;
}

export interface LauncherUpdateStatus {
  available: boolean;
  version: string | null;
  date: string | null;
  body: string | null;
  message: string;
}

export interface LauncherLogInfo {
  logDir: string;
  logFile: string;
}
