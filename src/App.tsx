import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  FolderOpen,
  House,
  LoaderCircle,
  Minimize2,
  Play,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageInfo from "../package.json";
import launcherIcon from "../src-tauri/icons/64x64.png";
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
  getMinecraftInstallationProgress,
  getMinecraftInstallationStatus,
  getOfflinePlayerStatus,
  launchMinecraft,
  openDirectoryInFileExplorer,
  pickGameDirectoryPath,
  prepareMinecraftInstallation,
  saveLauncherSettings,
  saveOfflinePlayerProfile,
} from "./services/launcher";
import { runAutomaticLauncherUpdateOnStartup } from "./services/updater";
import type {
  GameDirectoryInfo,
  GameLaunchStatus,
  JavaRuntimeCheck,
  LauncherLogInfo,
  LauncherStatus,
  LauncherUpdateStatus,
  LauncherSettings,
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

  async function refreshOfflinePlayerStatus() {
    try {
      const status = await getOfflinePlayerStatus();
      setPlayerState({ kind: "ready", value: status });
      setPlayerNameInput(status.playerName ?? "");
    } catch (error: unknown) {
      setPlayerState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offline profil hráče není k dispozici.",
      });
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
    let animationFrameId = 0;
    const timers: number[] = [];
    const cleanups: Array<() => void> = [];

    animationFrameId = window.requestAnimationFrame(() => {
      timers.push(
        window.setTimeout(() => {
          void refreshOfflinePlayerStatus();
        }, 120),
      );
      timers.push(
        window.setTimeout(() => {
          void refreshGameLaunchStatus();
        }, 360),
      );
      timers.push(
        window.setTimeout(() => {
          void refreshLauncherStatus();
        }, 420),
      );
      timers.push(
        window.setTimeout(() => {
          void refreshLauncherLogInfo();
        }, 540),
      );
      cleanups.push(
        scheduleBackgroundWork(() => {
          setWallpaperReady(true);
        }, 900),
      );
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
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
  }, [currentView, launcherSettingsState.kind, directoryState.kind]);

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
  const hasDiagnosticDetails =
    diagnosticSummary != null ||
    diagnosticFix != null ||
    diagnosticLogExcerpt != null ||
    launcherDiagnosticsError != null ||
    launcherLogState.kind === "error";
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
    launchBlockerItems.push("Nainstaluj nebo vyber kompatibilní Java runtime.");
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
  const progressPanelValue =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? `${installOperationPercent}%`
      : readinessCount === 5
        ? "Všechno je připravené"
        : readinessCount >= 3
          ? "Už jen pár kroků"
          : "Připravuji hru";
  const progressPanelPercent =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? installOperationPercent
      : readinessPercent;
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
    preparingInstallation && installationProgress?.currentStep != null
      ? installationProgress.currentStep
      : progressPanelLabel;
  const effectiveProgressPanelValue =
    hasLiveDownloadProgress && liveRemainingText != null
      ? liveSpeedText == null
        ? liveRemainingText
        : `${liveRemainingText} · ${liveSpeedText}`
      : progressPanelValue;
  const effectiveProgressPanelPercent = hasLiveDownloadProgress
    ? liveDownloadPercent
    : progressPanelPercent;

  const primaryButtonLabel = !identityReady
    ? "Uložit jméno"
    : gameRunning
      ? "Hra běží"
      : launchingGame
        ? "Spouštím hru..."
        : preparingInstallation
          ? "Připravuji hru..."
          : installationState.kind === "loading"
            ? "Zkontrolovat hru"
            : !installationReady
              ? "Připravit hru"
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
    if (target?.closest("[data-window-control='true']")) {
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
    } finally {
      setInstallationProgress(null);
      setPreparingInstallation(false);
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
    } finally {
      setLaunchingGame(false);
    }
  }

  async function handlePrimaryAction() {
    if (!identityReady) {
      await handleSaveOfflinePlayer();
      return;
    }

    let effectiveInstallationStatus = installationStatus;
    if (installationState.kind === "loading") {
      effectiveInstallationStatus = await refreshInstallationStatus();
    }

    if (effectiveInstallationStatus?.state !== "ready") {
      await handlePrepareInstallation();
      return;
    }

    if (gameRunning) {
      return;
    }

    let effectiveJavaCompatible = javaCompatible;
    if (
      !javaCompatible &&
      (javaState.kind === "loading" || javaState.kind === "error")
    ) {
      const refreshedJava = await refreshJavaRuntime();
      effectiveJavaCompatible =
        effectiveInstallationStatus?.requiredJavaMajor == null
          ? refreshedJava.detected
          : (refreshedJava.majorVersion ?? 0) >=
            effectiveInstallationStatus.requiredJavaMajor;
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
          <aside className="launcher-rail" aria-label="Navigace launcheru">
            <div className="rail-logo">
              <img src={launcherIcon} alt="Nekara icon" />
            </div>
            <button
              type="button"
              className={`rail-button ${currentView === "home" ? "rail-button--active" : ""}`}
              aria-label="Domů"
              onClick={() => setCurrentView("home")}
            >
              <House size={18} />
            </button>
            <button
              type="button"
              className={`rail-button ${currentView === "settings" ? "rail-button--active" : ""}`}
              aria-label="Nastavení"
              onClick={() => setCurrentView("settings")}
            >
              <Settings2 size={18} />
            </button>
          </aside>

          <div className="stage-main">
            <header
              className="stage-topbar"
              data-tauri-drag-region="true"
              onMouseDown={handleTitleBarMouseDown}
            >
              <div className="stage-topbar__meta" />

              <div
                className="window-bar__controls"
                aria-label="Ovládání okna"
                data-window-control="true"
                data-tauri-drag-region="false"
              >
                <button
                  type="button"
                  className="window-icon-button"
                  aria-label="Minimalizovat okno"
                  data-tauri-drag-region="false"
                  onClick={() =>
                    runWindowAction((appWindow) => appWindow.minimize())
                  }
                >
                  <Minimize2 size={14} />
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
                    <h1 id="launcher-title">Nekara</h1>
                  </div>

                  <div className="hero-actions hero-actions--stacked">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => void handlePrimaryAction()}
                      disabled={
                        savingPlayer || preparingInstallation || launchingGame
                      }
                    >
                      {savingPlayer ||
                      preparingInstallation ||
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

                {(hasDiagnosticDetails ||
                  launchFailed ||
                  installationNeedsAttention) && (
                  <section className="home-card home-card--diagnostic">
                    <div className="panel-heading">
                      <Settings2 size={18} />
                      <span>Diagnostika</span>
                    </div>
                    <p className="home-card__lead">
                      {launchFailed
                        ? "Spuštění se zastavilo dřív, než se Minecraft otevřel. Tady je přesný důvod i další krok."
                        : installationNeedsAttention
                          ? "Instalace ještě není kompletní. Launcher ti ukáže, co chybí a co má smysl udělat dál."
                          : "Launcher si drží po ruce cestu k logům a poslední stav kontroly pro rychlé řešení potíží."}
                    </p>

                    <dl className="settings-diagnostics">
                      {diagnosticSummary && (
                        <div>
                          <dt>Co se stalo</dt>
                          <dd>{diagnosticSummary}</dd>
                        </div>
                      )}
                      {diagnosticFix && (
                        <div>
                          <dt>Doporučený krok</dt>
                          <dd>{diagnosticFix}</dd>
                        </div>
                      )}
                      {diagnosticLogPath && (
                        <div>
                          <dt>Log soubor</dt>
                          <dd>{diagnosticLogPath}</dd>
                        </div>
                      )}
                    </dl>

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

                    <div className="profile-card__actions">
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => void handleRefreshDiagnostics()}
                      >
                        Obnovit stav
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => void handleOpenLauncherLogs()}
                      >
                        Otevřít logy
                      </button>
                    </div>
                  </section>
                )}

                <section className="home-card home-card--status">
                  <div className="panel-heading">
                    <Settings2 size={18} />
                    <span>Stav launcheru</span>
                  </div>
                  <p className="home-card__lead">
                    Tohle je rychlý přehled toho, co launcher už umí a co ještě
                    čeká na dokončení.
                  </p>

                  {launcherStatusState.kind === "error" ? (
                    <p className="settings-error-note">
                      {launcherStatusState.message}
                    </p>
                  ) : launcherStatusState.kind === "loading" ? (
                    <p className="settings-helper-text">
                      Načítám stav launcheru...
                    </p>
                  ) : (
                    <ul className="settings-checklist">
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
                </section>

                <section className="home-card home-card--readiness">
                  <div className="panel-heading">
                    <Play size={18} />
                    <span>Co chybí k hraní</span>
                  </div>
                  <p className="home-card__lead">
                    Tady je přehled toho, co ještě brání spuštění. Jedno
                    tlačítko tě pošle buď na opravu, nebo rovnou do hry.
                  </p>

                  {launchBlockerItems.length === 0 ? (
                    <p className="settings-helper-text">
                      Všechno je připravené. Můžeš spustit hru.
                    </p>
                  ) : (
                    <ul className="settings-checklist">
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

                  <div className="profile-card__actions">
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => void handlePrimaryAction()}
                      disabled={
                        savingPlayer || preparingInstallation || launchingGame
                      }
                    >
                      {launchBlockerItems.length === 0
                        ? "Hrát"
                        : "Opravit a pokračovat"}
                    </button>
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
                    <h2>Všechno důležité na jednom místě</h2>
                  </div>
                  <p className="settings-page__lead">
                    Jen to, co dává smysl měnit. Bez zbytečné technické omáčky.
                  </p>
                </div>

                <div className="settings-grid">
                  <section className="settings-card">
                    <div className="settings-card__header">
                      <h4>Kam se hra uloží</h4>
                    </div>
                    <p className="settings-card__lead">
                      Tady vybereš složku pro Nekaru, aby zůstala oddělená od
                      běžného Minecraftu.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">
                        {launcherSettingsState.message}
                      </p>
                    ) : (
                      <div className="settings-control-stack">
                        <div className="settings-path-picker">
                          <label className="settings-path-field">
                            <span>Herní složka</span>
                            <input
                              type="text"
                              value={gameDirectoryPathInput}
                              onChange={(event) =>
                                updateGameDirectoryPathInput(event.target.value)
                              }
                              placeholder="D:\\Games\\Nekara"
                              disabled={
                                launcherSettingsState.kind !== "ready" ||
                                savingSettings ||
                                pickingGameDirectory
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="text-action settings-picker-button"
                            onClick={() => void handlePickGameDirectory()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              pickingGameDirectory
                            }
                          >
                            <FolderOpen size={16} />
                            <span>
                              {pickingGameDirectory
                                ? "Otevírám..."
                                : "Vybrat složku"}
                            </span>
                          </button>
                        </div>

                        {gameDirectoryPickerError && (
                          <p className="settings-error-note">
                            {gameDirectoryPickerError}
                          </p>
                        )}

                        <div className="settings-inline-meta">
                          <span className="settings-value-chip">
                            {resolvedGameDirectoryModeLabel}
                          </span>
                          <span className="settings-helper-text">
                            Když to necháš prázdné, hra se uloží do vlastní
                            složky <code>AppData\Roaming\Nekara</code>. Pokud
                            chceš, můžeš jí vybrat i jiné místo. Starší
                            instalace z původního umístění se přesunou
                            automaticky.
                          </span>
                        </div>

                        <div className="settings-inline-meta">
                          <span className="settings-value-chip">
                            Verze aplikace
                          </span>
                          <span className="settings-helper-text">
                            {currentVersionLabel}
                          </span>
                        </div>

                        {gameDirectory?.minecraftDir && (
                          <div className="settings-inline-meta">
                            <span className="settings-value-chip">
                              Používaná složka
                            </span>
                            <span className="settings-helper-text">
                              {gameDirectory.minecraftDir}
                            </span>
                          </div>
                        )}

                        <div className="profile-card__actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => void handleOpenMinecraftDirectory()}
                            disabled={gameDirectory?.minecraftDir == null}
                          >
                            Otevřít složku
                          </button>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => void handleSaveLauncherSettings()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              !launcherSettingsDirty
                            }
                          >
                            {savingSettings ? "Ukládám..." : "Uložit"}
                          </button>
                          <button
                            type="button"
                            className="text-action"
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
                            Vrátit změny
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="settings-card">
                    <div className="settings-card__header">
                      <h4>Paměť pro hru</h4>
                    </div>
                    <p className="settings-card__lead">
                      Tady určíš, kolik paměti může Nekara při spuštění použít.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">
                        {launcherSettingsState.message}
                      </p>
                    ) : (
                      <div className="settings-control-stack">
                        <div className="settings-inline-fields">
                          <label className="settings-slider-field">
                            <span>Kolik paměti může hra použít</span>
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
                            <span>Vybraná hodnota</span>
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

                        <div className="settings-inline-meta">
                          <span className="settings-value-chip">
                            {ramInputLabel}
                          </span>
                          <span className="settings-helper-text">
                            Vyšší hodnota může pomoct větším modům, ale nech
                            něco i pro zbytek počítače.
                          </span>
                        </div>

                        <div className="profile-card__actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => void handleSaveLauncherSettings()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              !launcherSettingsDirty
                            }
                          >
                            {savingSettings ? "Ukládám..." : "Uložit paměť"}
                          </button>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => {
                              if (launcherSettings != null) {
                                setRamInputMb(launcherSettings.maxRamMb);
                              } else {
                                void refreshLauncherSettings();
                              }
                            }}
                            disabled={savingSettings}
                          >
                            Vrátit změny
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="settings-card">
                    <div className="settings-card__header">
                      <h4>Java</h4>
                    </div>
                    <p className="settings-card__lead">
                      Ve většině případů to můžeš nechat prázdné. Vyplň to jen
                      tehdy, když chceš launcheru ukázat vlastní Javu ručně.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">
                        {launcherSettingsState.message}
                      </p>
                    ) : (
                      <div className="settings-control-stack">
                        <label className="settings-path-field">
                          <span>Vlastní Java (volitelné)</span>
                          <input
                            type="text"
                            value={javaPathInput}
                            onChange={(event) =>
                              updateJavaPathInput(event.target.value)
                            }
                            placeholder="C:\\Program Files\\Java\\bin\\java.exe"
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings
                            }
                          />
                        </label>

                        <div className="settings-inline-meta">
                          <span className="settings-value-chip">
                            {javaPathNormalized.length > 0
                              ? "Vlastní Java"
                              : "Automatický výběr"}
                          </span>
                          <span className="settings-helper-text">
                            Když sem cestu nevyplníš, launcher zkusí Javu najít
                            sám.
                          </span>
                        </div>

                        <div className="profile-card__actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => void handleSaveLauncherSettings()}
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings ||
                              !launcherSettingsDirty
                            }
                          >
                            {savingSettings ? "Ukládám..." : "Uložit Javu"}
                          </button>
                          <button
                            type="button"
                            className="text-action"
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
                            Vrátit změny
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
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
