use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::read::ZipArchive;

use crate::{config, filesystem, logging};

const ADOPTIUM_API_BASE: &str = "https://api.adoptium.net/v3";
const MANAGED_RUNTIME_RELATIVE_DIR: &str = config::MANAGED_JAVA_RUNTIME_DIR;
const MANAGED_RUNTIME_IMAGE_TYPE: &str = "jre";
const MANAGED_RUNTIME_JVM_IMPL: &str = "hotspot";
const MANAGED_RUNTIME_HEAP_SIZE: &str = "normal";
const MANAGED_RUNTIME_VENDOR: &str = "eclipse";

#[derive(Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
}

#[derive(Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(Deserialize)]
struct AdoptiumPackage {
    checksum: String,
    link: String,
    name: String,
    size: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeInstallProgress {
    active: bool,
    current_step: Option<String>,
    current_download_label: Option<String>,
    total_bytes: u64,
    downloaded_bytes: u64,
    remaining_bytes: u64,
    bytes_per_second: Option<f64>,
}

#[derive(Default)]
struct JavaRuntimeInstallTracker {
    active: bool,
    current_step: Option<String>,
    current_download_label: Option<String>,
    total_bytes: u64,
    downloaded_bytes: u64,
    started_at: Option<Instant>,
}

struct JavaRuntimeInstallGuard;

struct JavaRuntimeInstallLock {
    path: PathBuf,
}

static JAVA_RUNTIME_INSTALL_TRACKER: OnceLock<Mutex<JavaRuntimeInstallTracker>> = OnceLock::new();

fn java_runtime_install_tracker() -> &'static Mutex<JavaRuntimeInstallTracker> {
    JAVA_RUNTIME_INSTALL_TRACKER.get_or_init(|| Mutex::new(JavaRuntimeInstallTracker::default()))
}

fn managed_runtime_root() -> Result<PathBuf, String> {
    filesystem::ensure_launcher_subdirectory(MANAGED_RUNTIME_RELATIVE_DIR)
}

fn managed_runtime_install_root() -> Result<PathBuf, String> {
    let root = managed_runtime_root()?;
    let Some(parent) = root.parent() else {
        return Err(format!(
            "Unable to determine managed Java runtime parent for {}.",
            root.display()
        ));
    };

    Ok(parent.to_path_buf())
}

fn java_runtime_install_lock_path() -> Result<PathBuf, String> {
    Ok(filesystem::ensure_launcher_subdirectory("locks")?
        .join(config::JAVA_RUNTIME_INSTALL_LOCK_FILE))
}

fn acquire_java_runtime_install_lock() -> Result<JavaRuntimeInstallLock, String> {
    let lock_path = java_runtime_install_lock_path()?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "Another Java runtime installation is already running for this launcher data directory.".to_string()
            } else {
                format!(
                    "Unable to create Java runtime installation lock at {}: {error}",
                    lock_path.display()
                )
            }
        })?;

    writeln!(file, "{}", std::process::id()).map_err(|error| {
        format!(
            "Unable to write Java runtime installation lock at {}: {error}",
            lock_path.display()
        )
    })?;

    Ok(JavaRuntimeInstallLock { path: lock_path })
}

impl Drop for JavaRuntimeInstallLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

impl JavaRuntimeInstallGuard {
    fn start(total_bytes: u64, current_step: &str) -> Self {
        let mut tracker = java_runtime_install_tracker()
            .lock()
            .expect("Java runtime install tracker lock should not be poisoned");
        *tracker = JavaRuntimeInstallTracker {
            active: true,
            current_step: Some(current_step.to_string()),
            current_download_label: None,
            total_bytes,
            downloaded_bytes: 0,
            started_at: Some(Instant::now()),
        };
        Self
    }
}

impl Drop for JavaRuntimeInstallGuard {
    fn drop(&mut self) {
        let mut tracker = java_runtime_install_tracker()
            .lock()
            .expect("Java runtime install tracker lock should not be poisoned");
        *tracker = JavaRuntimeInstallTracker::default();
    }
}

