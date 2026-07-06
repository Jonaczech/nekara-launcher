use std::fs;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use sha2::Sha512;

use crate::{client_package, config, fabric, filesystem, logging, manifests};

const ASSET_OBJECTS_BASE_URL: &str = "https://resources.download.minecraft.net";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum MinecraftInstallationPlanState {
    Ready,
    Blocked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftInstallationPlan {
    state: MinecraftInstallationPlanState,
    target_version: &'static str,
    minecraft_dir: String,
    version_json_path: String,
    client_jar_path: String,
    fabric_profile_json_path: String,
    libraries_dir: String,
    assets_dir: String,
    mods_dir: String,
    fabric_loader_version: Option<String>,
    fabric_profile_id: Option<String>,
    version_type: Option<String>,
    version_url: Option<String>,
    required_java_major: Option<u32>,
    client_download_url: Option<String>,
    client_download_sha1: Option<String>,
    asset_index_id: Option<String>,
    asset_index_url: Option<String>,
    library_count: Option<usize>,
    mod_count: Option<usize>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum MinecraftInstallationState {
    Ready,
    Pending,
    Blocked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftInstallationStatus {
    state: MinecraftInstallationState,
    target_version: &'static str,
    manifest_url: &'static str,
    latest_release: Option<String>,
    latest_snapshot: Option<String>,
    version_type: Option<String>,
    version_url: Option<String>,
    minecraft_dir: String,
    version_json_path: String,
    client_jar_path: String,
    fabric_profile_json_path: String,
    libraries_dir: String,
    assets_dir: String,
    mods_dir: String,
    asset_index_path: String,
    version_json_ready: bool,
    client_jar_ready: bool,
    fabric_profile_ready: bool,
    asset_index_ready: bool,
    library_count_total: usize,
    library_count_ready: usize,
    fabric_library_count_total: usize,
    fabric_library_count_ready: usize,
    asset_count_total: usize,
    asset_count_ready: usize,
    mod_count_total: usize,
    mod_count_ready: usize,
    fabric_loader_version: Option<String>,
    fabric_profile_id: Option<String>,
    required_java_major: Option<u32>,
    client_download_url: Option<String>,
    client_download_sha1: Option<String>,
    asset_index_id: Option<String>,
    asset_index_url: Option<String>,
    asset_index_total_size: Option<u64>,
    message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftInstallationProgress {
    active: bool,
    current_step: Option<String>,
    current_download_label: Option<String>,
    total_bytes: u64,
    downloaded_bytes: u64,
    remaining_bytes: u64,
    bytes_per_second: Option<f64>,
}

struct InstallationPaths {
    minecraft_dir: PathBuf,
    version_json_path: PathBuf,
    client_jar_path: PathBuf,
    fabric_profile_json_path: PathBuf,
    libraries_dir: PathBuf,
    assets_dir: PathBuf,
    mods_dir: PathBuf,
}

struct InstallationSnapshot {
    asset_index_path: PathBuf,
    version_json_ready: bool,
    client_jar_ready: bool,
    fabric_profile_ready: bool,
    asset_index_ready: bool,
    library_count_total: usize,
    library_count_ready: usize,
    fabric_library_count_total: usize,
    fabric_library_count_ready: usize,
    asset_count_total: usize,
    asset_count_ready: usize,
    mod_count_total: usize,
    mod_count_ready: usize,
}

#[derive(Deserialize, Serialize, Default)]
struct ManagedModsState {
    files: Vec<String>,
}

struct InstallationLock {
    path: PathBuf,
}

#[derive(Default)]
struct InstallationProgressTracker {
    active: bool,
    current_step: Option<String>,
    current_download_label: Option<String>,
    total_bytes: u64,
    completed_bytes: u64,
    current_download_total_bytes: u64,
    current_download_downloaded_bytes: u64,
    started_at: Option<Instant>,
}

struct InstallationProgressGuard;

static INSTALLATION_PROGRESS_TRACKER: OnceLock<Mutex<InstallationProgressTracker>> =
    OnceLock::new();

fn installation_progress_tracker() -> &'static Mutex<InstallationProgressTracker> {
    INSTALLATION_PROGRESS_TRACKER.get_or_init(|| Mutex::new(InstallationProgressTracker::default()))
}

fn snapshot_installation_progress() -> MinecraftInstallationProgress {
    let tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    let downloaded_bytes = tracker
        .completed_bytes
        .saturating_add(tracker.current_download_downloaded_bytes);
    let remaining_bytes = tracker.total_bytes.saturating_sub(downloaded_bytes);
    let bytes_per_second = tracker.started_at.and_then(|started_at| {
        let elapsed = started_at.elapsed().as_secs_f64();
        if elapsed >= 0.25 && downloaded_bytes > 0 {
            Some(downloaded_bytes as f64 / elapsed)
        } else {
            None
        }
    });

    MinecraftInstallationProgress {
        active: tracker.active,
        current_step: tracker.current_step.clone(),
        current_download_label: tracker.current_download_label.clone(),
        total_bytes: tracker.total_bytes,
        downloaded_bytes,
        remaining_bytes,
        bytes_per_second,
    }
}

fn start_installation_progress(total_bytes: u64, current_step: &str) {
    let mut tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    *tracker = InstallationProgressTracker {
        active: true,
        current_step: Some(current_step.to_string()),
        current_download_label: None,
        total_bytes,
        completed_bytes: 0,
        current_download_total_bytes: 0,
        current_download_downloaded_bytes: 0,
        started_at: Some(Instant::now()),
    };
}

fn set_installation_progress_step(current_step: &str) {
    let mut tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    if !tracker.active {
        return;
    }

    tracker.current_step = Some(current_step.to_string());
}

fn begin_installation_download(label: &str, expected_bytes: u64) {
    let mut tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    if !tracker.active {
        return;
    }

    tracker.current_download_label = Some(label.to_string());
    tracker.current_download_total_bytes = expected_bytes;
    tracker.current_download_downloaded_bytes = 0;
}

fn advance_installation_download(downloaded_bytes_delta: u64) {
    let mut tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    if !tracker.active {
        return;
    }

    tracker.current_download_downloaded_bytes = tracker
        .current_download_downloaded_bytes
        .saturating_add(downloaded_bytes_delta);
}

fn finish_installation_download(actual_bytes: u64) {
    let mut tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    if !tracker.active {
        return;
    }

    if actual_bytes > tracker.current_download_total_bytes {
        tracker.total_bytes = tracker
            .total_bytes
            .saturating_add(actual_bytes - tracker.current_download_total_bytes);
    } else {
        tracker.total_bytes = tracker
            .total_bytes
            .saturating_sub(tracker.current_download_total_bytes - actual_bytes);
    }

    tracker.completed_bytes = tracker.completed_bytes.saturating_add(actual_bytes);
    tracker.current_download_label = None;
    tracker.current_download_total_bytes = 0;
    tracker.current_download_downloaded_bytes = 0;
}

fn clear_installation_progress() {
    let mut tracker = installation_progress_tracker()
        .lock()
        .expect("installation progress tracker lock should not be poisoned");
    *tracker = InstallationProgressTracker::default();
}

impl InstallationProgressGuard {
    fn start(total_bytes: u64, current_step: &str) -> Self {
        start_installation_progress(total_bytes, current_step);
        Self
    }
}

impl Drop for InstallationProgressGuard {
    fn drop(&mut self) {
        clear_installation_progress();
    }
}

fn installation_paths(fabric_profile_id: &str) -> Result<InstallationPaths, String> {
    let minecraft_dir = filesystem::nekara_game_dir()?;
    let base_version_dir = minecraft_dir
        .join("versions")
        .join(config::MINECRAFT_VERSION);
    let fabric_version_dir = minecraft_dir.join("versions").join(fabric_profile_id);

    Ok(InstallationPaths {
        libraries_dir: minecraft_dir.join("libraries"),
        assets_dir: minecraft_dir.join("assets"),
        mods_dir: minecraft_dir.join("mods"),
        minecraft_dir,
        version_json_path: base_version_dir.join(format!("{}.json", config::MINECRAFT_VERSION)),
        client_jar_path: base_version_dir.join(format!("{}.jar", config::MINECRAFT_VERSION)),
        fabric_profile_json_path: fabric_version_dir.join(format!("{}.json", fabric_profile_id)),
    })
}

fn installation_lock_path() -> Result<PathBuf, String> {
    Ok(filesystem::ensure_launcher_subdirectory("locks")?.join(config::INSTALL_LOCK_FILE))
}

fn acquire_installation_lock() -> Result<InstallationLock, String> {
    let lock_path = installation_lock_path()?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "Another Minecraft preparation is already running for this launcher data directory."
                    .to_string()
            } else {
                format!(
                    "Unable to create installation lock at {}: {error}",
                    lock_path.display()
                )
            }
        })?;

    use std::io::Write;
    writeln!(file, "{}", std::process::id()).map_err(|error| {
        format!(
            "Unable to write installation lock at {}: {error}",
            lock_path.display()
        )
    })?;

    Ok(InstallationLock { path: lock_path })
}

