use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use md5::{Digest as Md5Digest, Md5};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use url::Url;

use crate::{config, filesystem};

const MICROSOFT_AUTHORIZE_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_USER_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XBOX_XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MINECRAFT_LOGIN_URL: &str =
    "https://api.minecraftservices.com/authentication/login_with_xbox";
const MINECRAFT_ENTITLEMENTS_URL: &str =
    "https://api.minecraftservices.com/entitlements/mcstore";
const MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MICROSOFT_CLIENT_ID_ENV: &str = "NEKARA_MICROSOFT_CLIENT_ID";
const MICROSOFT_SCOPE: &str = "XboxLive.signin offline_access";
const MICROSOFT_REDIRECT_URI: &str = "http://localhost:39231/auth/callback";
const CALLBACK_SERVER_TIMEOUT_SECS: u64 = 180;

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OfflinePlayerState {
    Missing,
    Ready,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OfflinePlayerStatus {
    pub state: OfflinePlayerState,
    pub player_name: Option<String>,
    pub message: String,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MicrosoftAccountState {
    Unconfigured,
    SignedOut,
    Pending,
    Ready,
    Error,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftAccountStatus {
    pub state: MicrosoftAccountState,
    pub configured: bool,
    pub player_name: Option<String>,
    pub player_uuid: Option<String>,
    pub verification_uri: Option<String>,
    pub user_code: Option<String>,
    pub expires_at_unix_ms: Option<u128>,
    pub poll_interval_seconds: Option<u64>,
    pub message: String,
}

#[derive(Clone)]
pub struct LaunchIdentity {
    pub player_name: String,
    pub player_uuid: String,
    pub access_token: String,
    pub client_id: String,
    pub xuid: String,
}

#[derive(Deserialize, Serialize)]
struct OfflinePlayerProfile {
    player_name: String,
}

#[derive(Default)]
pub struct AppAuthState {
    microsoft: Arc<Mutex<MicrosoftFlowState>>,
}

#[derive(Clone)]
enum MicrosoftFlowState {
    SignedOut,
    Pending(BrowserLoginPending),
    Ready(MicrosoftAccountSession),
    Error(String),
}

impl Default for MicrosoftFlowState {
    fn default() -> Self {
        Self::SignedOut
    }
}

#[derive(Clone)]
struct BrowserLoginPending {
    client_id: String,
    authorization_url: String,
    state: String,
    pkce_verifier: String,
    expires_at_unix_ms: u128,
    callback: BrowserCallbackState,
}

#[derive(Clone)]
enum BrowserCallbackState {
    Waiting,
    ReceivedCode { code: String, state: String },
    ReceivedError(String),
}

#[derive(Clone)]
struct MicrosoftAccountSession {
    client_id: String,
    player_name: String,
    player_uuid: String,
    access_token: String,
    xuid: String,
}

#[derive(Deserialize)]
struct MicrosoftTokenSuccessResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct MicrosoftTokenErrorResponse {
    error: String,
    error_description: Option<String>,
}

#[derive(Serialize)]
struct XboxUserAuthenticateRequest<'a> {
    #[serde(rename = "Properties")]
    properties: XboxUserAuthenticateProperties<'a>,
    #[serde(rename = "RelyingParty")]
    relying_party: &'a str,
    #[serde(rename = "TokenType")]
    token_type: &'a str,
}

#[derive(Serialize)]
struct XboxUserAuthenticateProperties<'a> {
    #[serde(rename = "AuthMethod")]
    auth_method: &'a str,
    #[serde(rename = "SiteName")]
    site_name: &'a str,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Deserialize)]
struct XboxUserAuthenticateResponse {
    #[serde(rename = "Token")]
    token: String,
}

#[derive(Serialize)]
struct XboxXstsAuthorizeRequest<'a> {
    #[serde(rename = "Properties")]
    properties: XboxXstsAuthorizeProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: &'a str,
    #[serde(rename = "TokenType")]
    token_type: &'a str,
}

#[derive(Serialize)]
struct XboxXstsAuthorizeProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: &'static str,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Deserialize)]
struct XboxXstsAuthorizeResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxUserHashClaim>,
}

