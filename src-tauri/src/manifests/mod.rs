use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::config;

#[derive(Debug, Clone)]
pub struct OfficialMinecraftVersionDetails {
    pub version_type: String,
    pub version_url: String,
    pub version_json: String,
    pub latest_release: String,
    pub latest_snapshot: String,
    pub required_java_major: Option<u32>,
    pub client_download_url: String,
    pub client_download_sha1: String,
    pub asset_index: OfficialAssetIndexDownload,
    pub libraries: Vec<OfficialLibraryDownload>,
}

#[derive(Debug, Clone)]
pub struct OfficialLibraryDownload {
    pub path: String,
    pub url: String,
    pub sha1: String,
}

#[derive(Debug, Clone)]
pub struct OfficialAssetIndexDownload {
    pub id: String,
    pub sha1: String,
    pub total_size: u64,
    pub url: String,
}

#[derive(Debug, Clone)]
pub struct OfficialAssetObject {
    pub name: String,
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct OfficialAssetIndexContents {
    pub raw_json: String,
    pub objects: Vec<OfficialAssetObject>,
}

#[derive(Deserialize)]
struct VersionManifest {
    latest: LatestManifestVersions,
    versions: Vec<VersionSummary>,
}

#[derive(Deserialize)]
struct LatestManifestVersions {
    release: String,
    snapshot: String,
}

#[derive(Deserialize)]
struct VersionSummary {
    id: String,
    #[serde(rename = "type")]
    version_type: String,
    url: String,
}

#[derive(Deserialize)]
struct VersionDetails {
    #[serde(rename = "javaVersion")]
    java_version: Option<JavaVersion>,
    downloads: VersionDownloads,
    #[serde(default)]
    libraries: Vec<LibraryEntry>,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexEntry,
}

#[derive(Deserialize)]
struct JavaVersion {
    #[serde(rename = "majorVersion")]
    major_version: u32,
}

#[derive(Deserialize)]
struct VersionDownloads {
    client: DownloadEntry,
}

#[derive(Deserialize)]
struct DownloadEntry {
    url: String,
    sha1: String,
}

#[derive(Deserialize)]
struct LibraryEntry {
    #[serde(rename = "name")]
    _name: String,
    downloads: Option<LibraryDownloads>,
    #[serde(default)]
    rules: Vec<LibraryRule>,
}

#[derive(Deserialize)]
struct LibraryDownloads {
    artifact: Option<LibraryArtifact>,
}

#[derive(Deserialize)]
struct LibraryArtifact {
    path: String,
    url: String,
    sha1: String,
    #[serde(rename = "size")]
    _size: u64,
}

#[derive(Deserialize)]
struct LibraryRule {
    action: String,
    os: Option<RuleOperatingSystem>,
}

#[derive(Deserialize)]
struct RuleOperatingSystem {
    name: Option<String>,
    arch: Option<String>,
}

#[derive(Deserialize)]
struct AssetIndexEntry {
    id: String,
    sha1: String,
    #[serde(rename = "size")]
    _size: u64,
    #[serde(rename = "totalSize")]
    total_size: u64,
    url: String,
}

#[derive(Deserialize)]
struct AssetIndexDocument {
    objects: HashMap<String, AssetIndexObjectEntry>,
}

#[derive(Deserialize)]
struct AssetIndexObjectEntry {
    hash: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MetadataCheckState {
    Ready,
    Blocked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftMetadataCheck {
    state: MetadataCheckState,
    target_version: &'static str,
    manifest_url: &'static str,
    latest_release: Option<String>,
    latest_snapshot: Option<String>,
    version_type: Option<String>,
    version_url: Option<String>,
    required_java_major: Option<u32>,
    client_download_url: Option<String>,
    client_download_sha1: Option<String>,
    asset_index_id: Option<String>,
    asset_index_url: Option<String>,
    asset_index_total_size: Option<u64>,
    library_count: Option<usize>,
    available: bool,
    message: String,
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(config::PRODUCT_NAME)
        .timeout(Duration::from_secs(config::HTTP_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

fn sha1_hex(bytes: &[u8]) -> String {
    let digest = Sha1::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);

    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }

    hex
}

async fn read_text(client: &reqwest::Client, url: &str, label: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Unable to read {label} from {url}: {error}"))?;

    let response = response
        .error_for_status()
        .map_err(|error| format!("Unable to read {label} from {url}: {error}"))?;

    response
        .text()
        .await
        .map_err(|error| format!("Unable to read {label} from {url}: {error}"))
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

fn current_arch_name() -> &'static str {
    std::env::consts::ARCH
}

fn library_rule_applies(rule: &LibraryRule) -> bool {
    match rule.os.as_ref() {
        Some(operating_system) => {
            let os_matches = operating_system
                .name
                .as_deref()
                .map(|name| name == current_os_name())
                .unwrap_or(true);
            let arch_matches = operating_system
                .arch
                .as_deref()
                .map(|arch| arch == current_arch_name())
                .unwrap_or(true);

            os_matches && arch_matches
        }
        None => true,
    }
}

fn library_is_allowed(rules: &[LibraryRule]) -> bool {
    if rules.is_empty() {
        return true;
    }

    let mut allowed = false;

    for rule in rules {
        if !library_rule_applies(rule) {
            continue;
        }

        allowed = rule.action == "allow";
    }

    allowed
}

fn library_artifact_matches_current_platform(path: &str) -> bool {
    if !path.contains("-natives-") {
        return true;
    }

    let arch = current_arch_name();

    if cfg!(target_os = "windows") {
        if path.contains("-natives-windows-arm64") {
            return arch == "aarch64";
        }

        if path.contains("-natives-windows-x86") {
            return arch == "x86";
        }

        return path.contains("-natives-windows") && arch != "aarch64" && arch != "x86";
    }

    if cfg!(target_os = "macos") {
        if path.contains("-natives-macos-arm64") {
            return arch == "aarch64";
        }

        return path.contains("-natives-macos") && arch != "aarch64";
    }

    if path.contains("-natives-linux-arm64") {
        return arch == "aarch64";
    }

    if path.contains("-natives-linux-arm32") {
        return arch == "arm";
    }

    if path.contains("-natives-linux") {
        return arch != "aarch64" && arch != "arm";
    }

    false
}

pub async fn fetch_official_minecraft_version_details(
) -> Result<OfficialMinecraftVersionDetails, String> {
    let client = build_http_client()?;

    let manifest_json = read_text(
        &client,
        config::MINECRAFT_VERSION_MANIFEST_URL,
        "official Minecraft metadata",
    )
    .await?;

    let manifest: VersionManifest = serde_json::from_str(&manifest_json).map_err(|error| {
        format!(
            "Unable to decode official Minecraft metadata from {}: {error}",
            config::MINECRAFT_VERSION_MANIFEST_URL
        )
    })?;

    let version_summary = manifest
        .versions
        .iter()
        .find(|entry| entry.id == config::MINECRAFT_VERSION)
        .ok_or_else(|| {
            format!(
                "Official metadata does not contain target version {}.",
                config::MINECRAFT_VERSION
            )
        })?;

    let version_json = read_text(
        &client,
        &version_summary.url,
        "official Minecraft version manifest",
    )
    .await?;

    let version_details: VersionDetails = serde_json::from_str(&version_json).map_err(|error| {
        format!(
            "Unable to decode official Minecraft version manifest from {}: {error}",
            version_summary.url
        )
    })?;

    let libraries = version_details
        .libraries
        .into_iter()
        .filter(|entry| library_is_allowed(&entry.rules))
        .filter_map(|entry| {
            entry
                .downloads
                .and_then(|downloads| downloads.artifact)
                .filter(|artifact| library_artifact_matches_current_platform(&artifact.path))
                .map(|artifact| OfficialLibraryDownload {
                    path: artifact.path,
                    url: artifact.url,
                    sha1: artifact.sha1,
                })
        })
        .collect();

    Ok(OfficialMinecraftVersionDetails {
        version_type: version_summary.version_type.clone(),
        version_url: version_summary.url.clone(),
        version_json,
        latest_release: manifest.latest.release,
        latest_snapshot: manifest.latest.snapshot,
        required_java_major: version_details
            .java_version
            .map(|java_version| java_version.major_version),
        client_download_url: version_details.downloads.client.url,
        client_download_sha1: version_details.downloads.client.sha1,
        asset_index: OfficialAssetIndexDownload {
            id: version_details.asset_index.id,
            sha1: version_details.asset_index.sha1,
            total_size: version_details.asset_index.total_size,
            url: version_details.asset_index.url,
        },
        libraries,
    })
}

pub fn parse_asset_index_contents(raw_json: &str) -> Result<OfficialAssetIndexContents, String> {
    let asset_index_document: AssetIndexDocument = serde_json::from_str(raw_json)
        .map_err(|error| format!("Unable to decode Minecraft asset index JSON: {error}"))?;

    let mut objects: Vec<OfficialAssetObject> = asset_index_document
        .objects
        .into_iter()
        .map(|(name, entry)| OfficialAssetObject {
            name,
            hash: entry.hash,
            size: entry.size,
        })
        .collect();

    objects.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(OfficialAssetIndexContents {
        raw_json: raw_json.to_string(),
        objects,
    })
}

pub async fn fetch_official_asset_index_contents(
    asset_index: &OfficialAssetIndexDownload,
) -> Result<OfficialAssetIndexContents, String> {
    let client = build_http_client()?;
    let raw_json = read_text(&client, &asset_index.url, "official Minecraft asset index").await?;
    let actual_sha1 = sha1_hex(raw_json.as_bytes());

    if !actual_sha1.eq_ignore_ascii_case(&asset_index.sha1) {
        return Err(format!(
            "Downloaded asset index hash mismatch. Expected {}, got {}.",
            asset_index.sha1, actual_sha1
        ));
    }

    parse_asset_index_contents(&raw_json).map(|parsed| OfficialAssetIndexContents {
        raw_json,
        objects: parsed.objects,
    })
}

#[tauri::command]
pub async fn check_minecraft_version_metadata() -> Result<MinecraftMetadataCheck, String> {
    match fetch_official_minecraft_version_details().await {
        Ok(details) => Ok(MinecraftMetadataCheck {
            state: MetadataCheckState::Ready,
            target_version: config::MINECRAFT_VERSION,
            manifest_url: config::MINECRAFT_VERSION_MANIFEST_URL,
            latest_release: Some(details.latest_release),
            latest_snapshot: Some(details.latest_snapshot),
            version_type: Some(details.version_type),
            version_url: Some(details.version_url),
            required_java_major: details.required_java_major,
            client_download_url: Some(details.client_download_url),
            client_download_sha1: Some(details.client_download_sha1),
            asset_index_id: Some(details.asset_index.id),
            asset_index_url: Some(details.asset_index.url),
            asset_index_total_size: Some(details.asset_index.total_size),
            library_count: Some(details.libraries.len()),
            available: true,
            message: format!(
                "Oficiální metadata obsahují cílovou verzi {}.",
                config::MINECRAFT_VERSION
            ),
        }),
        Err(message) => Ok(MinecraftMetadataCheck {
            state: MetadataCheckState::Blocked,
            target_version: config::MINECRAFT_VERSION,
            manifest_url: config::MINECRAFT_VERSION_MANIFEST_URL,
            latest_release: None,
            latest_snapshot: None,
            version_type: None,
            version_url: None,
            required_java_major: None,
            client_download_url: None,
            client_download_sha1: None,
            asset_index_id: None,
            asset_index_url: None,
            asset_index_total_size: None,
            library_count: None,
            available: false,
            message,
        }),
    }
}