impl Drop for InstallationLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn asset_index_path(paths: &InstallationPaths, asset_index_id: &str) -> PathBuf {
    paths
        .assets_dir
        .join("indexes")
        .join(format!("{asset_index_id}.json"))
}

fn asset_object_path(paths: &InstallationPaths, hash: &str) -> PathBuf {
    paths.assets_dir.join("objects").join(&hash[..2]).join(hash)
}

fn library_path(
    paths: &InstallationPaths,
    library: &manifests::OfficialLibraryDownload,
) -> PathBuf {
    paths.libraries_dir.join(&library.path)
}

fn ensure_parent_directory(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err(format!(
            "Unable to determine parent directory for {}.",
            path.display()
        ));
    };

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Unable to create directory at {}: {error}",
            parent.display()
        )
    })
}

fn sha1_hex(bytes: &[u8]) -> String {
    let digest = Sha1::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);

    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }

    hex
}

fn sha512_hex(bytes: &[u8]) -> String {
    let digest = Sha512::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);

    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }

    hex
}

fn read_sha1_hex(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| {
        format!(
            "Unable to read {} for SHA-1 verification: {error}",
            path.display()
        )
    })?;

    Ok(sha1_hex(&bytes))
}

fn text_matches(path: &Path, expected_text: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let local_text = fs::read_to_string(path)
        .map_err(|error| format!("Unable to read {}: {error}", path.display()))?;

    Ok(local_text == expected_text)
}

fn sha1_matches(path: &Path, expected_sha1: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    Ok(read_sha1_hex(path)?.eq_ignore_ascii_case(expected_sha1))
}

fn file_size_matches(path: &Path, expected_size: u64) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let metadata = fs::metadata(path)
        .map_err(|error| format!("Unable to read metadata for {}: {error}", path.display()))?;

    Ok(metadata.len() == expected_size)
}

fn sha512_matches(path: &Path, expected_sha512: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let bytes = fs::read(path).map_err(|error| {
        format!(
            "Unable to read {} for SHA-512 verification: {error}",
            path.display()
        )
    })?;

    Ok(sha512_hex(&bytes).eq_ignore_ascii_case(expected_sha512))
}

fn read_local_asset_index(
    asset_index_path: &Path,
) -> Result<Option<manifests::OfficialAssetIndexContents>, String> {
    if !asset_index_path.exists() {
        return Ok(None);
    }

    let raw_json = fs::read_to_string(asset_index_path).map_err(|error| {
        format!(
            "Unable to read local asset index at {}: {error}",
            asset_index_path.display()
        )
    })?;

    manifests::parse_asset_index_contents(&raw_json).map(Some)
}

fn write_text_file(path: &Path, contents: &str) -> Result<(), String> {
    ensure_parent_directory(path)?;

    fs::write(path, contents)
        .map_err(|error| format!("Unable to write {}: {error}", path.display()))
}