pub(super) fn snapshot_java_runtime_install_progress() -> JavaRuntimeInstallProgress {
    let tracker = java_runtime_install_tracker()
        .lock()
        .expect("Java runtime install tracker lock should not be poisoned");
    let remaining_bytes = tracker.total_bytes.saturating_sub(tracker.downloaded_bytes);
    let bytes_per_second = tracker.started_at.and_then(|started_at| {
        let elapsed = started_at.elapsed().as_secs_f64();
        if elapsed >= 0.25 && tracker.downloaded_bytes > 0 {
            Some(tracker.downloaded_bytes as f64 / elapsed)
        } else {
            None
        }
    });

    JavaRuntimeInstallProgress {
        active: tracker.active,
        current_step: tracker.current_step.clone(),
        current_download_label: tracker.current_download_label.clone(),
        total_bytes: tracker.total_bytes,
        downloaded_bytes: tracker.downloaded_bytes,
        remaining_bytes,
        bytes_per_second,
    }
}

fn set_java_runtime_install_step(current_step: &str) {
    let mut tracker = java_runtime_install_tracker()
        .lock()
        .expect("Java runtime install tracker lock should not be poisoned");
    if tracker.active {
        tracker.current_step = Some(current_step.to_string());
    }
}

fn begin_java_runtime_download(label: &str, expected_bytes: u64) {
    let mut tracker = java_runtime_install_tracker()
        .lock()
        .expect("Java runtime install tracker lock should not be poisoned");
    if tracker.active {
        tracker.current_download_label = Some(label.to_string());
        tracker.total_bytes = expected_bytes.max(tracker.total_bytes);
    }
}

fn advance_java_runtime_download(downloaded_bytes_delta: u64) {
    let mut tracker = java_runtime_install_tracker()
        .lock()
        .expect("Java runtime install tracker lock should not be poisoned");
    if tracker.active {
        tracker.downloaded_bytes = tracker
            .downloaded_bytes
            .saturating_add(downloaded_bytes_delta);
    }
}

fn finish_java_runtime_download() {
    let mut tracker = java_runtime_install_tracker()
        .lock()
        .expect("Java runtime install tracker lock should not be poisoned");
    if tracker.active {
        tracker.current_download_label = None;
        tracker.total_bytes = 0;
        tracker.downloaded_bytes = 0;
        tracker.started_at = None;
    }
}

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(config::PRODUCT_NAME)
        .timeout(Duration::from_secs(
            config::JAVA_RUNTIME_DOWNLOAD_TIMEOUT_SECS,
        ))
        .build()
        .map_err(|error| format!("Failed to create Java runtime HTTP client: {error}"))
}

fn current_os_name() -> Result<&'static str, String> {
    if cfg!(target_os = "windows") {
        Ok("windows")
    } else {
        Err("Managed Java runtime installation is currently available only on Windows.".to_string())
    }
}

fn current_arch_name() -> Result<&'static str, String> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("x64"),
        "aarch64" => Ok("aarch64"),
        other => Err(format!(
            "Managed Java runtime installation is unavailable for architecture {other}."
        )),
    }
}

fn assets_api_url(required_java_major: u32) -> Result<String, String> {
    Ok(format!(
        "{ADOPTIUM_API_BASE}/assets/latest/{required_java_major}/hotspot?architecture={}&heap_size={}&image_type={}&jvm_impl={}&os={}&vendor={}",
        current_arch_name()?,
        MANAGED_RUNTIME_HEAP_SIZE,
        MANAGED_RUNTIME_IMAGE_TYPE,
        MANAGED_RUNTIME_JVM_IMPL,
        current_os_name()?,
        MANAGED_RUNTIME_VENDOR,
    ))
}

async fn resolve_download_package(
    client: &Client,
    required_java_major: u32,
) -> Result<AdoptiumPackage, String> {
    let api_url = assets_api_url(required_java_major)?;
    let assets = client
        .get(&api_url)
        .send()
        .await
        .map_err(|error| format!("Unable to query Java runtime metadata at {api_url}: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Unable to query Java runtime metadata at {api_url}: {error}"))?
        .json::<Vec<AdoptiumAsset>>()
        .await
        .map_err(|error| {
            format!("Unable to decode Java runtime metadata from {api_url}: {error}")
        })?;

    assets
        .into_iter()
        .next()
        .map(|asset| asset.binary.package)
        .ok_or_else(|| {
            format!(
                "Adoptium did not return a compatible Java {required_java_major} runtime package."
            )
        })
}

