use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::mem;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha1::Digest;

use crate::{auth, config, fabric, filesystem, java, logging, manifests, settings};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum GameLaunchState {
    Idle,
    Launching,
    Running,
    Exited,
    Failed,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameLaunchStatus {
    state: GameLaunchState,
    target_version: &'static str,
    player_name: Option<String>,
    java_executable: Option<String>,
    java_major_version: Option<u32>,
    required_java_major: Option<u32>,
    main_class: Option<String>,
    working_directory: Option<String>,
    log_path: Option<String>,
    pid: Option<u32>,
    classpath_entry_count: usize,
    started_at_unix_ms: Option<u128>,
    finished_at_unix_ms: Option<u128>,
    exit_code: Option<i32>,
    configured_max_ram_mb: Option<u32>,
    diagnostic_summary: Option<String>,
    suggested_fix: Option<String>,
    log_excerpt: Option<String>,
    message: String,
}

struct LaunchPaths {
    minecraft_dir: PathBuf,
    version_json_path: PathBuf,
    client_jar_path: PathBuf,
    fabric_profile_json_path: PathBuf,
    libraries_dir: PathBuf,
    assets_dir: PathBuf,
    logs_dir: PathBuf,
    natives_dir: PathBuf,
    log_configs_dir: PathBuf,
}

#[derive(Deserialize)]
struct LaunchVersionManifest {
    id: String,
    #[serde(default, rename = "inheritsFrom")]
    inherits_from: Option<String>,
    #[serde(default)]
    assets: Option<String>,
    #[serde(rename = "type")]
    version_type: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(default)]
    arguments: LaunchArguments,
    logging: Option<LaunchLogging>,
}