fn log_prepare_step(message: &str) {
    let _ = logging::append_launcher_log_entry("minecraft", message);
}

async fn download_bytes_with_progress(
    url: &str,
    error_label: &str,
    progress_label: &str,
    expected_bytes: u64,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent(config::PRODUCT_NAME)
        .timeout(Duration::from_secs(config::HTTP_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Unable to download official file from {url}: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("{error_label} download failed for {url}: {error}"))?;

    let announced_bytes = response.content_length().unwrap_or(expected_bytes);
    begin_installation_download(progress_label, announced_bytes);

    let mut bytes = Vec::new();
    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Unable to read {error_label} response from {url}: {error}"))?
    {
        advance_installation_download(chunk.len() as u64);
        bytes.extend_from_slice(&chunk);
    }

    finish_installation_download(bytes.len() as u64);

    Ok(bytes)
}

async fn download_verified_bytes(
    url: &str,
    expected_sha1: &str,
    expected_bytes: u64,
    progress_label: &str,
) -> Result<Vec<u8>, String> {
    let bytes =
        download_bytes_with_progress(url, "Official file", progress_label, expected_bytes).await?;
    let actual_sha1 = sha1_hex(bytes.as_ref());
    if !actual_sha1.eq_ignore_ascii_case(expected_sha1) {
        return Err(format!(
            "Downloaded file hash mismatch for {url}. Expected {expected_sha1}, got {actual_sha1}."
        ));
    }

    Ok(bytes.to_vec())
}

async fn download_verified_bytes_sha512(
    url: &str,
    expected_sha512: &str,
    expected_bytes: u64,
    progress_label: &str,
) -> Result<Vec<u8>, String> {
    let bytes =
        download_bytes_with_progress(url, "Approved mod file", progress_label, expected_bytes)
            .await?;
    let actual_sha512 = sha512_hex(bytes.as_ref());
    if !actual_sha512.eq_ignore_ascii_case(expected_sha512) {
        return Err(format!(
            "Downloaded mod hash mismatch for {url}. Expected {expected_sha512}, got {actual_sha512}."
        ));
    }

    Ok(bytes.to_vec())
}

async fn download_verified_file(
    path: &Path,
    url: &str,
    expected_sha1: &str,
    expected_bytes: u64,
    progress_label: &str,
) -> Result<(), String> {
    ensure_parent_directory(path)?;

    let bytes = download_verified_bytes(url, expected_sha1, expected_bytes, progress_label).await?;
    let temp_path = path.with_extension("download");

    fs::write(&temp_path, &bytes).map_err(|error| {
        format!(
            "Unable to write temporary file to {}: {error}",
            temp_path.display()
        )
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            format!(
                "Unable to replace existing file at {}: {error}",
                path.display()
            )
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        format!(
            "Unable to move verified file into place at {}: {error}",
            path.display()
        )
    })
}

async fn download_verified_file_sha512(
    path: &Path,
    url: &str,
    expected_sha512: &str,
    expected_bytes: u64,
    progress_label: &str,
) -> Result<(), String> {
    ensure_parent_directory(path)?;

    let bytes =
        download_verified_bytes_sha512(url, expected_sha512, expected_bytes, progress_label)
            .await?;
    let temp_path = path.with_extension("download");

    fs::write(&temp_path, &bytes).map_err(|error| {
        format!(
            "Unable to write temporary file to {}: {error}",
            temp_path.display()
        )
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            format!(
                "Unable to replace existing file at {}: {error}",
                path.display()
            )
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        format!(
            "Unable to move verified file into place at {}: {error}",
            path.display()
        )
    })
}

fn managed_mods_state_path(paths: &InstallationPaths) -> PathBuf {
    paths.mods_dir.join(config::MANAGED_MODS_STATE_FILE)
}

fn read_managed_mods_state(paths: &InstallationPaths) -> Result<ManagedModsState, String> {
    let state_path = managed_mods_state_path(paths);
    if !state_path.exists() {
        return Ok(ManagedModsState::default());
    }

    let contents = fs::read_to_string(&state_path)
        .map_err(|error| format!("Unable to read {}: {error}", state_path.display()))?;

    serde_json::from_str(&contents)
        .map_err(|error| format!("Unable to decode {}: {error}", state_path.display()))
}

fn write_managed_mods_state(
    paths: &InstallationPaths,
    state: &ManagedModsState,
) -> Result<(), String> {
    let state_path = managed_mods_state_path(paths);
    write_text_file(
        &state_path,
        &serde_json::to_string_pretty(state)
            .map_err(|error| format!("Unable to encode managed mods state: {error}"))?,
    )
}

fn push_nbt_string_payload(payload: &mut Vec<u8>, value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let length = u16::try_from(bytes.len())
        .map_err(|_| format!("NBT string is too long: {}", value.len()))?;
    payload.extend_from_slice(&length.to_be_bytes());
    payload.extend_from_slice(bytes);
    Ok(())
}

fn push_nbt_named_string(payload: &mut Vec<u8>, name: &str, value: &str) -> Result<(), String> {
    payload.push(8);
    push_nbt_string_payload(payload, name)?;
    push_nbt_string_payload(payload, value)
}

fn build_servers_dat_payload() -> Result<Vec<u8>, String> {
    let mut payload = Vec::new();

    // Root compound with empty name.
    payload.push(10);
    payload.extend_from_slice(&0u16.to_be_bytes());

    // List named "servers" containing one compound.
    payload.push(9);
    push_nbt_string_payload(&mut payload, "servers")?;
    payload.push(10);
    payload.extend_from_slice(&1i32.to_be_bytes());

    push_nbt_named_string(&mut payload, "name", config::PRESET_MULTIPLAYER_SERVER_NAME)?;
    push_nbt_named_string(
        &mut payload,
        "ip",
        config::PRESET_MULTIPLAYER_SERVER_ADDRESS,
    )?;

    // End first server compound and root compound.
    payload.push(0);
    payload.push(0);

    Ok(payload)
}

fn build_servers_dat_bytes() -> Result<Vec<u8>, String> {
    build_servers_dat_payload()
}

fn ensure_preset_multiplayer_server(paths: &InstallationPaths) -> Result<bool, String> {
    let servers_dat_path = paths.minecraft_dir.join("servers.dat");
    let encoded_payload = build_servers_dat_bytes()?;

    if servers_dat_path.exists() {
        let existing_bytes = fs::read(&servers_dat_path)
            .map_err(|error| format!("Unable to read {}: {error}", servers_dat_path.display()))?;
        if existing_bytes == encoded_payload {
            return Ok(false);
        }
    }

    ensure_parent_directory(&servers_dat_path)?;
    fs::write(&servers_dat_path, &encoded_payload).map_err(|error| {
        format!(
            "Unable to write preset multiplayer server file at {}: {error}",
            servers_dat_path.display()
        )
    })?;

    Ok(true)
}

async fn sync_approved_mods(paths: &InstallationPaths) -> Result<usize, String> {
    let approved_package = client_package::load_approved_client_package()?;
    if approved_package.minecraft_version != config::MINECRAFT_VERSION {
        return Err(format!(
            "Approved mod manifest targets {}, expected {}.",
            approved_package.minecraft_version,
            config::MINECRAFT_VERSION
        ));
    }

    if approved_package.game_configuration_id != config::GAME_CONFIGURATION_ID {
        return Err(format!(
            "Approved mod manifest targets configuration {}, expected {}.",
            approved_package.game_configuration_id,
            config::GAME_CONFIGURATION_ID
        ));
    }

    fs::create_dir_all(&paths.mods_dir).map_err(|error| {
        format!(
            "Unable to create mods directory at {}: {error}",
            paths.mods_dir.display()
        )
    })?;

    let previous_state = read_managed_mods_state(paths)?;
    let mut changed_count = 0usize;
    let mut current_files = Vec::with_capacity(approved_package.mods.len());

    log_prepare_step("Ověřuji a synchronizuji schválené Fabric mody.");
    for approved_mod in &approved_package.mods {
        if approved_mod.distribution != "required" {
            continue;
        }

        let local_path = paths.mods_dir.join(&approved_mod.file_name);
        current_files.push(approved_mod.file_name.clone());

        if file_size_matches(&local_path, approved_mod.size)?
            && sha512_matches(&local_path, &approved_mod.sha512)?
        {
            continue;
        }

        log_prepare_step(&format!(
            "Stahuji nebo opravuji mod {} ({}) do {}.",
            approved_mod.display_name,
            approved_mod.id,
            local_path.display()
        ));
        download_verified_file_sha512(
            &local_path,
            &approved_mod.download_url,
            &approved_mod.sha512,
            approved_mod.size,
            &format!("Mod {}", approved_mod.display_name),
        )
        .await?;
        changed_count += 1;
    }

    for previous_file in previous_state.files {
        if current_files.contains(&previous_file) {
            continue;
        }

        let previous_path = paths.mods_dir.join(&previous_file);
        if previous_path.exists() {
            fs::remove_file(&previous_path).map_err(|error| {
                format!(
                    "Unable to remove outdated managed mod at {}: {error}",
                    previous_path.display()
                )
            })?;
            changed_count += 1;
        }
    }

    write_managed_mods_state(
        paths,
        &ManagedModsState {
            files: current_files,
        },
    )?;

    Ok(changed_count)
}

fn build_missing_summary(snapshot: &InstallationSnapshot) -> String {
    let mut parts = Vec::new();

    if !snapshot.version_json_ready {
        parts.push("metadata verze".to_string());
    }

    if !snapshot.client_jar_ready {
        parts.push("client `.jar`".to_string());
    }

    if !snapshot.fabric_profile_ready {
        parts.push("Fabric profil".to_string());
    }

    if !snapshot.asset_index_ready {
        parts.push("index assetů".to_string());
    }

    let missing_libraries = snapshot
        .library_count_total
        .saturating_sub(snapshot.library_count_ready);
    if missing_libraries > 0 {
        parts.push(format!("{missing_libraries} knihoven"));
    }

    let missing_assets = snapshot
        .asset_count_total
        .saturating_sub(snapshot.asset_count_ready);
    if missing_assets > 0 {
        parts.push(format!("{missing_assets} objektů assetů"));
    }

    let missing_mods = snapshot
        .mod_count_total
        .saturating_sub(snapshot.mod_count_ready);
    if missing_mods > 0 {
        parts.push(format!("{missing_mods} modů"));
    }

    if parts.is_empty() {
        "nothing".to_string()
    } else {
        parts.join(", ")
    }
}

fn combined_required_java_major(
    base_required_java_major: Option<u32>,
    fabric_min_java_major: u32,
) -> u32 {
    base_required_java_major
        .unwrap_or(fabric_min_java_major)
        .max(fabric_min_java_major)
}

fn installation_snapshot_is_ready(snapshot: &InstallationSnapshot) -> bool {
    snapshot.version_json_ready
        && snapshot.client_jar_ready
        && snapshot.fabric_profile_ready
        && snapshot.asset_index_ready
        && snapshot.library_count_ready == snapshot.library_count_total
        && snapshot.asset_count_ready == snapshot.asset_count_total
        && snapshot.mod_count_ready == snapshot.mod_count_total
}

fn collect_pending_download_bytes(
    paths: &InstallationPaths,
    base_details: &manifests::OfficialMinecraftVersionDetails,
    fabric_details: &fabric::FabricInstallationDetails,
    asset_index_contents: &manifests::OfficialAssetIndexContents,
    approved_package: &client_package::ApprovedClientPackage,
) -> Result<u64, String> {
    let mut total_bytes = 0u64;

    if !sha1_matches(&paths.client_jar_path, &base_details.client_download_sha1)? {
        total_bytes = total_bytes.saturating_add(base_details.client_download_size);
    }

    for library in &base_details.libraries {
        let local_path = library_path(paths, library);
        if !sha1_matches(&local_path, &library.sha1)? {
            total_bytes = total_bytes.saturating_add(library.size);
        }
    }

    for library in &fabric_details.libraries {
        let local_path = library_path(paths, library);
        if !sha1_matches(&local_path, &library.sha1)? {
            total_bytes = total_bytes.saturating_add(library.size);
        }
    }

    for asset in &asset_index_contents.objects {
        let local_path = asset_object_path(paths, &asset.hash);
        if !file_size_matches(&local_path, asset.size)? {
            total_bytes = total_bytes.saturating_add(asset.size);
        }
    }

    for approved_mod in &approved_package.mods {
        if approved_mod.distribution != "required" {
            continue;
        }

        let local_path = paths.mods_dir.join(&approved_mod.file_name);
        if !file_size_matches(&local_path, approved_mod.size)?
            || !sha512_matches(&local_path, &approved_mod.sha512)?
        {
            total_bytes = total_bytes.saturating_add(approved_mod.size);
        }
    }

    Ok(total_bytes)
}

fn build_installation_status(
    paths: &InstallationPaths,
    base_details: &manifests::OfficialMinecraftVersionDetails,
    fabric_details: &fabric::FabricInstallationDetails,
    snapshot: InstallationSnapshot,
    message: String,
) -> MinecraftInstallationStatus {
    let state = if installation_snapshot_is_ready(&snapshot) {
        MinecraftInstallationState::Ready
    } else {
        MinecraftInstallationState::Pending
    };

    MinecraftInstallationStatus {
        state,
        target_version: config::MINECRAFT_VERSION,
        manifest_url: config::MINECRAFT_VERSION_MANIFEST_URL,
        latest_release: Some(base_details.latest_release.clone()),
        latest_snapshot: Some(base_details.latest_snapshot.clone()),
        version_type: Some(base_details.version_type.clone()),
        version_url: Some(base_details.version_url.clone()),
        minecraft_dir: paths.minecraft_dir.display().to_string(),
        version_json_path: paths.version_json_path.display().to_string(),
        client_jar_path: paths.client_jar_path.display().to_string(),
        fabric_profile_json_path: paths.fabric_profile_json_path.display().to_string(),
        libraries_dir: paths.libraries_dir.display().to_string(),
        assets_dir: paths.assets_dir.display().to_string(),
        mods_dir: paths.mods_dir.display().to_string(),
        asset_index_path: snapshot.asset_index_path.display().to_string(),
        version_json_ready: snapshot.version_json_ready,
        client_jar_ready: snapshot.client_jar_ready,
        fabric_profile_ready: snapshot.fabric_profile_ready,
        asset_index_ready: snapshot.asset_index_ready,
        library_count_total: snapshot.library_count_total,
        library_count_ready: snapshot.library_count_ready,
        fabric_library_count_total: snapshot.fabric_library_count_total,
        fabric_library_count_ready: snapshot.fabric_library_count_ready,
        asset_count_total: snapshot.asset_count_total,
        asset_count_ready: snapshot.asset_count_ready,
        mod_count_total: snapshot.mod_count_total,
        mod_count_ready: snapshot.mod_count_ready,
        fabric_loader_version: Some(fabric_details.loader_version.clone()),
        fabric_profile_id: Some(fabric_details.profile_id.clone()),
        required_java_major: Some(combined_required_java_major(
            base_details.required_java_major,
            fabric_details.min_java_major,
        )),
        client_download_url: Some(base_details.client_download_url.clone()),
        client_download_sha1: Some(base_details.client_download_sha1.clone()),
        asset_index_id: Some(base_details.asset_index.id.clone()),
        asset_index_url: Some(base_details.asset_index.url.clone()),
        asset_index_total_size: Some(base_details.asset_index.total_size),
        message,
    }
}

async fn collect_installation_snapshot(
    paths: &InstallationPaths,
    base_details: &manifests::OfficialMinecraftVersionDetails,
    fabric_details: &fabric::FabricInstallationDetails,
) -> Result<InstallationSnapshot, String> {
    let approved_package = client_package::load_approved_client_package()?;
    let asset_index_path = asset_index_path(paths, &base_details.asset_index.id);
    let version_json_ready = text_matches(&paths.version_json_path, &base_details.version_json)?;
    let client_jar_ready =
        sha1_matches(&paths.client_jar_path, &base_details.client_download_sha1)?;
    let fabric_profile_ready = text_matches(
        &paths.fabric_profile_json_path,
        &fabric_details.profile_json,
    )?;
    let asset_index_ready = sha1_matches(&asset_index_path, &base_details.asset_index.sha1)?;
    let local_asset_index_contents = if asset_index_ready {
        read_local_asset_index(&asset_index_path)?
    } else {
        None
    };

    let mut official_library_count_ready = 0usize;
    for library in &base_details.libraries {
        if sha1_matches(&library_path(paths, library), &library.sha1)? {
            official_library_count_ready += 1;
        }
    }

    let mut fabric_library_count_ready = 0usize;
    for library in &fabric_details.libraries {
        if sha1_matches(&library_path(paths, library), &library.sha1)? {
            fabric_library_count_ready += 1;
        }
    }

    let mut asset_count_ready = 0usize;
    let asset_count_total = if let Some(asset_index_contents) = local_asset_index_contents.as_ref()
    {
        for asset in &asset_index_contents.objects {
            if file_size_matches(&asset_object_path(paths, &asset.hash), asset.size)? {
                asset_count_ready += 1;
            }
        }

        asset_index_contents.objects.len()
    } else {
        0
    };

    let mut mod_count_ready = 0usize;
    let required_mods: Vec<_> = approved_package
        .mods
        .iter()
        .filter(|approved_mod| approved_mod.distribution == "required")
        .collect();
    for approved_mod in &required_mods {
        let local_path = paths.mods_dir.join(&approved_mod.file_name);
        if file_size_matches(&local_path, approved_mod.size)?
            && sha512_matches(&local_path, &approved_mod.sha512)?
        {
            mod_count_ready += 1;
        }
    }

    Ok(InstallationSnapshot {
        asset_index_path,
        version_json_ready,
        client_jar_ready,
        fabric_profile_ready,
        asset_index_ready,
        library_count_total: base_details.libraries.len() + fabric_details.libraries.len(),
        library_count_ready: official_library_count_ready + fabric_library_count_ready,
        fabric_library_count_total: fabric_details.libraries.len(),
        fabric_library_count_ready,
        asset_count_total,
        asset_count_ready,
        mod_count_total: required_mods.len(),
        mod_count_ready,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::{filesystem, settings};

    fn test_paths() -> InstallationPaths {
        let root = PathBuf::from("C:/NekaraTest");

        InstallationPaths {
            minecraft_dir: root.clone(),
            version_json_path: root.join("versions/26.1.2/26.1.2.json"),
            client_jar_path: root.join("versions/26.1.2/26.1.2.jar"),
            fabric_profile_json_path: root.join("versions/fabric/fabric.json"),
            libraries_dir: root.join("libraries"),
            assets_dir: root.join("assets"),
            mods_dir: root.join("mods"),
        }
    }

    fn test_base_details() -> manifests::OfficialMinecraftVersionDetails {
        manifests::OfficialMinecraftVersionDetails {
            version_type: "release".to_string(),
            version_url: "https://example.test/version.json".to_string(),
            version_json: "{}".to_string(),
            latest_release: config::MINECRAFT_VERSION.to_string(),
            latest_snapshot: config::MINECRAFT_VERSION.to_string(),
            required_java_major: Some(21),
            client_download_url: "https://example.test/client.jar".to_string(),
            client_download_sha1: "client-sha1".to_string(),
            client_download_size: 1024,
            asset_index: manifests::OfficialAssetIndexDownload {
                id: "asset-index".to_string(),
                sha1: "asset-index-sha1".to_string(),
                total_size: 42,
                url: "https://example.test/assets.json".to_string(),
            },
            libraries: vec![
                manifests::OfficialLibraryDownload {
                    path: "official/a.jar".to_string(),
                    url: "https://example.test/official/a.jar".to_string(),
                    sha1: "official-a".to_string(),
                    size: 64,
                },
                manifests::OfficialLibraryDownload {
                    path: "official/b.jar".to_string(),
                    url: "https://example.test/official/b.jar".to_string(),
                    sha1: "official-b".to_string(),
                    size: 64,
                },
            ],
        }
    }

    fn test_fabric_details() -> fabric::FabricInstallationDetails {
        fabric::FabricInstallationDetails {
            loader_version: "0.16.14".to_string(),
            profile_id: "fabric-loader-0.16.14-26.1.2".to_string(),
            profile_json: "{}".to_string(),
            min_java_major: 21,
            libraries: vec![manifests::OfficialLibraryDownload {
                path: "fabric/loader.jar".to_string(),
                url: "https://example.test/fabric/loader.jar".to_string(),
                sha1: "fabric-loader".to_string(),
                size: 64,
            }],
        }
    }

    #[test]
    fn ready_status_counts_fabric_libraries_in_total_ready_libraries() {
        let snapshot = InstallationSnapshot {
            asset_index_path: PathBuf::from("C:/NekaraTest/assets/indexes/asset-index.json"),
            version_json_ready: true,
            client_jar_ready: true,
            fabric_profile_ready: true,
            asset_index_ready: true,
            library_count_total: 3,
            library_count_ready: 3,
            fabric_library_count_total: 1,
            fabric_library_count_ready: 1,
            asset_count_total: 2,
            asset_count_ready: 2,
            mod_count_total: 4,
            mod_count_ready: 4,
        };

        let status = build_installation_status(
            &test_paths(),
            &test_base_details(),
            &test_fabric_details(),
            snapshot,
            "ready".to_string(),
        );

        assert!(matches!(status.state, MinecraftInstallationState::Ready));
        assert_eq!(status.library_count_total, 3);
        assert_eq!(status.library_count_ready, 3);
        assert_eq!(status.fabric_library_count_ready, 1);
    }

    #[test]
    fn preset_multiplayer_server_payload_contains_expected_host() {
        let payload = build_servers_dat_payload().expect("server payload should build");
        assert_eq!(
            payload,
            vec![
                0x0A, 0x00, 0x00, 0x09, 0x00, 0x07, b's', b'e', b'r', b'v', b'e', b'r', b's', 0x0A,
                0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x04, b'n', b'a', b'm', b'e', 0x00, 0x06, b'N',
                b'e', b'k', b'a', b'r', b'a', 0x08, 0x00, 0x02, b'i', b'p', 0x00, 0x14, b'n', b'e',
                b'k', b'a', b'r', b'a', b'.', b'm', b'c', b'.', b'h', b'o', b's', b't', b'i', b'f',
                b'y', b'.', b'c', b'z', 0x00, 0x00,
            ]
        );
    }

    #[test]
    #[ignore = "downloads the full Minecraft/Fabric client package for smoke verification"]
    fn smoke_prepares_installation_and_writes_server_preset() {
        let launcher_data_dir =
            filesystem::launcher_data_dir().expect("launcher data dir should resolve");
        let settings_path = launcher_data_dir.join(config::LAUNCHER_SETTINGS_FILE);
        let original_settings = fs::read(&settings_path).ok();
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("current time should be after epoch")
            .as_secs();
        let smoke_root = std::env::temp_dir().join(format!("nekara-smoke-{unique_suffix}"));

        if smoke_root.exists() {
            fs::remove_dir_all(&smoke_root).expect("previous smoke dir should be removable");
        }

        let restore_settings = |original_settings: Option<Vec<u8>>| {
            if let Some(contents) = original_settings {
                fs::write(&settings_path, contents).expect("launcher settings should restore");
            } else if settings_path.exists() {
                fs::remove_file(&settings_path).expect("temporary launcher settings should clear");
            }
        };

        let result = (|| -> Result<(), String> {
            settings::save_launcher_settings(4096, None, Some(smoke_root.display().to_string()))?;
            let status = tauri::async_runtime::block_on(prepare_minecraft_installation())?;

            if !matches!(status.state, MinecraftInstallationState::Ready) {
                return Err(format!(
                    "Smoke preparation did not finish ready: {}",
                    status.message
                ));
            }

            let mods_dir = smoke_root.join("mods");
            let servers_dat = smoke_root.join("servers.dat");

            if !mods_dir.exists() {
                return Err(format!(
                    "Smoke test expected mods dir at {}.",
                    mods_dir.display()
                ));
            }

            if !servers_dat.exists() {
                return Err(format!(
                    "Smoke test expected preset server file at {}.",
                    servers_dat.display()
                ));
            }

            let servers_dat_bytes = fs::read(&servers_dat)
                .map_err(|error| format!("Unable to read smoke servers.dat: {error}"))?;
            if servers_dat_bytes.starts_with(&[0x1F, 0x8B]) {
                return Err(
                    "Smoke test expected raw NBT, not gzip-compressed servers.dat.".to_string(),
                );
            }

            let mod_files = fs::read_dir(&mods_dir)
                .map_err(|error| format!("Unable to list smoke mods dir: {error}"))?
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .and_then(|value| value.to_str())
                        .map(|extension| extension.eq_ignore_ascii_case("jar"))
                        .unwrap_or(false)
                })
                .count();

            if mod_files < 21 {
                return Err(format!(
                    "Smoke test expected at least 21 mod jars, found {mod_files}."
                ));
            }

            Ok(())
        })();

        restore_settings(original_settings);

        if smoke_root.exists() {
            let _ = fs::remove_dir_all(&smoke_root);
        }

        if let Err(error) = result {
            panic!("{error}");
        }
    }
}

#[tauri::command]
pub async fn get_minecraft_installation_plan() -> Result<MinecraftInstallationPlan, String> {
    let base_details = manifests::fetch_official_minecraft_version_details().await?;
    let fabric_details = fabric::fetch_fabric_installation_details().await?;
    let approved_package = client_package::load_approved_client_package()?;
    let paths = installation_paths(&fabric_details.profile_id)?;

    let _ = filesystem::ensure_nekara_game_directory()?;

    Ok(MinecraftInstallationPlan {
        state: MinecraftInstallationPlanState::Ready,
        target_version: config::MINECRAFT_VERSION,
        minecraft_dir: paths.minecraft_dir.display().to_string(),
        version_json_path: paths.version_json_path.display().to_string(),
        client_jar_path: paths.client_jar_path.display().to_string(),
        fabric_profile_json_path: paths.fabric_profile_json_path.display().to_string(),
        libraries_dir: paths.libraries_dir.display().to_string(),
        assets_dir: paths.assets_dir.display().to_string(),
        mods_dir: paths.mods_dir.display().to_string(),
        fabric_loader_version: Some(fabric_details.loader_version.clone()),
        fabric_profile_id: Some(fabric_details.profile_id.clone()),
        version_type: Some(base_details.version_type.clone()),
        version_url: Some(base_details.version_url.clone()),
        required_java_major: Some(combined_required_java_major(
            base_details.required_java_major,
            fabric_details.min_java_major,
        )),
        client_download_url: Some(base_details.client_download_url.clone()),
        client_download_sha1: Some(base_details.client_download_sha1.clone()),
        asset_index_id: Some(base_details.asset_index.id.clone()),
        asset_index_url: Some(base_details.asset_index.url.clone()),
        library_count: Some(base_details.libraries.len() + fabric_details.libraries.len()),
        mod_count: Some(
            approved_package
                .mods
                .iter()
                .filter(|approved_mod| approved_mod.distribution == "required")
                .count(),
        ),
        message: format!(
            "Fabric loader {} je pro {} dostupný a lokální instalační cesty jsou připravené.",
            fabric_details.loader_version,
            config::MINECRAFT_VERSION
        ),
    })
}

#[tauri::command]
pub async fn get_minecraft_installation_status() -> Result<MinecraftInstallationStatus, String> {
    let base_details = manifests::fetch_official_minecraft_version_details().await?;
    let fabric_details = fabric::fetch_fabric_installation_details().await?;
    let paths = installation_paths(&fabric_details.profile_id)?;

    let _ = filesystem::ensure_nekara_game_directory()?;

    let snapshot = collect_installation_snapshot(&paths, &base_details, &fabric_details).await?;
    let message = if matches!(
        build_installation_status(
            &paths,
            &base_details,
            &fabric_details,
            InstallationSnapshot {
                asset_index_path: snapshot.asset_index_path.clone(),
                version_json_ready: snapshot.version_json_ready,
                client_jar_ready: snapshot.client_jar_ready,
                fabric_profile_ready: snapshot.fabric_profile_ready,
                asset_index_ready: snapshot.asset_index_ready,
                library_count_total: snapshot.library_count_total,
                library_count_ready: snapshot.library_count_ready,
                fabric_library_count_total: snapshot.fabric_library_count_total,
                fabric_library_count_ready: snapshot.fabric_library_count_ready,
                asset_count_total: snapshot.asset_count_total,
                asset_count_ready: snapshot.asset_count_ready,
                mod_count_total: snapshot.mod_count_total,
                mod_count_ready: snapshot.mod_count_ready,
            },
            String::new(),
        )
        .state,
        MinecraftInstallationState::Ready
    ) {
        format!(
            "Fabric klientské soubory pro {} jsou připravené.",
            config::MINECRAFT_VERSION
        )
    } else {
        format!(
            "Fabric klientské soubory je ještě potřeba připravit: {}.",
            build_missing_summary(&snapshot)
        )
    };

    Ok(build_installation_status(
        &paths,
        &base_details,
        &fabric_details,
        snapshot,
        message,
    ))
}

#[tauri::command]
pub async fn prepare_minecraft_installation() -> Result<MinecraftInstallationStatus, String> {
    log_prepare_step("Připravuji Fabric klientské soubory pro launcher Nekara.");
    log_prepare_step("Načítám oficiální metadata verze Minecraftu.");
    let base_details = manifests::fetch_official_minecraft_version_details().await?;
    log_prepare_step("Načítám metadata instalace Fabricu.");
    let fabric_details = fabric::fetch_fabric_installation_details().await?;
    let _installation_lock = acquire_installation_lock()?;
    let paths = installation_paths(&fabric_details.profile_id)?;
    log_prepare_step("Načítám oficiální index assetů.");
    let asset_index_contents =
        manifests::fetch_official_asset_index_contents(&base_details.asset_index).await?;

    let _ = filesystem::ensure_nekara_game_directory()?;
    let approved_package = client_package::load_approved_client_package()?;
    let pending_download_bytes = collect_pending_download_bytes(
        &paths,
        &base_details,
        &fabric_details,
        &asset_index_contents,
        &approved_package,
    )?;
    let _progress_guard =
        InstallationProgressGuard::start(pending_download_bytes, "Připravuji hru");

    let mut changed_parts = Vec::new();

    if !text_matches(&paths.version_json_path, &base_details.version_json)? {
        write_text_file(&paths.version_json_path, &base_details.version_json)?;
        changed_parts.push("metadata verze");
    }

    if !sha1_matches(&paths.client_jar_path, &base_details.client_download_sha1)? {
        set_installation_progress_step("Stahuji základ hry");
        download_verified_file(
            &paths.client_jar_path,
            &base_details.client_download_url,
            &base_details.client_download_sha1,
            base_details.client_download_size,
            "Minecraft klient",
        )
        .await?;
        changed_parts.push("client `.jar`");
    }

    if !text_matches(
        &paths.fabric_profile_json_path,
        &fabric_details.profile_json,
    )? {
        write_text_file(
            &paths.fabric_profile_json_path,
            &fabric_details.profile_json,
        )?;
        changed_parts.push("Fabric profil");
    }

    let asset_index_path = asset_index_path(&paths, &base_details.asset_index.id);
    if !sha1_matches(&asset_index_path, &base_details.asset_index.sha1)? {
        write_text_file(&asset_index_path, &asset_index_contents.raw_json)?;
        changed_parts.push("index assetů");
    }

    let mut downloaded_libraries = 0usize;
    set_installation_progress_step("Stahuji knihovny");
    log_prepare_step("Ověřuji a stahuji oficiální knihovny.");
    for library in &base_details.libraries {
        let local_path = library_path(&paths, library);
        if sha1_matches(&local_path, &library.sha1)? {
            continue;
        }

        download_verified_file(
            &local_path,
            &library.url,
            &library.sha1,
            library.size,
            "Oficiální knihovna",
        )
        .await?;
        downloaded_libraries += 1;
    }

    if downloaded_libraries > 0 {
        changed_parts.push("knihovny");
    }

    let mut downloaded_fabric_libraries = 0usize;
    set_installation_progress_step("Stahuji Fabric knihovny");
    log_prepare_step("Ověřuji a stahuji Fabric knihovny.");
    for library in &fabric_details.libraries {
        let local_path = library_path(&paths, library);
        if sha1_matches(&local_path, &library.sha1)? {
            continue;
        }

        download_verified_file(
            &local_path,
            &library.url,
            &library.sha1,
            library.size,
            "Fabric knihovna",
        )
        .await?;
        downloaded_fabric_libraries += 1;
    }

    if downloaded_fabric_libraries > 0 {
        changed_parts.push("Fabric knihovny");
    }

    let mut downloaded_assets = 0usize;
    set_installation_progress_step("Stahuji herní soubory");
    log_prepare_step("Ověřuji a stahuji objekty assetů.");
    for asset in &asset_index_contents.objects {
        let local_path = asset_object_path(&paths, &asset.hash);
        if file_size_matches(&local_path, asset.size)? {
            continue;
        }

        let url = format!(
            "{}/{}/{}",
            ASSET_OBJECTS_BASE_URL,
            &asset.hash[..2],
            asset.hash
        );
        download_verified_file(&local_path, &url, &asset.hash, asset.size, "Herní asset").await?;
        downloaded_assets += 1;
    }

    if downloaded_assets > 0 {
        changed_parts.push("objekty assetů");
    }

    set_installation_progress_step("Stahuji schválené mody");
    let synchronized_mods = sync_approved_mods(&paths).await?;
    if synchronized_mods > 0 {
        changed_parts.push("schválené mody");
    }

    if ensure_preset_multiplayer_server(&paths)? {
        changed_parts.push("Nekara server v multiplayeru");
    }

    let snapshot = collect_installation_snapshot(&paths, &base_details, &fabric_details).await?;
    let message = if changed_parts.is_empty() {
        format!(
            "Fabric klientské soubory pro {} už byly aktuální.",
            config::MINECRAFT_VERSION
        )
    } else {
        let missing_summary = build_missing_summary(&snapshot);
        let all_ready = snapshot.version_json_ready
            && snapshot.client_jar_ready
            && snapshot.fabric_profile_ready
            && snapshot.asset_index_ready
            && snapshot.library_count_ready == snapshot.library_count_total
            && snapshot.asset_count_ready == snapshot.asset_count_total
            && snapshot.mod_count_ready == snapshot.mod_count_total;

        if all_ready {
            format!(
                "Fabric klientské soubory byly úspěšně připraveny: {}.",
                changed_parts.join(", ")
            )
        } else {
            format!(
                "Příprava Fabricu skončila, ale některé soubory ještě potřebují pozornost: {missing_summary}."
            )
        }
    };

    log_prepare_step(&format!("Příprava Minecraftu dokončena: {message}"));

    Ok(build_installation_status(
        &paths,
        &base_details,
        &fabric_details,
        snapshot,
        message,
    ))
}

#[tauri::command]
pub fn get_minecraft_installation_progress() -> MinecraftInstallationProgress {
    snapshot_installation_progress()
}