fn managed_runtime_download_path() -> Result<PathBuf, String> {
    Ok(managed_runtime_install_root()?.join("temurin-java-runtime.zip"))
}

fn managed_runtime_staging_root() -> Result<PathBuf, String> {
    Ok(managed_runtime_install_root()?.join("temurin-java-runtime.installing"))
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Unable to remove directory {}: {error}", path.display()))?;
    } else {
        fs::remove_file(path)
            .map_err(|error| format!("Unable to remove file {}: {error}", path.display()))?;
    }

    Ok(())
}

fn read_expected_sha256(contents: &str) -> Result<String, String> {
    let hash = contents
        .split_whitespace()
        .next()
        .ok_or_else(|| "Checksum response did not contain a hash.".to_string())?;

    if hash.len() != 64 {
        return Err("Checksum response did not contain a valid SHA-256 hash.".to_string());
    }

    Ok(hash.to_ascii_lowercase())
}

fn compute_sha256(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|error| {
        format!(
            "Unable to open downloaded Java runtime archive at {}: {error}",
            path.display()
        )
    })?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let read = reader.read(&mut buffer).map_err(|error| {
            format!(
                "Unable to hash downloaded Java runtime archive at {}: {error}",
                path.display()
            )
        })?;

        if read == 0 {
            break;
        }

        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn backup_runtime_root(runtime_root: &Path) -> Result<Option<PathBuf>, String> {
    if !runtime_root.exists() {
        return Ok(None);
    }

    let backup_root = runtime_root.with_extension("backup");
    remove_path_if_exists(&backup_root)?;
    fs::rename(runtime_root, &backup_root).map_err(|error| {
        format!(
            "Unable to back up existing managed Java runtime from {} to {}: {error}",
            runtime_root.display(),
            backup_root.display()
        )
    })?;

    Ok(Some(backup_root))
}

fn restore_runtime_root(runtime_root: &Path, backup_root: &Path) {
    let _ = remove_path_if_exists(runtime_root);
    let _ = fs::rename(backup_root, runtime_root);
}

fn finalize_runtime_root(staging_root: &Path, runtime_root: &Path) -> Result<(), String> {
    let backup_root = backup_runtime_root(runtime_root)?;

    match fs::rename(staging_root, runtime_root) {
        Ok(()) => {
            if let Some(backup_root) = backup_root {
                let _ = remove_path_if_exists(&backup_root);
            }
            Ok(())
        }
        Err(error) => {
            if let Some(backup_root) = backup_root {
                restore_runtime_root(runtime_root, &backup_root);
            }

            Err(format!(
                "Unable to activate managed Java runtime at {}: {error}",
                runtime_root.display()
            ))
        }
    }
}

fn find_java_executable_recursively(root: &Path) -> Result<Option<PathBuf>, String> {
    fn visit(directory: &Path, remaining_depth: usize) -> Result<Option<PathBuf>, String> {
        if !directory.exists() {
            return Ok(None);
        }

        let candidate = directory.join("bin").join("java.exe");
        if candidate.exists() {
            return Ok(Some(candidate));
        }

        if remaining_depth == 0 {
            return Ok(None);
        }

        let entries = fs::read_dir(directory).map_err(|error| {
            format!(
                "Unable to inspect managed Java runtime directory {}: {error}",
                directory.display()
            )
        })?;

        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Unable to inspect managed Java runtime entry in {}: {error}",
                    directory.display()
                )
            })?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(candidate) = visit(&path, remaining_depth - 1)? {
                    return Ok(Some(candidate));
                }
            }
        }

        Ok(None)
    }

    visit(root, 4)
}

pub fn resolve_managed_java_executable_path() -> Result<Option<String>, String> {
    let runtime_root = managed_runtime_root()?;
    Ok(find_java_executable_recursively(&runtime_root)?.map(|path| path.display().to_string()))
}

