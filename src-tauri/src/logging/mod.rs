use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::filesystem;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLogInfo {
    pub log_dir: String,
    pub log_file: String,
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn sanitize_line(value: &str) -> String {
    value.replace(['\r', '\n'], " ").trim().to_string()
}

pub fn launcher_log_dir() -> Result<PathBuf, String> {
    filesystem::ensure_launcher_subdirectory("logs")
}

pub fn launcher_log_file_path() -> Result<PathBuf, String> {
    Ok(launcher_log_dir()?.join("launcher.log"))
}

pub fn append_launcher_log_entry(scope: &str, message: &str) -> Result<(), String> {
    let log_file_path = launcher_log_file_path()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file_path)
        .map_err(|error| {
            format!(
                "Unable to open launcher log file at {}: {error}",
                log_file_path.display()
            )
        })?;

    writeln!(
        file,
        "{} [{}] {}",
        timestamp_ms(),
        sanitize_line(scope),
        sanitize_line(message),
    )
    .map_err(|error| {
        format!(
            "Unable to write launcher log entry to {}: {error}",
            log_file_path.display()
        )
    })
}

#[tauri::command]
pub fn get_launcher_log_info() -> Result<LauncherLogInfo, String> {
    let log_dir = launcher_log_dir()?;
    let log_file = launcher_log_file_path()?;

    Ok(LauncherLogInfo {
        log_dir: log_dir.display().to_string(),
        log_file: log_file.display().to_string(),
    })
}

#[tauri::command]
pub fn append_launcher_log(scope: String, message: String) -> Result<(), String> {
    append_launcher_log_entry(&scope, &message)
}
