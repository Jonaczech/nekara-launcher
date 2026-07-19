use std::{
    net::{TcpStream, ToSocketAddrs},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use crate::config;

const SERVER_STATUS_TIMEOUT_MS: u64 = 1_800;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    state: ServerStatusState,
    address: &'static str,
    latency_ms: Option<u128>,
    checked_at_unix_ms: u128,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerStatusState {
    Online,
    Offline,
}

fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn server_socket_candidates() -> Result<Vec<std::net::SocketAddr>, String> {
    let address = config::PRESET_MULTIPLAYER_SERVER_ADDRESS;
    let (host, port) = address
        .rsplit_once(':')
        .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host, port)))
        .unwrap_or((address, 25565));

    (host, port)
        .to_socket_addrs()
        .map(|addresses| addresses.collect::<Vec<_>>())
        .map_err(|error| format!("Server se nepodařilo najít: {error}"))
}

fn build_offline_status(message: String) -> ServerStatus {
    ServerStatus {
        state: ServerStatusState::Offline,
        address: config::PRESET_MULTIPLAYER_SERVER_ADDRESS,
        latency_ms: None,
        checked_at_unix_ms: current_timestamp_ms(),
        message,
    }
}

fn check_server_status_blocking() -> ServerStatus {
    let timeout = Duration::from_millis(SERVER_STATUS_TIMEOUT_MS);
    let candidates = match server_socket_candidates() {
        Ok(candidates) if !candidates.is_empty() => candidates,
        Ok(_) => {
            return build_offline_status("Server teď není dostupný.".to_string());
        }
        Err(error) => {
            return build_offline_status(error);
        }
    };

    let started_at = Instant::now();
    for socket_address in candidates {
        match TcpStream::connect_timeout(&socket_address, timeout) {
            Ok(_) => {
                return ServerStatus {
                    state: ServerStatusState::Online,
                    address: config::PRESET_MULTIPLAYER_SERVER_ADDRESS,
                    latency_ms: Some(started_at.elapsed().as_millis()),
                    checked_at_unix_ms: current_timestamp_ms(),
                    message: "Server je online.".to_string(),
                };
            }
            Err(_) => continue,
        }
    }

    build_offline_status("Server teď není dostupný.".to_string())
}

#[tauri::command]
pub async fn get_server_status() -> ServerStatus {
    tauri::async_runtime::spawn_blocking(check_server_status_blocking)
        .await
        .unwrap_or_else(|error| build_offline_status(format!("Kontrola serveru selhala: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_status_uses_configured_server_address() {
        let status = build_offline_status("test".to_string());

        assert_eq!(status.address, config::PRESET_MULTIPLAYER_SERVER_ADDRESS);
    }
}