#[derive(Deserialize)]
struct XboxUserHashClaim {
    uhs: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftLoginRequest<'a> {
    identity_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ensure_legacy_enabled: Option<&'a str>,
}

#[derive(Deserialize)]
struct MinecraftLoginResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct MinecraftEntitlementsResponse {
    items: Vec<MinecraftEntitlementItem>,
}

#[derive(Deserialize)]
struct MinecraftEntitlementItem {
    name: String,
    signature: String,
}

#[derive(Deserialize)]
struct MinecraftProfileResponse {
    id: String,
    name: String,
}

fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(config::PRODUCT_NAME)
        .timeout(Duration::from_secs(config::HTTP_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

fn offline_player_profile_path() -> Result<PathBuf, String> {
    Ok(filesystem::ensure_launcher_data_dir()?.join(config::OFFLINE_PLAYER_PROFILE_FILE))
}

fn validate_player_name(player_name: &str) -> Result<String, String> {
    let normalized = player_name.trim();
    if normalized.len() < 3 || normalized.len() > 16 {
        return Err("Jméno offline hráče musí mít 3 až 16 znaků.".to_string());
    }

    if !normalized
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err("Jméno offline hráče může obsahovat pouze písmena, čísla a podtržítka.".to_string());
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
            message: format!("Offline hráč {} je připraven.", profile.player_name),
            player_name: Some(profile.player_name),
        }),
        None => Ok(OfflinePlayerStatus {
            state: OfflinePlayerState::Missing,
            message: "Pro pokračování zadej jméno offline hráče.".to_string(),
            player_name: None,
        }),
    }
}

fn resolve_microsoft_client_id() -> Result<String, String> {
    let build_time = option_env!("NEKARA_MICROSOFT_CLIENT_ID")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    if let Some(client_id) = build_time {
        return Ok(client_id);
    }

    std::env::var(MICROSOFT_CLIENT_ID_ENV)
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Microsoft přihlášení není zatím nakonfigurované. Nastav {MICROSOFT_CLIENT_ID_ENV} a v app registraci povol redirect URI {MICROSOFT_REDIRECT_URI}."
            )
        })
}

fn random_token(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn build_pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|error| format!("Nepodařilo se otevřít výchozí prohlížeč: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Nepodařilo se otevřít výchozí prohlížeč: {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Nepodařilo se otevřít výchozí prohlížeč: {error}"))?;
        return Ok(());
    }
}

fn spawn_loopback_callback_listener(
    auth_state: &tauri::State<'_, AppAuthState>,
) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:39231")
        .map_err(|error| format!("Nepodařilo se otevřít callback port 39231: {error}"))?;
    listener
        .set_nonblocking(false)
        .map_err(|error| format!("Nepodařilo se nakonfigurovat callback listener: {error}"))?;

    let state_handle = auth_state.inner().microsoft.clone();

    thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(CALLBACK_SERVER_TIMEOUT_SECS);
        for stream in listener.incoming() {
            if std::time::Instant::now() > deadline {
                if let Ok(mut flow) = state_handle.lock() {
                    if matches!(*flow, MicrosoftFlowState::Pending(_)) {
                        *flow = MicrosoftFlowState::Error(
                            "Microsoft přihlášení vypršelo před návratem z prohlížeče.".to_string(),
                        );
                    }
                }
                break;
            }

            match stream {
                Ok(mut stream) => {
                    let mut buffer = [0u8; 4096];
                    let read_result = stream.read(&mut buffer);
                    let request = match read_result {
                        Ok(count) if count > 0 => String::from_utf8_lossy(&buffer[..count]).to_string(),
                        _ => String::new(),
                    };

                    let first_line = request.lines().next().unwrap_or_default();
                    let path = first_line
                        .split_whitespace()
                        .nth(1)
                        .unwrap_or("/");
                    let callback_url = format!("http://localhost:39231{path}");

                    let html = "<html><body style=\"font-family:Segoe UI, sans-serif;background:#0b0b0f;color:#f5f1e8;padding:32px;\"><h2>Přihlášení dokončeno</h2><p>Můžeš se vrátit zpět do launcheru Nekara.</p></body></html>";
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();

                    if let Ok(url) = Url::parse(&callback_url) {
                        let code = url
                            .query_pairs()
                            .find(|(key, _)| key == "code")
                            .map(|(_, value)| value.into_owned());
                        let state = url
                            .query_pairs()
                            .find(|(key, _)| key == "state")
                            .map(|(_, value)| value.into_owned());
                        let error = url
                            .query_pairs()
                            .find(|(key, _)| key == "error")
                            .map(|(_, value)| value.into_owned());
                        let error_description = url
                            .query_pairs()
                            .find(|(key, _)| key == "error_description")
                            .map(|(_, value)| value.into_owned());

                        if let Ok(mut flow) = state_handle.lock() {
                            if let MicrosoftFlowState::Pending(pending) = &mut *flow {
                                pending.callback = if let Some(error) = error {
                                    BrowserCallbackState::ReceivedError(
                                        error_description.unwrap_or(error),
                                    )
                                } else if let (Some(code), Some(state)) = (code, state) {
                                    BrowserCallbackState::ReceivedCode { code, state }
                                } else {
                                    BrowserCallbackState::ReceivedError(
                                        "Microsoft callback neobsahuje autorizační kód.".to_string(),
                                    )
                                };
                            }
                        }
                    }

                    break;
                }
                Err(_) => continue,
            }
        }
    });

    Ok(())
}

