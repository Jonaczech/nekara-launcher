import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Cpu,
  Database,
  Download,
  FolderCog,
  FolderOpen,
  Gauge,
  Gem,
  HardDrive,
  Home,
  LoaderCircle,
  MessageCircle,
  Minus,
  Newspaper,
  Play,
  RotateCcw,
  Save,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageInfo from "../package.json";
import launcherIcon from "../brand/icons/ikona2.png";
import launcherLogo from "../brand/logos/Logo3.png";
import launcherWallpaper from "../brand/wallpapers/wallpaper novy.png";
import "./App.css";
import "./styles/tokens.css";
import {
  ArcanePanel,
  ProgressBar,
  RuneIcon,
  SectionTitle,
} from "./components/ArcaneUi";
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

type ViewId = "home" | "news" | "account" | "settings" | "repair" | "support";

const appVersion = packageInfo.version;
const bytesInMegabyte = 1024 * 1024;

interface PlayerAvatarProps {
  playerName: string | null | undefined;
  className?: string;
}

function PlayerAvatar({ playerName, className = "" }: PlayerAvatarProps) {
  const name = playerName?.trim() ?? "";
  const initial = name.length > 0 ? name.slice(0, 1).toUpperCase() : null;
  const skinUrl =
    name.length > 0
      ? `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64`
      : null;

  return (
    <span className={`player-avatar ${className}`.trim()} aria-hidden="true">
      {initial ? (
        <span className="player-avatar__fallback">{initial}</span>
      ) : (
        <UserRound className="player-avatar__fallback-icon" size={20} />
      )}
      {skinUrl && (
        <img
          src={skinUrl}
          alt=""
          className="player-avatar__skin"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  );
}

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
  const [currentView, setCurrentView] = useState<ViewId>("home");
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
  const quickSettingsStatus =
    hasJavaRuntimeBlocker || launchBlockerItems.length > 0
      ? "Zkontrolovat"
      : "V pořádku";

  const primaryButtonLabel =
    playerState.kind === "loading" && playerNameInput.trim().length === 0
      ? "HRÁT"
      : !identityReady
        ? "ULOŽIT JMÉNO"
        : gameRunning
          ? "HRA BĚŽÍ"
          : installingManagedJava
            ? "INSTALUJI JAVU"
            : launchingGame
              ? "OTEVÍRÁM BRÁNU"
              : preparingInstallation
                ? "PŘÍPRAVA CESTY"
                : installationState.kind === "loading"
                  ? "OVĚŘIT HRU"
                  : !installationReady
                    ? "AKTUALIZOVAT"
                    : !javaCompatible
                      ? "PŘIPRAVIT JAVU A HRÁT"
                      : readinessCount === 5
                        ? "HRÁT"
                        : "DOKONČIT PŘÍPRAVU";

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
      void refreshLauncherErrorReport();
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

  const navigationItems = [
    { id: "home", label: "Domů", icon: Home },
    { id: "news", label: "Novinky", icon: Newspaper },
    { id: "account", label: "Účet", icon: UserRound },
    { id: "settings", label: "Nastavení", icon: Settings2 },
    { id: "support", label: "Podpora", icon: CircleHelp },
  ] as const;

  const statusMessage = gameRunning
    ? "HERNÍ RELACE JE AKTIVNÍ"
    : preparingInstallation
      ? "STAHOVÁNÍ A OVĚŘOVÁNÍ SOUBORŮ"
      : installingManagedJava
        ? "PŘÍPRAVA JAVA RUNTIME"
        : installationReady && identityReady && javaCompatible
          ? "PŘIPRAVEN K DOBRODRUŽSTVÍ"
          : "KONTROLA INSTALACE ČEKÁ";

  const isBusy =
    preparingInstallation ||
    installingManagedJava ||
    launchingGame ||
    gameRunning;

  return (
    <main className="launcher-shell">
      <div
        className={
          "world-backdrop" + (wallpaperReady ? " world-backdrop--ready" : "")
        }
        style={{
          backgroundImage: wallpaperReady
            ? `url("${launcherWallpaper}")`
            : undefined,
        }}
        aria-hidden="true"
      />
      <div className="world-backdrop__veil" aria-hidden="true" />

      <div className="launcher-frame">
        <header
          className="window-bar"
          data-tauri-drag-region
          onMouseDown={handleTitleBarMouseDown}
        >
          <div className="window-bar__brand">
            <img className="window-bar__icon" src={launcherIcon} alt="" />
            <span>Nekara Launcher</span>
            <span className="window-bar__version">{currentVersionLabel}</span>
          </div>

          <div className="window-bar__controls" data-topbar-interactive="true">
            <button
              type="button"
              className="window-control"
              data-window-control="true"
              aria-label="Minimalizovat okno"
              title="Minimalizovat"
              onClick={() =>
                runWindowAction((appWindow) => appWindow.minimize())
              }
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="window-control window-control--close"
              data-window-control="true"
              aria-label="Zavřít launcher"
              title="Zavřít"
              onClick={() => runWindowAction((appWindow) => appWindow.close())}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="launcher-layout">
          <aside className="side-rail" aria-label="Hlavní navigace">
            <button
              type="button"
              className="side-rail__crest"
              onClick={() => setCurrentView("account")}
              aria-label="Otevřít účet hráče"
              data-topbar-interactive="true"
            >
              <PlayerAvatar playerName={offlinePlayer?.playerName} />
            </button>
            <button
              type="button"
              className="side-rail__profile-name"
              onClick={() => setCurrentView("account")}
              aria-label="Otevřít účet hráče"
            >
              {offlinePlayer?.playerName ?? "Profil není nastaven"}
            </button>

            <nav className="side-navigation">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    "side-navigation__item" +
                    (currentView === item.id
                      ? " side-navigation__item--active"
                      : "")
                  }
                  onClick={() => setCurrentView(item.id)}
                  aria-current={currentView === item.id ? "page" : undefined}
                >
                  <RuneIcon icon={item.icon} active={currentView === item.id} />
                  <span>{item.label}</span>
                  {currentView === item.id && <i aria-hidden="true" />}
                </button>
              ))}
            </nav>

            <div className="side-rail__server">
              <div className="side-rail__server-heading">
                <span
                  className={"status-orb status-orb--" + serverStatusTone}
                  aria-hidden="true"
                />
                <div>
                  <small>BRÁNA NEKARY</small>
                  <strong>{serverStatusText}</strong>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Verze</dt>
                  <dd>{installationStatus?.targetVersion ?? "26.1.2"}</dd>
                </div>
                <div>
                  <dt>Ping</dt>
                  <dd>
                    {serverStatus?.latencyMs != null
                      ? `${serverStatus.latencyMs} ms`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Hráči</dt>
                  <dd>
                    {serverStatus?.playersOnline != null
                      ? `${serverStatus.playersOnline} / ${serverStatus.playersMax ?? "—"}`
                      : "— / —"}
                  </dd>
                </div>
              </dl>
              <p className="side-rail__server-note">
                {installationReady
                  ? "Klient Nekary je připraven."
                  : "Klient čeká na kontrolu."}
              </p>
              <button
                type="button"
                className="rail-refresh"
                onClick={() => void refreshServerStatus()}
                title={serverStatusTitle}
              >
                <RotateCcw size={13} />
                Obnovit
              </button>
            </div>
          </aside>

          <section className="content-region">
            <div className="content-scroll">
              {currentView === "home" && (
                <section className="home-view" aria-labelledby="launcher-title">
                  <div className="hero">
                    <div className="hero__ornament" aria-hidden="true">
                      <span />
                      <Gem size={16} />
                      <span />
                    </div>
                    <img
                      className="hero__logo"
                      src={launcherLogo}
                      alt="Nekara"
                      draggable={false}
                    />
                    <p className="hero__eyebrow">VÍTEJ ZPĚT, CESTOVATELI</p>
                    <h1 id="launcher-title">
                      Připraven vstoupit do světa Nekary?
                    </h1>
                    <p className="hero__lead">
                      Za kamennými hradbami čeká nový příběh. Připrav svou
                      výbavu a otevři bránu do Nekary.
                    </p>

                    <button
                      type="button"
                      className={
                        "gate-button" + (isBusy ? " gate-button--busy" : "")
                      }
                      onClick={() => void handlePrimaryAction()}
                      disabled={isBusy}
                    >
                      <span className="gate-button__wing gate-button__wing--left" />
                      <span className="gate-button__crystal" aria-hidden="true">
                        <Gem size={18} />
                      </span>
                      {(launchingGame ||
                        preparingInstallation ||
                        installingManagedJava) && (
                        <LoaderCircle className="spin" size={22} />
                      )}
                      <strong>{primaryButtonLabel}</strong>
                      <span className="gate-button__crystal" aria-hidden="true">
                        <Gem size={18} />
                      </span>
                      <span className="gate-button__wing gate-button__wing--right" />
                    </button>

                    {gameLaunchState.kind === "error" && (
                      <div
                        className="inline-alert inline-alert--danger"
                        role="alert"
                      >
                        <TriangleAlert size={16} />
                        <span>{gameLaunchState.message}</span>
                      </div>
                    )}
                    {launcherDiagnosticsError && (
                      <div
                        className="inline-alert inline-alert--danger"
                        role="alert"
                      >
                        <TriangleAlert size={16} />
                        <span>{launcherDiagnosticsError}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {currentView === "news" && (
                <section className="page-view">
                  <SectionTitle
                    eyebrow="NOVINKY ZE SVĚTA"
                    title="Kronika Nekary"
                    description="Důležité zprávy o launcheru, herním klientu a připravovaném světě."
                    icon={Newspaper}
                  />
                  <div className="news-grid news-grid--page">
                    <ArcanePanel
                      as="article"
                      className="news-card news-card--featured"
                    >
                      <div className="news-card__image news-card__image--world" />
                      <div className="news-card__body">
                        <span className="news-card__meta">VÝVOJ LAUNCHERU</span>
                        <h3>Nová brána do světa Nekary</h3>
                        <p>
                          Launcher dostává nový arkánně-gotický vzhled, který
                          propojuje logo, svět i každodenní cestu hráče.
                        </p>
                      </div>
                    </ArcanePanel>
                    <ArcanePanel as="article" className="news-card">
                      <div className="news-card__rune">
                        <ShieldCheck size={28} />
                      </div>
                      <div className="news-card__body">
                        <span className="news-card__meta">HERNÍ KLIENT</span>
                        <h3>Jedna ověřená konfigurace</h3>
                        <p>
                          Nekara používá jediný spravovaný Fabric klient pro
                          Minecraft 26.1.2 a před spuštěním kontroluje jeho
                          stav.
                        </p>
                      </div>
                    </ArcanePanel>
                    <ArcanePanel as="article" className="news-card">
                      <div className="news-card__rune">
                        <Sparkles size={28} />
                      </div>
                      <div className="news-card__body">
                        <span className="news-card__meta">KOMUNITA</span>
                        <h3>Společný příběh teprve začíná</h3>
                        <p>
                          Komunitní odkazy budou aktivovány, jakmile budou
                          bezpečně nakonfigurované v launcheru.
                        </p>
                      </div>
                    </ArcanePanel>
                  </div>
                </section>
              )}

              {currentView === "account" && (
                <section className="page-view">
                  <SectionTitle
                    eyebrow="IDENTITA HRÁČE"
                    title="Profil cestovatele"
                    description="Jméno se ukládá lokálně a launcher ho použije při spuštění Nekary."
                    icon={UserRound}
                  />
                  <div className="two-column-grid">
                    <ArcanePanel className="form-panel">
                      <div className="profile-emblem">
                        <PlayerAvatar
                          playerName={offlinePlayer?.playerName}
                          className="profile-emblem__avatar"
                        />
                      </div>
                      <div className="profile-summary">
                        <span>AKTUÁLNÍ PROFIL</span>
                        <h3>
                          {offlinePlayer?.playerName ??
                            "Nepojmenovaný cestovatel"}
                        </h3>
                        <p>
                          {offlinePlayer?.message ??
                            "Zvol jméno pro svou další cestu."}
                        </p>
                      </div>
                    </ArcanePanel>

                    <ArcanePanel className="form-panel">
                      <label className="fantasy-field">
                        <span>Herní jméno</span>
                        <input
                          type="text"
                          value={playerNameInput}
                          onChange={(event) =>
                            setPlayerNameInput(event.target.value)
                          }
                          placeholder="Zadej jméno cestovatele"
                          disabled={savingPlayer}
                          autoComplete="off"
                        />
                      </label>
                      {playerState.kind === "error" && (
                        <p className="field-error">{playerState.message}</p>
                      )}
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-action secondary-action--accent"
                          onClick={() => void handleSaveOfflinePlayer()}
                          disabled={
                            savingPlayer || playerNameInput.trim().length === 0
                          }
                        >
                          <Save size={16} />
                          {savingPlayer ? "UKLÁDÁM" : "ULOŽIT PROFIL"}
                        </button>
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => void handleClearOfflinePlayer()}
                          disabled={savingPlayer || !offlinePlayerReady}
                        >
                          <RotateCcw size={16} />
                          ODEBRAT PROFIL
                        </button>
                      </div>
                    </ArcanePanel>
                  </div>
                </section>
              )}

              {currentView === "settings" && (
                <section className="page-view">
                  <SectionTitle
                    eyebrow="PŘÍPRAVA VÝPRAVY"
                    title="Nastavení launcheru"
                    description="Důležité technické volby zůstávají mimo hlavní bránu, ale vždy po ruce."
                    icon={Settings2}
                    action={
                      <button
                        type="button"
                        className="secondary-action secondary-action--accent"
                        onClick={() => void handleSaveLauncherSettings()}
                        disabled={
                          launcherSettingsState.kind !== "ready" ||
                          savingSettings ||
                          !launcherSettingsDirty
                        }
                      >
                        <Save size={16} />
                        {savingSettings ? "UKLÁDÁM" : "ULOŽIT ZMĚNY"}
                      </button>
                    }
                  />

                  <div className="settings-sections">
                    <ArcanePanel className="settings-section">
                      <div className="settings-section__heading">
                        <RuneIcon icon={Gauge} active />
                        <div>
                          <span>SEKCE HRA</span>
                          <h3>Výkon a paměť</h3>
                        </div>
                        <strong>{ramInputLabel}</strong>
                      </div>
                      {launcherSettingsState.kind === "error" ? (
                        <p className="field-error">
                          {launcherSettingsState.message}
                        </p>
                      ) : (
                        <div className="settings-control">
                          <label className="fantasy-field fantasy-field--range">
                            <span>Přidělená RAM</span>
                            <input
                              type="range"
                              min={ramMinMb}
                              max={ramMaxMb}
                              step={ramStepMb}
                              value={ramInputMb}
                              onChange={(event) =>
                                updateRamInput(Number(event.target.value))
                              }
                              disabled={
                                launcherSettingsState.kind !== "ready" ||
                                savingSettings
                              }
                            />
                          </label>
                          <label className="fantasy-field fantasy-field--compact">
                            <span>Přesná hodnota</span>
                            <input
                              type="number"
                              min={ramMinMb}
                              max={ramMaxMb}
                              step={ramStepMb}
                              value={ramInputMb}
                              onChange={(event) =>
                                updateRamInput(Number(event.target.value))
                              }
                              disabled={
                                launcherSettingsState.kind !== "ready" ||
                                savingSettings
                              }
                            />
                          </label>
                          <p className="settings-hint">
                            Rozsah {ramMinMb}–{ramMaxMb} MB. Nech dostatek
                            paměti také systému Windows.
                          </p>
                        </div>
                      )}
                    </ArcanePanel>

                    <ArcanePanel className="settings-section">
                      <div className="settings-section__heading">
                        <RuneIcon icon={FolderCog} />
                        <div>
                          <span>SEKCE HRA</span>
                          <h3>Umístění klienta</h3>
                        </div>
                        <strong>{resolvedGameDirectoryModeLabel}</strong>
                      </div>
                      <label className="fantasy-field">
                        <span>Cesta ke hře</span>
                        <div className="field-with-action">
                          <input
                            type="text"
                            value={gameDirectoryPathInput}
                            onChange={(event) =>
                              updateGameDirectoryPathInput(event.target.value)
                            }
                            placeholder="Výchozí složka launcheru"
                            disabled={
                              launcherSettingsState.kind !== "ready" ||
                              savingSettings
                            }
                          />
                          <button
                            type="button"
                            className="field-icon-action"
                            onClick={() => void handlePickGameDirectory()}
                            disabled={pickingGameDirectory || savingSettings}
                            aria-label="Vybrat složku"
                            title="Vybrat složku"
                          >
                            <FolderOpen size={17} />
                          </button>
                        </div>
                      </label>
                      <p className="settings-hint">
                        {gameDirectory?.minecraftDir ??
                          "Cesta se načte při otevření nastavení."}
                      </p>
                      {gameDirectoryPickerError && (
                        <p className="field-error">
                          {gameDirectoryPickerError}
                        </p>
                      )}
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => void handleOpenMinecraftDirectory()}
                          disabled={gameDirectory?.minecraftDir == null}
                        >
                          <FolderOpen size={16} />
                          OTEVŘÍT SLOŽKU
                        </button>
                        <button
                          type="button"
                          className="icon-only-action"
                          aria-label="Vrátit cestu"
                          title="Vrátit změny"
                          onClick={() =>
                            setGameDirectoryPathInput(
                              launcherSettings?.gameDirectoryPath ?? "",
                            )
                          }
                          disabled={savingSettings}
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    </ArcanePanel>

                    <ArcanePanel className="settings-section">
                      <div className="settings-section__heading">
                        <RuneIcon icon={Cpu} />
                        <div>
                          <span>SEKCE HRA</span>
                          <h3>Java runtime</h3>
                        </div>
                        <strong>
                          {javaCompatible ? "Připraveno" : "Vyžaduje pozornost"}
                        </strong>
                      </div>
                      <label className="fantasy-field">
                        <span>Vlastní spustitelný soubor Java</span>
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
                      <p className="settings-hint">
                        {javaRuntime?.message ??
                          "Launcher vybere vhodnou Javu při přípravě hry."}
                      </p>
                      {installingManagedJava && (
                        <ProgressBar
                          percent={effectiveProgressPanelPercent}
                          label={effectiveProgressPanelLabel}
                          value={effectiveProgressPanelValue}
                          active
                        />
                      )}
                      <div className="button-row">
                        {javaPathNormalized.length === 0 &&
                          installationStatus?.requiredJavaMajor != null && (
                            <button
                              type="button"
                              className="secondary-action secondary-action--accent"
                              onClick={() =>
                                void handleInstallManagedJavaRuntime(
                                  installationStatus.requiredJavaMajor!,
                                )
                              }
                              disabled={installingManagedJava || savingSettings}
                            >
                              <Download size={16} />
                              {installingManagedJava
                                ? "INSTALUJI JAVU"
                                : "NAINSTALOVAT JAVU"}
                            </button>
                          )}
                        <button
                          type="button"
                          className="icon-only-action"
                          aria-label="Vrátit cestu Java"
                          title="Vrátit změny"
                          onClick={() =>
                            setJavaPathInput(
                              launcherSettings?.javaExecutablePath ?? "",
                            )
                          }
                          disabled={savingSettings}
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    </ArcanePanel>

                    <ArcanePanel className="settings-section settings-section--muted">
                      <div className="settings-section__heading">
                        <RuneIcon icon={Settings2} />
                        <div>
                          <span>SEKCE LAUNCHER</span>
                          <h3>Chování aplikace</h3>
                        </div>
                      </div>
                      <div className="setting-status-list">
                        <div>
                          <span>Automatické aktualizace</span>
                          <strong>Aktivní</strong>
                        </div>
                        <div>
                          <span>Jazyk rozhraní</span>
                          <strong>Čeština</strong>
                        </div>
                        <div>
                          <span>Spuštění po startu systému</span>
                          <strong>Není podporováno</strong>
                        </div>
                        <div>
                          <span>Minimalizace při spuštění hry</span>
                          <strong>Není podporováno</strong>
                        </div>
                      </div>
                    </ArcanePanel>
                  </div>
                </section>
              )}

              {currentView === "repair" && (
                <section className="page-view">
                  <SectionTitle
                    eyebrow="OBNOVA CESTY"
                    title="Oprava instalace"
                    description="Bezpečně ověř soubory Nekary, doplň chybějící části a zpřístupni diagnostiku."
                    icon={Wrench}
                  />

                  <ArcanePanel className="repair-hero">
                    <div className="repair-hero__icon">
                      {installationReady ? (
                        <CheckCircle2 size={38} />
                      ) : (
                        <Wrench size={38} />
                      )}
                    </div>
                    <div className="repair-hero__copy">
                      <span>STAV HERNÍHO KLIENTA</span>
                      <h3>
                        {installationReady
                          ? "Instalace je připravená"
                          : "Instalace vyžaduje kontrolu"}
                      </h3>
                      <p>
                        {installationStatus?.message ??
                          "Podrobný stav se načte při spuštění kontroly."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-action secondary-action--accent secondary-action--large"
                      onClick={() => void handlePrepareInstallation()}
                      disabled={
                        preparingInstallation ||
                        installingManagedJava ||
                        gameRunning
                      }
                    >
                      {preparingInstallation ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <ShieldCheck size={18} />
                      )}
                      {preparingInstallation
                        ? "OVĚŘUJI SOUBORY"
                        : "OVĚŘIT A OPRAVIT SOUBORY"}
                    </button>
                  </ArcanePanel>

                  <div className="repair-grid">
                    <ArcanePanel className="check-panel">
                      <h3>Kontrola připravenosti</h3>
                      <ul className="check-list">
                        {[
                          ["Profil hráče", identityReady],
                          ["Herní složka", gameDirectory?.exists ?? false],
                          ["Java runtime", javaCompatible],
                          ["Minecraft metadata", metadataAvailable],
                          ["Klient Nekary", installationReady],
                        ].map(([label, ready]) => (
                          <li
                            key={String(label)}
                            className={ready ? "is-ready" : "is-pending"}
                          >
                            {ready ? (
                              <CheckCircle2 size={15} />
                            ) : (
                              <TriangleAlert size={15} />
                            )}
                            <span>{String(label)}</span>
                            <strong>{ready ? "Připraveno" : "Čeká"}</strong>
                          </li>
                        ))}
                      </ul>
                    </ArcanePanel>

                    <ArcanePanel className="check-panel">
                      <h3>Stav launcheru</h3>
                      {launcherStatusState.kind === "loading" ? (
                        <p className="settings-hint">
                          Stav se načte při otevření diagnostiky.
                        </p>
                      ) : launcherStatusState.kind === "error" ? (
                        <p className="field-error">
                          {launcherStatusState.message}
                        </p>
                      ) : (
                        <ul className="check-list">
                          {launcherStatus?.checks.map((check) => (
                            <li
                              key={check.id}
                              className={
                                check.state === "ready"
                                  ? "is-ready"
                                  : "is-pending"
                              }
                            >
                              {check.state === "ready" ? (
                                <CheckCircle2 size={15} />
                              ) : (
                                <TriangleAlert size={15} />
                              )}
                              <span>{check.label}</span>
                              <strong>
                                {launcherCheckStateLabel[check.state]}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </ArcanePanel>
                  </div>

                  {launchBlockerItems.length > 0 && (
                    <ArcanePanel className="blocker-panel" tone="danger">
                      <TriangleAlert size={20} />
                      <div>
                        <h3>Co je potřeba dokončit</h3>
                        <ul>
                          {launchBlockerItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </ArcanePanel>
                  )}
                </section>
              )}

              {currentView === "support" && (
                <section className="page-view">
                  <SectionTitle
                    eyebrow="POMOC NA CESTĚ"
                    title="Podpora a diagnostika"
                    description="Připrav podklady pro řešení potíží a otevři místní logy launcheru."
                    icon={CircleHelp}
                  />
                  <ArcanePanel className="support-repair-card">
                    <div className="support-repair-card__copy">
                      <span>OBNOVA HERNÍHO KLIENTA</span>
                      <h3>
                        {installationReady
                          ? "Instalace je připravená"
                          : "Ověřit a opravit soubory"}
                      </h3>
                      <p>
                        {installationStatus?.message ??
                          "Doplň chybějící soubory Nekary a ověř jejich integritu."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-action secondary-action--accent secondary-action--large"
                      onClick={() => void handlePrepareInstallation()}
                      disabled={
                        preparingInstallation ||
                        installingManagedJava ||
                        gameRunning
                      }
                    >
                      {preparingInstallation ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <ShieldCheck size={18} />
                      )}
                      {preparingInstallation
                        ? "OVĚŘUJI SOUBORY"
                        : "OVĚŘIT A OPRAVIT"}
                    </button>
                  </ArcanePanel>
                  <div className="support-actions">
                    <ArcanePanel className="support-card">
                      <ScrollText size={30} />
                      <h3>Diagnostický report</h3>
                      <p>
                        Vygeneruje jeden přehledný soubor se stavem launcheru,
                        hry a Javy.
                      </p>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void refreshLauncherErrorReport()}
                      >
                        <Wrench size={16} />
                        VYGENEROVAT REPORT
                      </button>
                    </ArcanePanel>
                    <ArcanePanel className="support-card">
                      <FolderOpen size={30} />
                      <h3>Lokální logy</h3>
                      <p>
                        Otevře adresář s detailními záznamy launcheru a herního
                        procesu.
                      </p>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void handleOpenLauncherLogs()}
                      >
                        <FolderOpen size={16} />
                        OTEVŘÍT LOGY
                      </button>
                    </ArcanePanel>
                    <ArcanePanel className="support-card">
                      <RotateCcw size={30} />
                      <h3>Obnovit stav</h3>
                      <p>
                        Znovu načte stav hry, Javy, instalace a diagnostických
                        souborů.
                      </p>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void handleRefreshDiagnostics()}
                      >
                        <RotateCcw size={16} />
                        OBNOVIT DIAGNOSTIKU
                      </button>
                    </ArcanePanel>
                  </div>

                  {(diagnosticSummary ||
                    diagnosticFix ||
                    diagnosticLogPath ||
                    diagnosticErrorReportPath ||
                    diagnosticLogExcerpt ||
                    launcherDiagnosticsError) && (
                    <ArcanePanel
                      className="diagnostic-panel"
                      tone={launchFailed ? "danger" : "deep"}
                    >
                      <div className="diagnostic-panel__heading">
                        <Database size={20} />
                        <h3>Technické podrobnosti</h3>
                      </div>
                      <dl>
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
                            <dt>Log</dt>
                            <dd>{diagnosticLogPath}</dd>
                          </div>
                        )}
                        {diagnosticErrorReportPath && (
                          <div>
                            <dt>Diagnostický report</dt>
                            <dd>{diagnosticErrorReportPath}</dd>
                          </div>
                        )}
                      </dl>
                      {launcherDiagnosticsError && (
                        <p className="field-error">
                          {launcherDiagnosticsError}
                        </p>
                      )}
                      {diagnosticLogExcerpt && (
                        <pre>{diagnosticLogExcerpt}</pre>
                      )}
                    </ArcanePanel>
                  )}
                </section>
              )}
            </div>

            <footer className="status-dock">
              <div className="status-dock__mark">
                <span
                  className={
                    "status-orb status-orb--" +
                    (gameRunning ? "online" : "pending")
                  }
                />
                <div>
                  <small>STAV VÝPRAVY</small>
                  <strong>{statusMessage}</strong>
                </div>
              </div>
              <ProgressBar
                percent={effectiveProgressPanelPercent}
                label={effectiveProgressPanelLabel}
                value={effectiveProgressPanelValue}
                active={preparingInstallation || installingManagedJava}
              />
              <button
                type="button"
                className="status-dock__repair"
                onClick={() => setCurrentView("support")}
              >
                <Wrench size={15} />
                ZKONTROLOVAT SOUBORY
              </button>
            </footer>
          </section>

          <aside className="right-rail" aria-label="Novinky a komunita">
            <section className="right-rail__section">
              <div className="right-rail__heading">
                <div>
                  <span>KRONIKA</span>
                  <h2>Novinky</h2>
                </div>
                <Newspaper size={18} />
              </div>
              <button
                type="button"
                className="featured-news"
                onClick={() => setCurrentView("news")}
              >
                <span className="featured-news__image" />
                <span className="featured-news__body">
                  <small>VÝVOJ LAUNCHERU</small>
                  <strong>Nová brána do Nekary</strong>
                  <span>Objev nový vizuální směr launcheru.</span>
                </span>
              </button>
              <button
                type="button"
                className="compact-news"
                onClick={() => setCurrentView("news")}
              >
                <ShieldCheck size={18} />
                <span>
                  <small>HERNÍ KLIENT</small>
                  <strong>Fabric 26.1.2 připraven</strong>
                </span>
              </button>
              <button
                type="button"
                className="rail-link"
                onClick={() => setCurrentView("news")}
              >
                ZOBRAZIT VŠECHNY NOVINKY
                <BookOpen size={14} />
              </button>
            </section>

            <ArcanePanel className="community-card">
              <div className="community-card__icon">
                <MessageCircle size={25} />
              </div>
              <span>PŘIPOJ SE K NÁM</span>
              <h3>Komunita Nekary</h3>
              <p>
                Discord odkaz zatím není v launcheru nakonfigurován. Sleduj
                kroniku a buď u otevření bran.
              </p>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setCurrentView("support")}
              >
                <MessageCircle size={16} />
                PŘIPOJIT DISCORD
              </button>
            </ArcanePanel>

            <div className="quick-state" aria-label="Rychlý stav launcheru">
              <div>
                <Play size={14} />
                <span>Hra</span>
                <strong>{quickGameStatus}</strong>
              </div>
              <div>
                <HardDrive size={14} />
                <span>Instalace</span>
                <strong>{installationReady ? "Připravena" : "Čeká"}</strong>
              </div>
              <div>
                <Settings2 size={14} />
                <span>Nastavení</span>
                <strong>{quickSettingsStatus}</strong>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {startupUpdateNotice?.available && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-title"
        >
          <ArcanePanel className="update-dialog">
            <div className="update-dialog__rune">
              <LoaderCircle className="spin" size={28} />
            </div>
            <span>AKTUALIZACE LAUNCHERU</span>
            <h2 id="update-title">
              Stahuji verzi {startupUpdateNotice.version}
            </h2>
            <p>
              Nová verze se stáhne a bezpečně nainstaluje. Po dokončení se
              launcher automaticky vrátí.
            </p>
            {startupUpdateNotice.body && (
              <div className="update-dialog__notes">
                {startupUpdateNotice.body}
              </div>
            )}
            <ProgressBar
              percent={35}
              label="PŘÍPRAVA AKTUALIZACE"
              value="PROBÍHÁ"
              active
            />
            <small>Launcher prosím nevypínej.</small>
          </ArcanePanel>
        </div>
      )}
    </main>
  );
}

export default App;
