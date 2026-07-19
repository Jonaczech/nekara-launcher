import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  ChevronDown,
  Cpu,
  FolderOpen,
  HardDrive,
  House,
  LoaderCircle,
  Minus,
  Play,
  RotateCcw,
  Save,
  Settings2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageInfo from "../package.json";
import launcherIcon from "../src-tauri/icons/64x64.png";
import launcherLogo from "../brand/logos/logo.png";
import launcherWallpaper from "../brand/wallpapers/pozadi.png";
import "./App.css";
import {
  checkJavaRuntime,
  clearOfflinePlayerProfile,
  ensureNekaraGameDirectory,
  getGameLaunchStatus,
  getLauncherLogInfo,
  getLauncherStatus,
  getLauncherSettings,
  getJavaRuntimeInstallProgress,
  getMinecraftInstallationProgress,
  getMinecraftInstallationStatus,
  getOfflinePlayerStatus,
  getServerStatus,
  installManagedJavaRuntime,
  launchMinecraft,
  openDirectoryInFileExplorer,
  pickGameDirectoryPath,
  prepareMinecraftInstallation,
  refreshLauncherErrorReport as generateLauncherErrorReport,
  saveLauncherSettings,
  saveOfflinePlayerProfile,
} from "./services/launcher";
import { runAutomaticLauncherUpdateOnStartup } from "./services/updater";
import type {
  GameDirectoryInfo,
  GameLaunchStatus,
  JavaRuntimeCheck,
  JavaRuntimeInstallProgress,
  LauncherLogInfo,
  LauncherStatus,
  LauncherUpdateStatus,
  LauncherSettings,
  ServerStatus,
  MinecraftInstallationProgress,
  MinecraftInstallationStatus,
  OfflinePlayerStatus,
} from "./types/launcher";

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

const appVersion = packageInfo.version;
const bytesInMegabyte = 1024 * 1024;

function formatRemainingMegabytes(bytes: number) {
  const megabytes = Math.max(0, bytes) / bytesInMegabyte;

  if (megabytes >= 100) {
    return `${Math.round(megabytes)} MB`;
  }

  if (megabytes >= 10) {
    return `${megabytes.toFixed(1)} MB`;
  }

  return `${megabytes.toFixed(2)} MB`;
}

function formatDownloadSpeed(bytesPerSecond: number | null) {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) {
    return null;
  }

  const megabytesPerSecond = bytesPerSecond / bytesInMegabyte;

  if (megabytesPerSecond >= 10) {
    return `${megabytesPerSecond.toFixed(1)} MB/s`;
  }

  return `${megabytesPerSecond.toFixed(2)} MB/s`;
}