#[derive(Deserialize, Default)]
struct LaunchArguments {
    #[serde(rename = "default-user-jvm", default)]
    default_user_jvm: Vec<LaunchArgumentEntry>,
    #[serde(default)]
    game: Vec<LaunchArgumentEntry>,
    #[serde(default)]
    jvm: Vec<LaunchArgumentEntry>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum LaunchArgumentEntry {
    Literal(String),
    Structured(ConditionalLaunchArgument),
}

#[derive(Deserialize)]
struct ConditionalLaunchArgument {
    #[serde(default)]
    rules: Vec<LaunchRule>,
    value: LaunchArgumentValue,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum LaunchArgumentValue {
    Literal(String),
    Many(Vec<String>),
}

#[derive(Deserialize)]
struct LaunchRule {
    action: String,
    os: Option<LaunchRuleOperatingSystem>,
    #[serde(default)]
    features: HashMap<String, bool>,
}

#[derive(Deserialize)]
struct LaunchRuleOperatingSystem {
    name: Option<String>,
    arch: Option<String>,
    #[serde(rename = "versionRange")]
    version_range: Option<LaunchRuleVersionRange>,
}

#[derive(Deserialize)]
struct LaunchRuleVersionRange {
    min: Option<String>,
    max: Option<String>,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct OsVersionInfoW {
    dw_os_version_info_size: u32,
    dw_major_version: u32,
    dw_minor_version: u32,
    dw_build_number: u32,
    dw_platform_id: u32,
    sz_csd_version: [u16; 128],
}

#[cfg(target_os = "windows")]
#[link(name = "ntdll")]
extern "system" {
    fn RtlGetVersion(lp_version_information: *mut OsVersionInfoW) -> i32;
}

#[derive(Deserialize)]
struct LaunchLogging {
    client: Option<ClientLogging>,
}

#[derive(Deserialize)]
struct ClientLogging {
    argument: String,
    file: LoggingFileDownload,
}

#[derive(Deserialize)]
struct LoggingFileDownload {
    id: String,
    sha1: String,
    url: String,
}

struct LaunchContext {
    auth_player_name: String,
    version_name: String,
    game_directory: String,
    assets_root: String,
    assets_index_name: String,
    auth_uuid: String,
    auth_access_token: String,
    client_id: String,
    auth_xuid: String,
    version_type: String,
    natives_directory: String,
    launcher_name: String,
    launcher_version: String,
    classpath: String,
    logging_path: Option<String>,
}

struct LaunchFailureContext {
    player_name: Option<String>,
    java_executable: Option<String>,
    java_major_version: Option<u32>,
    required_java_major: Option<u32>,
    configured_max_ram_mb: Option<u32>,
    working_directory: Option<String>,
    log_path: Option<String>,
    diagnostic_summary: String,
    suggested_fix: String,
}

fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn initial_game_launch_status() -> GameLaunchStatus {
    GameLaunchStatus {
        state: GameLaunchState::Idle,
        target_version: config::MINECRAFT_VERSION,
        player_name: None,
        java_executable: None,
        java_major_version: None,
        required_java_major: None,
        main_class: None,
        working_directory: None,
        log_path: None,
        pid: None,
        classpath_entry_count: 0,
        started_at_unix_ms: None,
        finished_at_unix_ms: None,
        exit_code: None,
        configured_max_ram_mb: None,
        diagnostic_summary: None,
        suggested_fix: None,
        log_excerpt: None,
        message: "Minecraft neběží.".to_string(),
    }
}

fn game_status_store() -> &'static Mutex<GameLaunchStatus> {
    static GAME_STATUS: OnceLock<Mutex<GameLaunchStatus>> = OnceLock::new();
    GAME_STATUS.get_or_init(|| Mutex::new(initial_game_launch_status()))
}

fn read_game_status() -> Result<GameLaunchStatus, String> {
    game_status_store()
        .lock()
        .map(|status| status.clone())
        .map_err(|_| "Stav spuštění hry se nepodařilo načíst.".to_string())
}

fn write_game_status(status: GameLaunchStatus) -> Result<(), String> {
    let mut current_status = game_status_store()
        .lock()
        .map_err(|_| "Stav spuštění hry se nepodařilo aktualizovat.".to_string())?;
    *current_status = status;
    Ok(())
}

fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

#[cfg(target_os = "windows")]
fn current_windows_version() -> Option<(u32, u32, u32)> {
    let mut version_info = unsafe { mem::zeroed::<OsVersionInfoW>() };
    version_info.dw_os_version_info_size = std::mem::size_of::<OsVersionInfoW>() as u32;

    let status = unsafe { RtlGetVersion(&mut version_info as *mut OsVersionInfoW) };
    if status != 0 {
        return None;
    }

    Some((
        version_info.dw_major_version,
        version_info.dw_minor_version,
        version_info.dw_build_number,
    ))
}

#[cfg(not(target_os = "windows"))]
fn current_windows_version() -> Option<(u32, u32, u32)> {
    None
}

fn parse_version_components(version: &str) -> Option<[u32; 4]> {
    let mut components = [0_u32; 4];

    for (index, part) in version.split('.').take(4).enumerate() {
        components[index] = part.parse().ok()?;
    }

    Some(components)
}

fn compare_versions(left: [u32; 4], right: [u32; 4]) -> Ordering {
    left.cmp(&right)
}

fn current_windows_version_matches(range: &LaunchRuleVersionRange) -> bool {
    let Some(current_version) = current_windows_version() else {
        return false;
    };

    let current = [current_version.0, current_version.1, current_version.2, 0];

    if let Some(min) = range.min.as_deref().and_then(parse_version_components) {
        if compare_versions(current, min) == Ordering::Less {
            return false;
        }
    }

    if let Some(max) = range.max.as_deref().and_then(parse_version_components) {
        if compare_versions(current, max) == Ordering::Greater {
            return false;
        }
    }

    true
}

fn rule_matches(rule: &LaunchRule) -> bool {
    let os_matches = rule
        .os
        .as_ref()
        .and_then(|operating_system| operating_system.name.as_deref())
        .map(|name| name == current_os_name())
        .unwrap_or(true);
    let arch_matches = rule
        .os
        .as_ref()
        .and_then(|operating_system| operating_system.arch.as_deref())
        .map(|arch| arch == std::env::consts::ARCH)
        .unwrap_or(true);
    let version_matches = rule
        .os
        .as_ref()
        .and_then(|operating_system| operating_system.version_range.as_ref())
        .map(current_windows_version_matches)
        .unwrap_or(true);
    let features_match = rule.features.values().all(|value| !value);

    os_matches && arch_matches && version_matches && features_match
}

fn argument_is_allowed(rules: &[LaunchRule]) -> bool {
    if rules.is_empty() {
        return true;
    }

    let mut allowed = false;

    for rule in rules {
        if !rule_matches(rule) {
            continue;
        }

        allowed = rule.action == "allow";
    }

    allowed
}

fn resolve_argument_value(
    argument_value: &LaunchArgumentValue,
    context: &LaunchContext,
) -> Vec<String> {
    match argument_value {
        LaunchArgumentValue::Literal(value) => vec![replace_placeholders(value, context)],
        LaunchArgumentValue::Many(values) => values
            .iter()
            .map(|value| replace_placeholders(value, context))
            .collect(),
    }
}

fn resolve_argument_entries(
    entries: &[LaunchArgumentEntry],
    context: &LaunchContext,
) -> Vec<String> {
    let mut resolved = Vec::new();

    for entry in entries {
        match entry {
            LaunchArgumentEntry::Literal(value) => {
                resolved.push(replace_placeholders(value, context));
            }
            LaunchArgumentEntry::Structured(argument) => {
                if argument_is_allowed(&argument.rules) {
                    resolved.extend(resolve_argument_value(&argument.value, context));
                }
            }
        }
    }

    resolved
}

fn replace_placeholders(value: &str, context: &LaunchContext) -> String {
    let mut replaced = value.to_string();

    let replacements = [
        ("${auth_player_name}", context.auth_player_name.as_str()),
        ("${version_name}", context.version_name.as_str()),
        ("${game_directory}", context.game_directory.as_str()),
        ("${assets_root}", context.assets_root.as_str()),
        ("${assets_index_name}", context.assets_index_name.as_str()),
        ("${auth_uuid}", context.auth_uuid.as_str()),
        ("${auth_access_token}", context.auth_access_token.as_str()),
        ("${clientid}", context.client_id.as_str()),
        ("${auth_xuid}", context.auth_xuid.as_str()),
        ("${version_type}", context.version_type.as_str()),
        ("${natives_directory}", context.natives_directory.as_str()),
        ("${launcher_name}", context.launcher_name.as_str()),
        ("${launcher_version}", context.launcher_version.as_str()),
        ("${classpath}", context.classpath.as_str()),
    ];

    for (needle, replacement) in replacements {
        replaced = replaced.replace(needle, replacement);
    }

    if let Some(logging_path) = context.logging_path.as_deref() {
        replaced = replaced.replace("${path}", logging_path);
    }

    replaced
}

fn launch_paths(fabric_profile_id: &str) -> Result<LaunchPaths, String> {
    let game_dir = filesystem::nekara_game_dir()?;
    let minecraft_dir = game_dir.join(".minecraft");
    let base_version_dir = minecraft_dir
        .join("versions")
        .join(config::MINECRAFT_VERSION);
    let fabric_version_dir = minecraft_dir.join("versions").join(fabric_profile_id);

    Ok(LaunchPaths {
        libraries_dir: minecraft_dir.join("libraries"),
        assets_dir: minecraft_dir.join("assets"),
        logs_dir: minecraft_dir.join("logs").join("launcher"),
        natives_dir: minecraft_dir
            .join("natives")
            .join(config::MINECRAFT_VERSION)
            .join(std::env::consts::ARCH),
        log_configs_dir: minecraft_dir.join("assets").join("log_configs"),
        minecraft_dir,
        version_json_path: base_version_dir.join(format!("{}.json", config::MINECRAFT_VERSION)),
        client_jar_path: base_version_dir.join(format!("{}.jar", config::MINECRAFT_VERSION)),
        fabric_profile_json_path: fabric_version_dir.join(format!("{}.json", fabric_profile_id)),
    })
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "Adresář se nepodařilo vytvořit na {}: {error}",
            path.display()
        )
    })
}

