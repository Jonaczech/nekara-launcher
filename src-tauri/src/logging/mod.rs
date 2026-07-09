use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::{filesystem, game, java, launcher, settings};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLogInfo {
    pub log_dir: String,
    pub log_file: String,
    pub error_report_file: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LauncherErrorReportInfo {
    pub report_dir: String,
    pub report_file: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherErrorReport {
    generated_at_unix_ms: u128,
    product_name: &'static str,
    app_version: &'static str,
    launcher_status: launcher::LauncherStatus,
    game_launch_status: game::GameLaunchStatus,
    java_runtime: java::JavaRuntimeCheck,
    launcher_settings: settings::LauncherSettings,
    launcher_log_info: LauncherLogInfo,
    launcher_log_excerpt: String,
    game_log_excerpt: Option<String>,
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

pub fn launcher_error_report_file_path() -> Result<PathBuf, String> {
    Ok(launcher_log_dir()?.join("launcher-error-report.txt"))
}

fn read_tail_lines(path: &Path, max_lines: usize) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }

    let contents = std::fs::read_to_string(path)
        .map_err(|error| format!("Unable to read {}: {error}", path.display()))?;
    let mut lines: Vec<&str> = contents.lines().rev().take(max_lines).collect();
    lines.reverse();

    Ok(lines.join("\n"))
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
    let error_report_file = launcher_error_report_file_path()?;

    Ok(LauncherLogInfo {
        log_dir: log_dir.display().to_string(),
        log_file: log_file.display().to_string(),
        error_report_file: error_report_file.display().to_string(),
    })
}

fn build_launcher_error_report() -> Result<LauncherErrorReport, String> {
    let launcher_status = launcher::get_launcher_status();
    let game_launch_status = game::get_game_launch_status()?;
    let java_runtime = java::check_java_runtime()?;
    let launcher_settings = settings::get_launcher_settings()?;
    let launcher_log_info = get_launcher_log_info()?;
    let launcher_log_excerpt = read_tail_lines(Path::new(&launcher_log_info.log_file), 160)?;
    let game_log_excerpt = game::get_game_launch_log_path()?
        .as_deref()
        .map(Path::new)
        .map(|path| read_tail_lines(path, 120))
        .transpose()?;

    Ok(LauncherErrorReport {
        generated_at_unix_ms: timestamp_ms(),
        product_name: crate::config::PRODUCT_NAME,
        app_version: env!("CARGO_PKG_VERSION"),
        launcher_status,
        game_launch_status,
        java_runtime,
        launcher_settings,
        launcher_log_info,
        launcher_log_excerpt,
        game_log_excerpt,
    })
}

#[tauri::command]
pub fn refresh_launcher_error_report() -> Result<LauncherErrorReportInfo, String> {
    let report = build_launcher_error_report()?;
    let report_file_path = launcher_error_report_file_path()?;
    let report_json = serde_json::to_string_pretty(&report)
        .map_err(|error| format!("Unable to encode launcher error report: {error}"))?;

    std::fs::write(&report_file_path, report_json).map_err(|error| {
        format!(
            "Unable to write launcher error report to {}: {error}",
            report_file_path.display()
        )
    })?;

    Ok(LauncherErrorReportInfo {
        report_dir: launcher_log_dir()?.display().to_string(),
        report_file: report_file_path.display().to_string(),
        message: format!("Error report byl uložen do {}.", report_file_path.display()),
    })
}

#[tauri::command]
pub fn append_launcher_log(scope: String, message: String) -> Result<(), String> {
    append_launcher_log_entry(&scope, &message)
}
