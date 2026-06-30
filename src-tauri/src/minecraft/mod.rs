use std::fs;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha1::{Digest, Sha1};

use crate::{config, filesystem, manifests};

const ASSET_OBJECTS_BASE_URL: &str = "https://resources.download.minecraft.net";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
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
    libraries_dir: String,
    assets_dir: String,
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
    libraries_dir: String,
    assets_dir: String,
    asset_index_path: String,
    version_json_ready: bool,
    client_jar_ready: bool,
    asset_index_ready: bool,
    library_count_total: usize,
    library_count_ready: usize,
    asset_count_total: usize,
    asset_count_ready: usize,
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
    libraries_dir: PathBuf,
    assets_dir: PathBuf,
}

struct InstallationSnapshot {
    asset_index_path: PathBuf,
    version_json_ready: bool,
    client_jar_ready: bool,
    asset_index_ready: bool,
    library_count_total: usize,
    library_count_ready: usize,
    asset_count_total: usize,
    asset_count_ready: usize,
}

struct InstallationLock {
    path: PathBuf,
}

fn installation_paths() -> Result<InstallationPaths, String> {
    let game_dir = filesystem::nekara_game_dir()?;
    let minecraft_dir = game_dir.join(".minecraft");
    let version_dir = minecraft_dir
        .join("versions")
        .join(config::MINECRAFT_VERSION);

    Ok(InstallationPaths {
        libraries_dir: minecraft_dir.join("libraries"),
        assets_dir: minecraft_dir.join("assets"),
        minecraft_dir,
        version_json_path: version_dir.join(format!("{}.json", config::MINECRAFT_VERSION)),
        client_jar_path: version_dir.join(format!("{}.jar", config::MINECRAFT_VERSION)),
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

async fn download_verified_bytes(url: &str, expected_sha1: &str) -> Result<Vec<u8>, String> {
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
        parts.push("version metadata".to_string());
    }

    if !snapshot.client_jar_ready {
        parts.push("client jar".to_string());
    }

    if !snapshot.asset_index_ready {
        parts.push("asset index".to_string());
    }

    let missing_libraries = snapshot
        .library_count_total
        .saturating_sub(snapshot.library_count_ready);
    if missing_libraries > 0 {
        parts.push(format!("{missing_libraries} libraries"));
    }

    let missing_assets = snapshot
        .asset_count_total
        .saturating_sub(snapshot.asset_count_ready);
    if missing_assets > 0 {
        parts.push(format!("{missing_assets} asset objects"));
    }

    if parts.is_empty() {
        "nothing".to_string()
    } else {
        parts.join(", ")
    }
}

fn build_installation_status(
    paths: &InstallationPaths,
    details: &manifests::OfficialMinecraftVersionDetails,
    snapshot: InstallationSnapshot,
    message: String,
) -> MinecraftInstallationStatus {
    let state = if snapshot.version_json_ready
        && snapshot.client_jar_ready
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
        latest_release: Some(details.latest_release.clone()),
        latest_snapshot: Some(details.latest_snapshot.clone()),
        version_type: Some(details.version_type.clone()),
        version_url: Some(details.version_url.clone()),
        minecraft_dir: paths.minecraft_dir.display().to_string(),
        version_json_path: paths.version_json_path.display().to_string(),
        client_jar_path: paths.client_jar_path.display().to_string(),
        libraries_dir: paths.libraries_dir.display().to_string(),
        assets_dir: paths.assets_dir.display().to_string(),
        asset_index_path: snapshot.asset_index_path.display().to_string(),
        version_json_ready: snapshot.version_json_ready,
        client_jar_ready: snapshot.client_jar_ready,
        asset_index_ready: snapshot.asset_index_ready,
        library_count_total: snapshot.library_count_total,
        library_count_ready: snapshot.library_count_ready,
        asset_count_total: snapshot.asset_count_total,
        asset_count_ready: snapshot.asset_count_ready,
        required_java_major: details.required_java_major,
        client_download_url: Some(details.client_download_url.clone()),
        client_download_sha1: Some(details.client_download_sha1.clone()),
        asset_index_id: Some(details.asset_index.id.clone()),
        asset_index_url: Some(details.asset_index.url.clone()),
        asset_index_total_size: Some(details.asset_index.total_size),
        message,
    }
}

async fn collect_installation_snapshot(
    paths: &InstallationPaths,
    details: &manifests::OfficialMinecraftVersionDetails,
) -> Result<InstallationSnapshot, String> {
    let asset_index_path = asset_index_path(paths, &details.asset_index.id);
    let version_json_ready = text_matches(&paths.version_json_path, &details.version_json)?;
    let client_jar_ready = sha1_matches(&paths.client_jar_path, &details.client_download_sha1)?;
    let asset_index_ready = sha1_matches(&asset_index_path, &details.asset_index.sha1)?;
    let local_asset_index_contents = if asset_index_ready {
        read_local_asset_index(&asset_index_path)?
    } else {
        None
    };

    let mut library_count_ready = 0usize;
    for library in &details.libraries {
        if sha1_matches(&library_path(paths, library), &library.sha1)? {
            library_count_ready += 1;
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
        asset_index_ready,
        library_count_total: details.libraries.len(),
        library_count_ready,
        asset_count_total,
        asset_count_ready,
    })
}

#[tauri::command]
pub async fn get_minecraft_installation_plan() -> Result<MinecraftInstallationPlan, String> {
    let paths = installation_paths()?;

    let _ = filesystem::ensure_nekara_game_directory()?;

    match manifests::fetch_official_minecraft_version_details().await {
        Ok(details) => Ok(MinecraftInstallationPlan {
            state: MinecraftInstallationPlanState::Ready,
            target_version: config::MINECRAFT_VERSION,
            minecraft_dir: paths.minecraft_dir.display().to_string(),
            version_json_path: paths.version_json_path.display().to_string(),
            client_jar_path: paths.client_jar_path.display().to_string(),
            libraries_dir: paths.libraries_dir.display().to_string(),
            assets_dir: paths.assets_dir.display().to_string(),
            version_type: Some(details.version_type),
            version_url: Some(details.version_url),
            required_java_major: details.required_java_major,
            client_download_url: Some(details.client_download_url),
            client_download_sha1: Some(details.client_download_sha1),
            asset_index_id: Some(details.asset_index.id),
            asset_index_url: Some(details.asset_index.url),
            library_count: Some(details.libraries.len()),
            message: format!(
                "Official metadata resolved for {} and local install paths are prepared.",
                config::MINECRAFT_VERSION
            ),
        }),
        Err(message) => Ok(MinecraftInstallationPlan {
            state: MinecraftInstallationPlanState::Blocked,
            target_version: config::MINECRAFT_VERSION,
            minecraft_dir: paths.minecraft_dir.display().to_string(),
            version_json_path: paths.version_json_path.display().to_string(),
            client_jar_path: paths.client_jar_path.display().to_string(),
            libraries_dir: paths.libraries_dir.display().to_string(),
            assets_dir: paths.assets_dir.display().to_string(),
            version_type: None,
            version_url: None,
            required_java_major: None,
            client_download_url: None,
            client_download_sha1: None,
            asset_index_id: None,
            asset_index_url: None,
            library_count: None,
            message,
        }),
    }
}

#[tauri::command]
pub async fn get_minecraft_installation_status() -> Result<MinecraftInstallationStatus, String> {
    let paths = installation_paths()?;

    let _ = filesystem::ensure_nekara_game_directory()?;

    match manifests::fetch_official_minecraft_version_details().await {
        Ok(details) => {
            let snapshot = collect_installation_snapshot(&paths, &details).await?;
            let message = if matches!(
                build_installation_status(
                    &paths,
                    &details,
                    InstallationSnapshot {
                        asset_index_path: snapshot.asset_index_path.clone(),
                        version_json_ready: snapshot.version_json_ready,
                        client_jar_ready: snapshot.client_jar_ready,
                        asset_index_ready: snapshot.asset_index_ready,
                        library_count_total: snapshot.library_count_total,
                        library_count_ready: snapshot.library_count_ready,
                        asset_count_total: snapshot.asset_count_total,
                        asset_count_ready: snapshot.asset_count_ready,
                    },
                    String::new(),
                )
                .state,
                MinecraftInstallationState::Ready
            ) {
                format!(
                    "Official Minecraft files for {} are prepared.",
                    config::MINECRAFT_VERSION
                )
            } else {
                format!(
                    "Official Minecraft files still need preparation: {}.",
                    build_missing_summary(&snapshot)
                )
            };

            Ok(build_installation_status(
                &paths, &details, snapshot, message,
            ))
        }
        Err(message) => Ok(MinecraftInstallationStatus {
            state: MinecraftInstallationState::Blocked,
            target_version: config::MINECRAFT_VERSION,
            manifest_url: config::MINECRAFT_VERSION_MANIFEST_URL,
            latest_release: None,
            latest_snapshot: None,
            version_type: None,
            version_url: None,
            minecraft_dir: paths.minecraft_dir.display().to_string(),
            version_json_path: paths.version_json_path.display().to_string(),
            client_jar_path: paths.client_jar_path.display().to_string(),
            libraries_dir: paths.libraries_dir.display().to_string(),
            assets_dir: paths.assets_dir.display().to_string(),
            asset_index_path: paths
                .assets_dir
                .join("indexes")
                .join("unknown.json")
                .display()
                .to_string(),
            version_json_ready: false,
            client_jar_ready: false,
            asset_index_ready: false,
            library_count_total: 0,
            library_count_ready: 0,
            asset_count_total: 0,
            asset_count_ready: 0,
            required_java_major: None,
            client_download_url: None,
            client_download_sha1: None,
            asset_index_id: None,
            asset_index_url: None,
            asset_index_total_size: None,
            message,
        }),
    }
}

#[tauri::command]
pub async fn prepare_minecraft_installation() -> Result<MinecraftInstallationStatus, String> {
    let _installation_lock = acquire_installation_lock()?;
    let paths = installation_paths()?;
    let details = manifests::fetch_official_minecraft_version_details().await?;
    let asset_index_contents =
        manifests::fetch_official_asset_index_contents(&details.asset_index).await?;

    let _ = filesystem::ensure_nekara_game_directory()?;

    let mut changed_parts = Vec::new();

    if !text_matches(&paths.version_json_path, &details.version_json)? {
        write_text_file(&paths.version_json_path, &details.version_json)?;
        changed_parts.push("version metadata");
    }

    if !sha1_matches(&paths.client_jar_path, &details.client_download_sha1)? {
        download_verified_file(
            &paths.client_jar_path,
            &details.client_download_url,
            &details.client_download_sha1,
        )
        .await?;
        changed_parts.push("client jar");
    }

    let asset_index_path = asset_index_path(&paths, &details.asset_index.id);
    if !sha1_matches(&asset_index_path, &details.asset_index.sha1)? {
        write_text_file(&asset_index_path, &asset_index_contents.raw_json)?;
        changed_parts.push("asset index");
    }

    let mut downloaded_libraries = 0usize;
    for library in &details.libraries {
        let local_path = library_path(&paths, library);
        if sha1_matches(&local_path, &library.sha1)? {
            continue;
        }

        download_verified_file(&local_path, &library.url, &library.sha1).await?;
        downloaded_libraries += 1;
    }

    if downloaded_libraries > 0 {
        changed_parts.push("libraries");
    }

    let mut downloaded_assets = 0usize;
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
        changed_parts.push("asset objects");
    }

    let snapshot = collect_installation_snapshot(&paths, &details).await?;
    let message = if changed_parts.is_empty() {
        format!(
            "Official Minecraft files for {} were already up to date.",
            config::MINECRAFT_VERSION
        )
    } else {
        let missing_summary = build_missing_summary(&snapshot);
        let all_ready = snapshot.version_json_ready
            && snapshot.client_jar_ready
            && snapshot.asset_index_ready
            && snapshot.library_count_ready == snapshot.library_count_total
            && snapshot.asset_count_ready == snapshot.asset_count_total;

        if all_ready {
            format!(
                "Official Minecraft files prepared successfully: {}.",
                changed_parts.join(", ")
            )
        } else {
            format!(
                "Minecraft preparation finished, but some files still need attention: {missing_summary}."
            )
        }
    };

    Ok(build_installation_status(
        &paths, &details, snapshot, message,
    ))
}
