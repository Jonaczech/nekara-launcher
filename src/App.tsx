import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  CircleAlert,
  Download,
  LoaderCircle,
  Minimize2,
  Play,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import packageInfo from "../package.json";
import launcherIcon from "../brand/icons/ikona.png";
import launcherWallpaper from "../brand/wallpapers/pozadi.png";
import "./App.css";
import {
  checkJavaRuntime,
  clearOfflinePlayerProfile,
  getLauncherLogInfo,
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
import {
  checkLauncherUpdate,
  installLauncherUpdate,
} from "./services/updater";
import type {
  GameLaunchStatus,
  GameDirectoryInfo,
  JavaRuntimeCheck,
  LauncherLogInfo,
  LauncherCheck,
  LauncherSettings,
  LauncherStatus,
  LauncherUpdateStatus,
  MinecraftInstallationStatus,
  OfflinePlayerStatus,
} from "./types/launcher";

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

const checkStateLabel: Record<LauncherCheck["state"], string> = {
  ready: "Připraveno",
  pending: "Čeká",
  blocked: "Blokováno",
};

const appVersion = packageInfo.version;

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
  const [launcherLogState, setLauncherLogState] = useState<
    LoadState<LauncherLogInfo>
  >({ kind: "loading" });
  const [launcherUpdateState, setLauncherUpdateState] = useState<
    LoadState<LauncherUpdateStatus>
  >({ kind: "loading" });
  const [playerState, setPlayerState] = useState<LoadState<OfflinePlayerStatus>>({
    kind: "loading",
  });
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [ramInputMb, setRamInputMb] = useState(4096);
  const [javaPathInput, setJavaPathInput] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [preparingInstallation, setPreparingInstallation] = useState(false);
  const [launchingGame, setLaunchingGame] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [startupSettled, setStartupSettled] = useState(false);
  const autoPrepareTriggeredRef = useRef(false);

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
            : "Stav launcheru není k dispozici.",
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
            : "Stav instalace Minecraftu není k dispozici.",
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
            : "Stav spuštění Minecraftu není k dispozici.",
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
            : "Detekce Java runtime není k dispozici.",
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
            : "Nastavení launcheru není k dispozici.",
      });
    }
  }

  async function refreshLauncherUpdateStatus() {
    try {
      const update = await checkLauncherUpdate();
      setLauncherUpdateState({ kind: "ready", value: update });
      return update;
    } catch (error: unknown) {
      setLauncherUpdateState({
        kind: "error",
        message:
          error instanceof Error
          ? error.message
            : "Stav aktualizace launcheru není k dispozici.",
      });
      throw error;
    }
  }

  useEffect(() => {
    let isMounted = true;

    void refreshLauncherStatus();

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
                : "Příprava herního adresáře není k dispozici.",
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
                : "Stav offline hráče není k dispozici.",
          });
        }
      });

    void refreshGameLaunchStatus();
    void refreshLauncherSettings();

    getLauncherLogInfo()
      .then((info) => {
        if (isMounted) {
          setLauncherLogState({ kind: "ready", value: info });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLauncherLogState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Umístění logu launcheru není k dispozici.",
          });
        }
      });

    const startupSettleTimeout = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }

      setStartupSettled(true);
    }, 900);

    const deferredRuntimeTimeout = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }

      void refreshJavaRuntime();
      void refreshInstallationStatus();
    }, 180);

    const deferredUpdaterTimeout = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }

      void refreshLauncherUpdateStatus().catch(() => {
        // The state is already updated inside refreshLauncherUpdateStatus.
      });
    }, 1400);

    return () => {
      isMounted = false;
      window.clearTimeout(startupSettleTimeout);
      window.clearTimeout(deferredRuntimeTimeout);
      window.clearTimeout(deferredUpdaterTimeout);
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

  useEffect(() => {
    if (autoPrepareTriggeredRef.current) {
      return;
    }

    if (!startupSettled) {
      return;
    }

    if (installationState.kind !== "ready") {
      return;
    }

    if (installationState.value.state === "ready") {
      autoPrepareTriggeredRef.current = true;
      return;
    }

    if (preparingInstallation || launchingGame) {
      return;
    }

    autoPrepareTriggeredRef.current = true;
    void handlePrepareInstallation();
  }, [installationState, launchingGame, preparingInstallation, startupSettled]);

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
  const launcherLog =
    launcherLogState.kind === "ready" ? launcherLogState.value : null;
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
      ? "Průběh Fabric klienta"
      : "Průběh přípravy";
  const progressPanelValue =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? `${installOperationPercent}%`
      : `${readinessCount}/5 připraveno`;
  const progressPanelPercent =
    preparingInstallation || (installationStatus != null && !installationReady)
      ? installOperationPercent
      : readinessPercent;
  const primaryStatus = gameRunning
    ? "Minecraft běží"
    : launchingGame
      ? "Spouštím Minecraft"
      : preparingInstallation
    ? "Připravuji Fabric klienta"
    : readinessCount === 5
      ? "Připraveno ke spuštění"
      : "Připravuji Nekaru";
  const installationErrorMessage =
    installationState.kind === "error" ? installationState.message : null;
  const primaryHint = installationErrorMessage != null
    ? installationErrorMessage
    : !offlinePlayerReady
    ? "Zadej lokální jméno hráče, aby se odemklo spuštění."
    : gameRunning
      ? gameLaunch?.message ?? "Minecraft právě běží z launcheru."
      : gameFailed || gameExitedWithError
        ? gameLaunch?.diagnosticSummary ??
          gameLaunch?.suggestedFix ??
          gameLaunch?.message ??
          "Minecraft nenaběhl správně. Otevři diagnostiku a podívej se na poslední log."
      : launchingGame
        ? "Launcher skládá příkaz ke spuštění a startuje proces Minecraftu."
    : preparingInstallation
      ? installationProgressLabel == null
        ? "Launcher stahuje a ověřuje Fabric klientské soubory, knihovny a assety."
        : `Launcher stahuje a ověřuje Fabric klientské soubory. Aktuální průběh: ${installationProgressLabel}.`
      : !installationReady
        ? installationStatus?.message ??
          "Fabric klientské soubory je ještě potřeba připravit."
        : readinessCount === 5
          ? "Vše potřebné pro první offline spuštění je připravené."
          : !javaCompatible
            ? "Fabric klientské soubory jsou připravené. Zbývá už jen kompatibilní Java runtime."
            : "Launcher ještě kontroluje zbývající runtime detaily.";
  const primaryButtonLabel = !offlinePlayerReady
    ? "Uložit jméno hráče"
    : gameRunning
      ? "Běží"
      : launchingGame
        ? "Spouštím..."
    : preparingInstallation
      ? "Připravuji soubory..."
      : !installationReady
        ? "Připravit klienta"
      : readinessCount === 5
          ? "Hrát"
          : "Instalace připravena";
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
  const launcherUpdate = launcherUpdateState.kind === "ready"
    ? launcherUpdateState.value
    : null;
  const updateAvailable = launcherUpdate?.available ?? false;
  const currentVersionLabel = `v${appVersion}`;
  const playerSummary = offlinePlayer?.playerName ?? "Nenastaveno";
  const installSummary = installationReady
    ? "Klient připraven"
    : preparingInstallation
      ? "Připravuji klienta"
      : "Čeká příprava";
  const javaSummary = javaCompatible
    ? `Java ${javaRuntime?.majorVersion ?? ""}`.trim()
    : "Je potřeba Java";
  const updateSummary =
    launcherUpdateState.kind === "error"
      ? "Update chyba"
      : updateAvailable
        ? `Update ${launcherUpdate?.version ?? ""}`.trim()
        : "Aktuální build";
  const statusPanelTitle = installationReady
    ? gameRunning
      ? "Nekara právě běží"
      : "Klient je připravený"
    : "Příprava klienta";
  const statusPanelText = actionMessage ?? primaryHint;
  const secondaryActionLabel = updateAvailable
    ? "Nainstalovat update"
    : "Zkontrolovat update";

  const diagnosticRows = [
    {
      label: "Fabric loader",
      value: installationStatus?.fabricLoaderVersion ?? "Nedostupné",
    },
    {
      label: "Fabric profil",
      value: installationStatus?.fabricProfileId ?? "Nedostupné",
    },
    {
      label: "Adresář Minecraftu",
      value: gameDirectory?.minecraftDir ?? "Nedostupné",
    },
    {
      label: "Data launcheru",
      value: gameDirectory?.launcherDataDir ?? "Nedostupné",
    },
    {
      label: "Adresář logů launcheru",
      value: launcherLog?.logDir ?? "Nedostupné",
    },
    {
      label: "Soubor logu launcheru",
      value: launcherLog?.logFile ?? "Nedostupné",
    },
    {
      label: "Stav instalace",
      value: installationStatus?.message ?? "Nedostupné",
    },
    {
      label: "JSON verze připraven",
      value:
        installationStatus == null
          ? "Nedostupné"
          : installationStatus.versionJsonReady
            ? "Ano"
            : "Ne",
    },
    {
      label: "Fabric profil připraven",
      value:
        installationStatus == null
          ? "Nedostupné"
          : installationStatus.fabricProfileReady
            ? "Ano"
            : "Ne",
    },
    {
      label: "Knihovny připraveny",
      value:
        installationStatus == null
          ? "Nedostupné"
          : `${installationStatus.libraryCountReady}/${installationStatus.libraryCountTotal} + ${installationStatus.fabricLibraryCountReady}/${installationStatus.fabricLibraryCountTotal}`,
    },
    {
      label: "Assety připraveny",
      value:
        installationStatus == null
          ? "Nedostupné"
          : `${installationStatus.assetCountReady}/${installationStatus.assetCountTotal}`,
    },
    {
      label: "Kompatibilita Javy",
      value: javaCompatible ? "Kompatibilní" : "Aktualizuj Javu pro tuto verzi",
    },
    {
      label: "Spustitelný soubor Javy",
      value: javaRuntime?.executablePath ?? "Zatím nezjištěno.",
    },
    {
      label: "Stav hry",
      value: gameLaunch?.message ?? "Nedostupné",
    },
    {
      label: "Diagnostika spuštění",
      value: gameLaunch?.diagnosticSummary ?? "Žádná diagnostika nebyla zachycena.",
    },
    {
      label: "Navržená oprava",
      value: gameLaunch?.suggestedFix ?? "Zatím nebyla navržena žádná oprava.",
    },
    {
      label: "Log hry",
      value: gameLaunch?.logPath ?? "Nedostupné",
    },
    {
      label: "Úryvek z logu",
      value: gameLaunch?.logExcerpt ?? "Zatím nebyl zachycen žádný úryvek logu.",
    },
  ];

  const readinessChecks: LauncherCheck[] = [
    ...(launcherStatus?.checks ?? []),
    {
      id: "minecraft-installation",
      label: "Fabric klientské soubory",
      state:
        installationState.kind === "error"
          ? "blocked"
          : installationStatus?.state ?? "pending",
    },
    {
      id: "minecraft-process",
      label: "Proces Minecraftu",
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
            : "Offline hráčský profil se nepodařilo uložit.",
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
      setActionMessage("Offline hráčský profil byl vymazán.");
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
            : "Minecraft instalaci se nepodařilo připravit.",
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
            : "Nastavení launcheru se nepodařilo uložit.",
      });
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Nastavení launcheru se nepodařilo uložit.",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleCheckLauncherUpdate() {
    setActionMessage(null);
    setCheckingUpdate(true);

    try {
      const update = await refreshLauncherUpdateStatus();
      setActionMessage(update.message);
    } catch (error: unknown) {
      setLauncherUpdateState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Stav aktualizace launcheru není k dispozici.",
      });
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Stav aktualizace launcheru není k dispozici.",
      );
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallLauncherUpdate() {
    setActionMessage(null);
    setInstallingUpdate(true);

    try {
      const update = await installLauncherUpdate();
      setLauncherUpdateState({ kind: "ready", value: update });
      setActionMessage(update.message);
    } catch (error: unknown) {
      setLauncherUpdateState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Aktualizaci launcheru se nepodařilo nainstalovat.",
      });
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Aktualizaci launcheru se nepodařilo nainstalovat.",
      );
    } finally {
      setInstallingUpdate(false);
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
            : "Minecraft se nepodařilo spustit.",
      });
      setActionMessage(
        error instanceof Error ? error.message : "Minecraft se nepodařilo spustit.",
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
      setActionMessage(gameLaunch?.message ?? "Minecraft už běží.");
      return;
    }

    if (readinessCount === 5) {
      await handleLaunchMinecraft();
      return;
    }

    if (!javaCompatible) {
      setActionMessage(
        installationStatus?.requiredJavaMajor == null
          ? "Fabric klientské soubory jsou připravené. Nainstaluj nebo zpřístupni Javu v PATH a můžeš pokračovat ke spuštění."
          : `Fabric klientské soubory jsou připravené, ale je stále potřeba Java ${installationStatus.requiredJavaMajor} nebo novější.`,
      );
      return;
    }

    setActionMessage("Launcher stále připravuje izolovanou instalaci.");
  }

  return (
    <main className="launcher-shell">
      <div className="launcher-frame">
        <section
          className="launcher-stage"
          aria-labelledby="launcher-title"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(8, 8, 10, 0.96) 0%, rgba(8, 8, 10, 0.8) 32%, rgba(8, 8, 10, 0.2) 66%, rgba(8, 8, 10, 0.62) 100%), linear-gradient(180deg, rgba(8, 8, 10, 0.18), rgba(8, 8, 10, 0.82)), url(${launcherWallpaper})`,
          }}
        >
          <aside className="launcher-rail" aria-label="Navigace launcheru">
            <div className="rail-logo">
              <img src={launcherIcon} alt="Nekara icon" />
            </div>
            <button
              type="button"
              className="rail-button"
              aria-label="Nastavení"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 size={18} />
            </button>
            <button
              type="button"
              className="rail-button"
              aria-label="Diagnostika"
              onClick={() => setShowSettings(true)}
            >
              <CircleAlert size={18} />
            </button>
          </aside>

          <div className="stage-main">
            <header
              className="stage-topbar"
              data-tauri-drag-region="true"
              onMouseDown={handleTitleBarMouseDown}
            >
              <div className="stage-topbar__meta">
                <span className="stage-chip">{currentVersionLabel}</span>
                <span className="stage-chip">{updateSummary}</span>
              </div>

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
                  onClick={() => runWindowAction((appWindow) => appWindow.minimize())}
                >
                  <Minimize2 size={14} />
                </button>
                <button
                  type="button"
                  className="window-icon-button window-icon-button--close"
                  aria-label="Zavřít okno"
                  data-tauri-drag-region="false"
                  onClick={() => runWindowAction((appWindow) => appWindow.close())}
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            <section className="hero-panel">
              <div className="hero-copy">
                <p className="hero-eyebrow">Nekara Launcher</p>
                <h1 id="launcher-title">Nekara</h1>
                <p className="hero-subtitle">Jedna hra. Jeden klient. Jedna cesta do světa.</p>
              </div>

              <div className="hero-actions">
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

                <button
                  type="button"
                  className="icon-action"
                  onClick={() => setShowSettings(true)}
                  aria-label="Otevřít nastavení launcheru"
                >
                  <Settings2 size={18} />
                </button>
              </div>

              <div className="hero-status">
                <span className="hero-status__label">
                  {primaryStatus === "Připraveno ke spuštění" ? (
                    <ShieldCheck size={14} />
                  ) : (
                    <LoaderCircle size={14} className={preparingInstallation ? "spin" : ""} />
                  )}
                  {primaryStatus}
                </span>
                <p>{primaryHint}</p>
              </div>

              <section className="progress-panel progress-panel--hero" aria-label="Příprava launcheru">
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
              </section>
            </section>

            <section className="command-panel">
              <div className="command-panel__player">
                <div className="panel-heading">
                  <UserRound size={18} />
                  <span>Hráč</span>
                </div>
                <label className="player-field">
                  <span className="player-field__label">Offline jméno</span>
                  <input
                    type="text"
                    maxLength={16}
                    value={playerNameInput}
                    onChange={(event) => setPlayerNameInput(event.target.value)}
                    placeholder="Zadej jméno"
                  />
                </label>
                <div className="player-field__actions">
                  <button
                    type="button"
                    className="inline-action"
                    onClick={() => void handleSaveOfflinePlayer()}
                    disabled={savingPlayer}
                  >
                    Uložit
                  </button>
                  <button
                    type="button"
                    className="inline-action inline-action--muted"
                    onClick={() => void handleClearOfflinePlayer()}
                    disabled={savingPlayer}
                  >
                    Vymazat
                  </button>
                </div>
              </div>

              <div className="command-panel__status">
                <div className="status-grid">
                  <div className="status-tile">
                    <span>Profil</span>
                    <strong>{playerSummary}</strong>
                  </div>
                  <div className="status-tile">
                    <span>Klient</span>
                    <strong>{installSummary}</strong>
                  </div>
                  <div className="status-tile">
                    <span>Java</span>
                    <strong>{javaSummary}</strong>
                  </div>
                  <div className="status-tile">
                    <span>Release</span>
                    <strong>{updateSummary}</strong>
                  </div>
                </div>

                <div className="status-story">
                  <p className="status-story__tag">{progressPanelLabel}</p>
                  <h2>{statusPanelTitle}</h2>
                  <p>{statusPanelText}</p>
                  {preparingInstallation && installationProgressLabel && (
                    <p className="status-story__meta">{installationProgressLabel}</p>
                  )}
                </div>

                <div className="command-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      updateAvailable
                        ? void handleInstallLauncherUpdate()
                        : void handleCheckLauncherUpdate()
                    }
                    disabled={checkingUpdate || installingUpdate}
                  >
                    <Download size={16} />
                    <span>
                      {checkingUpdate
                        ? "Kontroluji..."
                        : installingUpdate
                          ? "Instaluji..."
                          : secondaryActionLabel}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary-action secondary-action--muted"
                    onClick={() => setShowSettings(true)}
                  >
                    <CircleAlert size={16} />
                    <span>Detaily</span>
                  </button>
                </div>
              </div>
            </section>

          </div>
        </section>
      </div>

      <aside className={`settings-drawer ${showSettings ? "settings-drawer--open" : ""}`}>
        <div className="settings-drawer__header">
          <div>
            <p className="eyebrow">Nastavení</p>
            <h3>Ovládání launcheru</h3>
          </div>
          <button
            type="button"
            className="text-action"
            data-tauri-drag-region="false"
            onClick={() => setShowSettings(false)}
          >
            <X size={14} />
            Skrýt
          </button>
        </div>

        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card__header">
              <h4>Aktualizace launcheru</h4>
            </div>
            <p className="settings-card__lead">
              Launcher kontroluje podepsané artefakty z GitHub Releases a
              aktualizace instaluje na vyžádání.
            </p>
            <div className="settings-control-stack">
              <dl className="settings-meta">
                <div>
                  <dt>Aktuální verze</dt>
                  <dd>{currentVersionLabel}</dd>
                </div>
                <div>
                  <dt>Kanál</dt>
                  <dd>GitHub Releases</dd>
                </div>
              </dl>

              <div className="settings-update-state">
                <span className="settings-value-chip">
                  {launcherUpdateState.kind === "loading"
                    ? "Kontroluji..."
                    : launcherUpdateState.kind === "error"
                      ? "Nedostupné"
                      : updateAvailable
                        ? `Dostupná aktualizace ${launcherUpdate?.version}`
                        : "Aktuální"}
                </span>
                <p className="settings-helper-text">
                  {launcherUpdateState.kind === "loading"
                    ? "Kontroluji release endpoint kvůli novější verzi launcheru."
                    : launcherUpdateState.kind === "error"
                      ? launcherUpdateState.message
                      : launcherUpdate?.message ?? "Launcher je aktuální."}
                </p>
              </div>

              {updateAvailable && launcherUpdate != null && (
                <div className="settings-release-notes">
                  <div className="settings-release-notes__header">
                    <span>Poznámky k vydání</span>
                    <span>{launcherUpdate.version}</span>
                  </div>
                  {launcherUpdate.date && (
                    <p className="settings-helper-text">{launcherUpdate.date}</p>
                  )}
                  {launcherUpdate.body && (
                    <p className="settings-release-notes__body">{launcherUpdate.body}</p>
                  )}
                </div>
              )}

              <div className="profile-card__actions">
                <button
                  type="button"
                  className="text-action"
                  onClick={() => void handleCheckLauncherUpdate()}
                  disabled={checkingUpdate || installingUpdate}
                >
                  {checkingUpdate ? "Kontroluji..." : "Zkontrolovat aktualizace"}
                </button>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => void handleInstallLauncherUpdate()}
                  disabled={
                    checkingUpdate ||
                    installingUpdate ||
                    !updateAvailable
                  }
                >
                  {installingUpdate ? "Instaluji..." : "Nainstalovat aktualizaci"}
                </button>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <h4>RAM</h4>
            </div>
              <p className="settings-card__lead">
              Přidělení paměti patří sem, ne na hlavní obrazovku.
            </p>
            {launcherSettingsState.kind === "error" ? (
              <p className="settings-error-note">{launcherSettingsState.message}</p>
            ) : (
              <div className="settings-control-stack">
                <div className="settings-inline-fields">
                  <label className="settings-slider-field">
                    <span>Limit paměti</span>
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
                    <span>Aktuální hodnota</span>
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
                    Spouští Minecraft s vybraným limitem `-Xmx`.
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
                    {savingSettings ? "Ukládám..." : "Uložit RAM"}
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
                    Obnovit
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
              Nech to prázdné, pokud chceš použít první `java` z PATH, nebo sem
              vlož vlastní `java.exe`, když chceš používat jen jeden známý runtime.
            </p>
            {launcherSettingsState.kind === "error" ? (
              <p className="settings-error-note">{launcherSettingsState.message}</p>
            ) : (
              <div className="settings-control-stack">
                <label className="settings-path-field">
                  <span>Cesta ke spustitelnému souboru Javy</span>
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
                    {javaPathNormalized.length > 0 ? "Vlastní cesta" : "Systémová PATH"}
                  </span>
                  <span className="settings-helper-text">
                    Launcher zkusí tento soubor dřív, než přejde na systémové
                    hledání.
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
                    {savingSettings ? "Ukládám..." : "Uložit runtime"}
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
                    Obnovit
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <h4>Připravenost</h4>
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
                  <span className="settings-checkline__label">Načítám stav launcheru</span>
                  <span className="settings-checkline__value">Čeká</span>
                </li>
              )}
            </ul>
          </section>

          <section className="settings-card settings-card--wide">
            <div className="settings-card__header">
              <h4>Diagnostika klienta</h4>
            </div>
            <dl className="settings-diagnostics">
              {diagnosticRows.map((row) => (
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