pub async fn install_managed_java_runtime(required_java_major: u32) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err(
            "Managed Java runtime installation is currently available only on Windows.".to_string(),
        );
    }

    let _install_lock = acquire_java_runtime_install_lock()?;
    let runtime_root = managed_runtime_root()?;

    if let Some(installed_java_executable) = find_java_executable_recursively(&runtime_root)? {
        let version_output =
            super::capture_java_version_line(&installed_java_executable.display().to_string());
        let installed_major = version_output
            .as_deref()
            .and_then(super::extract_java_version)
            .as_deref()
            .and_then(super::extract_major_version);

        if installed_major.is_some_and(|major| major >= required_java_major) {
            return Ok(());
        }
    }

    let _progress_guard = JavaRuntimeInstallGuard::start(0, "Připravuji Java runtime");
    let client = build_http_client()?;
    let package = resolve_download_package(&client, required_java_major).await?;
    let expected_checksum = read_expected_sha256(&package.checksum)?;
    let download_url = package.link;
    logging::append_launcher_log_entry(
        "java",
        &format!(
            "Downloading managed Java runtime package {} from {}.",
            package.name, download_url
        ),
    )
    .ok();

    let response = client.get(&download_url).send().await.map_err(|error| {
        format!("Unable to download managed Java runtime from {download_url}: {error}")
    })?;
    let response = response.error_for_status().map_err(|error| {
        format!("Unable to download managed Java runtime from {download_url}: {error}")
    })?;

    let download_path = managed_runtime_download_path()?;
    let staging_root = managed_runtime_staging_root()?;
    remove_path_if_exists(&download_path)?;
    remove_path_if_exists(&staging_root)?;

    let total_bytes = response.content_length().unwrap_or(package.size);
    set_java_runtime_install_step(&format!("Stahuji Java runtime {}", required_java_major));
    begin_java_runtime_download(&format!("Temurin JRE {}", required_java_major), total_bytes);

    {
        let mut file = File::create(&download_path).map_err(|error| {
            format!(
                "Unable to create managed Java runtime archive at {}: {error}",
                download_path.display()
            )
        })?;
        let mut response = response;

        while let Some(chunk) = response.chunk().await.map_err(|error| {
            format!("Unable to stream managed Java runtime archive from {download_url}: {error}")
        })? {
            file.write_all(&chunk).map_err(|error| {
                format!(
                    "Unable to write managed Java runtime archive to {}: {error}",
                    download_path.display()
                )
            })?;
            advance_java_runtime_download(chunk.len() as u64);
        }

        file.flush().map_err(|error| {
            format!(
                "Unable to flush managed Java runtime archive at {}: {error}",
                download_path.display()
            )
        })?;
    }

    finish_java_runtime_download();
    set_java_runtime_install_step("Ověřuji kontrolní součet Java runtime");
    let actual_checksum = compute_sha256(&download_path)?;

    if expected_checksum != actual_checksum {
        remove_path_if_exists(&download_path).ok();
        return Err(format!(
            "Managed Java runtime checksum mismatch: expected {expected_checksum}, got {actual_checksum}."
        ));
    }

    set_java_runtime_install_step("Rozbaluji Java runtime");
    let archive_file = File::open(&download_path).map_err(|error| {
        format!(
            "Unable to reopen managed Java runtime archive at {}: {error}",
            download_path.display()
        )
    })?;
    let mut archive = ZipArchive::new(archive_file).map_err(|error| {
        format!(
            "Unable to open managed Java runtime archive at {}: {error}",
            download_path.display()
        )
    })?;
    remove_path_if_exists(&staging_root)?;
    fs::create_dir_all(&staging_root).map_err(|error| {
        format!(
            "Unable to create managed Java runtime staging directory at {}: {error}",
            staging_root.display()
        )
    })?;
    archive.extract(&staging_root).map_err(|error| {
        format!(
            "Unable to extract managed Java runtime archive to {}: {error}",
            staging_root.display()
        )
    })?;

    let installed_java_executable =
        find_java_executable_recursively(&staging_root)?.ok_or_else(|| {
            format!(
                "Managed Java runtime archive did not contain a runnable java.exe in {}.",
                staging_root.display()
            )
        })?;
    let version_line =
        super::capture_java_version_line(&installed_java_executable.display().to_string())
            .ok_or_else(|| {
                format!(
                    "Unable to execute the managed Java runtime at {}.",
                    installed_java_executable.display()
                )
            })?;
    let installed_java_version = super::extract_java_version(&version_line).ok_or_else(|| {
        format!(
            "Managed Java runtime at {} did not report a Java version.",
            installed_java_executable.display()
        )
    })?;
    let installed_major =
        super::extract_major_version(&installed_java_version).ok_or_else(|| {
            format!(
                "Managed Java runtime at {} reported an unrecognised Java version {}.",
                installed_java_executable.display(),
                installed_java_version
            )
        })?;

    if installed_major < required_java_major {
        remove_path_if_exists(&staging_root).ok();
        remove_path_if_exists(&download_path).ok();
        return Err(format!(
            "Managed Java runtime {} is too old; it reported Java {}.",
            required_java_major, installed_java_version
        ));
    }

    set_java_runtime_install_step("Dokončuji Java runtime");
    finalize_runtime_root(&staging_root, &runtime_root)?;
    remove_path_if_exists(&download_path).ok();
    let activated_java_executable =
        find_java_executable_recursively(&runtime_root)?.ok_or_else(|| {
            format!(
                "Managed Java runtime was activated at {}, but java.exe could not be found.",
                runtime_root.display()
            )
        })?;
    let activated_version_line =
        super::capture_java_version_line(&activated_java_executable.display().to_string())
            .ok_or_else(|| {
                format!(
                    "Managed Java runtime was activated, but {} could not be executed.",
                    activated_java_executable.display()
                )
            })?;
    let activated_version =
        super::extract_java_version(&activated_version_line).ok_or_else(|| {
            format!(
                "Managed Java runtime at {} did not report a Java version after activation.",
                activated_java_executable.display()
            )
        })?;
    let activated_major = super::extract_major_version(&activated_version).ok_or_else(|| {
        format!(
            "Managed Java runtime at {} reported an unrecognised Java version {} after activation.",
            activated_java_executable.display(),
            activated_version
        )
    })?;
    if activated_major < required_java_major {
        return Err(format!(
            "Activated managed Java runtime is too old; expected Java {required_java_major}, got {activated_version}."
        ));
    }
    logging::append_launcher_log_entry(
        "java",
        &format!(
            "Managed Java runtime installed to {} with Java {}.",
            runtime_root.display(),
            installed_java_version
        ),
    )
    .ok();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{assets_api_url, read_expected_sha256, AdoptiumAsset};

    #[test]
    fn builds_filtered_adoptium_assets_url() {
        let url = assets_api_url(25).expect("assets URL should be available");

        assert!(url.starts_with("https://api.adoptium.net/v3/assets/latest/25/hotspot?"));
        assert!(url.contains("architecture=x64") || url.contains("architecture=aarch64"));
        assert!(url.contains("image_type=jre"));
        assert!(url.contains("os=windows"));
        assert!(url.contains("vendor=eclipse"));
    }

    #[test]
    fn decodes_package_checksum_without_following_binary_redirects() {
        let assets: Vec<AdoptiumAsset> = serde_json::from_str(
            r#"[{
                "binary": {
                    "package": {
                        "checksum": "a183e7280220ad5f6fe94ecbf025a5f10fc5797a0b18c600ed8f813c8158c530",
                        "link": "https://example.invalid/runtime.zip",
                        "name": "runtime.zip",
                        "size": 58466005
                    }
                }
            }]"#,
        )
        .expect("Adoptium package metadata should decode");
        let package = &assets[0].binary.package;

        assert_eq!(
            read_expected_sha256(&package.checksum).expect("checksum should be valid"),
            package.checksum
        );
        assert_eq!(package.link, "https://example.invalid/runtime.zip");
        assert_eq!(package.size, 58_466_005);
    }
}