fn microsoft_status_from_flow(flow: &MicrosoftFlowState) -> MicrosoftAccountStatus {
    match flow {
        MicrosoftFlowState::SignedOut => MicrosoftAccountStatus {
            state: MicrosoftAccountState::SignedOut,
            configured: true,
            player_name: None,
            player_uuid: None,
            verification_uri: None,
            user_code: None,
            expires_at_unix_ms: None,
            poll_interval_seconds: None,
            message: "Minecraft účet zatím není přihlášený.".to_string(),
        },
        MicrosoftFlowState::Pending(pending) => MicrosoftAccountStatus {
            state: MicrosoftAccountState::Pending,
            configured: true,
            player_name: None,
            player_uuid: None,
            verification_uri: Some(pending.authorization_url.clone()),
            user_code: None,
            expires_at_unix_ms: Some(pending.expires_at_unix_ms),
            poll_interval_seconds: Some(2),
            message: "Dokonči Microsoft přihlášení v otevřeném prohlížeči a vrať se do launcheru.".to_string(),
        },
        MicrosoftFlowState::Ready(session) => MicrosoftAccountStatus {
            state: MicrosoftAccountState::Ready,
            configured: true,
            player_name: Some(session.player_name.clone()),
            player_uuid: Some(session.player_uuid.clone()),
            verification_uri: None,
            user_code: None,
            expires_at_unix_ms: None,
            poll_interval_seconds: None,
            message: format!("Microsoft účet {} je připraven.", session.player_name),
        },
        MicrosoftFlowState::Error(message) => MicrosoftAccountStatus {
            state: MicrosoftAccountState::Error,
            configured: true,
            player_name: None,
            player_uuid: None,
            verification_uri: None,
            user_code: None,
            expires_at_unix_ms: None,
            poll_interval_seconds: None,
            message: message.clone(),
        },
    }
}

fn microsoft_unconfigured_status(message: String) -> MicrosoftAccountStatus {
    MicrosoftAccountStatus {
        state: MicrosoftAccountState::Unconfigured,
        configured: false,
        player_name: None,
        player_uuid: None,
        verification_uri: None,
        user_code: None,
        expires_at_unix_ms: None,
        poll_interval_seconds: None,
        message,
    }
}

pub fn resolve_launch_identity(
    auth_state: &AppAuthState,
) -> Result<LaunchIdentity, String> {
    let microsoft = auth_state
        .microsoft
        .lock()
        .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;

    if let MicrosoftFlowState::Ready(session) = &*microsoft {
        return Ok(LaunchIdentity {
            player_name: session.player_name.clone(),
            player_uuid: session.player_uuid.clone(),
            access_token: session.access_token.clone(),
            client_id: session.client_id.clone(),
            xuid: session.xuid.clone(),
        });
    }

    drop(microsoft);

    let offline_player = resolve_offline_player_status()?;
    let player_name = offline_player
        .player_name
        .ok_or_else(|| "Před spuštěním zadej jméno offline hráče nebo se přihlas přes Microsoft.".to_string())?;

    Ok(LaunchIdentity {
        player_name: player_name.clone(),
        player_uuid: build_offline_uuid(&player_name),
        access_token: "0".to_string(),
        client_id: "nekara-offline".to_string(),
        xuid: "0".to_string(),
    })
}