fn read_log_tail(path: &Path, max_lines: usize) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    let lines: Vec<&str> = contents.lines().collect();
    if lines.is_empty() {
        return None;
    }

    let start = lines.len().saturating_sub(max_lines);
    let excerpt = lines[start..].join("\n").trim().to_string();
    if excerpt.is_empty() {
        None
    } else {
        Some(excerpt)
    }
}

fn derive_initial_ram_mb(max_ram_mb: u32) -> u32 {
    (max_ram_mb / 2).clamp(1024, 2048)
}

fn sha1_hex(bytes: &[u8]) -> String {
    let digest = sha1::Sha1::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);

    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }

    hex
}

fn sha1_matches(path: &Path, expected_sha1: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let bytes = fs::read(path).map_err(|error| {
        format!(
            "Unable to read {} for SHA-1 verification: {error}",
            path.display()
        )
    })?;
    Ok(sha1_hex(&bytes).eq_ignore_ascii_case(expected_sha1))
}

async fn download_verified_file(path: &Path, url: &str, expected_sha1: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent(config::PRODUCT_NAME)
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Unable to download official file from {url}: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("Official file download failed for {url}: {error}"))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Unable to read official file response from {url}: {error}"))?;

    let actual_sha1 = sha1_hex(bytes.as_ref());
    if !actual_sha1.eq_ignore_ascii_case(expected_sha1) {
        return Err(format!(
            "Downloaded file hash mismatch for {url}. Expected {expected_sha1}, got {actual_sha1}."
        ));
    }

    if let Some(parent) = path.parent() {
        ensure_directory(parent)?;
    }

    fs::write(path, bytes.as_ref())
        .map_err(|error| format!("Unable to write {}: {error}", path.display()))
}

