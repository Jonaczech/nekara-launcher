use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;

use crate::settings;

mod managed;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone)]
pub struct ResolvedJavaRuntime {
    pub executable_path: Option<String>,
    pub version_line: Option<String>,
    pub java_version: Option<String>,
    pub major_version: Option<u32>,
    pub source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JavaRuntimeState {
    Ready,
    Blocked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeCheck {
    state: JavaRuntimeState,
    detected: bool,
    source: String,
    executable_path: Option<String>,
    version_line: Option<String>,
    java_version: Option<String>,
    major_version: Option<u32>,
    message: String,
}

fn locate_java_executable() -> Option<String> {
    let locator = if cfg!(windows) { "where" } else { "which" };
    let mut command = Command::new(locator);
    command.arg("java");

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

fn capture_java_version_line(java_executable: &str) -> Option<String> {
    let mut command = Command::new(java_executable);
    command.arg("-version");

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = if stderr.trim().is_empty() {
        stdout.as_ref()
    } else {
        stderr.as_ref()
    };

    combined
        .lines()
        .map(str::trim)
        .find(|line| line.contains("version"))
        .or_else(|| {
            combined
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
        })
        .map(ToOwned::to_owned)
}

fn extract_java_version(version_line: &str) -> Option<String> {
    let quoted_start = version_line.find('"')?;
    let rest = &version_line[quoted_start + 1..];
    let quoted_end = rest.find('"')?;
    let quoted = &rest[..quoted_end];

    if quoted.is_empty() {
        None
    } else {
        Some(quoted.to_string())
    }
}

fn extract_major_version(java_version: &str) -> Option<u32> {
    let normalized = java_version.trim().trim_matches('"');
    let candidate = normalized.strip_prefix("1.").unwrap_or(normalized);
    candidate
        .split(['.', '-', '_'])
        .next()
        .and_then(|value| value.parse::<u32>().ok())
}

fn resolve_managed_java_runtime() -> Option<String> {
    managed::resolve_managed_java_executable_path()
        .ok()
        .flatten()
}

pub fn resolve_java_runtime() -> ResolvedJavaRuntime {
    let configured_java_executable = settings::resolve_java_executable_path().ok().flatten();

    let (executable_path, version_line, source) =
        if let Some(configured_java_executable) = configured_java_executable {
            let version_line = capture_java_version_line(&configured_java_executable);
            (
                Some(configured_java_executable),
                version_line,
                "Custom path".to_string(),
            )
        } else if let Some(managed_java_executable) = resolve_managed_java_runtime() {
            let version_line = capture_java_version_line(&managed_java_executable);
            (
                Some(managed_java_executable),
                version_line,
                "Managed runtime".to_string(),
            )
        } else {
            let executable_path = locate_java_executable();
            let version_line = executable_path
                .as_deref()
                .and_then(capture_java_version_line);
            let source = if executable_path.is_some() {
                "PATH".to_string()
            } else {
                "System lookup".to_string()
            };
            (executable_path, version_line, source)
        };

    let java_version = version_line.as_deref().and_then(extract_java_version);
    let major_version = java_version.as_deref().and_then(extract_major_version);

    ResolvedJavaRuntime {
        executable_path,
        version_line,
        java_version,
        major_version,
        source,
    }
}

#[tauri::command]
pub fn check_java_runtime() -> Result<JavaRuntimeCheck, String> {
    let resolved = resolve_java_runtime();
    let detected = resolved.java_version.is_some();

    Ok(JavaRuntimeCheck {
        state: if detected {
            JavaRuntimeState::Ready
        } else {
            JavaRuntimeState::Blocked
        },
        detected,
        source: resolved.source.clone(),
        executable_path: resolved.executable_path,
        version_line: resolved.version_line,
        java_version: resolved.java_version,
        major_version: resolved.major_version,
        message: if detected {
            if resolved.source == "Custom path" {
                "Nastavený Java runtime je připraven.".to_string()
            } else if resolved.source == "Managed runtime" {
                "Spravovaný Java runtime je připraven.".to_string()
            } else {
                "Byl nalezen kompatibilní Java runtime.".to_string()
            }
        } else if resolved.source == "Custom path" {
            "Nastavený Java spustitelný soubor se nepodařilo spustit.".to_string()
        } else if resolved.source == "Managed runtime" {
            "Spravovaný Java runtime se nepodařilo spustit.".to_string()
        } else {
            "Na tomto systému zatím nebyl nalezen Java runtime.".to_string()
        },
    })
}

#[tauri::command]
pub fn get_java_runtime_install_progress() -> managed::JavaRuntimeInstallProgress {
    managed::snapshot_java_runtime_install_progress()
}

#[tauri::command]
pub async fn install_managed_java_runtime(required_java_major: u32) -> Result<(), String> {
    let resolved = resolve_java_runtime();
    if resolved
        .major_version
        .is_some_and(|major| major >= required_java_major)
    {
        return Ok(());
    }

    managed::install_managed_java_runtime(required_java_major).await
}
