use serde::Deserialize;

use crate::{config, manifests};

const FABRIC_META_BASE_URL: &str = "https://meta.fabricmc.net";

#[derive(Debug, Clone)]
pub struct FabricInstallationDetails {
    pub loader_version: String,
    pub profile_id: String,
    pub profile_json: String,
    pub min_java_major: u32,
    pub libraries: Vec<manifests::OfficialLibraryDownload>,
}

#[derive(Deserialize, Clone)]
struct LoaderSummary {
    loader: LoaderVersion,
    #[serde(rename = "launcherMeta")]
    launcher_meta: LoaderLauncherMeta,
}

#[derive(Deserialize, Clone)]
struct LoaderVersion {
    version: String,
    stable: bool,
}

#[derive(Deserialize, Clone)]
struct LoaderLauncherMeta {
    #[serde(rename = "min_java_version")]
    min_java_version: u32,
}

#[derive(Deserialize)]
struct FabricProfileDocument {
    #[serde(default)]
    libraries: Vec<FabricLibraryEntry>,
}

#[derive(Deserialize)]
struct FabricLibraryEntry {
    #[serde(default)]
    rules: Vec<FabricLibraryRule>,
    downloads: Option<FabricLibraryDownloads>,
}

#[derive(Deserialize)]
struct FabricLibraryDownloads {
    artifact: Option<FabricLibraryArtifact>,
}

#[derive(Deserialize)]
struct FabricLibraryArtifact {
    path: String,
    url: String,
    sha1: String,
}

#[derive(Deserialize)]
struct FabricLibraryRule {
    action: String,
    os: Option<FabricRuleOperatingSystem>,
}

#[derive(Deserialize)]
struct FabricRuleOperatingSystem {
    name: Option<String>,
    arch: Option<String>,
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(config::PRODUCT_NAME)
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
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

fn library_rule_applies(rule: &FabricLibraryRule) -> bool {
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

fn library_is_allowed(rules: &[FabricLibraryRule]) -> bool {
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

fn select_loader_summary(summaries: &[LoaderSummary]) -> Result<LoaderSummary, String> {
    summaries
        .iter()
        .find(|entry| entry.loader.stable)
        .or_else(|| summaries.first())
        .cloned()
        .ok_or_else(|| {
            format!(
                "Fabric metadata does not contain any loader versions for {}.",
                config::MINECRAFT_VERSION
            )
        })
}

fn profile_json_url(loader_version: &str) -> String {
    format!(
        "{}/v2/versions/loader/{}/{}/profile/json",
        FABRIC_META_BASE_URL,
        config::MINECRAFT_VERSION,
        loader_version
    )
}

pub fn fabric_profile_id(loader_version: &str) -> String {
    format!("fabric-loader-{}-{}", loader_version, config::MINECRAFT_VERSION)
}

pub async fn fetch_fabric_installation_details() -> Result<FabricInstallationDetails, String> {
    let client = build_http_client()?;
    let loader_list_url = format!(
        "{}/v2/versions/loader/{}",
        FABRIC_META_BASE_URL,
        config::MINECRAFT_VERSION
    );

    let raw_loader_list = read_text(&client, &loader_list_url, "Fabric loader metadata").await?;
    let loader_summaries: Vec<LoaderSummary> =
        serde_json::from_str(&raw_loader_list).map_err(|error| {
            format!(
                "Unable to decode Fabric loader metadata from {}: {error}",
                loader_list_url
            )
        })?;

    let selected_loader = select_loader_summary(&loader_summaries)?;
    let loader_version = selected_loader.loader.version.clone();
    let profile_url = profile_json_url(&loader_version);
    let profile_json = read_text(&client, &profile_url, "Fabric profile metadata").await?;
    let profile_document: FabricProfileDocument =
        serde_json::from_str(&profile_json).map_err(|error| {
            format!(
                "Unable to decode Fabric profile metadata from {}: {error}",
                profile_url
            )
        })?;

    let libraries = profile_document
        .libraries
        .into_iter()
        .filter(|entry| library_is_allowed(&entry.rules))
        .filter_map(|entry| {
            entry
                .downloads
                .and_then(|downloads| downloads.artifact)
                .filter(|artifact| library_artifact_matches_current_platform(&artifact.path))
                .map(|artifact| manifests::OfficialLibraryDownload {
                    path: artifact.path,
                    url: artifact.url,
                    sha1: artifact.sha1,
                })
        })
        .collect();

    Ok(FabricInstallationDetails {
        loader_version: selected_loader.loader.version,
        profile_id: fabric_profile_id(&loader_version),
        profile_json,
        min_java_major: selected_loader.launcher_meta.min_java_version,
        libraries,
    })
}