fn classpath_separator() -> &'static str {
    if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    }
}

fn parse_launch_manifest(version_json: &str) -> Result<LaunchVersionManifest, String> {
    serde_json::from_str(version_json)
        .map_err(|error| format!("Metadata spuštění Minecraftu se nepodařilo dekódovat: {error}"))
}

fn merge_launch_manifests(
    base_manifest: LaunchVersionManifest,
    fabric_manifest: LaunchVersionManifest,
) -> LaunchVersionManifest {
    let mut arguments = base_manifest.arguments;
    arguments
        .default_user_jvm
        .extend(fabric_manifest.arguments.default_user_jvm);
    arguments.jvm.extend(fabric_manifest.arguments.jvm);
    arguments.game.extend(fabric_manifest.arguments.game);

    LaunchVersionManifest {
        id: fabric_manifest.id,
        inherits_from: fabric_manifest
            .inherits_from
            .or(base_manifest.inherits_from),
        assets: fabric_manifest.assets.or(base_manifest.assets),
        version_type: fabric_manifest.version_type,
        main_class: fabric_manifest.main_class,
        arguments,
        logging: fabric_manifest.logging.or(base_manifest.logging),
    }
}

fn ensure_launch_requirements(
    paths: &LaunchPaths,
    base_details: &manifests::OfficialMinecraftVersionDetails,
    fabric_details: &fabric::FabricInstallationDetails,
) -> Result<(), String> {
    if !paths.version_json_path.exists() {
        return Err("Chybí metadata verze Minecraftu. Nejprve připrav klienta.".to_string());
    }

    if !paths.client_jar_path.exists() {
        return Err("Chybí client `.jar` soubor Minecraftu. Nejprve připrav klienta.".to_string());
    }

    if !paths.fabric_profile_json_path.exists() {
        return Err("Chybí metadata Fabric profilu. Nejprve připrav klienta.".to_string());
    }

    let asset_index_path = paths
        .assets_dir
        .join("indexes")
        .join(format!("{}.json", base_details.asset_index.id));
    if !asset_index_path.exists() {
        return Err("Chybí index assetů Minecraftu. Nejprve připrav klienta.".to_string());
    }

    for library in &base_details.libraries {
        let library_path = paths.libraries_dir.join(&library.path);
        if !library_path.exists() {
            return Err(format!(
                "Chybí požadovaná knihovna: {}. Nejprve připrav klienta.",
                library_path.display()
            ));
        }
    }

    for library in &fabric_details.libraries {
        let library_path = paths.libraries_dir.join(&library.path);
        if !library_path.exists() {
            return Err(format!(
                "Chybí požadovaná Fabric knihovna: {}. Nejprve připrav klienta.",
                library_path.display()
            ));
        }
    }

    Ok(())
}

async fn ensure_logging_config(
    paths: &LaunchPaths,
    launch_manifest: &LaunchVersionManifest,
) -> Result<Option<String>, String> {
    let Some(logging) = launch_manifest
        .logging
        .as_ref()
        .and_then(|logging| logging.client.as_ref())
    else {
        return Ok(None);
    };

    let log_config_path = paths.log_configs_dir.join(&logging.file.id);
    if !sha1_matches(&log_config_path, &logging.file.sha1)? {
        download_verified_file(&log_config_path, &logging.file.url, &logging.file.sha1).await?;
    }

    Ok(Some(log_config_path.display().to_string()))
}

fn build_classpath(
    paths: &LaunchPaths,
    base_details: &manifests::OfficialMinecraftVersionDetails,
    fabric_details: &fabric::FabricInstallationDetails,
) -> (String, usize) {
    let mut entries: Vec<String> = base_details
        .libraries
        .iter()
        .map(|library| {
            paths
                .libraries_dir
                .join(&library.path)
                .display()
                .to_string()
        })
        .collect();

    for library in &fabric_details.libraries {
        let entry = paths
            .libraries_dir
            .join(&library.path)
            .display()
            .to_string();
        if !entries.contains(&entry) {
            entries.push(entry);
        }
    }

    entries.push(paths.client_jar_path.display().to_string());

    (entries.join(classpath_separator()), entries.len())
}

