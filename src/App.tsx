import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  CircleAlert,
  Download,
  HardDriveDownload,
  LoaderCircle,
  Minimize2,
  Play,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import {
  checkJavaRuntime,
  clearOfflinePlayerProfile,
  getGameLaunchStatus,
  getLauncherSettings,
  getMinecraftInstallationStatus,
  ensureNekaraGameDirectory,
  getLauncherStatus,
  launchMinecraft,
  getOfflinePlayerStatus,
  prepareMinecraftInstallation,
  saveLauncherSettings,
  saveOfflinePlayerProfile,
} from "./services/launcher";
import type {
  GameLaunchStatus,
  GameDirectoryInfo,
  JavaRuntimeCheck,
  LauncherCheck,
  LauncherSettings,
  LauncherStatus,
  MinecraftInstallationStatus,
  OfflinePlayerStatus,
} from "./types/launcher";

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

const checkStateLabel: Record<LauncherCheck["state"], string> = {
  ready: "Ready",
  pending: "Pending",
  blocked: "Blocked",
};

function App() {
  const [launcherState, setLauncherState] = useState<LoadState<LauncherStatus>>({
    kind: "loading",
  });
  const [directoryState, setDirectoryState] = useState<
    LoadState<GameDirectoryInfo>
  >({ kind: "loading" });
  const [javaState, setJavaState] = useState<LoadState<JavaRuntimeCheck>>({
    kind: "loading",
  });
  const [installationState, setInstallationState] = useState<
    LoadState<MinecraftInstallationStatus>
  >({ kind: "loading" });
  const [gameLaunchState, setGameLaunchState] = useState<
    LoadState<GameLaunchStatus>
  >({ kind: "loading" });
  const [launcherSettingsState, setLauncherSettingsState] = useState<
    LoadState<LauncherSettings>
  >({ kind: "loading" });
  const [playerState, setPlayerState] = useState<LoadState<OfflinePlayerStatus>>({
    kind: "loading",
  });
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [ramInputMb, setRamInputMb] = useState(4096);
  const [javaPathInput, setJavaPathInput] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [preparingInstallation, setPreparingInstallation] = useState(false);
  const [launchingGame, setLaunchingGame] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  function updateRamInput(value: number) {
    if (Number.isNaN(value)) {
      return;
    }

    setRamInputMb(value);
  }

  function updateJavaPathInput(value: string) {
    setJavaPathInput(value);
  }

  async function refreshLauncherStatus() {
    try {
      const status = await getLauncherStatus();
      setLauncherState({ kind: "ready", value: status });
    } catch (error: unknown) {
      setLauncherState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Launcher status is not available.",
      });
    }
  }

  async function refreshInstallationStatus() {
    try {
      const status = await getMinecraftInstallationStatus();
      setInstallationState({ kind: "ready", value: status });
    } catch (error: unknown) {
      setInstallationState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Minecraft installation status is not available.",
      });
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
            : "Minecraft launch status is not available.",
      });
    }
  }

  async function refreshJavaRuntime() {
    try {
      const check = await checkJavaRuntime();
      setJavaState({ kind: "ready", value: check });
    } catch (error: unknown) {
      setJavaState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Java runtime detection is not available.",
      });
    }
  }

  async function refreshLauncherSettings() {
    try {
      const settings = await getLauncherSettings();
      setLauncherSettingsState({ kind: "ready", value: settings });
      setRamInputMb(settings.maxRamMb);
      setJavaPathInput(settings.javaExecutablePath ?? "");
    } catch (error: unknown) {
      setLauncherSettingsState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Launcher settings are not available.",
      });
    }
  }

  useEffect(() => {
    let isMounted = true;

    getLauncherStatus()
      .then((status) => {
        if (isMounted) {
          setLauncherState({ kind: "ready", value: status });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLauncherState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Launcher status is not available.",
          });
        }
      });

    ensureNekaraGameDirectory()
      .then((info) => {
        if (isMounted) {
          setDirectoryState({ kind: "ready", value: info });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setDirectoryState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Game directory preparation is not available.",
          });
        }
      });

    checkJavaRuntime()
      .then((check) => {
        if (isMounted) {
          setJavaState({ kind: "ready", value: check });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setJavaState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Java runtime detection is not available.",
          });
        }
      });

    getMinecraftInstallationStatus()
      .then((status) => {
        if (isMounted) {
          setInstallationState({ kind: "ready", value: status });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setInstallationState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Minecraft installation status is not available.",
          });
        }
      });

    getOfflinePlayerStatus()
      .then((status) => {
        if (isMounted) {
          setPlayerState({ kind: "ready", value: status });
          setPlayerNameInput(status.playerName ?? "");
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setPlayerState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Offline player status is not available.",
          });
        }
      });

    getGameLaunchStatus()
      .then((status) => {
        if (isMounted) {
          setGameLaunchState({ kind: "ready", value: status });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setGameLaunchState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Minecraft launch status is not available.",
          });
        }
      });

    getLauncherSettings()
      .then((settings) => {
        if (isMounted) {
          setLauncherSettingsState({ kind: "ready", value: settings });
          setRamInputMb(settings.maxRamMb);
          setJavaPathInput(settings.javaExecutablePath ?? "");
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLauncherSettingsState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Launcher settings are not available.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshGameLaunchStatus();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!preparingInstallation) {
      return;
    }

    void refreshInstallationStatus();

    const intervalId = window.setInterval(() => {
      void refreshInstallationStatus();
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [preparingInstallation]);

  const launcherStatus =
    launcherState.kind === "ready" ? launcherState.value : null;
  const gameDirectory =
    directoryState.kind === "ready" ? directoryState.value : null;
  const javaRuntime = javaState.kind === "ready" ? javaState.value : null;
  const installationStatus =
    installationState.kind === "ready" ? installationState.value : null;
  const gameLaunch =
    gameLaunchState.kind === "ready" ? gameLaunchState.value : null;
  const launcherSettings =
    launcherSettingsState.kind === "ready" ? launcherSettingsState.value : null;
  const offlinePlayer = playerState.kind === "ready" ? playerState.value : null;
  const offlinePlayerReady = offlinePlayer?.state === "ready";
  const installationReady = installationStatus?.state === "ready";
  const metadataAvailable =
    installationStatus != null && installationStatus.state !== "blocked";
  const javaCompatible =
    installationStatus?.requiredJavaMajor == null
      ? javaRuntime?.detected ?? false
      : (javaRuntime?.majorVersion ?? 0) >= installationStatus.requiredJavaMajor;
  const gameRunning = gameLaunch?.state === "running" || gameLaunch?.state === "launching";
  const gameFailed = gameLaunch?.state === "failed";
  const gameExitedWithError =
    gameLaunch?.state === "exited" && (gameLaunch.exitCode ?? 0) !== 0;

  const readiness = useMemo(
    () => ({
      metadata: metadataAvailable,
      gameDirectory: gameDirectory?.exists ?? false,
      java: javaCompatible,
      player: offlinePlayerReady,
      installation: installationReady,
    }),
    [
      gameDirectory?.exists,
      installationReady,
      javaCompatible,
      metadataAvailable,
      offlinePlayerReady,
    ],
  );

  const readinessCount = Object.values(readiness).filter(Boolean).length;
  const readinessPercent = Math.round((readinessCount / 5) * 100);
  const installationProgressLabel =
    installationStatus == null
      ? null
      : `${installationStatus.libraryCountReady}/${installationStatus.libraryCountTotal} libraries, ${installationStatus.assetCountReady}/${installationStatus.assetCountTotal} assets`;
  const installOperationTotalUnits =
    installationStatus == null
      ? 0
      : 3 +
        installationStatus.libraryCountTotal +
        installationStatus.assetCountTotal;
  const installOperationReadyUnits =
    installationStatus == null
      ? 0
      : (installationStatus.versionJsonReady ? 1 : 0) +
        (installationStatus.clientJarReady ? 1 : 0) +
        (installationStatus.assetIndexReady ? 1 : 0) +
        installationStatus.libraryCountReady +
        installationStatus.assetCountReady;
  const installOperationPercent =
    installOperationTotalUnits === 0
      ? 0
      : Math.round((installOperationReadyUnits / installOperationTotalUnits) * 100);
  const progressPanelLabel =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? "Client preparation progress"
      : "Preparation progress";
  const progressPanelValue =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? `${installOperationPercent}%`
      : `${readinessCount}/5 ready`;
  const progressPanelPercent =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? installOperationPercent
      : readinessPercent;
  const primaryStatus = gameRunning
    ? "Minecraft is running"
    : launchingGame
      ? "Launching Minecraft"
      : preparingInstallation
    ? "Preparing official files"
    : readinessCount === 5
      ? "Ready to launch"
      : "Preparing Nekara";
  const primaryHint = !offlinePlayerReady
    ? "Choose an offline player name to unlock the launch flow."
    : gameRunning
      ? gameLaunch?.message ?? "Minecraft is currently running from the launcher."
      : gameFailed || gameExitedWithError
        ? gameLaunch?.diagnosticSummary ??
          gameLaunch?.suggestedFix ??
          gameLaunch?.message ??
          "Minecraft did not start cleanly. Open diagnostics for the latest log details."
      : launchingGame
        ? "The launcher is building the launch command and starting the Minecraft process."
    : preparingInstallation
      ? installationProgressLabel == null
        ? "The launcher is downloading and verifying official Minecraft files, libraries, and assets."
        : `The launcher is downloading and verifying official Minecraft files. Current progress: ${installationProgressLabel}.`
      : !installationReady
        ? installationStatus?.message ??
          "Official Minecraft files still need to be prepared."
        : readinessCount === 5
          ? "Everything required for the first offline launch is in place."
          : !javaCompatible
            ? "Minecraft files are ready. The remaining blocker is a compatible Java runtime."
            : "The launcher is checking the remaining runtime details.";
  const primaryButtonLabel = !offlinePlayerReady
    ? "Save player name"
    : gameRunning
      ? "Running"
      : launchingGame
        ? "Launching..."
    : preparingInstallation
      ? "Preparing files..."
      : !installationReady
        ? "Prepare client"
      : readinessCount === 5
          ? "Play"
          : "Installation ready";
  const ramMinMb = launcherSettings?.minRamMb ?? 2048;
  const ramMaxMb = launcherSettings?.maxAllowedRamMb ?? 12288;
  const ramStepMb = launcherSettings?.ramStepMb ?? 512;
  const javaPathNormalized = javaPathInput.trim();
  const savedJavaPathNormalized = launcherSettings?.javaExecutablePath?.trim() ?? "";
  const ramSettingsDirty =
    launcherSettings != null && ramInputMb !== launcherSettings.maxRamMb;
  const javaSettingsDirty =
    launcherSettings != null && javaPathNormalized !== savedJavaPathNormalized;
  const launcherSettingsDirty = ramSettingsDirty || javaSettingsDirty;
  const ramInputLabel = `${ramInputMb} MB`;

  const settingsRows = [
    {
      label: "Official manifest",
      value:
        installationStatus?.manifestUrl ??
        "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    },
    {
      label: "Version metadata URL",
      value: installationStatus?.versionUrl ?? "Unavailable until metadata loads.",
    },
    {
      label: "Client download",
      value:
        installationStatus?.clientDownloadUrl ?? "Unavailable until metadata loads.",
    },
    {
      label: "Client hash",
      value:
        installationStatus?.clientDownloadSha1 ?? "Unavailable until metadata loads.",
    },
    {
      label: "Required Java",
      value: installationStatus?.requiredJavaMajor?.toString() ?? "Unavailable",
    },
    {
      label: "Asset index",
      value: installationStatus?.assetIndexUrl ?? "Unavailable until metadata loads.",
    },
    {
      label: "Asset index total size",
      value:
        installationStatus?.assetIndexTotalSize == null
          ? "Unavailable"
          : `${Math.round(installationStatus.assetIndexTotalSize / 1024 / 1024)} MB`,
    },
    {
      label: "Java executable",
      value: javaRuntime?.executablePath ?? "Not detected yet.",
    },
    {
      label: "Java version",
      value: javaRuntime?.javaVersion ?? "Not detected yet.",
    },
    {
      label: "Java compatibility",
      value: javaCompatible ? "Compatible" : "Upgrade Java for this version",
    },
    {
      label: "Configured Java",
      value:
        launcherSettings?.javaExecutablePath ??
        "System PATH is used when no custom Java path is configured.",
    },
    {
      label: "Java source",
      value: javaRuntime?.source ?? "Unavailable",
    },
    {
      label: "Configured RAM",
      value:
        gameLaunch?.configuredMaxRamMb != null
          ? `${gameLaunch.configuredMaxRamMb} MB`
          : launcherSettings != null
            ? `${launcherSettings.maxRamMb} MB`
            : "Unavailable",
    },
    {
      label: "Launcher data",
      value: gameDirectory?.launcherDataDir ?? "Unavailable",
    },
    {
      label: "Nekara game dir",
      value: gameDirectory?.nekaraGameDir ?? "Unavailable",
    },
    {
      label: "Version JSON path",
      value: installationStatus?.versionJsonPath ?? "Unavailable",
    },
    {
      label: "Libraries path",
      value: installationStatus?.librariesDir ?? "Unavailable",
    },
    {
      label: "Assets path",
      value: installationStatus?.assetsDir ?? "Unavailable",
    },
    {
      label: "Asset index path",
      value: installationStatus?.assetIndexPath ?? "Unavailable",
    },
    {
      label: "Install status",
      value: installationStatus?.message ?? "Unavailable",
    },
    {
      label: "Version JSON ready",
      value:
        installationStatus == null
          ? "Unavailable"
          : installationStatus.versionJsonReady
            ? "Yes"
            : "No",
    },
    {
      label: "Client JAR ready",
      value:
        installationStatus == null
          ? "Unavailable"
          : installationStatus.clientJarReady
            ? "Yes"
            : "No",
    },
    {
      label: "Asset index ready",
      value:
        installationStatus == null
          ? "Unavailable"
          : installationStatus.assetIndexReady
            ? "Yes"
            : "No",
    },
    {
      label: "Libraries ready",
      value:
        installationStatus == null
          ? "Unavailable"
          : `${installationStatus.libraryCountReady}/${installationStatus.libraryCountTotal}`,
    },
    {
      label: "Assets ready",
      value:
        installationStatus == null
          ? "Unavailable"
          : `${installationStatus.assetCountReady}/${installationStatus.assetCountTotal}`,
    },
    {
      label: "Game status",
      value: gameLaunch?.message ?? "Unavailable",
    },
    {
      label: "Launch diagnosis",
      value: gameLaunch?.diagnosticSummary ?? "No diagnosis captured.",
    },
    {
      label: "Suggested fix",
      value: gameLaunch?.suggestedFix ?? "No fix suggested yet.",
    },
    {
      label: "Game log",
      value: gameLaunch?.logPath ?? "Unavailable",
    },
    {
      label: "Log excerpt",
      value: gameLaunch?.logExcerpt ?? "No log excerpt captured yet.",
    },
    {
      label: "Game PID",
      value: gameLaunch?.pid?.toString() ?? "Unavailable",
    },
    {
      label: "Player profile",
      value: offlinePlayer?.message ?? "Unavailable",
    },
  ];

  const readinessChecks: LauncherCheck[] = [
    ...(launcherStatus?.checks ?? []),
    {
      id: "minecraft-installation",
      label: "Official client files",
      state:
        installationState.kind === "error"
          ? "blocked"
          : installationStatus?.state ?? "pending",
    },
    {
      id: "minecraft-process",
      label: "Minecraft process",
      state:
        gameLaunch?.state === "running"
          ? "ready"
          : gameLaunch?.state === "failed"
            ? "blocked"
            : "pending",
    },
  ];

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
    setActionMessage(null);
    setSavingPlayer(true);

    try {
      const status = await saveOfflinePlayerProfile(playerNameInput);
      setPlayerState({ kind: "ready", value: status });
      setPlayerNameInput(status.playerName ?? "");
      await refreshLauncherStatus();
      setActionMessage(status.message);
    } catch (error: unknown) {
      setPlayerState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offline player profile could not be saved.",
      });
    } finally {
      setSavingPlayer(false);
    }
  }

  async function handleClearOfflinePlayer() {
    setActionMessage(null);
    setSavingPlayer(true);

    try {
      const status = await clearOfflinePlayerProfile();
      setPlayerState({ kind: "ready", value: status });
      setPlayerNameInput("");
      await refreshLauncherStatus();
      setActionMessage("Offline player profile cleared.");
    } catch (error: unknown) {
      setPlayerState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offline player profile could not be cleared.",
      });
    } finally {
      setSavingPlayer(false);
    }
  }

  async function handlePrepareInstallation() {
    setActionMessage(null);
    setPreparingInstallation(true);

    try {
      const status = await prepareMinecraftInstallation();
      setInstallationState({ kind: "ready", value: status });
      await Promise.all([refreshLauncherStatus(), refreshInstallationStatus()]);
      setActionMessage(status.message);
    } catch (error: unknown) {
      setInstallationState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Minecraft installation could not be prepared.",
      });
    } finally {
      setPreparingInstallation(false);
    }
  }

  async function handleSaveLauncherSettings() {
    setActionMessage(null);
    setSavingSettings(true);

    try {
      const settings = await saveLauncherSettings(
        ramInputMb,
        javaPathInput.trim().length > 0 ? javaPathInput.trim() : null,
      );
      setLauncherSettingsState({ kind: "ready", value: settings });
      setRamInputMb(settings.maxRamMb);
      setJavaPathInput(settings.javaExecutablePath ?? "");
      await Promise.all([refreshGameLaunchStatus(), refreshJavaRuntime()]);
      setActionMessage(settings.message);
    } catch (error: unknown) {
      setLauncherSettingsState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Launcher settings could not be saved.",
      });
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Launcher settings could not be saved.",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleLaunchMinecraft() {
    setActionMessage(null);
    setLaunchingGame(true);

    try {
      const status = await launchMinecraft();
      setGameLaunchState({ kind: "ready", value: status });
      setActionMessage(status.message);
    } catch (error: unknown) {
      setGameLaunchState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Minecraft could not be launched.",
      });
      setActionMessage(
        error instanceof Error ? error.message : "Minecraft could not be launched.",
      );
    } finally {
      setLaunchingGame(false);
    }
  }

  async function handlePrimaryAction() {
    if (!offlinePlayerReady) {
      await handleSaveOfflinePlayer();
      return;
    }

    if (!installationReady) {
      await handlePrepareInstallation();
      return;
    }

    if (gameRunning) {
      setActionMessage(gameLaunch?.message ?? "Minecraft is already running.");
      return;
    }

    if (readinessCount === 5) {
      await handleLaunchMinecraft();
      return;
    }

    if (!javaCompatible) {
      setActionMessage(
        installationStatus?.requiredJavaMajor == null
          ? "Official Minecraft files are ready. Install or expose Java in PATH to continue toward launch."
          : `Official Minecraft files are ready, but Java ${installationStatus.requiredJavaMajor} or newer is still required.`,
      );
      return;
    }

    setActionMessage("The launcher is still preparing the isolated installation.");
  }

  return (
    <main className="launcher-shell">
      <div className="launcher-shell__glow" />

      <div className="launcher-frame">
        <header
          className="window-bar"
          data-tauri-drag-region="true"
          onMouseDown={handleTitleBarMouseDown}
        >
          <div className="window-bar__brand">
            <div className="brand-mark" aria-hidden="true">
              N
            </div>
            <div className="window-bar__copy">
              <p className="eyebrow">Nekara Launcher</p>
              <h1>Nekara</h1>
            </div>
          </div>

          <div
            className="window-bar__controls"
            aria-label="Window controls"
            data-window-control="true"
            data-tauri-drag-region="false"
          >
            <button
              type="button"
              className="window-icon-button"
              aria-label="Minimize window"
              data-tauri-drag-region="false"
              onClick={() => runWindowAction((appWindow) => appWindow.minimize())}
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              className="window-icon-button window-icon-button--close"
              aria-label="Close window"
              data-tauri-drag-region="false"
              onClick={() => runWindowAction((appWindow) => appWindow.close())}
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <section className="launcher-body">
          <section className="hero-stage" aria-labelledby="launcher-title">
            <div className="hero-stage__copy">
              <p className="eyebrow">One game. One configuration.</p>
              <h2 id="launcher-title">Launcher</h2>
              <p className="hero-text">
                Offline mode keeps us moving toward a playable launcher. Pick a
                local player name, prepare the Nekara client, and keep the launch
                path focused.
              </p>
            </div>

            <div className="hero-stage__action">
              <button
                type="button"
                className="primary-action"
                onClick={() => void handlePrimaryAction()}
                disabled={savingPlayer || preparingInstallation || launchingGame}
              >
                {savingPlayer || preparingInstallation || launchingGame ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Play size={18} />
                )}
                <span>{primaryButtonLabel}</span>
              </button>

              <div className="hero-stage__status">
                <span className="hero-stage__status-label">
                  {primaryStatus === "Ready to launch" ? (
                    <ShieldCheck size={14} />
                  ) : (
                    <LoaderCircle size={14} className="spin" />
                  )}
                  {primaryStatus}
                </span>
                <p>{primaryHint}</p>
                {preparingInstallation && installationProgressLabel && (
                  <p>{installationProgressLabel}</p>
                )}
              </div>
            </div>

            {actionMessage && <p className="hero-action-note">{actionMessage}</p>}

            <div className="progress-panel" aria-label="Launcher preparation">
              <div className="progress-panel__header">
                <span>{progressPanelLabel}</span>
                <span>{progressPanelValue}</span>
              </div>
              <div className="progress-track" role="presentation">
                <div
                  className="progress-track__fill"
                  style={{ width: `${progressPanelPercent}%` }}
                />
              </div>
            </div>
          </section>

          <aside className="utility-rail" aria-label="Player and menu">
            <section className="profile-card">
              <div className="profile-card__avatar" aria-hidden="true">
                <UserRound size={32} />
              </div>
              <div className="profile-card__body">
                <p className="eyebrow">Player</p>
                <h3>
                  {playerState.kind === "loading"
                    ? "Checking profile"
                    : offlinePlayer?.playerName ?? "Offline profile"}
                </h3>
                <p>
                  {playerState.kind === "ready"
                    ? playerState.value.message
                    : playerState.kind === "error"
                      ? playerState.message
                      : "Checking offline player profile."}
                </p>

                <label className="profile-card__field">
                  <span>Player name</span>
                  <input
                    type="text"
                    maxLength={16}
                    value={playerNameInput}
                    onChange={(event) => setPlayerNameInput(event.target.value)}
                    placeholder="Enter offline name"
                  />
                </label>

                <div className="profile-card__actions">
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => void handleSaveOfflinePlayer()}
                    disabled={savingPlayer}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => void handleClearOfflinePlayer()}
                    disabled={savingPlayer}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </section>

            <section className="menu-card">
              <div className="menu-card__header">
                <div>
                  <p className="eyebrow">Menu</p>
                  <h3>Icons</h3>
                </div>
              </div>

              <div className="menu-list">
                <button
                  type="button"
                  className="menu-button"
                  onClick={() => setShowSettings(true)}
                  aria-label="Open settings"
                >
                  <Settings2 size={18} />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  className="menu-button"
                  onClick={() => setShowSettings(true)}
                  aria-label="Open update settings"
                >
                  <Download size={18} />
                  <span>Updates</span>
                </button>
                <button
                  type="button"
                  className="menu-button"
                  onClick={() => setShowSettings(true)}
                  aria-label="Open installation settings"
                >
                  <HardDriveDownload size={18} />
                  <span>Storage</span>
                </button>
                <button
                  type="button"
                  className="menu-button"
                  onClick={() => setShowSettings(true)}
                  aria-label="Open diagnostics"
                >
                  <CircleAlert size={18} />
                  <span>Diagnostics</span>
                </button>
              </div>
            </section>
          </aside>
        </section>
      </div>

      <aside className={`settings-drawer ${showSettings ? "settings-drawer--open" : ""}`}>
        <div className="settings-drawer__header">
          <div>
            <p className="eyebrow">Settings</p>
            <h3>Launcher controls</h3>
          </div>
          <button
            type="button"
            className="text-action"
            data-tauri-drag-region="false"
            onClick={() => setShowSettings(false)}
          >
            <X size={14} />
            Hide
          </button>
        </div>

        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card__header">
              <h4>Launcher update</h4>
            </div>
            <p className="settings-card__lead">
              This is the place for self-update controls. The intended update path
              is GitHub Releases with a signed update bundle.
            </p>
            <dl className="settings-meta">
              <div>
                <dt>Channel</dt>
                <dd>GitHub Releases</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Scaffold only</dd>
              </div>
            </dl>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <h4>RAM</h4>
            </div>
            <p className="settings-card__lead">
              Memory allocation belongs here instead of the main screen.
            </p>
            {launcherSettingsState.kind === "error" ? (
              <p className="settings-error-note">{launcherSettingsState.message}</p>
            ) : (
              <div className="settings-control-stack">
                <div className="settings-inline-fields">
                  <label className="settings-slider-field">
                    <span>Memory limit</span>
                    <input
                      className="settings-slider"
                      type="range"
                      min={ramMinMb}
                      max={ramMaxMb}
                      step={ramStepMb}
                      value={ramInputMb}
                      onChange={(event) =>
                        updateRamInput(Number.parseInt(event.target.value, 10))
                      }
                      disabled={launcherSettingsState.kind !== "ready" || savingSettings}
                    />
                  </label>

                  <label className="settings-number-field">
                    <span>Current value</span>
                    <input
                      type="number"
                      min={ramMinMb}
                      max={ramMaxMb}
                      step={ramStepMb}
                      value={ramInputMb}
                      onChange={(event) =>
                        updateRamInput(Number.parseInt(event.target.value || "0", 10))
                      }
                      disabled={launcherSettingsState.kind !== "ready" || savingSettings}
                    />
                  </label>
                </div>

                <div className="settings-inline-meta">
                  <span className="settings-value-chip">{ramInputLabel}</span>
                  <span className="settings-helper-text">
                    Launches Minecraft with the selected `-Xmx` limit.
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
                    {savingSettings ? "Saving..." : "Save RAM"}
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
                    Reset
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <h4>Java runtime</h4>
            </div>
            <p className="settings-card__lead">
              Leave this blank to use the first `java` found in PATH, or point it
              to a custom `java.exe` when you want the launcher to stick to one
              known runtime.
            </p>
            {launcherSettingsState.kind === "error" ? (
              <p className="settings-error-note">{launcherSettingsState.message}</p>
            ) : (
              <div className="settings-control-stack">
                <label className="settings-path-field">
                  <span>Java executable path</span>
                  <input
                    type="text"
                    value={javaPathInput}
                    onChange={(event) => updateJavaPathInput(event.target.value)}
                    placeholder="C:\\Program Files\\Java\\bin\\java.exe"
                    disabled={launcherSettingsState.kind !== "ready" || savingSettings}
                  />
                </label>

                <div className="settings-inline-meta">
                  <span className="settings-value-chip">
                    {javaPathNormalized.length > 0 ? "Custom path" : "System PATH"}
                  </span>
                  <span className="settings-helper-text">
                    The launcher will try this executable before falling back to the
                    system lookup.
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
                    {savingSettings ? "Saving..." : "Save runtime"}
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => {
                      if (launcherSettings != null) {
                        setJavaPathInput(launcherSettings.javaExecutablePath ?? "");
                      } else {
                        void refreshLauncherSettings();
                      }
                    }}
                    disabled={savingSettings}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <h4>Readiness</h4>
            </div>
            <ul className="settings-checklist">
              {readinessChecks.map((check) => (
                <li key={check.id} className={`settings-checkline settings-checkline--${check.state}`}>
                  <span className="settings-checkline__label">{check.label}</span>
                  <span className="settings-checkline__value">
                    {checkStateLabel[check.state]}
                  </span>
                </li>
              ))}
              {readinessChecks.length === 0 && (
                <li className="settings-checkline settings-checkline--pending">
                  <span className="settings-checkline__label">Loading launcher state</span>
                  <span className="settings-checkline__value">Pending</span>
                </li>
              )}
            </ul>
          </section>

          <section className="settings-card settings-card--wide">
            <div className="settings-card__header">
              <h4>Diagnostics</h4>
            </div>
            <dl className="settings-diagnostics">
              {settingsRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </aside>
    </main>
  );
}

export default App;
