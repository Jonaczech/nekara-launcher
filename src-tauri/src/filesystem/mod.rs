use std::fs;
use std::path::PathBuf;

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

use crate::config;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDirectoryInfo {
    launcher_data_dir: String,
    nekara_game_dir: String,
    minecraft_dir: String,
    configured_game_directory_path: Option<String>,
    exists: bool,
    created: bool,
    message: String,
}

#[derive(Deserialize)]
struct LauncherSettingsFile {
    #[serde(default)]
    game_directory_path: Option<String>,
}

fn project_dirs() -> Result<ProjectDirs, String> {
    ProjectDirs::from("cz", "Nekara", config::PRODUCT_NAME)
        .ok_or_else(|| "Unable to determine launcher data directory.".to_string())
}

pub fn ensure_launcher_data_dir() -> Result<PathBuf, String> {
    let data_dir = launcher_data_dir()?;
    fs::create_dir_all(&data_dir).map_err(|error| {
        format!(
            "Unable to create launcher data directory at {}: {error}",
            data_dir.display()
        )
    })?;
    Ok(data_dir)
}

pub fn ensure_launcher_subdirectory(name: &str) -> Result<PathBuf, String> {
    let directory = ensure_launcher_data_dir()?.join(name);
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "Unable to create launcher directory at {}: {error}",
            directory.display()
        )
    })?;
    Ok(directory)
}

pub fn nekara_game_dir() -> Result<PathBuf, String> {
    if let Some(custom_path) = configured_game_directory_path()? {
        return Ok(custom_path);
    }

    let dirs = project_dirs()?;
    Ok(dirs.data_local_dir().join("Nekara").join("game"))
}

pub fn launcher_data_dir() -> Result<PathBuf, String> {
    Ok(project_dirs()?.data_local_dir().to_path_buf())
}

pub fn updater_cache_dir() -> Result<PathBuf, String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "Unable to determine local application data directory.".to_string())?;

    Ok(PathBuf::from(local_app_data).join("nekara-launcher-updater"))
}

fn configured_game_directory_path() -> Result<Option<PathBuf>, String> {
    let settings_path = launcher_data_dir()?.join(config::LAUNCHER_SETTINGS_FILE);
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

    let Some(path) = settings
        .game_directory_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let candidate = PathBuf::from(&path);
    if !candidate.is_absolute() {
        return Err("Configured game directory path must be absolute.".to_string());
    }

    Ok(Some(candidate))
}

#[tauri::command]
pub fn clear_launcher_updater_cache() -> Result<bool, String> {
    let cache_dir = updater_cache_dir()?;

    if !cache_dir.exists() {
        return Ok(false);
    }

    fs::remove_dir_all(&cache_dir).map_err(|error| {
        format!(
            "Unable to clear launcher updater cache at {}: {error}",
            cache_dir.display()
        )
    })?;

    Ok(true)
}

#[tauri::command]
pub fn ensure_nekara_game_directory() -> Result<GameDirectoryInfo, String> {
    let launcher_data_dir = launcher_data_dir()?;
    let game_dir = nekara_game_dir()?;
    let minecraft_dir = game_dir.join(".minecraft");
    let configured_game_directory_path =
        configured_game_directory_path()?.map(|path| path.display().to_string());

    let existed_before = game_dir.exists() && minecraft_dir.exists();

    fs::create_dir_all(&minecraft_dir).map_err(|error| {
        format!(
            "Unable to create Nekara game directory at {}: {error}",
            game_dir.display()
        )
    })?;

    Ok(GameDirectoryInfo {
        launcher_data_dir: launcher_data_dir.display().to_string(),
        nekara_game_dir: game_dir.display().to_string(),
        minecraft_dir: minecraft_dir.display().to_string(),
        configured_game_directory_path,
        exists: true,
        created: !existed_before,
        message: if existed_before {
            "Nekara game directory already exists.".to_string()
        } else {
            "Nekara game directory was created.".to_string()
        },
    })
}
