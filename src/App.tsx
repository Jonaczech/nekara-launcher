import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Copy,
  ExternalLink,
  House,
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
  beginMicrosoftDeviceLogin,
  checkJavaRuntime,
  clearOfflinePlayerProfile,
  ensureNekaraGameDirectory,
  getGameLaunchStatus,
  getLauncherSettings,
  getMinecraftInstallationStatus,
  getMicrosoftAccountStatus,
  getOfflinePlayerStatus,
  launchMinecraft,
  pollMicrosoftDeviceLogin,
  prepareMinecraftInstallation,
  saveLauncherSettings,
  saveOfflinePlayerProfile,
  signOutMicrosoftAccount,
} from "./services/launcher";
import { checkLauncherUpdate, installLauncherUpdate } from "./services/updater";
import type {
  GameDirectoryInfo,
  GameLaunchStatus,
  JavaRuntimeCheck,
  LauncherSettings,
  LauncherUpdateStatus,
  MicrosoftAccountStatus,
  MinecraftInstallationStatus,
  OfflinePlayerStatus,
} from "./types/launcher";

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

const appVersion = packageInfo.version;

function App() {
  const [directoryState, setDirectoryState] = useState<LoadState<GameDirectoryInfo>>({
    kind: "loading",
  });
  const [javaState, setJavaState] = useState<LoadState<JavaRuntimeCheck>>({
    kind: "loading",
  });
  const [installationState, setInstallationState] = useState<
    LoadState<MinecraftInstallationStatus>
  >({ kind: "loading" });
  const [gameLaunchState, setGameLaunchState] = useState<LoadState<GameLaunchStatus>>({
    kind: "loading",
  });
  const [launcherSettingsState, setLauncherSettingsState] = useState<
    LoadState<LauncherSettings>
  >({ kind: "loading" });
  const [launcherUpdateState, setLauncherUpdateState] = useState<
    LoadState<LauncherUpdateStatus>
  >({ kind: "loading" });
  const [playerState, setPlayerState] = useState<LoadState<OfflinePlayerStatus>>({
    kind: "loading",
  });
  const [microsoftState, setMicrosoftState] = useState<LoadState<MicrosoftAccountStatus>>({
    kind: "loading",
  });
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [ramInputMb, setRamInputMb] = useState(4096);
  const [javaPathInput, setJavaPathInput] = useState("");
  const [gameDirectoryPathInput, setGameDirectoryPathInput] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [preparingInstallation, setPreparingInstallation] = useState(false);
  const [launchingGame, setLaunchingGame] = useState(false);
  const [startingMicrosoftLogin, setStartingMicrosoftLogin] = useState(false);
  const [signingOutMicrosoft, setSigningOutMicrosoft] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<"home" | "settings">("home");

  function updateRamInput(value: number) {
    if (!Number.isNaN(value)) {
      setRamInputMb(value);
    }
  }

  function updateJavaPathInput(value: string) {
    setJavaPathInput(value);
  }

  function updateGameDirectoryPathInput(value: string) {
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

  async function refreshMicrosoftStatus() {
    try {
      const status = await getMicrosoftAccountStatus();
      setMicrosoftState({ kind: "ready", value: status });
      return status;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Stav Microsoft přihlášení není k dispozici.";
      setMicrosoftState({ kind: "error", message });
      throw error;
    }
  }

  useEffect(() => {
    void refreshOfflinePlayerStatus();
    void refreshMicrosoftStatus();

    const directoryTimer = window.setTimeout(() => {
      void refreshDirectoryInfo();
    }, 80);

    const settingsTimer = window.setTimeout(() => {
      void refreshLauncherSettings();
    }, 250);

    const gameStatusTimer = window.setTimeout(() => {
      void refreshGameLaunchStatus();
    }, 700);

    const javaTimer = window.setTimeout(() => {
      void refreshJavaRuntime();
    }, 1200);

    const installTimer = window.setTimeout(() => {
      void refreshInstallationStatus();
    }, 1800);

    const updateTimer = window.setTimeout(() => {
      void refreshLauncherUpdateStatus().catch(() => undefined);
    }, 3200);

    return () => {
      window.clearTimeout(directoryTimer);
      window.clearTimeout(settingsTimer);
      window.clearTimeout(gameStatusTimer);
      window.clearTimeout(javaTimer);
      window.clearTimeout(installTimer);
      window.clearTimeout(updateTimer);
    };
  }, []);

  useEffect(() => {
    if (microsoftState.kind !== "ready" || microsoftState.value.state !== "pending") {
      return;
    }

    const delaySeconds = Math.max(microsoftState.value.pollIntervalSeconds ?? 5, 5);
    const timer = window.setTimeout(() => {
      void handlePollMicrosoftLogin();
    }, delaySeconds * 1000);

    return () => window.clearTimeout(timer);
  }, [microsoftState]);

  const gameDirectory = directoryState.kind === "ready" ? directoryState.value : null;
  const javaRuntime = javaState.kind === "ready" ? javaState.value : null;
  const installationStatus =
    installationState.kind === "ready" ? installationState.value : null;
  const gameLaunch = gameLaunchState.kind === "ready" ? gameLaunchState.value : null;
  const launcherSettings =
    launcherSettingsState.kind === "ready" ? launcherSettingsState.value : null;
  const launcherUpdate =
    launcherUpdateState.kind === "ready" ? launcherUpdateState.value : null;
  const offlinePlayer = playerState.kind === "ready" ? playerState.value : null;
  const microsoftAccount = microsoftState.kind === "ready" ? microsoftState.value : null;

  const microsoftReady = microsoftAccount?.state === "ready";
  const offlinePlayerReady = offlinePlayer?.state === "ready";
  const identityReady = microsoftReady || offlinePlayerReady;
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
  const installationProgressLabel =
    installationStatus == null
      ? null
      : `${installationStatus.libraryCountReady}/${installationStatus.libraryCountTotal} libraries, ${installationStatus.assetCountReady}/${installationStatus.assetCountTotal} assets, ${installationStatus.modCountReady}/${installationStatus.modCountTotal} mods`;
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
  const primaryHint =
    installationErrorMessage != null
      ? installationErrorMessage
      : !identityReady
        ? "Přihlas se přes Microsoft nebo vyplň offline jméno hráče."
        : gameRunning
          ? gameLaunch?.message ?? "Minecraft právě běží z launcheru."
          : gameFailed || gameExitedWithError
            ? gameLaunch?.diagnosticSummary ??
              gameLaunch?.suggestedFix ??
              gameLaunch?.message ??
              "Minecraft nenaběhl správně."
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
                    ? "Vše potřebné pro spuštění Nekary je připravené."
                    : !javaCompatible
                      ? "Fabric klientské soubory jsou připravené. Zbývá už jen kompatibilní Java runtime."
                      : "Launcher ještě kontroluje zbývající runtime detaily.";

  const primaryButtonLabel = !identityReady
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
  const gameDirectoryPathNormalized = gameDirectoryPathInput.trim();
  const savedJavaPathNormalized = launcherSettings?.javaExecutablePath?.trim() ?? "";
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
  const updateAvailable = launcherUpdate?.available ?? false;
  const currentVersionLabel = `v${appVersion}`;
  const updateSummary =
    launcherUpdateState.kind === "error"
      ? "Update chyba"
      : updateAvailable
        ? `Update ${launcherUpdate?.version ?? ""}`.trim()
        : "Aktuální build";
  const releaseStatusLabel =
    launcherUpdateState.kind === "loading"
      ? "Kontroluji..."
      : launcherUpdateState.kind === "error"
        ? "Nedostupné"
        : updateAvailable
          ? `Dostupná aktualizace ${launcherUpdate?.version}`
          : "Aktuální build";
  const secondaryActionLabel = updateAvailable
    ? "Nainstalovat update"
    : "Zkontrolovat update";

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
      await refreshInstallationStatus();
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
        gameDirectoryPathInput.trim().length > 0 ? gameDirectoryPathInput.trim() : null,
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
      setActionMessage(settings.message);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Nastavení launcheru se nepodařilo uložit.";
      setLauncherSettingsState({ kind: "error", message });
      setActionMessage(message);
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
      const message =
        error instanceof Error
          ? error.message
          : "Stav aktualizace launcheru není k dispozici.";
      setActionMessage(message);
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
      const message =
        error instanceof Error
          ? error.message
          : "Aktualizaci launcheru se nepodařilo nainstalovat.";
      setActionMessage(message);
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
      const message =
        error instanceof Error ? error.message : "Minecraft se nepodařilo spustit.";
      setGameLaunchState({ kind: "error", message });
      setActionMessage(message);
    } finally {
      setLaunchingGame(false);
    }
  }

  async function handlePrimaryAction() {
    if (!identityReady) {
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

  async function handleBeginMicrosoftLogin() {
    setActionMessage(null);
    setStartingMicrosoftLogin(true);

    try {
      const status = await beginMicrosoftDeviceLogin();
      setMicrosoftState({ kind: "ready", value: status });
      setActionMessage(status.message);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Microsoft přihlášení se nepodařilo zahájit.";
      setMicrosoftState({ kind: "error", message });
      setActionMessage(message);
    } finally {
      setStartingMicrosoftLogin(false);
    }
  }

  async function handlePollMicrosoftLogin() {
    try {
      const status = await pollMicrosoftDeviceLogin();
      setMicrosoftState({ kind: "ready", value: status });
      setActionMessage(status.message);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Microsoft přihlášení se nepodařilo dokončit.";
      setMicrosoftState({ kind: "error", message });
      setActionMessage(message);
    }
  }

  async function handleSignOutMicrosoft() {
    setActionMessage(null);
    setSigningOutMicrosoft(true);

    try {
      const status = await signOutMicrosoftAccount();
      setMicrosoftState({ kind: "ready", value: status });
      setActionMessage("Microsoft účet byl odhlášen.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Microsoft účet se nepodařilo odhlásit.";
      setActionMessage(message);
    } finally {
      setSigningOutMicrosoft(false);
    }
  }

  async function handleCopyMicrosoftCode(value: string | null) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setActionMessage("Microsoft kód byl zkopírován do schránky.");
    } catch {
      setActionMessage("Kód nešlo zkopírovat automaticky. Zkopíruj ho ručně.");
    }
  }

  function handleOpenMicrosoftVerification(url: string | null) {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
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

            {currentView === "home" ? (
              <>
                <section className="hero-panel">
                  <div className="hero-copy">
                    <p className="hero-eyebrow">Nekara Launcher</p>
                    <h1 id="launcher-title">Nekara</h1>
                    <p className="hero-subtitle">Jedna hra. Jeden klient. Jedna cesta do světa.</p>
                  </div>

                  <div className="hero-actions hero-actions--stacked">
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

                    <section className="progress-panel progress-panel--hero" aria-label="Průběh přípravy launcheru">
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
                    <p>{actionMessage ?? primaryHint}</p>
                    {preparingInstallation && installationProgressLabel && (
                      <p className="hero-status__meta">{installationProgressLabel}</p>
                    )}
                  </div>
                </section>

                <section className="home-grid">
                  <section className="home-card home-card--player">
                    <div className="panel-heading">
                      <UserRound size={18} />
                      <span>Hráč</span>
                    </div>
                    <p className="home-card__lead">
                      Lokální profil pro první spuštění klienta nebo fallback bez Microsoft účtu.
                    </p>
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
                  </section>

                  <section className="home-card home-card--account">
                    <div className="panel-heading">
                      <ShieldCheck size={18} />
                      <span>Minecraft účet</span>
                    </div>
                    <p className="home-card__lead">
                      Přímé Microsoft přihlášení pro ověření Minecraft Java účtu.
                    </p>

                    <div className="home-summary home-summary--single">
                      <div>
                        <dt>Stav účtu</dt>
                        <dd>
                          {microsoftState.kind === "loading"
                            ? "Načítám..."
                            : microsoftState.kind === "error"
                              ? microsoftState.message
                              : microsoftAccount?.message ?? "Microsoft účet není dostupný."}
                        </dd>
                      </div>

                      {microsoftAccount?.state === "ready" && (
                        <div>
                          <dt>Aktivní profil</dt>
                          <dd>{microsoftAccount.playerName}</dd>
                        </div>
                      )}

                      {microsoftAccount?.state === "pending" && (
                        <>
                          <div>
                            <dt>Kód</dt>
                            <dd className="home-code">{microsoftAccount.userCode}</dd>
                          </div>
                          <div>
                            <dt>Ověřovací stránka</dt>
                            <dd className="home-link">{microsoftAccount.verificationUri}</dd>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="profile-card__actions">
                      {microsoftAccount?.state === "ready" ? (
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => void handleSignOutMicrosoft()}
                          disabled={signingOutMicrosoft}
                        >
                          {signingOutMicrosoft ? "Odhlašuji..." : "Odhlásit Microsoft účet"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => void handleBeginMicrosoftLogin()}
                          disabled={startingMicrosoftLogin}
                        >
                          {startingMicrosoftLogin ? "Zahajuji..." : "Přihlásit přes Microsoft"}
                        </button>
                      )}

                      {microsoftAccount?.state === "pending" && (
                        <>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => handleOpenMicrosoftVerification(microsoftAccount.verificationUri)}
                          >
                            <ExternalLink size={16} />
                            Otevřít ověření
                          </button>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => void handleCopyMicrosoftCode(microsoftAccount.userCode)}
                          >
                            <Copy size={16} />
                            Kopírovat kód
                          </button>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => void handlePollMicrosoftLogin()}
                          >
                            Zkontrolovat přihlášení
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                </section>
              </>
            ) : (
              <section className="settings-page">
                <div className="settings-page__header">
                  <div>
                    <p className="eyebrow">Nastavení</p>
                    <h2>Ovládání launcheru</h2>
                  </div>
                  <p className="settings-page__lead">
                    Sekundární volby a aktualizace bez rušivých diagnostických bloků.
                  </p>
                </div>

                <div className="settings-grid">
                  <section className="settings-card">
                    <div className="settings-card__header">
                      <h4>Aktualizace launcheru</h4>
                    </div>
                    <p className="settings-card__lead">
                      Launcher kontroluje podepsané artefakty z GitHub Releases a aktualizace instaluje na vyžádání.
                    </p>
                    <div className="settings-control-stack">
                      <dl className="settings-meta">
                        <div>
                          <dt>Verze launcheru</dt>
                          <dd>{currentVersionLabel}</dd>
                        </div>
                        <div>
                          <dt>Aktuální build</dt>
                          <dd>{updateSummary}</dd>
                        </div>
                        <div>
                          <dt>Release stav</dt>
                          <dd>{releaseStatusLabel}</dd>
                        </div>
                        <div>
                          <dt>Kanál</dt>
                          <dd>GitHub Releases</dd>
                        </div>
                      </dl>

                      <div className="settings-update-state">
                        <span className="settings-value-chip">{releaseStatusLabel}</span>
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
                          {checkingUpdate ? "Kontroluji..." : secondaryActionLabel}
                        </button>
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => void handleInstallLauncherUpdate()}
                          disabled={checkingUpdate || installingUpdate || !updateAvailable}
                        >
                          {installingUpdate ? "Instaluji..." : "Nainstalovat aktualizaci"}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card__header">
                      <h4>Instalace klienta</h4>
                    </div>
                    <p className="settings-card__lead">
                      Tady nastavíš, kam se má ukládat Minecraft, Fabric i schválené mody.
                    </p>
                    {launcherSettingsState.kind === "error" ? (
                      <p className="settings-error-note">{launcherSettingsState.message}</p>
                    ) : (
                      <div className="settings-control-stack">
                        <label className="settings-path-field">
                          <span>Cílová složka klienta</span>
                          <input
                            type="text"
                            value={gameDirectoryPathInput}
                            onChange={(event) =>
                              updateGameDirectoryPathInput(event.target.value)
                            }
                            placeholder="D:\\Games\\Nekara"
                            disabled={launcherSettingsState.kind !== "ready" || savingSettings}
                          />
                        </label>

                        <div className="settings-inline-meta">
                          <span className="settings-value-chip">
                            {gameDirectoryPathNormalized.length > 0
                              ? "Vlastní umístění"
                              : "Výchozí AppData"}
                          </span>
                          <span className="settings-helper-text">
                            Prázdné pole použije výchozí adresář launcheru v AppData. Vyplněná
                            cesta musí být absolutní.
                          </span>
                        </div>

                        {gameDirectory?.minecraftDir && (
                          <div className="settings-inline-meta">
                            <span className="settings-value-chip">Aktuální složka</span>
                            <span className="settings-helper-text">
                              {gameDirectory.minecraftDir}
                            </span>
                          </div>
                        )}

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
                            {savingSettings ? "Ukládám..." : "Uložit umístění"}
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
                            Obnovit
                          </button>
                        </div>
                      </div>
                    )}
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
                            Spouští Minecraft s vybraným limitem <code>-Xmx</code>.
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
                      Nech to prázdné, pokud chceš použít první <code>java</code> z PATH, nebo sem vlož vlastní <code>java.exe</code>.
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
                            Launcher zkusí tento soubor dřív, než přejde na systémové hledání.
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
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