fn customize_jvm_args(mut jvm_args: Vec<String>, max_ram_mb: u32) -> Vec<String> {
    jvm_args.retain(|argument| {
        !argument.starts_with("-Xms")
            && !argument.starts_with("-Xmx")
            && !argument.starts_with("-XX:MaxRAMPercentage")
    });

    let initial_ram_mb = derive_initial_ram_mb(max_ram_mb);
    jvm_args.insert(0, format!("-Xmx{}M", max_ram_mb));
    jvm_args.insert(0, format!("-Xms{}M", initial_ram_mb));
    jvm_args
}

fn build_launch_failure_status(context: LaunchFailureContext) -> GameLaunchStatus {
    GameLaunchStatus {
        state: GameLaunchState::Failed,
        target_version: config::MINECRAFT_VERSION,
        player_name: context.player_name,
        java_executable: context.java_executable,
        java_major_version: context.java_major_version,
        required_java_major: context.required_java_major,
        main_class: None,
        working_directory: context.working_directory,
        log_path: context.log_path,
        pid: None,
        classpath_entry_count: 0,
        started_at_unix_ms: None,
        finished_at_unix_ms: Some(current_timestamp_ms()),
        exit_code: None,
        configured_max_ram_mb: context.configured_max_ram_mb,
        diagnostic_summary: Some(context.diagnostic_summary),
        suggested_fix: Some(context.suggested_fix),
        log_excerpt: None,
        message: "Spuštění Minecraftu selhalo ještě před startem herního procesu.".to_string(),
    }
}

fn start_game_monitor(mut child: std::process::Child, mut status: GameLaunchStatus) {
    thread::spawn(move || {
        match child.wait() {
            Ok(exit_status) => {
                status.state = GameLaunchState::Exited;
                status.exit_code = exit_status.code();
                status.finished_at_unix_ms = Some(current_timestamp_ms());
                let log_excerpt = status
                    .log_path
                    .as_deref()
                    .map(Path::new)
                    .and_then(|path| read_log_tail(path, 20));
                status.log_excerpt = log_excerpt.clone();
                status.message = if exit_status.success() {
                    status.diagnostic_summary = None;
                    status.suggested_fix = None;
                    "Minecraft skončil normálně.".to_string()
                } else {
                    status.diagnostic_summary = Some(
                        "Minecraft skončil s nenulovým kódem a launcher zachytil poslední úryvek logu."
                            .to_string(),
                    );
                    status.suggested_fix = Some(
                    "Otevři herní log v nastavení, zkontroluj poslední řádky a ověř kompatibilitu Javy i připravené klientské soubory."
                            .to_string(),
                    );
                    format!(
                        "Minecraft skončil s kódem {}.",
                        exit_status
                            .code()
                            .map(|code| code.to_string())
                            .unwrap_or_else(|| "unknown".to_string())
                    )
                };
                let _ = logging::append_launcher_log_entry(
                    "game",
                    &format!(
                        "Proces Minecraftu skončil s kódem {:?}. Soubor logu: {}",
                        status.exit_code,
                        status.log_path.as_deref().unwrap_or("unavailable")
                    ),
                );
            }
            Err(error) => {
                status.state = GameLaunchState::Failed;
                status.finished_at_unix_ms = Some(current_timestamp_ms());
                status.diagnostic_summary =
                    Some("Launcher nedokázal sledovat proces Minecraftu až do konce.".to_string());
                status.suggested_fix = Some(
                    "Zkus spustit znovu a pokud se problém opakuje, otevři uloženou cestu k hernímu logu."
                        .to_string(),
                );
                status.message = format!("Sledování procesu Minecraftu selhalo: {error}");
                let _ = logging::append_launcher_log_entry(
                    "game",
                    &format!("Sledování procesu Minecraftu selhalo: {error}"),
                );
            }
        }

        let _ = write_game_status(status);
    });
}

#[tauri::command]
pub fn get_game_launch_status() -> Result<GameLaunchStatus, String> {
    read_game_status()
}

