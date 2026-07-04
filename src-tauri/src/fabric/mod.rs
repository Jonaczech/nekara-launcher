use std::time::Duration;

use serde::Deserialize;

use crate::{config, logging, manifests};

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
    #[serde(rename = "min_java_version", default)]
    min_java_version: Option<u32>,
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
    name: Option<String>,
    url: Option<String>,
    sha1: Option<String>,
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
    #[serde(default)]
    size: u64,
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
        .timeout(Duration::from_secs(config::HTTP_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

fn log_fabric_step(message: &str) {
    let _ = logging::append_launcher_log_entry("fabric", message);
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

fn maven_coordinate_to_path(name: &str) -> Result<String, String> {
    let (coordinate, extension) = match name.split_once('@') {
        Some((coordinate, extension)) if !extension.trim().is_empty() => {
            (coordinate, extension.trim())
        }
        _ => (name, "jar"),
    };

    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() < 3 {
        return Err(format!(
            "Invalid Maven coordinate in Fabric metadata: {name}"
        ));
    }

    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() > 3 {
        Some(parts[3..].join("-"))
    } else {
        None
    };

    let file_name = match classifier {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.{extension}"),
        None => format!("{artifact}-{version}.{extension}"),
    };

    Ok(format!("{group}/{artifact}/{version}/{file_name}"))
}

async fn resolve_library_download(
    client: &reqwest::Client,
    entry: FabricLibraryEntry,
) -> Result<Option<manifests::OfficialLibraryDownload>, String> {
    if !library_is_allowed(&entry.rules) {
        return Ok(None);
    }

    if let Some(artifact) = entry
        .downloads
        .as_ref()
        .and_then(|downloads| downloads.artifact.as_ref())
    {
        if library_artifact_matches_current_platform(&artifact.path) {
            return Ok(Some(manifests::OfficialLibraryDownload {
                path: artifact.path.clone(),
                url: artifact.url.clone(),
                sha1: artifact.sha1.clone(),
                size: artifact.size,
            }));
        }

        return Ok(None);
    }

    let Some(name) = entry.name.as_deref() else {
        return Ok(None);
    };
    let Some(base_url) = entry.url.as_deref() else {
        return Ok(None);
    };

    let path = maven_coordinate_to_path(name)?;
    if !library_artifact_matches_current_platform(&path) {
        return Ok(None);
    }

    let normalized_base_url = if base_url.ends_with('/') {
        base_url.to_string()
    } else {
        format!("{base_url}/")
    };
    let artifact_url = format!("{normalized_base_url}{path}");
    let sha1 = match entry.sha1 {
        Some(sha1) if !sha1.trim().is_empty() => sha1,
        _ => read_text(
            client,
            &format!("{artifact_url}.sha1"),
            "Fabric library checksum",
        )
        .await?
        .trim()
        .to_string(),
    };

    Ok(Some(manifests::OfficialLibraryDownload {
        path,
        url: artifact_url,
        sha1,
        size: 0,
    }))
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
    format!(
        "fabric-loader-{}-{}",
        loader_version,
        config::MINECRAFT_VERSION
    )
}

pub async fn fetch_fabric_installation_details() -> Result<FabricInstallationDetails, String> {
    log_fabric_step("Initializing Fabric metadata HTTP client.");
    let client = build_http_client()?;
    let loader_list_url = format!(
        "{}/v2/versions/loader/{}",
        FABRIC_META_BASE_URL,
        config::MINECRAFT_VERSION
    );

    log_fabric_step(&format!(
        "Requesting Fabric loader metadata from {loader_list_url}."
    ));
    let raw_loader_list = read_text(&client, &loader_list_url, "Fabric loader metadata").await?;
    let loader_summaries: Vec<LoaderSummary> =
        serde_json::from_str(&raw_loader_list).map_err(|error| {
            format!(
                "Unable to decode Fabric loader metadata from {}: {error}",
                loader_list_url
            )
        })?;

    log_fabric_step(&format!(
        "Loaded {} Fabric loader metadata entries for {}.",
        loader_summaries.len(),
        config::MINECRAFT_VERSION
    ));
    let selected_loader = select_loader_summary(&loader_summaries)?;
    let loader_version = selected_loader.loader.version.clone();
    let profile_url = profile_json_url(&loader_version);
    log_fabric_step(&format!(
        "Selected Fabric loader {} with minimum Java {}.",
        loader_version,
        selected_loader.launcher_meta.min_java_version.unwrap_or(0)
    ));
    log_fabric_step(&format!(
        "Requesting Fabric profile metadata from {profile_url}."
    ));
    let profile_json = read_text(&client, &profile_url, "Fabric profile metadata").await?;
    let profile_document: FabricProfileDocument =
        serde_json::from_str(&profile_json).map_err(|error| {
            format!(
                "Unable to decode Fabric profile metadata from {}: {error}",
                profile_url
            )
        })?;

    log_fabric_step("Fabric profile metadata downloaded and decoded.");
    let mut libraries = Vec::new();
    for entry in profile_document.libraries {
        if let Some(library) = resolve_library_download(&client, entry).await? {
            libraries.push(library);
        }
    }
    log_fabric_step(&format!(
        "Resolved {} Fabric libraries for the current platform.",
        libraries.len()
    ));

    Ok(FabricInstallationDetails {
        loader_version: selected_loader.loader.version,
        profile_id: fabric_profile_id(&loader_version),
        profile_json,
        min_java_major: selected_loader.launcher_meta.min_java_version.unwrap_or(0),
        libraries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetch_fabric_installation_details_resolves_for_target_version() {
        let result = tauri::async_runtime::block_on(fetch_fabric_installation_details());
        assert!(
            result.is_ok(),
            "Fabric metadata fetch failed for {}: {:?}",
            config::MINECRAFT_VERSION,
            result.err()
        );
    }

    #[test]
    fn maven_coordinate_to_path_builds_expected_jar_path() {
        assert_eq!(
            maven_coordinate_to_path("net.fabricmc:fabric-loader:0.19.3").unwrap(),
            "net/fabricmc/fabric-loader/0.19.3/fabric-loader-0.19.3.jar"
        );
        assert_eq!(
            maven_coordinate_to_path("org.lwjgl:lwjgl:3.4.1:natives-windows").unwrap(),
            "org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-windows.jar"
        );
    }
}
