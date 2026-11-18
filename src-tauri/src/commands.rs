use crate::discord_rpc::{
    sanitize_text, validate_cover_url, validate_track_url, DiscordRpcHandle, TrackPayload,
};
use crate::settings::AppSettings;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCheckResponse {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateCheckResponse, String> {
    let current_version = app.package_info().version.to_string();
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return Err(format!("Updater initialization error: {e}")),
    };

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateCheckResponse {
            available: true,
            current_version,
            version: Some(update.version),
            notes: update.body,
        }),
        Ok(None) => Ok(UpdateCheckResponse {
            available: false,
            current_version,
            version: None,
            notes: None,
        }),
        Err(e) => {
            log::warn!("Update check failed: {e}");
            Err(format!("Failed to check for updates: {e}"))
        }
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<bool, String> {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return Err(format!("Updater initialization error: {e}")),
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let mut downloaded = 0;
            update
                .download_and_install(
                    |chunk_length, content_length| {
                        downloaded += chunk_length;
                        log::info!("Downloaded {downloaded} of {content_length:?}");
                    },
                    || {
                        log::info!("Update download finished, installing...");
                    },
                )
                .await
                .map_err(|e| format!("Failed to install update: {e}"))?;

            log::info!("Update installed successfully, restarting app...");
            app.restart();
        }
        Ok(None) => Err("No update available to install".to_string()),
        Err(e) => Err(format!("Failed to check update before installation: {e}")),
    }
}

#[tauri::command]
pub fn get_settings(
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<AppSettings, String> {
    settings
        .read()
        .map(|s| s.clone())
        .map_err(|e| format!("Failed to acquire read lock on settings: {e}"))
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    rpc: State<'_, DiscordRpcHandle>,
    mut new_settings: AppSettings,
) -> Result<AppSettings, String> {
    new_settings.validate_and_sanitize();

    new_settings
        .save(&app)
        .map_err(|e| format!("Failed to persist settings: {e}"))?;

    if let Ok(mut current) = settings.write() {
        *current = new_settings.clone();
    } else {
        return Err("Failed to acquire write lock on settings".to_string());
    }

    rpc.set_enabled(new_settings.discord_rpc_enabled);
    rpc.set_app_id(new_settings.discord_app_id.clone());

    log::info!("Settings successfully updated and persisted");
    Ok(new_settings)
}

#[tauri::command]
pub fn update_discord_rpc(
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    rpc: State<'_, DiscordRpcHandle>,
    mut payload: TrackPayload,
) -> Result<(), String> {
    let rpc_enabled = settings
        .read()
        .map(|s| s.discord_rpc_enabled)
        .unwrap_or(true);

    if !rpc_enabled {
        rpc.clear();
        return Ok(());
    }

    payload.title = sanitize_text(&payload.title, 128);
    payload.artist = sanitize_text(&payload.artist, 128);

    if let Some(ref cover) = payload.cover_url {
        payload.cover_url = validate_cover_url(cover);
    }
    if let Some(ref track) = payload.track_url {
        payload.track_url = validate_track_url(track);
    }

    rpc.update(payload);
    Ok(())
}

#[tauri::command]
pub fn clear_discord_rpc(rpc: State<'_, DiscordRpcHandle>) -> Result<(), String> {
    rpc.clear();
    Ok(())
}

#[tauri::command]
pub fn get_discord_rpc_status(rpc: State<'_, DiscordRpcHandle>) -> String {
    rpc.get_status()
}

#[tauri::command]
pub fn window_action(
    window: WebviewWindow,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    action: String,
) -> Result<(), String> {
    match action.as_str() {
        "minimize" => window.minimize().map_err(|e| e.to_string()),
        "maximize" => window.maximize().map_err(|e| e.to_string()),
        "unmaximize" => window.unmaximize().map_err(|e| e.to_string()),
        "toggle_maximize" => {
            let is_max = window.is_maximized().map_err(|e| e.to_string())?;
            if is_max {
                window.unmaximize().map_err(|e| e.to_string())
            } else {
                window.maximize().map_err(|e| e.to_string())
            }
        }
        "close" => {
            let minimize_to_tray = settings
                .read()
                .map(|s| s.minimize_to_tray)
                .unwrap_or(true);
            if minimize_to_tray {
                window.hide().map_err(|e| e.to_string())
            } else {
                window.close().map_err(|e| e.to_string())
            }
        }
        unknown => Err(format!("Unsupported window action: {unknown}")),
    }
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    log::info!("Restarting application upon user request...");
    app.restart();
}
