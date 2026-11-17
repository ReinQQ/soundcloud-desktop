mod commands;
mod discord_rpc;
mod proxy_bridge;
mod settings;

use commands::{
    check_update, clear_discord_rpc, get_settings, install_update, restart_app, save_settings,
    update_discord_rpc, window_action,
};
use discord_rpc::DiscordRpcHandle;
use settings::AppSettings;
use std::sync::{Arc, RwLock};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

pub const INJECTED_SCRIPT: &str = include_str!("../injected.js");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }

            let _ = app.handle().plugin(tauri_plugin_process::init());
            let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());

            // Load persistent settings or fall back to defaults
            let mut initial_settings = AppSettings::load_or_default(app.handle());
            let mut proxy_bridge_handle: Option<proxy_bridge::ProxyBridge> = None;
            let mut is_proxy_active = false;

            // Initialize Discord RPC background worker
            let rpc_handle = DiscordRpcHandle::new(
                initial_settings.discord_app_id.clone(),
                initial_settings.discord_rpc_enabled,
            );
            app.manage(rpc_handle);

            // Build main window
            let mut window_builder = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://soundcloud.com".parse().expect("Valid SoundCloud URL")),
            )
            .title("SoundCloud")
            .inner_size(1280.0, 800.0)
            .min_inner_size(860.0, 540.0)
            .decorations(false)
            .initialization_script(INJECTED_SCRIPT);

            // Isolate WebView2 data directory to prevent locked state / environment collisions
            if let Ok(local_data) = app.path().app_local_data_dir() {
                let webview2_dir = local_data.join("webview2");
                let _ = std::fs::create_dir_all(&webview2_dir);
                window_builder = window_builder.data_directory(webview2_dir);
            }

            // Apply webview proxy if enabled and valid
            if initial_settings.proxy_enabled {
                match settings::validate_proxy_url(&initial_settings.proxy_url) {
                    Ok(parsed_url) => {
                        if proxy_bridge::needs_proxy_bridge(&parsed_url) {
                            match proxy_bridge::ProxyBridge::start(parsed_url.clone()) {
                                Ok(bridge) => {
                                    let proxy_server = bridge.local_http_str();
                                    log::info!("Connecting WebView through local proxy bridge: {proxy_server} (upstream: {parsed_url})");
                                    #[cfg(windows)]
                                    {
                                        window_builder = window_builder.additional_browser_args(&format!("--proxy-server={proxy_server}"));
                                    }
                                    #[cfg(not(windows))]
                                    {
                                        let local_url = bridge.local_http_url();
                                        window_builder = window_builder.proxy_url(local_url);
                                    }
                                    proxy_bridge_handle = Some(bridge);
                                    is_proxy_active = true;
                                }
                                Err(e) => {
                                    log::warn!("Failed to start proxy bridge: {e}");
                                }
                            }
                        } else {
                            let proxy_str = parsed_url.as_str().trim_end_matches('/');
                            log::info!("Configuring direct WebView proxy: {proxy_str}");
                            #[cfg(windows)]
                            {
                                window_builder = window_builder.additional_browser_args(&format!("--proxy-server={proxy_str}"));
                            }
                            #[cfg(not(windows))]
                            {
                                window_builder = window_builder.proxy_url(parsed_url);
                            }
                            is_proxy_active = true;
                        }
                    }
                    Err(e) => {
                        log::warn!("Proxy enabled but URL invalid: {e}");
                    }
                }
            }

            initial_settings.proxy_active = is_proxy_active;
            let settings_state = Arc::new(RwLock::new(initial_settings.clone()));
            app.manage(settings_state.clone());
            if let Some(bridge) = proxy_bridge_handle {
                app.manage(bridge);
            }

            // Build window
            let window = window_builder.build()?;

            // Intercept window close request for minimize-to-tray
            let settings_for_close = settings_state.clone();
            let win_for_close = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let minimize = settings_for_close
                        .read()
                        .map(|s| s.minimize_to_tray)
                        .unwrap_or(true);
                    if minimize {
                        api.prevent_close();
                        let _ = win_for_close.hide();
                    }
                }
            });

            // Build System Tray
            let toggle_item =
                MenuItem::with_id(app, "toggle_window", "Show / Hide", true, None::<&str>)?;
            let play_pause_item =
                MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)?;
            let next_item = MenuItem::with_id(app, "next_track", "Next Track", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[&toggle_item, &play_pause_item, &next_item, &quit_item],
            )?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle_window" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let is_vis = w.is_visible().unwrap_or(false);
                            let is_foc = w.is_focused().unwrap_or(false);
                            if is_vis && is_foc {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "play_pause" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.eval("window.__sc_toggle_playback && window.__sc_toggle_playback();");
                        }
                    }
                    "next_track" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.eval("window.__sc_next_track && window.__sc_next_track();");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let is_vis = w.is_visible().unwrap_or(false);
                            let is_foc = w.is_focused().unwrap_or(false);
                            if is_vis && is_foc {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            update_discord_rpc,
            clear_discord_rpc,
            window_action,
            restart_app,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running soundcloud-desktop application");
}
