use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::{config, filesystem};

const DEFAULT_MAX_RAM_MB: u32 = 4096;
const MIN_MAX_RAM_MB: u32 = 2048;
const MAX_MAX_RAM_MB: u32 = 12288;
const RAM_STEP_MB: u32 = 512;

#[derive(Deserialize, Serialize)]
struct LauncherSettingsFile {
    max_ram_mb: u32,
    #[serde(default)]
    java_executable_path: Option<String>,
    #[serde(default)]
    game_directory_path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub max_ram_mb: u32,
    pub java_executable_path: Option<String>,
    pub game_directory_path: Option<String>,
    pub min_ram_mb: u32,
    pub max_allowed_ram_mb: u32,
    pub ram_step_mb: u32,
    pub message: String,
}

fn launcher_settings_path() -> Result<PathBuf, String> {
    Ok(filesystem::ensure_launcher_data_dir()?.join(config::LAUNCHER_SETTINGS_FILE))
}

fn normalize_max_ram_mb(max_ram_mb: u32) -> Result<u32, String> {
    if !(MIN_MAX_RAM_MB..=MAX_MAX_RAM_MB).contains(&max_ram_mb) {
        return Err(format!(
            "Přidělení RAM musí zůstat mezi {} MB a {} MB.",
            MIN_MAX_RAM_MB, MAX_MAX_RAM_MB
        ));
    }

    if !max_ram_mb.is_multiple_of(RAM_STEP_MB) {
        return Err(format!("Přidělení RAM musí používat kroky po {} MB.", RAM_STEP_MB));
    }

    Ok(max_ram_mb)
}

fn read_launcher_settings_file() -> Result<Option<LauncherSettingsFile>, String> {
    let settings_path = launcher_settings_path()?;
    if !settings_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&settings_path).map_err(|error| {
        format!(
            "Unable to read launcher settings from {}: {error}",
            settings_path.display()
        )
    })?;

    let settings = serde_json::from_str::<LauncherSettingsFile>(&contents).map_err(|error| {
        format!(
            "Launcher settings at {} are invalid JSON: {error}",
            settings_path.display()
        )
    })?;

    Ok(Some(settings))
}

fn resolved_max_ram_mb() -> Result<u32, String> {
    match read_launcher_settings_file()? {
        Some(settings) => normalize_max_ram_mb(settings.max_ram_mb),
        None => Ok(DEFAULT_MAX_RAM_MB),
    }
}

fn normalize_game_directory_path(
    game_directory_path: Option<String>,
) -> Result<Option<String>, String> {
    let Some(path) = game_directory_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let candidate = PathBuf::from(&path);
    if !candidate.is_absolute() {
        return Err("Instalační cesta Minecraftu musí být absolutní.".to_string());
    }

    Ok(Some(path))
}

pub fn resolve_java_executable_path() -> Result<Option<String>, String> {
    Ok(read_launcher_settings_file()?
        .and_then(|settings| settings.java_executable_path)
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty()))
}

pub fn resolve_game_directory_path() -> Result<Option<String>, String> {
    let path = read_launcher_settings_file()?
        .and_then(|settings| settings.game_directory_path);
    normalize_game_directory_path(path)
}

pub fn resolve_launcher_settings() -> Result<LauncherSettings, String> {
    let max_ram_mb = resolved_max_ram_mb()?;
    let java_executable_path = resolve_java_executable_path()?;
    let game_directory_path = resolve_game_directory_path()?;
    let message = if let Some(game_directory_path) = game_directory_path.as_deref() {
        if let Some(java_executable_path) = java_executable_path.as_deref() {
            format!(
                "Limit RAM launcheru je nastaven na {} MB, vlastní Java je {} a herní data se ukládají do {}.",
                max_ram_mb, java_executable_path, game_directory_path
            )
        } else {
            format!(
                "Limit RAM launcheru je nastaven na {} MB a herní data se ukládají do {}.",
                max_ram_mb, game_directory_path
            )
        }
    } else if let Some(java_executable_path) = java_executable_path.as_deref() {
        format!(
            "Limit RAM launcheru je nastaven na {} MB a vlastní cesta k Javě je nastavena na {}.",
            max_ram_mb, java_executable_path
        )
    } else {
        format!("Limit RAM launcheru je nastaven na {} MB.", max_ram_mb)
    };

    Ok(LauncherSettings {
        max_ram_mb,
        java_executable_path,
        game_directory_path,
        min_ram_mb: MIN_MAX_RAM_MB,
        max_allowed_ram_mb: MAX_MAX_RAM_MB,
        ram_step_mb: RAM_STEP_MB,
        message,
    })
}

#[tauri::command]
pub fn get_launcher_settings() -> Result<LauncherSettings, String> {
    resolve_launcher_settings()
}

#[tauri::command]
pub fn save_launcher_settings(
    max_ram_mb: u32,
    java_executable_path: Option<String>,
    game_directory_path: Option<String>,
) -> Result<LauncherSettings, String> {
    let normalized_max_ram_mb = normalize_max_ram_mb(max_ram_mb)?;
    let normalized_java_executable_path = java_executable_path
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty());
    let normalized_game_directory_path = normalize_game_directory_path(game_directory_path)?;
    let settings_path = launcher_settings_path()?;
    let settings = LauncherSettingsFile {
        max_ram_mb: normalized_max_ram_mb,
        java_executable_path: normalized_java_executable_path,
        game_directory_path: normalized_game_directory_path,
    };
    let payload = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Unable to encode launcher settings: {error}"))?;

    fs::write(&settings_path, payload).map_err(|error| {
        format!(
            "Unable to save launcher settings to {}: {error}",
            settings_path.display()
        )
    })?;

    resolve_launcher_settings()
}
