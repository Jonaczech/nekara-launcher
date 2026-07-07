use serde::Serialize;

use crate::{auth, config, java};

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
    Blocked,
}

#[tauri::command]
pub fn get_launcher_status() -> LauncherStatus {
    let player_status = auth::resolve_offline_player_status().ok();
    let launch_identity_ready = auth::resolve_launch_identity().is_ok();
    let java_runtime = java::resolve_java_runtime();

    LauncherStatus {
        product_name: config::PRODUCT_NAME,
        game_configuration_id: config::GAME_CONFIGURATION_ID,
        minecraft_version: config::MINECRAFT_VERSION,
        phase: LauncherPhase::Foundation,
        checks: vec![
            LauncherCheck {
                id: "configuration",
                label: "Jedna konfigurace Nekara",
                state: CheckState::Ready,
            },
            LauncherCheck {
                id: "minecraft-version",
                label: "Cílová verze Minecraftu je pevně daná",
                state: CheckState::Ready,
            },
            LauncherCheck {
                id: "metadata-resolution",
                label: "Metadata Fabric klienta jsou dostupná",
                state: CheckState::Ready,
            },
            LauncherCheck {
                id: "runtime",
                label: "Detekce Java runtime",
                state: if java_runtime.java_version.is_some() {
                    CheckState::Ready
                } else {
                    CheckState::Blocked
                },
            },
            LauncherCheck {
                id: "player-identity",
                label: "Herní identita",
                state: if launch_identity_ready
                    || matches!(
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
