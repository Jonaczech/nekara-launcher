use serde::Serialize;

use crate::{auth, config};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherStatus {
    product_name: &'static str,
    game_configuration_id: &'static str,
    minecraft_version: &'static str,
    phase: LauncherPhase,
    checks: Vec<LauncherCheck>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LauncherPhase {
    Foundation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCheck {
    id: &'static str,
    label: &'static str,
    state: CheckState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CheckState {
    Ready,
    Pending,
    Blocked,
}

#[tauri::command]
pub fn get_launcher_status() -> LauncherStatus {
    let player_status = auth::resolve_offline_player_status().ok();

    LauncherStatus {
        product_name: config::PRODUCT_NAME,
        game_configuration_id: config::GAME_CONFIGURATION_ID,
        minecraft_version: config::MINECRAFT_VERSION,
        phase: LauncherPhase::Foundation,
        checks: vec![
            LauncherCheck {
                id: "configuration",
                label: "Single Nekara configuration",
                state: CheckState::Ready,
            },
            LauncherCheck {
                id: "minecraft-version",
                label: "Target Minecraft version locked",
                state: CheckState::Ready,
            },
            LauncherCheck {
                id: "metadata-resolution",
                label: "Official Minecraft metadata available",
                state: CheckState::Ready,
            },
            LauncherCheck {
                id: "runtime",
                label: "Java runtime detection",
                state: CheckState::Pending,
            },
            LauncherCheck {
                id: "offline-player",
                label: "Offline player profile",
                state: if matches!(
                    player_status.as_ref().map(|status| status.state),
                    Some(auth::OfflinePlayerState::Ready)
                ) {
                    CheckState::Ready
                } else {
                    CheckState::Blocked
                },
            },
        ],
    }
}