fn build_offline_uuid(player_name: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{player_name}").as_bytes());
    let mut bytes = hasher.finalize().to_vec();

    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    )
}

async fn exchange_auth_code_for_token(
    client_id: &str,
    code: &str,
    pkce_verifier: &str,
) -> Result<MicrosoftTokenSuccessResponse, String> {
    let client = http_client()?;
    let response = client
        .post(MICROSOFT_TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("code", code),
            ("redirect_uri", MICROSOFT_REDIRECT_URI),
            ("scope", MICROSOFT_SCOPE),
            ("code_verifier", pkce_verifier),
        ])
        .send()
        .await
        .map_err(|error| format!("Nepodařilo se získat Microsoft access token: {error}"))?;

    if response.status().is_success() {
        return response
            .json::<MicrosoftTokenSuccessResponse>()
            .await
            .map_err(|error| format!("Microsoft token odpověď nešla dekódovat: {error}"));
    }

    let status = response.status();
    let payload = response
        .json::<MicrosoftTokenErrorResponse>()
        .await
        .map_err(|error| format!("Microsoft token chyba nešla dekódovat: {error}"))?;

    Err(format!(
        "Microsoft token endpoint vrátil {}: {}",
        status,
        payload.error_description.unwrap_or(payload.error)
    ))
}

async fn authenticate_xbox_user(microsoft_access_token: &str) -> Result<String, String> {
    let client = http_client()?;
    let payload = XboxUserAuthenticateRequest {
        properties: XboxUserAuthenticateProperties {
            auth_method: "RPS",
            site_name: "user.auth.xboxlive.com",
            rps_ticket: format!("d={microsoft_access_token}"),
        },
        relying_party: "http://auth.xboxlive.com",
        token_type: "JWT",
    };

    let response = client
        .post(XBOX_USER_AUTH_URL)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Nepodařilo se ověřit Xbox Live účet: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("Xbox Live user/authenticate vrátil chybu: {error}"))?;

    let payload = response
        .json::<XboxUserAuthenticateResponse>()
        .await
        .map_err(|error| format!("Xbox Live user/authenticate odpověď nešla dekódovat: {error}"))?;

    Ok(payload.token)
}

async fn authorize_xsts(xbox_user_token: &str) -> Result<(String, String), String> {
    let client = http_client()?;
    let payload = XboxXstsAuthorizeRequest {
        properties: XboxXstsAuthorizeProperties {
            sandbox_id: "RETAIL",
            user_tokens: vec![xbox_user_token.to_string()],
        },
        relying_party: "rp://api.minecraftservices.com/",
        token_type: "JWT",
    };

    let response = client
        .post(XBOX_XSTS_AUTH_URL)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Nepodařilo se získat Xbox XSTS token: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("Xbox XSTS authorize vrátil chybu: {error}"))?;

    let payload = response
        .json::<XboxXstsAuthorizeResponse>()
        .await
        .map_err(|error| format!("Xbox XSTS authorize odpověď nešla dekódovat: {error}"))?;

    let user_hash = payload
        .display_claims
        .xui
        .first()
        .map(|claim| claim.uhs.clone())
        .ok_or_else(|| "Xbox XSTS odpověď neobsahuje user hash.".to_string())?;

    Ok((payload.token, user_hash))
}

