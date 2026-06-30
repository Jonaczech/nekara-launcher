use std::fs;
use std::path::PathBuf;

use directories::ProjectDirs;
use serde::Serialize;

use crate::config;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDirectoryInfo {
    launcher_data_dir: String,
    nekara_game_dir: String,
    minecraft_dir: String,
    exists: bool,
    created: bool,
    message: String,
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
    let dirs = project_dirs()?;
    Ok(dirs.data_local_dir().join("Nekara").join("game"))
}

pub fn launcher_data_dir() -> Result<PathBuf, String> {
    Ok(project_dirs()?.data_local_dir().to_path_buf())
}

#[tauri::command]
pub fn ensure_nekara_game_directory() -> Result<GameDirectoryInfo, String> {
    let launcher_data_dir = launcher_data_dir()?;
    let game_dir = nekara_game_dir()?;
    let minecraft_dir = game_dir.join(".minecraft");

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
        exists: true,
        created: !existed_before,
        message: if existed_before {
            "Nekara game directory already exists.".to_string()
        } else {
            "Nekara game directory was created.".to_string()
        },
    })
}
