use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::{config, filesystem};

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OfflinePlayerState {
    Missing,
    Ready,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflinePlayerStatus {
    pub state: OfflinePlayerState,
    pub player_name: Option<String>,
    pub message: String,
}

#[derive(Deserialize, Serialize)]
struct OfflinePlayerProfile {
    player_name: String,
}

fn offline_player_profile_path() -> Result<PathBuf, String> {
    Ok(filesystem::ensure_launcher_data_dir()?.join(config::OFFLINE_PLAYER_PROFILE_FILE))
}

fn validate_player_name(player_name: &str) -> Result<String, String> {
    let normalized = player_name.trim();
    if normalized.len() < 3 || normalized.len() > 16 {
        return Err("Offline player name must be between 3 and 16 characters.".to_string());
    }

    if !normalized
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err(
            "Offline player name can only contain letters, numbers, and underscores.".to_string(),
        );
    }

    Ok(normalized.to_string())
}

fn read_offline_player_profile() -> Result<Option<OfflinePlayerProfile>, String> {
    let profile_path = offline_player_profile_path()?;
    if !profile_path.exists() {
        return Ok(None);
    }

    let profile_contents = fs::read_to_string(&profile_path).map_err(|error| {
        format!(
            "Unable to read offline player profile from {}: {error}",
            profile_path.display()
        )
    })?;
    let profile =
        serde_json::from_str::<OfflinePlayerProfile>(&profile_contents).map_err(|error| {
            format!(
                "Offline player profile at {} is invalid JSON: {error}",
                profile_path.display()
            )
        })?;

    Ok(Some(profile))
}

pub fn resolve_offline_player_status() -> Result<OfflinePlayerStatus, String> {
    match read_offline_player_profile()? {
        Some(profile) => Ok(OfflinePlayerStatus {
            state: OfflinePlayerState::Ready,
            message: format!("Offline player {} is ready.", profile.player_name),
            player_name: Some(profile.player_name),
        }),
        None => Ok(OfflinePlayerStatus {
            state: OfflinePlayerState::Missing,
            message: "Choose an offline player name to continue.".to_string(),
            player_name: None,
        }),
    }
}

#[tauri::command]
pub fn get_offline_player_status() -> Result<OfflinePlayerStatus, String> {
    resolve_offline_player_status()
}

#[tauri::command]
pub fn save_offline_player_profile(player_name: String) -> Result<OfflinePlayerStatus, String> {
    let validated_player_name = validate_player_name(&player_name)?;
    let profile_path = offline_player_profile_path()?;
    let profile = OfflinePlayerProfile {
        player_name: validated_player_name.clone(),
    };
    let profile_json = serde_json::to_string_pretty(&profile)
        .map_err(|error| format!("Unable to encode offline player profile: {error}"))?;

    fs::write(&profile_path, profile_json).map_err(|error| {
        format!(
            "Unable to save offline player profile to {}: {error}",
            profile_path.display()
        )
    })?;

    Ok(OfflinePlayerStatus {
        state: OfflinePlayerState::Ready,
        player_name: Some(validated_player_name.clone()),
        message: format!("Offline player {} is ready.", validated_player_name),
    })
}

#[tauri::command]
pub fn clear_offline_player_profile() -> Result<OfflinePlayerStatus, String> {
    let profile_path = offline_player_profile_path()?;
    if profile_path.exists() {
        fs::remove_file(&profile_path).map_err(|error| {
            format!(
                "Unable to remove offline player profile at {}: {error}",
                profile_path.display()
            )
        })?;
    }

    Ok(OfflinePlayerStatus {
        state: OfflinePlayerState::Missing,
        player_name: None,
        message: "Choose an offline player name to continue.".to_string(),
    })
}
