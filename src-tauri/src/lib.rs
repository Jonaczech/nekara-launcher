mod auth;
mod client_package;
mod config;
mod fabric;
mod filesystem;
mod game;
mod java;
mod launcher;
mod logging;
mod manifests;
mod minecraft;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            auth::get_offline_player_status,
            auth::save_offline_player_profile,
            auth::clear_offline_player_profile,
            game::get_game_launch_status,
            game::launch_minecraft,
            launcher::get_launcher_status,
            manifests::check_minecraft_version_metadata,
            minecraft::get_minecraft_installation_plan,
            minecraft::get_minecraft_installation_progress,
            minecraft::get_minecraft_installation_status,
            minecraft::prepare_minecraft_installation,
            settings::get_launcher_settings,
            settings::save_launcher_settings,
            filesystem::clear_launcher_updater_cache,
            filesystem::ensure_nekara_game_directory,
            filesystem::open_directory_in_file_explorer,
            logging::append_launcher_log,
            logging::get_launcher_log_info,
            java::check_java_runtime
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nekara Launcher");
}