function App() {
  const [directoryState, setDirectoryState] = useState<
    LoadState<GameDirectoryInfo>
  >({
    kind: "loading",
  });
  const [javaState, setJavaState] = useState<LoadState<JavaRuntimeCheck>>({
    kind: "loading",
  });
  const [installationState, setInstallationState] = useState<
    LoadState<MinecraftInstallationStatus>
  >({ kind: "loading" });
  const [gameLaunchState, setGameLaunchState] = useState<
    LoadState<GameLaunchStatus>
  >({
    kind: "loading",
  });
  const [launcherSettingsState, setLauncherSettingsState] = useState<
    LoadState<LauncherSettings>
  >({ kind: "loading" });
  const [launcherLogState, setLauncherLogState] = useState<
    LoadState<LauncherLogInfo>
  >({
    kind: "loading",
  });
  const [launcherStatusState, setLauncherStatusState] = useState<
    LoadState<LauncherStatus>
  >({
    kind: "loading",
  });
  const [serverStatusState, setServerStatusState] = useState<
    LoadState<ServerStatus>
  >({
    kind: "loading",
  });
  const [startupUpdateNotice, setStartupUpdateNotice] =
    useState<LauncherUpdateStatus | null>(null);
  const [playerState, setPlayerState] = useState<
    LoadState<OfflinePlayerStatus>
  >({
    kind: "loading",
  });
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [ramInputMb, setRamInputMb] = useState(4096);
  const [javaPathInput, setJavaPathInput] = useState("");
  const [gameDirectoryPathInput, setGameDirectoryPathInput] = useState("");
  const [gameDirectoryPickerError, setGameDirectoryPickerError] = useState<
    string | null
  >(null);
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pickingGameDirectory, setPickingGameDirectory] = useState(false);
  const [preparingInstallation, setPreparingInstallation] = useState(false);
  const [installationProgress, setInstallationProgress] =
    useState<MinecraftInstallationProgress | null>(null);
  const [installingManagedJava, setInstallingManagedJava] = useState(false);
  const [javaInstallProgress, setJavaInstallProgress] =
    useState<JavaRuntimeInstallProgress | null>(null);
  const [launchingGame, setLaunchingGame] = useState(false);
  const [currentView, setCurrentView] = useState<"home" | "settings">("home");
  const [wallpaperReady, setWallpaperReady] = useState(false);
  const [launcherDiagnosticsError, setLauncherDiagnosticsError] = useState<
    string | null
  >(null);

  function updateRamInput(value: number) {
    if (!Number.isNaN(value)) {
      setRamInputMb(value);
    }
  }

  function updateJavaPathInput(value: string) {
    setJavaPathInput(value);
  }

  function updateGameDirectoryPathInput(value: string) {
    setGameDirectoryPickerError(null);
    setGameDirectoryPathInput(value);
  }

  async function refreshDirectoryInfo() {
    try {
      const info = await ensureNekaraGameDirectory();
      setDirectoryState({ kind: "ready", value: info });
    } catch (error: unknown) {
      setDirectoryState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Herní adresář Nekary není k dispozici.",
      });
    }
  }

  async function refreshJavaRuntime() {
    try {
      const check = await checkJavaRuntime();
      setJavaState({ kind: "ready", value: check });
      return check;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Detekce Java runtime není k dispozici.";
      setJavaState({
        kind: "error",
        message,
      });
      throw new Error(message);
    }
  }

  async function refreshInstallationStatus() {
    try {
      const status = await getMinecraftInstallationStatus();
      setInstallationState({ kind: "ready", value: status });
      return status;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Stav instalace Minecraftu není k dispozici.";
      setInstallationState({
        kind: "error",
        message,
      });
      throw new Error(message);
    }
  }

  async function refreshGameLaunchStatus() {
    try {
      const status = await getGameLaunchStatus();
      setGameLaunchState({ kind: "ready", value: status });
    } catch (error: unknown) {
      setGameLaunchState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Stav spuštění Minecraftu není k dispozici.",
      });
    }
  }

  async function refreshLauncherSettings() {
    try {
      const settings = await getLauncherSettings();
      setLauncherSettingsState({ kind: "ready", value: settings });
      setRamInputMb(settings.maxRamMb);
      setJavaPathInput(settings.javaExecutablePath ?? "");
      setGameDirectoryPathInput(settings.gameDirectoryPath ?? "");
    } catch (error: unknown) {
      setLauncherSettingsState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nastavení launcheru není k dispozici.",
      });
    }
  }

  async function refreshLauncherLogInfo() {
    try {
      const info = await getLauncherLogInfo();
      setLauncherLogState({ kind: "ready", value: info });
      return info;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Informace o lokálních logách launcheru nejsou k dispozici.";
      setLauncherLogState({
        kind: "error",
        message,
      });
      return null;
    }
  }

  async function refreshLauncherErrorReport() {
    try {
      const info = await generateLauncherErrorReport();
      return info;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Error log se nepodařilo vytvořit.";
      setLauncherDiagnosticsError(message);
      return null;
    }
  }

  async function refreshLauncherStatus() {
    try {
      const status = await getLauncherStatus();
      setLauncherStatusState({ kind: "ready", value: status });
      return status;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Stav launcheru není k dispozici.";
      setLauncherStatusState({
        kind: "error",
        message,
      });
      return null;
    }
  }

  async function refreshServerStatus() {
    try {
      const status = await getServerStatus();
      setServerStatusState({ kind: "ready", value: status });
      return status;
    } catch (error: unknown) {
      setServerStatusState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Stav serveru není k dispozici.",
      });
      return null;
    }
  }

  async function refreshOfflinePlayerStatus() {
    try {
      const status = await getOfflinePlayerStatus();
      setPlayerState({ kind: "ready", value: status });
      setPlayerNameInput(status.playerName ?? "");
      return status;
    } catch (error: unknown) {
      setPlayerState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offline profil hráče není k dispozici.",
      });
      return null;
    }
  }

  function scheduleBackgroundWork(callback: () => void, timeoutMs: number) {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const browserWindow = window as Window & typeof globalThis;

    if (typeof browserWindow.requestIdleCallback === "function") {
      const idleId = browserWindow.requestIdleCallback(callback, {
        timeout: timeoutMs,
      });
      return () => browserWindow.cancelIdleCallback(idleId);
    }

    const timer = browserWindow.setTimeout(callback, timeoutMs);
    return () => browserWindow.clearTimeout(timer);
  }

  useEffect(() => {
    return scheduleBackgroundWork(() => {
      setWallpaperReady(true);
    }, 450);
  }, []);

  useEffect(() => {
    return scheduleBackgroundWork(() => {
      void refreshServerStatus();
    }, 1_000);
  }, []);

  useEffect(() => {
    const cleanup = scheduleBackgroundWork(() => {
      void runAutomaticLauncherUpdateOnStartup((status) => {
        setStartupUpdateNotice(status);
      }).catch((error: unknown) => {
        setStartupUpdateNotice(null);
        console.warn("Automatic launcher update failed.", error);
      });
    }, 2400);

    return cleanup;
  }, []);

  useEffect(() => {
    if (currentView !== "settings") {
      return;
    }

    if (launcherSettingsState.kind === "loading") {
      void refreshLauncherSettings();
    }

    if (directoryState.kind === "loading") {
      void refreshDirectoryInfo();
    }

    if (playerState.kind === "loading") {
      void refreshOfflinePlayerStatus();
    }

    if (gameLaunchState.kind === "loading") {
      void refreshGameLaunchStatus();
    }

    if (launcherStatusState.kind === "loading") {
      void refreshLauncherStatus();
    }

    if (launcherLogState.kind === "loading") {
      void refreshLauncherLogInfo();
      void refreshLauncherErrorReport();
    }

    if (javaState.kind === "loading") {
      void refreshJavaRuntime().catch(() => undefined);
    }
  }, [
    currentView,
    launcherSettingsState.kind,
    directoryState.kind,
    playerState.kind,
    gameLaunchState.kind,
    launcherStatusState.kind,
    launcherLogState.kind,
    javaState.kind,
  ]);

  useEffect(() => {
    if (
      gameLaunchState.kind !== "ready" ||
      (gameLaunchState.value.state !== "running" &&
        gameLaunchState.value.state !== "launching")
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshGameLaunchStatus();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [gameLaunchState]);

  useEffect(() => {
    if (!preparingInstallation) {
      setInstallationProgress(null);
      return;
    }

    let cancelled = false;

    async function refreshProgress() {
      try {
        const progress = await getMinecraftInstallationProgress();
        if (!cancelled) {
          setInstallationProgress(progress);
        }
      } catch (error) {
        console.warn("Installation progress refresh failed.", error);
      }
    }

    void refreshProgress();
    const timer = window.setInterval(() => {
      void refreshProgress();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preparingInstallation]);

  useEffect(() => {
    if (!installingManagedJava) {
      setJavaInstallProgress(null);
      return;
    }

    let cancelled = false;

    async function refreshProgress() {
      try {
        const progress = await getJavaRuntimeInstallProgress();
        if (!cancelled) {
          setJavaInstallProgress(progress);
        }
      } catch (error) {
        console.warn("Java runtime install progress refresh failed.", error);
      }
    }

    void refreshProgress();
    const timer = window.setInterval(() => {
      void refreshProgress();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [installingManagedJava]);

  const gameDirectory =
    directoryState.kind === "ready" ? directoryState.value : null;
  const javaRuntime = javaState.kind === "ready" ? javaState.value : null;
  const installationStatus =
    installationState.kind === "ready" ? installationState.value : null;
  const gameLaunch =
    gameLaunchState.kind === "ready" ? gameLaunchState.value : null;
  const launcherSettings =
    launcherSettingsState.kind === "ready" ? launcherSettingsState.value : null;
  const launcherLogInfo =
    launcherLogState.kind === "ready" ? launcherLogState.value : null;
  const launcherStatus =
    launcherStatusState.kind === "ready" ? launcherStatusState.value : null;
  const serverStatus =
    serverStatusState.kind === "ready" ? serverStatusState.value : null;
  const offlinePlayer = playerState.kind === "ready" ? playerState.value : null;
  const offlinePlayerReady = offlinePlayer?.state === "ready";
  const identityReady = offlinePlayerReady;
  const installationReady = installationStatus?.state === "ready";
  const metadataAvailable =
    installationStatus != null && installationStatus.state !== "blocked";
  const javaCompatible =
    installationStatus?.requiredJavaMajor == null
      ? (javaRuntime?.detected ?? false)
      : (javaRuntime?.majorVersion ?? 0) >=
        installationStatus.requiredJavaMajor;
  const gameRunning =
    gameLaunch?.state === "running" || gameLaunch?.state === "launching";
  const launchFailed = gameLaunch?.state === "failed";
  const installationNeedsAttention =
    installationStatus != null && !installationReady;
  const diagnosticSummary = launchFailed
    ? (gameLaunch?.diagnosticSummary ?? null)
    : installationNeedsAttention
      ? (installationStatus?.message ?? null)
      : null;
  const diagnosticFix = launchFailed
    ? (gameLaunch?.suggestedFix ?? null)
    : installationNeedsAttention
      ? "Spusť přípravu hry znovu, nebo zkontroluj, zda jsou soubory dostupné v herní složce."
      : null;
  const diagnosticLogExcerpt = launchFailed
    ? (gameLaunch?.logExcerpt ?? null)
    : null;
  const diagnosticLogPath = launchFailed
    ? (gameLaunch?.logPath ?? null)
    : (launcherLogInfo?.logFile ?? null);
  const diagnosticErrorReportPath = launcherLogInfo?.errorReportFile ?? null;
  const launcherCheckStateLabel = {
    ready: "Připraveno",
    pending: "Čeká",
    blocked: "Blokováno",
  } as const;
  const launchBlockerItems: string[] = [];
  if (!identityReady) {
    launchBlockerItems.push("Ulož herní jméno hráče.");
  }
  if (!gameDirectory?.exists) {
    launchBlockerItems.push("Připrav herní složku Nekary v nastavení.");
  }
  if (!javaCompatible) {
    launchBlockerItems.push(
      javaRuntime?.source === "Custom path"
        ? "Nastavená cesta k Java runtime nefunguje."
        : "Nainstaluj nebo vyber kompatibilní Java runtime.",
    );
  }
  if (installationStatus != null && !installationReady) {
    if (!installationStatus.versionJsonReady) {
      launchBlockerItems.push("Chybí metadata verze Minecraftu.");
    }
    if (!installationStatus.clientJarReady) {
      launchBlockerItems.push("Chybí client JAR Minecraftu.");
    }
    if (!installationStatus.fabricProfileReady) {
      launchBlockerItems.push("Chybí Fabric profil.");
    }
    if (!installationStatus.assetIndexReady) {
      launchBlockerItems.push("Chybí index assetů.");
    }
    if (
      installationStatus.libraryCountReady <
      installationStatus.libraryCountTotal
    ) {
      launchBlockerItems.push(
        `${installationStatus.libraryCountTotal - installationStatus.libraryCountReady} knihoven chybí.`,
      );
    }
    if (
      installationStatus.assetCountReady < installationStatus.assetCountTotal
    ) {
      launchBlockerItems.push(
        `${installationStatus.assetCountTotal - installationStatus.assetCountReady} assetů chybí.`,
      );
    }
    if (installationStatus.modCountReady < installationStatus.modCountTotal) {
      launchBlockerItems.push(
        `${installationStatus.modCountTotal - installationStatus.modCountReady} modů chybí.`,
      );
    }
  }
  const hasJavaRuntimeBlocker = !javaCompatible;
  const readinessChecksStarted =
    directoryState.kind !== "loading" ||
    javaState.kind !== "loading" ||
    installationState.kind !== "loading";
  const waitingForPrimaryChecks =
    !preparingInstallation &&
    !installingManagedJava &&
    !launchingGame &&
    !readinessChecksStarted;

  const readiness = useMemo(
    () => ({
      metadata: metadataAvailable,
      gameDirectory: gameDirectory?.exists ?? false,
      java: javaCompatible,
      identity: identityReady,
      installation: installationReady,
    }),
    [
      metadataAvailable,
      gameDirectory?.exists,
      javaCompatible,
      identityReady,
      installationReady,
    ],
  );

  const readinessCount = Object.values(readiness).filter(Boolean).length;
  const readinessPercent = Math.round((readinessCount / 5) * 100);
  const installOperationTotalUnits =
    installationStatus == null
      ? 0
      : 3 +
        installationStatus.libraryCountTotal +
        installationStatus.assetCountTotal +
        installationStatus.modCountTotal;
  const installOperationReadyUnits =
    installationStatus == null
      ? 0
      : (installationStatus.versionJsonReady ? 1 : 0) +
        (installationStatus.clientJarReady ? 1 : 0) +
        (installationStatus.assetIndexReady ? 1 : 0) +
        installationStatus.libraryCountReady +
        installationStatus.assetCountReady +
        installationStatus.modCountReady;
  const installOperationPercent =
    installOperationTotalUnits === 0
      ? 0
      : Math.round(
          (installOperationReadyUnits / installOperationTotalUnits) * 100,
        );
  const progressPanelLabel = "Průběh";
  const progressPanelValue = waitingForPrimaryChecks
    ? "Klikni na Hrát pro kontrolu hry"
    : preparingInstallation ||
        (installationStatus != null && !installationReady)
      ? `${installOperationPercent}%`
      : readinessCount === 5
        ? "Všechno je připravené"
        : readinessCount >= 3
          ? "Už jen pár kroků"
          : "Připravuji hru";
  const progressPanelPercent = waitingForPrimaryChecks
    ? 0
    : preparingInstallation ||
        (installationStatus != null && !installationReady)
      ? installOperationPercent
      : readinessPercent;
  const hasLiveJavaDownloadProgress =
    installingManagedJava &&
    javaInstallProgress?.active === true &&
    (javaInstallProgress?.totalBytes ?? 0) > 0;
  const liveJavaDownloadPercent = hasLiveJavaDownloadProgress
    ? Math.round(
        (javaInstallProgress!.downloadedBytes /
          javaInstallProgress!.totalBytes) *
          100,
      )
    : 0;
  const liveJavaRemainingText =
    javaInstallProgress == null
      ? null
      : `${formatRemainingMegabytes(javaInstallProgress.remainingBytes)} zbývá`;
  const liveJavaSpeedText =
    javaInstallProgress == null
      ? null
      : formatDownloadSpeed(javaInstallProgress.bytesPerSecond);
  const hasLiveDownloadProgress =
    preparingInstallation &&
    installationProgress?.active === true &&
    (installationProgress?.totalBytes ?? 0) > 0;
  const liveDownloadPercent = hasLiveDownloadProgress
    ? Math.round(
        (installationProgress!.downloadedBytes /
          installationProgress!.totalBytes) *
          100,
      )
    : 0;
  const liveRemainingText =
    installationProgress == null
      ? null
      : `${formatRemainingMegabytes(installationProgress.remainingBytes)} zbývá`;
  const liveSpeedText =
    installationProgress == null
      ? null
      : formatDownloadSpeed(installationProgress.bytesPerSecond);
  const effectiveProgressPanelLabel =
    installingManagedJava && javaInstallProgress?.currentStep != null
      ? javaInstallProgress.currentStep
      : installingManagedJava
        ? "Instaluji Java runtime"
        : preparingInstallation && installationProgress?.currentStep != null
          ? installationProgress.currentStep
          : progressPanelLabel;
  const effectiveProgressPanelValue =
    hasLiveJavaDownloadProgress && liveJavaRemainingText != null
      ? liveJavaSpeedText == null
        ? liveJavaRemainingText
        : `${liveJavaRemainingText} · ${liveJavaSpeedText}`
      : installingManagedJava
        ? (javaInstallProgress?.currentStep ?? "Připravuji Java runtime")
        : hasLiveDownloadProgress && liveRemainingText != null
          ? liveSpeedText == null
            ? liveRemainingText
            : `${liveRemainingText} · ${liveSpeedText}`
          : progressPanelValue;
  const effectiveProgressPanelPercent = hasLiveJavaDownloadProgress
    ? liveJavaDownloadPercent
    : installingManagedJava
      ? 0
      : hasLiveDownloadProgress
        ? liveDownloadPercent
        : progressPanelPercent;

  const quickGameStatus = gameRunning
    ? "Hra běží"
    : readinessCount === 5
      ? "Připraveno"
      : preparingInstallation || installingManagedJava
        ? "Probíhá"
        : "Čeká";
  const quickPlayerStatus = identityReady ? "Uloženo" : "Chybí";
  const quickSettingsStatus =
    hasJavaRuntimeBlocker || launchBlockerItems.length > 0
      ? "Zkontrolovat"
      : "V pořádku";

  const primaryButtonLabel =
    playerState.kind === "loading" && playerNameInput.trim().length === 0
      ? "Hrát"
      : !identityReady
        ? "Uložit jméno"
        : gameRunning
          ? "Hra běží"
          : installingManagedJava
            ? "Instaluji Javu..."
            : launchingGame
              ? "Spouštím hru..."
              : preparingInstallation
                ? "Připravuji hru..."
                : installationState.kind === "loading"
                  ? "Zkontrolovat hru"
                  : !installationReady
                    ? "Připravit hru"
                    : !javaCompatible
                      ? "Nainstalovat Javu a hrát"
                      : readinessCount === 5
                        ? "Hrát"
                        : "Skoro hotovo";

  const ramMinMb = launcherSettings?.minRamMb ?? 2048;
  const ramMaxMb = launcherSettings?.maxAllowedRamMb ?? 12288;
  const ramStepMb = launcherSettings?.ramStepMb ?? 512;
  const javaPathNormalized = javaPathInput.trim();
  const gameDirectoryPathNormalized = gameDirectoryPathInput.trim();
  const savedJavaPathNormalized =
    launcherSettings?.javaExecutablePath?.trim() ?? "";
  const savedGameDirectoryPathNormalized =
    launcherSettings?.gameDirectoryPath?.trim() ?? "";
  const ramSettingsDirty =
    launcherSettings != null && ramInputMb !== launcherSettings.maxRamMb;
  const javaSettingsDirty =
    launcherSettings != null && javaPathNormalized !== savedJavaPathNormalized;
  const gameDirectorySettingsDirty =
    launcherSettings != null &&
    gameDirectoryPathNormalized !== savedGameDirectoryPathNormalized;
  const launcherSettingsDirty =
    ramSettingsDirty || javaSettingsDirty || gameDirectorySettingsDirty;
  const ramInputLabel = `${ramInputMb} MB`;
  const currentVersionLabel = `v${appVersion}`;
  const serverStatusTone =
    serverStatusState.kind === "loading"
      ? "pending"
      : serverStatus?.state === "online"
        ? "online"
        : "offline";
  const serverStatusText =
    serverStatusState.kind === "loading"
      ? "Server"
      : serverStatus?.state === "online"
        ? "Server online"
        : "Server offline";
  const serverStatusTitle =
    serverStatusState.kind === "loading"
      ? "Zjišťuji stav serveru"
      : serverStatusState.kind === "error"
        ? serverStatusState.message
        : serverStatus?.latencyMs != null
          ? `${serverStatus.message} Odezva ${serverStatus.latencyMs} ms.`
          : (serverStatus?.message ?? "Server teď není dostupný.");
  const resolvedGameDirectoryModeLabel =
    gameDirectoryPathNormalized.length > 0
      ? "Vlastní umístění"
      : gameDirectory?.resolvedLocationKind === "appDataRoaming"
        ? "Výchozí umístění"
        : "Výchozí umístění";

  function runWindowAction(
    action: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>,
  ) {
    try {
      void action(getCurrentWindow());
    } catch (error) {
      console.warn("Window action unavailable in this runtime.", error);
    }
  }

  function handleTitleBarMouseDown(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "[data-window-control='true'], [data-topbar-interactive='true']",
      )
    ) {
      return;
    }

    runWindowAction((appWindow) => appWindow.startDragging());
  }

  async function handleSaveOfflinePlayer() {
    setSavingPlayer(true);

    try {
      const status = await saveOfflinePlayerProfile(playerNameInput);
      setPlayerState({ kind: "ready", value: status });
      setPlayerNameInput(status.playerName ?? "");
    } catch (error: unknown) {
      setPlayerState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offline hráčský profil se nepodařilo uložit.",
      });
    } finally {
      setSavingPlayer(false);
    }
  }

  async function handleClearOfflinePlayer() {
    setSavingPlayer(true);

    try {
      const status = await clearOfflinePlayerProfile();
      setPlayerState({ kind: "ready", value: status });
      setPlayerNameInput("");
    } catch (error: unknown) {
      setPlayerState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offline hráčský profil se nepodařilo vymazat.",
      });
    } finally {
      setSavingPlayer(false);
    }
  }

  async function handlePrepareInstallation() {
    setPreparingInstallation(true);
    setInstallationProgress(null);

    try {
      const status = await prepareMinecraftInstallation();
      setInstallationState({ kind: "ready", value: status });
      await refreshInstallationStatus();
    } catch (error: unknown) {
      setInstallationState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Minecraft instalaci se nepodařilo připravit.",
      });
      void refreshLauncherErrorReport();
    } finally {
      setInstallationProgress(null);
      setPreparingInstallation(false);
    }
  }

  async function handleInstallManagedJavaRuntime(requiredJavaMajor: number) {
    setInstallingManagedJava(true);
    setLauncherDiagnosticsError(null);

    try {
      await installManagedJavaRuntime(requiredJavaMajor);
      const refreshedJava = await refreshJavaRuntime();
      return refreshedJava;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Spravovaný Java runtime se nepodařilo nainstalovat.";
      setLauncherDiagnosticsError(message);
      return null;
    } finally {
      setInstallingManagedJava(false);
      setJavaInstallProgress(null);
    }
  }

  async function handleSaveLauncherSettings() {
    setSavingSettings(true);

    try {
      const settings = await saveLauncherSettings(
        ramInputMb,
        javaPathInput.trim().length > 0 ? javaPathInput.trim() : null,
        gameDirectoryPathInput.trim().length > 0
          ? gameDirectoryPathInput.trim()
          : null,
      );
      setLauncherSettingsState({ kind: "ready", value: settings });
      setRamInputMb(settings.maxRamMb);
      setJavaPathInput(settings.javaExecutablePath ?? "");
      setGameDirectoryPathInput(settings.gameDirectoryPath ?? "");
      await Promise.all([
        refreshDirectoryInfo(),
        refreshGameLaunchStatus(),
        refreshInstallationStatus(),
        refreshJavaRuntime(),
      ]);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Nastavení launcheru se nepodařilo uložit.";
      setLauncherSettingsState({ kind: "error", message });
      void refreshLauncherErrorReport();
    } finally {
      setSavingSettings(false);
    }
  }

  async function handlePickGameDirectory() {
    setPickingGameDirectory(true);
    setGameDirectoryPickerError(null);

    try {
      const selectedPath = await pickGameDirectoryPath(
        gameDirectoryPathNormalized ||
          launcherSettings?.gameDirectoryPath ||
          gameDirectory?.nekaraGameDir,
      );

      if (selectedPath != null) {
        setGameDirectoryPathInput(selectedPath);
      }
    } catch (error: unknown) {
      setGameDirectoryPickerError(
        error instanceof Error
          ? error.message
          : "Výběr instalační složky se nepodařilo otevřít.",
      );
    } finally {
      setPickingGameDirectory(false);
    }
  }

  async function handleOpenMinecraftDirectory() {
    if (gameDirectory?.minecraftDir == null) {
      return;
    }

    setGameDirectoryPickerError(null);

    try {
      await openDirectoryInFileExplorer(gameDirectory.minecraftDir);
    } catch (error: unknown) {
      setGameDirectoryPickerError(
        error instanceof Error
          ? error.message
          : "Nepodařilo se otevřít herní složku v Průzkumníku.",
      );
    }
  }

  async function handleOpenLauncherLogs() {
    setLauncherDiagnosticsError(null);

    try {
      const info =
        launcherLogInfo ??
        (launcherLogState.kind === "loading"
          ? await refreshLauncherLogInfo()
          : null);

      if (info == null) {
        throw new Error("Cesta k logům launcheru není k dispozici.");
      }

      await openDirectoryInFileExplorer(info.logDir);
    } catch (error: unknown) {
      setLauncherDiagnosticsError(
        error instanceof Error
          ? error.message
          : "Složku s logy launcheru se nepodařilo otevřít.",
      );
    }
  }

  async function handleRefreshDiagnostics() {
    setLauncherDiagnosticsError(null);

    await Promise.allSettled([
      refreshGameLaunchStatus(),
      refreshLauncherLogInfo(),
      refreshLauncherErrorReport(),
      refreshJavaRuntime(),
      installationNeedsAttention
        ? refreshInstallationStatus()
        : Promise.resolve(),
    ]);
  }

  async function handleLaunchMinecraft() {
    setLaunchingGame(true);

    try {
      const status = await launchMinecraft();
      setGameLaunchState({ kind: "ready", value: status });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Minecraft se nepodařilo spustit.";
      setGameLaunchState({ kind: "error", message });
      void refreshLauncherErrorReport();
    } finally {
      setLaunchingGame(false);
    }
  }

  async function handlePrimaryAction() {
    let effectiveOfflinePlayer = offlinePlayer;
    if (playerState.kind === "loading") {
      effectiveOfflinePlayer = await refreshOfflinePlayerStatus();
    }

    if (effectiveOfflinePlayer?.state !== "ready") {
      await handleSaveOfflinePlayer();
      return;
    }

    let effectiveInstallationStatus = installationStatus;
    if (installationState.kind === "loading") {
      effectiveInstallationStatus = await refreshInstallationStatus();
    }

    if (effectiveInstallationStatus?.state !== "ready") {
      await handlePrepareInstallation();
      effectiveInstallationStatus = await refreshInstallationStatus();
      if (effectiveInstallationStatus.state !== "ready") {
        return;
      }
    }

    if (gameRunning) {
      return;
    }

    const currentInstallationStatus = effectiveInstallationStatus;
    if (currentInstallationStatus == null) {
      return;
    }

    let effectiveJavaRuntime = javaRuntime;
    if (javaState.kind === "loading") {
      try {
        effectiveJavaRuntime = await refreshJavaRuntime();
      } catch {
        return;
      }
    }

    let effectiveJavaCompatible =
      currentInstallationStatus.requiredJavaMajor == null
        ? (effectiveJavaRuntime?.detected ?? false)
        : (effectiveJavaRuntime?.majorVersion ?? 0) >=
          currentInstallationStatus.requiredJavaMajor;
    if (!effectiveJavaCompatible) {
      const requiredJavaMajor = currentInstallationStatus.requiredJavaMajor;
      if (requiredJavaMajor == null) {
        setLauncherDiagnosticsError(
          "Launcher nedokáže určit kompatibilní verzi Java runtime.",
        );
        return;
      }

      if (javaRuntime?.source !== "Custom path") {
        effectiveJavaRuntime =
          await handleInstallManagedJavaRuntime(requiredJavaMajor);
        if (effectiveJavaRuntime == null) {
          return;
        }
        effectiveJavaCompatible =
          currentInstallationStatus.requiredJavaMajor == null
            ? (effectiveJavaRuntime?.detected ?? false)
            : (effectiveJavaRuntime?.majorVersion ?? 0) >=
              currentInstallationStatus.requiredJavaMajor;
      }
    }

    if (!effectiveJavaCompatible) {
      return;
    }

    if (
      readinessCount === 5 ||
      effectiveInstallationStatus?.state === "ready"
    ) {
      await handleLaunchMinecraft();
      return;
    }
  }

  return (
    <main className="launcher-shell">
      <div className="launcher-frame">
        <section
          className="launcher-stage"
          aria-labelledby="launcher-title"
          style={{
            backgroundImage: wallpaperReady
              ? `linear-gradient(90deg, rgba(8, 8, 10, 0.96) 0%, rgba(8, 8, 10, 0.8) 32%, rgba(8, 8, 10, 0.2) 66%, rgba(8, 8, 10, 0.62) 100%), linear-gradient(180deg, rgba(8, 8, 10, 0.18), rgba(8, 8, 10, 0.82)), url(${launcherWallpaper})`
              : "linear-gradient(135deg, rgba(10, 10, 12, 0.98) 0%, rgba(22, 18, 12, 0.92) 42%, rgba(10, 10, 12, 0.98) 100%)",
          }}
        >
          <div className="stage-main">
            <header
              className="stage-topbar"
              data-tauri-drag-region="true"
              onMouseDown={handleTitleBarMouseDown}
            >
              <div
                className="stage-topbar__meta"
                data-topbar-interactive="true"
                data-tauri-drag-region="false"
              >
                <div className="topbar-brand">
                  <img src={launcherIcon} alt="" />
                  <span>Nekara Launcher</span>
                </div>

                <nav className="topbar-nav" aria-label="Navigace launcheru">
                  <button
                    type="button"
                    className={`topbar-nav-button ${
                      currentView === "home" ? "topbar-nav-button--active" : ""
                    }`}
                    aria-label="Domů"
                    aria-current={currentView === "home" ? "page" : undefined}
                    onClick={() => setCurrentView("home")}
                  >
                    <House size={17} />
                    <span>Domů</span>
                  </button>
                  <button
                    type="button"
                    className={`topbar-nav-button ${
                      currentView === "settings"
                        ? "topbar-nav-button--active"
                        : ""
                    }`}
                    aria-label="Nastavení"
                    aria-current={
                      currentView === "settings" ? "page" : undefined
                    }
                    onClick={() => setCurrentView("settings")}
                  >
                    <Settings2 size={17} />
                    <span>Nastavení</span>
                  </button>
                </nav>
              </div>

              <div
                className="window-bar__controls"
                aria-label="Ovládání okna"
                data-window-control="true"
                data-tauri-drag-region="false"
              >
                <button
                  type="button"
                  className="window-icon-button window-icon-button--minimize"
                  aria-label="Minimalizovat okno"
                  data-tauri-drag-region="false"
                  onClick={() =>
                    runWindowAction((appWindow) => appWindow.minimize())
                  }
                >
                  <Minus size={18} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  className="window-icon-button window-icon-button--close"
                  aria-label="Zavřít okno"
                  data-tauri-drag-region="false"
                  onClick={() =>
                    runWindowAction((appWindow) => appWindow.close())
                  }
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            {currentView === "home" ? (
              <>
                <section className="hero-panel">
                  <div className="hero-copy">
                    <h1 id="launcher-title" className="sr-only">
                      Nekara
                    </h1>
                    <img
                      className="hero-logo"
                      src={launcherLogo}
                      alt="Nekara"
                    />
                  </div>

                  <div className="hero-actions hero-actions--stacked">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => void handlePrimaryAction()}
                      disabled={
                        savingPlayer ||
                        preparingInstallation ||
                        installingManagedJava ||
                        launchingGame
                      }
                    >
                      {savingPlayer ||
                      preparingInstallation ||
                      installingManagedJava ||
                      launchingGame ? (
                        <LoaderCircle
                          size={22}
                          strokeWidth={2.6}
                          className="spin primary-action__icon"
                        />
                      ) : (
                        <Play
                          size={22}
                          strokeWidth={2.6}
                          className="primary-action__icon"
                        />
                      )}
                      <span className="primary-action__label">
                        {primaryButtonLabel}
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`server-status-pill server-status-pill--${serverStatusTone}`}
                      title={serverStatusTitle}
                      aria-label={serverStatusTitle}
                      onClick={() => void refreshServerStatus()}
                    >
                      <span className="server-status-pill__dot" />
                      <span>{serverStatusText}</span>
                    </button>

                    <section
                      className="progress-panel progress-panel--hero"
                      aria-label="Průběh přípravy hry"
                    >
                      <div className="progress-panel__header">
                        <span>{effectiveProgressPanelLabel}</span>
                        <span>{effectiveProgressPanelValue}</span>
                      </div>
                      <div className="progress-track" role="presentation">
                        <div
                          className="progress-track__fill"
                          style={{ width: `${effectiveProgressPanelPercent}%` }}
                        />
                      </div>
                    </section>
                  </div>
                </section>

                <section className="home-grid">
                  <section className="home-card home-card--player">
                    <div className="panel-heading">
                      <UserRound size={18} />
                      <span>Jméno ve hře</span>
                    </div>
                    <p className="home-card__lead">
                      Tohle jméno použije launcher při spuštění hry.
                    </p>
                    <label className="player-field">
                      <span className="player-field__label">Herní jméno</span>
                      <input
                        type="text"
                        maxLength={16}
                        value={playerNameInput}
                        onChange={(event) =>
                          setPlayerNameInput(event.target.value)
                        }
                        placeholder="Sem napiš své jméno"
                      />
                    </label>
                    <div className="player-field__actions">
                      <button
                        type="button"
                        className="inline-action"
                        onClick={() => void handleSaveOfflinePlayer()}
                        disabled={savingPlayer}
                      >
                        Uložit jméno
                      </button>
                      <button
                        type="button"
                        className="inline-action inline-action--muted"
                        onClick={() => void handleClearOfflinePlayer()}
                        disabled={savingPlayer}
                      >
                        Smazat jméno
                      </button>
                    </div>
                  </section>
                </section>
              </>
            ) : (
              <section className="settings-page">
                <div className="settings-page__header">
                  <div>
                    <p className="eyebrow">Nastavení</p>
                    <h2>Nastavení launcheru</h2>
                  </div>
                  <p className="settings-page__lead">
                    Jen pár věcí, které hráč opravdu potřebuje. Technické
                    detaily jsou schované níž pro případ, že něco zlobí.
                  </p>
                </div>

                <div
                  className="settings-status-strip"
                  aria-label="Rychlý stav launcheru"
                >
                  <div
                    className={`summary-icon-pill ${
                      readinessCount === 5 || gameRunning
                        ? "summary-icon-pill--ready"
                        : "summary-icon-pill--pending"
                    }`}
                  >
                    <Play size={17} />
                    <span>{quickGameStatus}</span>
                  </div>
                  <div
                    className={`summary-icon-pill ${
                      identityReady
                        ? "summary-icon-pill--ready"
                        : "summary-icon-pill--blocked"
                    }`}
                  >
                    <UserRound size={17} />
                    <span>{quickPlayerStatus}</span>
                  </div>
                  <div
                    className={`summary-icon-pill ${
                      quickSettingsStatus === "V pořádku"
                        ? "summary-icon-pill--ready"
                        : "summary-icon-pill--blocked"
                    }`}
                  >
                    <Settings2 size={17} />
                    <span>{quickSettingsStatus}</span>
                  </div>
                </div>

                <div className="settings-grid settings-grid--player">
                  <section className="settings-card settings-card--primary">
                    <div className="settings-card__header">
                      <div className="settings-card__title">
                        <HardDrive size={19} />
                        <h4>Hra</h4>
                      </div>
                    </div>
                    <p className="settings-card__lead">
                      Změň umístění instalace jen tehdy, když chceš mít Nekaru
                      na jiném disku.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">
                        {launcherSettingsState.message}
                      </p>
                    ) : (
                      <div className="settings-control-stack">
                        <div className="settings-path-picker">
                          <label className="settings-path-field">
                            <span>Umístění hry</span>
                            <input
                              type="text"
                              value={gameDirectoryPathInput}
                              onChange={(event) =>
                                updateGameDirectoryPathInput(event.target.value)
                              }
                              placeholder="Výchozí složka launcheru"
                              disabled={
                                launcherSettingsState.kind !== "ready" ||
                                savingSettings ||
                                pickingGameDirectory
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="icon-text-action settings-picker-button"
                            onClick={() => void handlePickGameDirectory()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              pickingGameDirectory
                            }
                          >
                            <FolderOpen size={16} />
                            <span>
                              {pickingGameDirectory ? "Otevírám..." : "Vybrat"}
                            </span>
                          </button>
                        </div>

                        {gameDirectoryPickerError && (
                          <p className="settings-error-note">
                            {gameDirectoryPickerError}
                          </p>
                        )}

                        <div className="settings-compact-meta">
                          <span>{resolvedGameDirectoryModeLabel}</span>
                          <span>
                            {gameDirectory?.minecraftDir ??
                              "Použije se vlastní složka launcheru."}
                          </span>
                        </div>

                        <div className="settings-actions-row">
                          <button
                            type="button"
                            className="icon-text-action"
                            onClick={() => void handleOpenMinecraftDirectory()}
                            disabled={gameDirectory?.minecraftDir == null}
                          >
                            <FolderOpen size={16} />
                            <span>Otevřít složku</span>
                          </button>
                          <button
                            type="button"
                            className="icon-text-action"
                            onClick={() => void handleSaveLauncherSettings()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              !launcherSettingsDirty
                            }
                          >
                            <Save size={16} />
                            <span>
                              {savingSettings ? "Ukládám..." : "Uložit"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-action"
                            aria-label="Vrátit změny umístění hry"
                            title="Vrátit změny"
                            onClick={() => {
                              if (launcherSettings != null) {
                                setGameDirectoryPathInput(
                                  launcherSettings.gameDirectoryPath ?? "",
                                );
                              } else {
                                void refreshLauncherSettings();
                              }
                            }}
                            disabled={savingSettings}
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="settings-card settings-card--primary">
                    <div className="settings-card__header">
                      <div className="settings-card__title">
                        <Cpu size={19} />
                        <h4>Výkon</h4>
                      </div>
                    </div>
                    <p className="settings-card__lead">
                      Doporučené nastavení nech launcheru. RAM měň jen při
                      zásecích nebo velkém modpacku.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">
                        {launcherSettingsState.message}
                      </p>
                    ) : (
                      <div className="settings-control-stack">
                        <div className="settings-inline-fields">
                          <label className="settings-slider-field">
                            <span>RAM pro hru</span>
                            <input
                              className="settings-slider"
                              type="range"
                              min={ramMinMb}
                              max={ramMaxMb}
                              step={ramStepMb}
                              value={ramInputMb}
                              onChange={(event) =>
                                updateRamInput(
                                  Number.parseInt(event.target.value, 10),
                                )
                              }
                              disabled={
                                launcherSettingsState.kind !== "ready" ||
                                savingSettings
                              }
                            />
                          </label>

                          <label className="settings-number-field">
                            <span>Hodnota</span>
                            <input
                              type="number"
                              min={ramMinMb}
                              max={ramMaxMb}
                              step={ramStepMb}
                              value={ramInputMb}
                              onChange={(event) =>
                                updateRamInput(
                                  Number.parseInt(
                                    event.target.value || "0",
                                    10,
                                  ),
                                )
                              }
                              disabled={
                                launcherSettingsState.kind !== "ready" ||
                                savingSettings
                              }
                            />
                          </label>
                        </div>

                        <div className="settings-compact-meta">
                          <span>{ramInputLabel}</span>
                          <span>
                            Nech rezervu i pro Windows a běžící aplikace.
                          </span>
                        </div>

                        <div className="settings-actions-row">
                          <button
                            type="button"
                            className="icon-text-action"
                            onClick={() => void handleSaveLauncherSettings()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              !launcherSettingsDirty
                            }
                          >
                            <Save size={16} />
                            <span>
                              {savingSettings ? "Ukládám..." : "Uložit"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-action"
                            aria-label="Vrátit změnu paměti"
                            title="Vrátit změny"
                            onClick={() => {
                              if (launcherSettings != null) {
                                setRamInputMb(launcherSettings.maxRamMb);
                              } else {
                                void refreshLauncherSettings();
                              }
                            }}
                            disabled={savingSettings}
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                <details className="settings-disclosure">
                  <summary>
                    <span>
                      <Wrench size={17} />
                      Pokročilé
                    </span>
                    <ChevronDown
                      size={17}
                      className="settings-disclosure__chevron"
                    />
                  </summary>

                  <section className="settings-card settings-card--subtle">
                    <div className="settings-card__header">
                      <div className="settings-card__title">
                        <Settings2 size={18} />
                        <h4>Java runtime</h4>
                      </div>
                    </div>
                    <p className="settings-card__lead">
                      Nech prázdné, pokud launcher nemá používat konkrétní
                      instalaci Javy.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">
                        {launcherSettingsState.message}
                      </p>
                    ) : (
                      <div className="settings-control-stack">
                        <label className="settings-path-field">
                          <span>Vlastní Java</span>
                          <input
                            type="text"
                            value={javaPathInput}
                            onChange={(event) =>
                              updateJavaPathInput(event.target.value)
                            }
                            placeholder="Automatický výběr"
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings
                            }
                          />
                        </label>

                        <div className="settings-compact-meta">
                          <span>
                            {javaPathNormalized.length > 0
                              ? "Vlastní cesta"
                              : "Automaticky"}
                          </span>
                          <span>
                            {javaRuntime?.message ??
                              "Launcher vybere Javu při přípravě nebo spuštění hry."}
                          </span>
                        </div>

                        {installingManagedJava && (
                          <div className="progress-panel progress-panel--hero">
                            <div className="progress-panel__header">
                              <span>{effectiveProgressPanelLabel}</span>
                              <span>{effectiveProgressPanelValue}</span>
                            </div>
                            <div className="progress-track" role="presentation">
                              <div
                                className="progress-track__fill"
                                style={{
                                  width: `${effectiveProgressPanelPercent}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="settings-actions-row">
                          {javaPathNormalized.length === 0 &&
                            installationStatus?.requiredJavaMajor != null && (
                              <button
                                type="button"
                                className="icon-text-action"
                                onClick={() =>
                                  void handleInstallManagedJavaRuntime(
                                    installationStatus.requiredJavaMajor!,
                                  )
                                }
                                disabled={
                                  launcherSettingsState.kind !== "ready" ||
                                  savingSettings ||
                                  installingManagedJava
                                }
                              >
                                <Cpu size={16} />
                                <span>
                                  {installingManagedJava
                                    ? "Instaluji..."
                                    : "Nainstalovat Javu"}
                                </span>
                              </button>
                            )}
                          <button
                            type="button"
                            className="icon-text-action"
                            onClick={() => void handleSaveLauncherSettings()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              !launcherSettingsDirty
                            }
                          >
                            <Save size={16} />
                            <span>
                              {savingSettings ? "Ukládám..." : "Uložit"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-action"
                            aria-label="Vrátit změnu Java runtime"
                            title="Vrátit změny"
                            onClick={() => {
                              if (launcherSettings != null) {
                                setJavaPathInput(
                                  launcherSettings.javaExecutablePath ?? "",
                                );
                              } else {
                                void refreshLauncherSettings();
                              }
                            }}
                            disabled={savingSettings}
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </details>

                <details className="settings-disclosure settings-disclosure--support">
                  <summary>
                    <span>
                      <Wrench size={17} />
                      Oprava a podpora
                    </span>
                    <ChevronDown
                      size={17}
                      className="settings-disclosure__chevron"
                    />
                  </summary>

                  <section className="settings-card settings-card--subtle">
                    <div className="settings-support-grid">
                      <div>
                        <h4>Stav hry</h4>
                        {launchBlockerItems.length === 0 ? (
                          <p className="settings-helper-text">
                            Všechno důležité je připravené.
                          </p>
                        ) : (
                          <ul className="settings-checklist settings-checklist--compact">
                            {launchBlockerItems.map((item, index) => (
                              <li
                                key={`${index}-${item}`}
                                className="settings-checkline"
                              >
                                <span className="settings-checkline__label">
                                  {item}
                                </span>
                                <span className="settings-checkline__value">
                                  Nutné
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <h4>Launcher</h4>
                        {launcherStatusState.kind === "error" ? (
                          <p className="settings-error-note">
                            {launcherStatusState.message}
                          </p>
                        ) : launcherStatusState.kind === "loading" ? (
                          <p className="settings-helper-text">
                            Načítám stav launcheru...
                          </p>
                        ) : (
                          <ul className="settings-checklist settings-checklist--compact">
                            {launcherStatus?.checks.map((check) => (
                              <li
                                key={check.id}
                                className={`settings-checkline settings-checkline--${check.state}`}
                              >
                                <span className="settings-checkline__label">
                                  {check.label}
                                </span>
                                <span className="settings-checkline__value">
                                  {launcherCheckStateLabel[check.state]}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {(diagnosticSummary != null ||
                      diagnosticFix != null ||
                      diagnosticLogPath != null ||
                      launcherDiagnosticsError != null ||
                      launcherLogState.kind === "error") && (
                      <div className="settings-diagnostics settings-diagnostics--compact">
                        {diagnosticSummary && (
                          <div className="settings-diagnostics__section">
                            <p className="settings-checkline__label">
                              Co se stalo
                            </p>
                            <p className="settings-helper-text">
                              {diagnosticSummary}
                            </p>
                          </div>
                        )}
                        {diagnosticFix && (
                          <div className="settings-diagnostics__section">
                            <p className="settings-checkline__label">
                              Doporučený krok
                            </p>
                            <p className="settings-helper-text">
                              {diagnosticFix}
                            </p>
                          </div>
                        )}
                        {diagnosticLogPath && (
                          <div className="settings-diagnostics__section">
                            <p className="settings-checkline__label">Log</p>
                            <p className="settings-helper-text">
                              {diagnosticLogPath}
                            </p>
                          </div>
                        )}
                        {diagnosticErrorReportPath && (
                          <div className="settings-diagnostics__section">
                            <p className="settings-checkline__label">
                              Error report
                            </p>
                            <p className="settings-helper-text">
                              {diagnosticErrorReportPath}
                            </p>
                          </div>
                        )}
                        {launcherLogState.kind === "error" && (
                          <p className="settings-error-note">
                            {launcherLogState.message}
                          </p>
                        )}
                        {launcherDiagnosticsError && (
                          <p className="settings-error-note">
                            {launcherDiagnosticsError}
                          </p>
                        )}
                        {diagnosticLogExcerpt && (
                          <div className="diagnostic-log-block">
                            <p className="settings-checkline__label">
                              Poslední řádky logu
                            </p>
                            <pre className="diagnostic-log">
                              {diagnosticLogExcerpt}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="settings-actions-row">
                      <button
                        type="button"
                        className="icon-text-action"
                        onClick={() => void refreshLauncherErrorReport()}
                      >
                        <Wrench size={16} />
                        <span>Vygenerovat error log</span>
                      </button>
                      <button
                        type="button"
                        className="icon-text-action"
                        onClick={() => void handleRefreshDiagnostics()}
                      >
                        <RotateCcw size={16} />
                        <span>Obnovit stav</span>
                      </button>
                      <button
                        type="button"
                        className="icon-text-action"
                        onClick={() => void handleOpenLauncherLogs()}
                      >
                        <FolderOpen size={16} />
                        <span>Otevřít logy</span>
                      </button>
                      <span className="settings-version-label">
                        {currentVersionLabel}
                      </span>
                    </div>
                  </section>
                </details>
              </section>
            )}
          </div>
        </section>
      </div>
      {startupUpdateNotice?.available && (
        <div
          className="launcher-update-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="launcher-update-title"
        >
          <section className="launcher-update-dialog">
            <div className="launcher-update-dialog__eyebrow">
              <LoaderCircle
                size={16}
                strokeWidth={2.4}
                className="spin launcher-update-dialog__icon"
              />
              <span>Aktualizace launcheru</span>
            </div>
            <h2 id="launcher-update-title">
              Stahuji verzi {startupUpdateNotice.version}
            </h2>
            <p className="launcher-update-dialog__lead">
              Launcher našel novější verzi a teď ji stáhne a nainstaluje. Po
              dokončení se sám restartuje.
            </p>
            {startupUpdateNotice.body && (
              <div className="launcher-update-dialog__body">
                {startupUpdateNotice.body}
              </div>
            )}
            <p className="settings-helper-text">
              Prosím launcher nevypínej, dokud se nevrátí zpět.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