#[tauri::command]
pub async fn launch_minecraft() -> Result<GameLaunchStatus, String> {
    let current_status = read_game_status()?;
    if matches!(
        current_status.state,
        GameLaunchState::Launching | GameLaunchState::Running
    ) {
        return Err("Minecraft už běží v této relaci launcheru.".to_string());
    }

    let launch_identity = auth::resolve_launch_identity()?;
    let player_name = launch_identity.player_name.clone();
    let launcher_settings = settings::resolve_launcher_settings()?;
    let _ = logging::append_launcher_log_entry(
        "game",
        &format!(
            "Požadováno spuštění pro hráče {player_name} s nastavenou RAM {} MB.",
            launcher_settings.max_ram_mb
        ),
    );

    let base_details = manifests::fetch_official_minecraft_version_details().await?;
    let fabric_details = fabric::fetch_fabric_installation_details().await?;
    let paths = launch_paths(&fabric_details.profile_id)?;
    if let Err(error) = ensure_launch_requirements(&paths, &base_details, &fabric_details) {
        let _ = logging::append_launcher_log_entry(
            "game",
            &format!("Předpoklady spuštění selhaly: {error}"),
        );
        let failed_status = build_launch_failure_status(LaunchFailureContext {
            player_name: Some(player_name.clone()),
            java_executable: None,
            java_major_version: None,
            required_java_major: Some(
                base_details
                    .required_java_major
                    .unwrap_or(fabric_details.min_java_major)
                    .max(fabric_details.min_java_major),
            ),
            configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
            working_directory: Some(paths.minecraft_dir.display().to_string()),
            log_path: None,
            diagnostic_summary: error,
            suggested_fix: "Znovu spusť přípravu klienta, než zkusíš Minecraft spustit."
                .to_string(),
        });
        let _ = write_game_status(failed_status.clone());
        return Ok(failed_status);
    }

    let java_runtime = java::resolve_java_runtime();
    let java_executable = match java_runtime.executable_path.clone() {
        Some(executable_path) => executable_path,
        None => {
            let failed_status = build_launch_failure_status(LaunchFailureContext {
                player_name: Some(player_name.clone()),
                java_executable: None,
                java_major_version: java_runtime.major_version,
                required_java_major: Some(
                    base_details
                        .required_java_major
                        .unwrap_or(fabric_details.min_java_major)
                        .max(fabric_details.min_java_major),
                ),
                configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
                working_directory: Some(paths.minecraft_dir.display().to_string()),
                log_path: None,
                diagnostic_summary: "Spustitelný soubor Javy nebyl v PATH nalezen.".to_string(),
                suggested_fix:
                    "Nainstaluj kompatibilní Java runtime a ověř, že je příkaz `java` dostupný v PATH."
                        .to_string(),
            });
            let _ = logging::append_launcher_log_entry(
                "game",
                "Spustitelný soubor Javy nebyl v PATH nalezen.",
            );
            let _ = write_game_status(failed_status.clone());
            return Ok(failed_status);
        }
    };

    let required_java_major = base_details
        .required_java_major
        .unwrap_or(fabric_details.min_java_major)
        .max(fabric_details.min_java_major);

    if required_java_major > 0 {
        let detected_major = match java_runtime.major_version {
            Some(major_version) => major_version,
            None => {
                let diagnostic_summary = if java_runtime.source == "Custom path" {
                    "Nastavenou Javu se nepodařilo spustit.".to_string()
                } else {
                    "Javu se podařilo detekovat, ale její hlavní verzi se nepodařilo určit."
                        .to_string()
                };
                let suggested_fix = if java_runtime.source == "Custom path" {
                    "Zkontroluj nastavenou cestu k Javě, ověř že soubor existuje, nebo vlastní cestu smaž, aby se znovu použila PATH."
                        .to_string()
                } else {
                    "Nainstaluj běžné JDK nebo JRE a ověř, že `java -version` funguje v terminálu."
                        .to_string()
                };
                let failed_status = build_launch_failure_status(LaunchFailureContext {
                    player_name: Some(player_name.clone()),
                    java_executable: Some(java_executable.clone()),
                    java_major_version: None,
                    required_java_major: Some(required_java_major),
                    configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
                    working_directory: Some(paths.minecraft_dir.display().to_string()),
                    log_path: None,
                    diagnostic_summary,
                    suggested_fix,
                });
                let _ = logging::append_launcher_log_entry(
                    "game",
                    "Podařilo se detekovat Javu, ale verzi nebylo možné určit.",
                );
                let _ = write_game_status(failed_status.clone());
                return Ok(failed_status);
            }
        };

        if detected_major < required_java_major {
            let failed_status = build_launch_failure_status(LaunchFailureContext {
                player_name: Some(player_name.clone()),
                java_executable: Some(java_executable.clone()),
                java_major_version: Some(detected_major),
                required_java_major: Some(required_java_major),
                configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
                working_directory: Some(paths.minecraft_dir.display().to_string()),
                log_path: None,
                diagnostic_summary: format!(
                    "Minecraft {} vyžaduje Javu {} nebo novější, ale byla nalezena pouze Java {}.",
                    config::MINECRAFT_VERSION,
                    required_java_major,
                    detected_major
                ),
                suggested_fix: format!(
                    "Nainstaluj Javu {} nebo novější a pak zkus spuštění znovu.",
                    required_java_major
                ),
            });
            let _ = logging::append_launcher_log_entry(
                "game",
                &format!(
                    "Java {} je pro Minecraft {} příliš stará; je potřeba {}.",
                    detected_major,
                    config::MINECRAFT_VERSION,
                    required_java_major
                ),
            );
            let _ = write_game_status(failed_status.clone());
            return Ok(failed_status);
        }
    }

    let base_launch_manifest = parse_launch_manifest(&base_details.version_json)?;
    let fabric_launch_manifest = parse_launch_manifest(&fabric_details.profile_json)?;
    let launch_manifest = merge_launch_manifests(base_launch_manifest, fabric_launch_manifest);
    if launch_manifest.inherits_from.as_deref() != Some(config::MINECRAFT_VERSION) {
        let _ = logging::append_launcher_log_entry(
            "game",
            &format!(
                "Fabric profil {} dědí z {:?} místo z {}.",
                launch_manifest.id,
                launch_manifest.inherits_from,
                config::MINECRAFT_VERSION
            ),
        );
    }
    let logging_path = ensure_logging_config(&paths, &launch_manifest).await?;

    ensure_directory(&paths.natives_dir)?;
    ensure_directory(&paths.logs_dir)?;

    let (classpath, classpath_entry_count) =
        build_classpath(&paths, &base_details, &fabric_details);
    let log_path = paths
        .logs_dir
        .join(format!("minecraft-{}.log", current_timestamp_ms()));

    let launch_context = LaunchContext {
        auth_player_name: player_name.clone(),
        version_name: launch_manifest.id.clone(),
        game_directory: paths.minecraft_dir.display().to_string(),
        assets_root: paths.assets_dir.display().to_string(),
        assets_index_name: launch_manifest
            .assets
            .clone()
            .unwrap_or_else(|| base_details.asset_index.id.clone()),
        auth_uuid: launch_identity.player_uuid,
        auth_access_token: launch_identity.access_token,
        client_id: launch_identity.client_id,
        auth_xuid: launch_identity.xuid,
        version_type: launch_manifest.version_type.clone(),
        natives_directory: paths.natives_dir.display().to_string(),
        launcher_name: config::PRODUCT_NAME.to_string(),
        launcher_version: env!("CARGO_PKG_VERSION").to_string(),
        classpath,
        logging_path,
    };

    let mut jvm_args =
        resolve_argument_entries(&launch_manifest.arguments.default_user_jvm, &launch_context);
    jvm_args.extend(resolve_argument_entries(
        &launch_manifest.arguments.jvm,
        &launch_context,
    ));
    if let (Some(logging_path), Some(client_logging)) = (
        launch_context.logging_path.as_deref(),
        launch_manifest
            .logging
            .as_ref()
            .and_then(|logging| logging.client.as_ref()),
    ) {
        jvm_args.push(client_logging.argument.replace("${path}", logging_path));
    }
    jvm_args = customize_jvm_args(jvm_args, launcher_settings.max_ram_mb);
    let game_args = resolve_argument_entries(&launch_manifest.arguments.game, &launch_context);

    let started_at_unix_ms = current_timestamp_ms();

    let launching_status = GameLaunchStatus {
        state: GameLaunchState::Launching,
        target_version: config::MINECRAFT_VERSION,
        player_name: Some(player_name.clone()),
        java_executable: Some(java_executable.clone()),
        java_major_version: java_runtime.major_version,
        required_java_major: Some(required_java_major),
        main_class: Some(launch_manifest.main_class.clone()),
        working_directory: Some(paths.minecraft_dir.display().to_string()),
        log_path: Some(log_path.display().to_string()),
        pid: None,
        classpath_entry_count,
        started_at_unix_ms: Some(started_at_unix_ms),
        finished_at_unix_ms: None,
        exit_code: None,
        configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
        diagnostic_summary: None,
        suggested_fix: None,
        log_excerpt: None,
        message: "Spouštím Minecraft.".to_string(),
    };
    write_game_status(launching_status)?;
    let _ = logging::append_launcher_log_entry(
        "game",
        &format!(
            "Spouštím Minecraft {} z {} s Javou {}.",
            config::MINECRAFT_VERSION,
            paths.minecraft_dir.display(),
            java_executable
        ),
    );

    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| {
            format!(
                "Soubor logu Minecraftu na {} se nepodařilo otevřít: {error}",
                log_path.display()
            )
        })?;
    let stderr_log = log_file.try_clone().map_err(|error| {
        format!("Popisovač souboru logu Minecraftu se nepodařilo zkopírovat: {error}")
    })?;

    let mut command = Command::new(&java_executable);
    command
        .current_dir(&paths.minecraft_dir)
        .args(&jvm_args)
        .arg(&launch_manifest.main_class)
        .args(&game_args)
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(stderr_log));

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = logging::append_launcher_log_entry(
                "game",
                &format!("Proces Minecraftu se nepodařilo spustit: {error}"),
            );
            let failed_status = build_launch_failure_status(LaunchFailureContext {
                player_name: Some(player_name.clone()),
                java_executable: Some(java_executable.clone()),
                java_major_version: java_runtime.major_version,
                required_java_major: Some(required_java_major),
                configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
                working_directory: Some(paths.minecraft_dir.display().to_string()),
                log_path: Some(log_path.display().to_string()),
                diagnostic_summary: format!("Proces Minecraftu se nepodařilo spustit: {error}"),
                suggested_fix:
                    "Ověř, že je Java správně nainstalovaná, launcher má přístup k souborům a připravené klientské soubory stále existují."
                        .to_string(),
            });
            let _ = write_game_status(failed_status.clone());
            return Ok(failed_status);
        }
    };

    let running_status = GameLaunchStatus {
        state: GameLaunchState::Running,
        target_version: config::MINECRAFT_VERSION,
        player_name: Some(player_name),
        java_executable: Some(java_executable),
        java_major_version: java_runtime.major_version,
        required_java_major: Some(required_java_major),
        main_class: Some(launch_manifest.main_class),
        working_directory: Some(paths.minecraft_dir.display().to_string()),
        log_path: Some(log_path.display().to_string()),
        pid: Some(child.id()),
        classpath_entry_count,
        started_at_unix_ms: Some(started_at_unix_ms),
        finished_at_unix_ms: None,
        exit_code: None,
        configured_max_ram_mb: Some(launcher_settings.max_ram_mb),
        diagnostic_summary: None,
        suggested_fix: None,
        log_excerpt: None,
        message: "Minecraft běží.".to_string(),
    };

    write_game_status(running_status.clone())?;
    let _ = logging::append_launcher_log_entry(
        "game",
        &format!("Proces Minecraftu byl spuštěn s PID {}.", child.id()),
    );
    start_game_monitor(child, running_status.clone());

    Ok(running_status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_launch_manifests_keeps_base_classpath_args_and_fabric_main_class() {
        let base_manifest = parse_launch_manifest(
            r#"{
                "id":"26.1.2",
                "type":"release",
                "mainClass":"net.minecraft.client.main.Main",
                "arguments":{
                    "jvm":["-cp","${classpath}"],
                    "game":["--username","${auth_player_name}"]
                }
            }"#,
        )
        .expect("base manifest should parse");

        let fabric_manifest = parse_launch_manifest(
            r#"{
                "id":"fabric-loader-0.19.3-26.1.2",
                "inheritsFrom":"26.1.2",
                "type":"release",
                "mainClass":"net.fabricmc.loader.impl.launch.knot.KnotClient",
                "arguments":{
                    "jvm":["-DFabricMcEmu= net.minecraft.client.main.Main "],
                    "game":[]
                }
            }"#,
        )
        .expect("fabric manifest should parse");

        let merged = merge_launch_manifests(base_manifest, fabric_manifest);

        assert_eq!(
            merged.main_class,
            "net.fabricmc.loader.impl.launch.knot.KnotClient"
        );
        let merged_jvm_args = resolve_argument_entries(
            &merged.arguments.jvm,
            &LaunchContext {
                auth_player_name: "Tester".to_string(),
                version_name: merged.id.clone(),
                game_directory: "C:/Game".to_string(),
                assets_root: "C:/Assets".to_string(),
                assets_index_name: "26.1.2".to_string(),
                auth_uuid: "uuid".to_string(),
                auth_access_token: "token".to_string(),
                client_id: "client".to_string(),
                auth_xuid: "0".to_string(),
                version_type: merged.version_type.clone(),
                natives_directory: "C:/Natives".to_string(),
                launcher_name: "Nekara Launcher".to_string(),
                launcher_version: "0.1.11".to_string(),
                classpath: "fabric-loader.jar;client.jar".to_string(),
                logging_path: None,
            },
        );

        assert!(merged_jvm_args.iter().any(|arg| arg == "-cp"));
        assert!(merged_jvm_args
            .iter()
            .any(|arg| arg == "fabric-loader.jar;client.jar"));
        assert!(merged_jvm_args
            .iter()
            .any(|arg| arg.contains("net.minecraft.client.main.Main")));
    }
}
