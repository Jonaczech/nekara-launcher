use serde::Deserialize;

use crate::config;

const APPROVED_MODS_MANIFEST: &str =
    include_str!("../../resources/client-package/approved-mods.fabric-26.1.2.json");

#[derive(Debug, Clone)]
pub struct ApprovedClientPackage {
    pub game_configuration_id: String,
    pub minecraft_version: String,
    pub mods: Vec<ApprovedMod>,
}

#[derive(Debug, Clone)]
pub struct ApprovedMod {
    pub id: String,
    pub display_name: String,
    pub distribution: String,
    pub file_name: String,
    pub download_url: String,
    pub sha512: String,
    pub size: u64,
}

#[derive(Deserialize)]
struct ApprovedClientPackageDocument {
    #[serde(rename = "gameConfigurationId")]
    game_configuration_id: String,
    #[serde(rename = "minecraftVersion")]
    minecraft_version: String,
    mods: Vec<ApprovedModDocument>,
}

#[derive(Deserialize)]
struct ApprovedModDocument {
    id: String,
    #[serde(rename = "displayName")]
    display_name: String,
    distribution: String,
    source: ApprovedModSource,
}

#[derive(Deserialize)]
struct ApprovedModSource {
    filename: String,
    url: String,
    sha512: String,
    size: u64,
}

pub fn load_approved_client_package() -> Result<ApprovedClientPackage, String> {
    let document: ApprovedClientPackageDocument = serde_json::from_str(APPROVED_MODS_MANIFEST)
        .map_err(|error| {
            format!(
                "Unable to decode approved client package manifest {}: {error}",
                config::APPROVED_MODS_MANIFEST_FILE
            )
        })?;

    if document.minecraft_version != config::MINECRAFT_VERSION {
        return Err(format!(
            "Approved client package manifest targets {}, but launcher expects {}.",
            document.minecraft_version,
            config::MINECRAFT_VERSION
        ));
    }

    Ok(ApprovedClientPackage {
        game_configuration_id: document.game_configuration_id,
        minecraft_version: document.minecraft_version,
        mods: document
            .mods
            .into_iter()
            .map(|entry| ApprovedMod {
                id: entry.id,
                display_name: entry.display_name,
                distribution: entry.distribution,
                file_name: entry.source.filename,
                download_url: entry.source.url,
                sha512: entry.source.sha512,
                size: entry.source.size,
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approved_client_package_matches_target_version_and_contains_required_mods() {
        let package = load_approved_client_package().expect("client package manifest should load");
        let required_mods = package
            .mods
            .iter()
            .filter(|approved_mod| approved_mod.distribution == "required")
            .count();

        assert_eq!(package.game_configuration_id, config::GAME_CONFIGURATION_ID);
        assert_eq!(package.minecraft_version, config::MINECRAFT_VERSION);
        assert_eq!(required_mods, 21);
    }
}
