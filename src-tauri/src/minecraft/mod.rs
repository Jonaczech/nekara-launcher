use std::fs;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use sha1::{Digest, Sha1};

use crate::{config, fabric, filesystem, logging, manifests};

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

struct InstallationPaths {
    minecraft_dir: PathBuf,
    version_json_path: PathBuf,
    client_jar_path: PathBuf,
    fabric_profile_json_path: PathBuf,
    libraries_dir: PathBuf,
    assets_dir: PathBuf,
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
}

struct InstallationLock {
    path: PathBuf,
}

fn installation_paths(fabric_profile_id: &str) -> Result<InstallationPaths, String> {
    let game_dir = filesystem::nekara_game_dir()?;
    let minecraft_dir = game_dir.join(".minecraft");
    let base_version_dir = minecraft_dir
        .join("versions")
        .join(config::MINECRAFT_VERSION);
    let fabric_version_dir = minecraft_dir.join("versions").join(fabric_profile_id);

    Ok(InstallationPaths {
        libraries_dir: minecraft_dir.join("libraries"),
        assets_dir: minecraft_dir.join("assets"),
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

async fn download_verified_bytes(url: &str, expected_sha1: &str) -> Result<Vec<u8>, String> {
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

    Ok(bytes.to_vec())
}

async fn download_verified_file(path: &Path, url: &str, expected_sha1: &str) -> Result<(), String> {
    ensure_parent_directory(path)?;

    let bytes = download_verified_bytes(url, expected_sha1).await?;
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

fn build_installation_status(
    paths: &InstallationPaths,
    base_details: &manifests::OfficialMinecraftVersionDetails,
    fabric_details: &fabric::FabricInstallationDetails,
    snapshot: InstallationSnapshot,
    message: String,
) -> MinecraftInstallationStatus {
    let state = if snapshot.version_json_ready
        && snapshot.client_jar_ready
        && snapshot.fabric_profile_ready
        && snapshot.asset_index_ready
        && snapshot.library_count_ready == snapshot.library_count_total
        && snapshot.asset_count_ready == snapshot.asset_count_total
    {
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
    let asset_index_path = asset_index_path(paths, &base_details.asset_index.id);
    let version_json_ready = text_matches(&paths.version_json_path, &base_details.version_json)?;
    let client_jar_ready =
        sha1_matches(&paths.client_jar_path, &base_details.client_download_sha1)?;
    let fabric_profile_ready =
        text_matches(&paths.fabric_profile_json_path, &fabric_details.profile_json)?;
    let asset_index_ready = sha1_matches(&asset_index_path, &base_details.asset_index.sha1)?;
    let local_asset_index_contents = if asset_index_ready {
        read_local_asset_index(&asset_index_path)?
    } else {
        None
    };

    let mut library_count_ready = 0usize;
    for library in &base_details.libraries {
        if sha1_matches(&library_path(paths, library), &library.sha1)? {
            library_count_ready += 1;
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

    Ok(InstallationSnapshot {
        asset_index_path,
        version_json_ready,
        client_jar_ready,
        fabric_profile_ready,
        asset_index_ready,
        library_count_total: base_details.libraries.len() + fabric_details.libraries.len(),
        library_count_ready,
        fabric_library_count_total: fabric_details.libraries.len(),
        fabric_library_count_ready,
        asset_count_total,
        asset_count_ready,
    })
}

#[tauri::command]
pub async fn get_minecraft_installation_plan() -> Result<MinecraftInstallationPlan, String> {
    let base_details = manifests::fetch_official_minecraft_version_details().await?;
    let fabric_details = fabric::fetch_fabric_installation_details().await?;
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

    let mut changed_parts = Vec::new();

    if !text_matches(&paths.version_json_path, &base_details.version_json)? {
        write_text_file(&paths.version_json_path, &base_details.version_json)?;
        changed_parts.push("metadata verze");
    }

    if !sha1_matches(&paths.client_jar_path, &base_details.client_download_sha1)? {
        download_verified_file(
            &paths.client_jar_path,
            &base_details.client_download_url,
            &base_details.client_download_sha1,
        )
        .await?;
        changed_parts.push("client `.jar`");
    }

    if !text_matches(&paths.fabric_profile_json_path, &fabric_details.profile_json)? {
        write_text_file(&paths.fabric_profile_json_path, &fabric_details.profile_json)?;
        changed_parts.push("Fabric profil");
    }

    let asset_index_path = asset_index_path(&paths, &base_details.asset_index.id);
    if !sha1_matches(&asset_index_path, &base_details.asset_index.sha1)? {
        write_text_file(&asset_index_path, &asset_index_contents.raw_json)?;
        changed_parts.push("index assetů");
    }

    let mut downloaded_libraries = 0usize;
    log_prepare_step("Ověřuji a stahuji oficiální knihovny.");
    for library in &base_details.libraries {
        let local_path = library_path(&paths, library);
        if sha1_matches(&local_path, &library.sha1)? {
            continue;
        }

        download_verified_file(&local_path, &library.url, &library.sha1).await?;
        downloaded_libraries += 1;
    }

    if downloaded_libraries > 0 {
        changed_parts.push("knihovny");
    }

    let mut downloaded_fabric_libraries = 0usize;
    log_prepare_step("Ověřuji a stahuji Fabric knihovny.");
    for library in &fabric_details.libraries {
        let local_path = library_path(&paths, library);
        if sha1_matches(&local_path, &library.sha1)? {
            continue;
        }

        download_verified_file(&local_path, &library.url, &library.sha1).await?;
        downloaded_fabric_libraries += 1;
    }

    if downloaded_fabric_libraries > 0 {
        changed_parts.push("Fabric knihovny");
    }

    let mut downloaded_assets = 0usize;
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
        download_verified_file(&local_path, &url, &asset.hash).await?;
        downloaded_assets += 1;
    }

    if downloaded_assets > 0 {
        changed_parts.push("objekty assetů");
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
            && snapshot.asset_count_ready == snapshot.asset_count_total;

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
