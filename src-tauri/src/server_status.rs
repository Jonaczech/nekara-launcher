use std::{
    io::{Read, Write},
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
    players_online: Option<u32>,
    players_max: Option<u32>,
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
        players_online: None,
        players_max: None,
        checked_at_unix_ms: current_timestamp_ms(),
        message,
    }
}

fn write_var_int(value: i32, output: &mut Vec<u8>) {
    let mut value = value as u32;
    loop {
        if value & !0x7f == 0 {
            output.push(value as u8);
            return;
        }
        output.push(((value & 0x7f) | 0x80) as u8);
        value >>= 7;
    }
}

fn write_string(value: &str, output: &mut Vec<u8>) {
    write_var_int(value.len() as i32, output);
    output.extend_from_slice(value.as_bytes());
}

fn write_packet(payload: &[u8], stream: &mut TcpStream) -> std::io::Result<()> {
    let mut packet = Vec::new();
    write_var_int(payload.len() as i32, &mut packet);
    packet.extend_from_slice(payload);
    stream.write_all(&packet)
}

fn read_var_int(stream: &mut TcpStream) -> std::io::Result<i32> {
    let mut result = 0i32;
    for index in 0..5 {
        let mut byte = [0u8; 1];
        stream.read_exact(&mut byte)?;
        result |= ((byte[0] & 0x7f) as i32) << (index * 7);
        if byte[0] & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "Neplatná VarInt odpověď serveru",
    ))
}

fn read_string(stream: &mut TcpStream) -> std::io::Result<String> {
    let length = read_var_int(stream)?;
    if !(0..=1_000_000).contains(&length) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Neplatná délka odpovědi serveru",
        ));
    }
    let mut bytes = vec![0u8; length as usize];
    stream.read_exact(&mut bytes)?;
    String::from_utf8(bytes)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))
}

fn query_server_status(
    stream: &mut TcpStream,
    host: &str,
    port: u16,
) -> std::io::Result<(Option<u32>, Option<u32>)> {
    let mut handshake = Vec::new();
    write_var_int(0, &mut handshake);
    write_var_int(0, &mut handshake);
    write_string(host, &mut handshake);
    handshake.extend_from_slice(&port.to_be_bytes());
    write_var_int(1, &mut handshake);
    write_packet(&handshake, stream)?;
    write_packet(&[0], stream)?;

    let _packet_length = read_var_int(stream)?;
    if read_var_int(stream)? != 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Server vrátil neočekávaný status paket",
        ));
    }
    let response = read_string(stream)?;
    let status: serde_json::Value = serde_json::from_str(&response)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    let players = status.get("players");
    let read_count = |key| {
        players
            .and_then(|value| value.get(key))
            .and_then(serde_json::Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
    };
    Ok((read_count("online"), read_count("max")))
}

fn check_server_status_blocking() -> ServerStatus {
    let timeout = Duration::from_millis(SERVER_STATUS_TIMEOUT_MS);
    let address = config::PRESET_MULTIPLAYER_SERVER_ADDRESS;
    let (host, port) = address
        .rsplit_once(':')
        .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host, port)))
        .unwrap_or((address, 25565));
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
            Ok(mut stream) => {
                let (players_online, players_max) =
                    query_server_status(&mut stream, host, port).unwrap_or((None, None));
                return ServerStatus {
                    state: ServerStatusState::Online,
                    address: config::PRESET_MULTIPLAYER_SERVER_ADDRESS,
                    latency_ms: Some(started_at.elapsed().as_millis()),
                    players_online,
                    players_max,
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