async fn login_to_minecraft_services(
    xsts_token: &str,
    user_hash: &str,
) -> Result<String, String> {
    let client = http_client()?;
    let payload = MinecraftLoginRequest {
        identity_token: format!("XBL3.0 x={user_hash};{xsts_token}"),
        ensure_legacy_enabled: Some("true"),
    };

    let response = client
        .post(MINECRAFT_LOGIN_URL)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Nepodařilo se přihlásit do Minecraft Services: {error}"))?;

    let status = response.status();
    if status == StatusCode::FORBIDDEN {
        return Err("Minecraft Services odmítly app registration. Ověř, že použitý Microsoft client ID podporuje XboxLive.signin a má povolený redirect URI pro desktop launcher.".to_string());
    }

    let response = response
        .error_for_status()
        .map_err(|error| format!("Minecraft Services login_with_xbox vrátil chybu: {error}"))?;

    let payload = response
        .json::<MinecraftLoginResponse>()
        .await
        .map_err(|error| format!("Minecraft login odpověď nešla dekódovat: {error}"))?;

    Ok(payload.access_token)
}

async fn verify_minecraft_entitlements(minecraft_access_token: &str) -> Result<(), String> {
    let client = http_client()?;
    let response = client
        .get(MINECRAFT_ENTITLEMENTS_URL)
        .bearer_auth(minecraft_access_token)
        .send()
        .await
        .map_err(|error| format!("Nepodařilo se ověřit Minecraft entitlement: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("Minecraft entitlement endpoint vrátil chybu: {error}"))?;

    let payload = response
        .json::<MinecraftEntitlementsResponse>()
        .await
        .map_err(|error| format!("Minecraft entitlement odpověď nešla dekódovat: {error}"))?;

    let has_entitlement = payload
        .items
        .iter()
        .any(|item| !item.name.trim().is_empty() && !item.signature.trim().is_empty());

    if !has_entitlement {
        return Err("Přihlášený Microsoft účet nevlastní Minecraft Java Edition.".to_string());
    }

    Ok(())
}

async fn fetch_minecraft_profile(
    minecraft_access_token: &str,
) -> Result<MinecraftProfileResponse, String> {
    let client = http_client()?;
    let response = client
        .get(MINECRAFT_PROFILE_URL)
        .bearer_auth(minecraft_access_token)
        .send()
        .await
        .map_err(|error| format!("Nepodařilo se načíst Minecraft profil: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("Minecraft profile endpoint vrátil chybu: {error}"))?;

    response
        .json::<MinecraftProfileResponse>()
        .await
        .map_err(|error| format!("Minecraft profile odpověď nešla dekódovat: {error}"))
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
        message: format!("Offline hráč {} je připraven.", validated_player_name),
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
        message: "Pro pokračování zadej jméno offline hráče.".to_string(),
    })
}

#[tauri::command]
pub fn get_microsoft_account_status(
    auth_state: tauri::State<'_, AppAuthState>,
) -> Result<MicrosoftAccountStatus, String> {
    let client_id_result = resolve_microsoft_client_id();
    if let Err(message) = client_id_result {
        return Ok(microsoft_unconfigured_status(message));
    }

    let flow = auth_state
        .microsoft
        .lock()
        .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;

    Ok(microsoft_status_from_flow(&flow))
}

#[tauri::command]
pub fn begin_microsoft_device_login(
    auth_state: tauri::State<'_, AppAuthState>,
) -> Result<MicrosoftAccountStatus, String> {
    let client_id = match resolve_microsoft_client_id() {
        Ok(client_id) => client_id,
        Err(message) => return Ok(microsoft_unconfigured_status(message)),
    };

    let state = random_token(24);
    let pkce_verifier = random_token(64);
    let pkce_challenge = build_pkce_challenge(&pkce_verifier);
    let authorization_url = format!(
        "{MICROSOFT_AUTHORIZE_URL}?client_id={client_id}&response_type=code&redirect_uri={redirect_uri}&response_mode=query&scope={scope}&state={state}&code_challenge={pkce_challenge}&code_challenge_method=S256&prompt=select_account",
        redirect_uri = urlencoding::encode(MICROSOFT_REDIRECT_URI),
        scope = urlencoding::encode(MICROSOFT_SCOPE)
    );

    {
        let mut flow = auth_state
            .microsoft
            .lock()
            .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
        *flow = MicrosoftFlowState::Pending(BrowserLoginPending {
            client_id: client_id.clone(),
            authorization_url: authorization_url.clone(),
            state: state.clone(),
            pkce_verifier,
            expires_at_unix_ms: current_timestamp_ms() + CALLBACK_SERVER_TIMEOUT_SECS as u128 * 1000,
            callback: BrowserCallbackState::Waiting,
        });
    }

    spawn_loopback_callback_listener(&auth_state)?;
    open_external_url(&authorization_url)?;

    let flow = auth_state
        .microsoft
        .lock()
        .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
    Ok(microsoft_status_from_flow(&flow))
}

#[tauri::command]
pub async fn poll_microsoft_device_login(
    auth_state: tauri::State<'_, AppAuthState>,
) -> Result<MicrosoftAccountStatus, String> {
    let pending = {
        let flow = auth_state
            .microsoft
            .lock()
            .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;

        match &*flow {
            MicrosoftFlowState::Pending(pending) => pending.clone(),
            MicrosoftFlowState::Ready(session) => {
                return Ok(microsoft_status_from_flow(&MicrosoftFlowState::Ready(
                    session.clone(),
                )));
            }
            MicrosoftFlowState::Error(message) => {
                return Ok(microsoft_status_from_flow(&MicrosoftFlowState::Error(
                    message.clone(),
                )));
            }
            MicrosoftFlowState::SignedOut => {
                return Ok(microsoft_status_from_flow(&MicrosoftFlowState::SignedOut));
            }
        }
    };

    if current_timestamp_ms() >= pending.expires_at_unix_ms {
        let mut flow = auth_state
            .microsoft
            .lock()
            .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
        *flow = MicrosoftFlowState::Error(
            "Microsoft přihlášení vypršelo před dokončením v prohlížeči.".to_string(),
        );
        return Ok(microsoft_status_from_flow(&flow));
    }

    match pending.callback {
        BrowserCallbackState::Waiting => {
            let flow = auth_state
                .microsoft
                .lock()
                .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
            Ok(microsoft_status_from_flow(&flow))
        }
        BrowserCallbackState::ReceivedError(message) => {
            let mut flow = auth_state
                .microsoft
                .lock()
                .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
            *flow = MicrosoftFlowState::Error(message);
            Ok(microsoft_status_from_flow(&flow))
        }
        BrowserCallbackState::ReceivedCode { code, state } => {
            if state != pending.state {
                let mut flow = auth_state
                    .microsoft
                    .lock()
                    .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
                *flow = MicrosoftFlowState::Error(
                    "Microsoft callback obsahuje neplatný bezpečnostní stav.".to_string(),
                );
                return Ok(microsoft_status_from_flow(&flow));
            }

            let token_payload =
                exchange_auth_code_for_token(&pending.client_id, &code, &pending.pkce_verifier)
                    .await?;
            let xbox_user_token = authenticate_xbox_user(&token_payload.access_token).await?;
            let (xsts_token, user_hash) = authorize_xsts(&xbox_user_token).await?;
            let minecraft_access_token =
                login_to_minecraft_services(&xsts_token, &user_hash).await?;
            verify_minecraft_entitlements(&minecraft_access_token).await?;
            let profile = fetch_minecraft_profile(&minecraft_access_token).await?;

            let session = MicrosoftAccountSession {
                client_id: pending.client_id.clone(),
                player_name: profile.name,
                player_uuid: profile.id,
                access_token: minecraft_access_token,
                xuid: user_hash,
            };

            let status = microsoft_status_from_flow(&MicrosoftFlowState::Ready(session.clone()));
            let mut flow = auth_state
                .microsoft
                .lock()
                .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
            *flow = MicrosoftFlowState::Ready(session);
            Ok(status)
        }
    }
}

#[tauri::command]
pub fn sign_out_microsoft_account(
    auth_state: tauri::State<'_, AppAuthState>,
) -> Result<MicrosoftAccountStatus, String> {
    let client_id_result = resolve_microsoft_client_id();
    if let Err(message) = client_id_result {
        return Ok(microsoft_unconfigured_status(message));
    }

    let mut flow = auth_state
        .microsoft
        .lock()
        .map_err(|_| "Unable to access Microsoft auth state.".to_string())?;
    *flow = MicrosoftFlowState::SignedOut;

    Ok(microsoft_status_from_flow(&flow))
}
