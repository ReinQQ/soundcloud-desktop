pub mod commands;
mod discord_rpc;
pub mod media_relay;
pub mod proxy_bridge;
pub mod settings;
pub mod soundcloud;

use commands::{
    check_update, clear_discord_rpc, get_discord_rpc_status, get_settings, install_update,
    log_frontend_error, save_settings, sc_add_track_to_playlist, sc_clear_stream_cache,
    sc_create_playlist, sc_frontend_ready, sc_get_discover, sc_get_library, sc_get_me,
    sc_get_playlist, sc_get_stream, sc_get_track_comments, sc_get_track_detail,
    sc_get_user_profile, sc_get_user_tracks, sc_login, sc_login_with_token, sc_logout,
    sc_post_track_comment, sc_resolve_stream, sc_search, sc_toggle_follow, sc_toggle_like,
    sc_update_profile, sc_upload_profile_image, test_proxy, update_discord_rpc, window_action,
};
use discord_rpc::DiscordRpcHandle;
use settings::AppSettings;
use soundcloud::SoundCloudClient;
use std::sync::{Arc, RwLock};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};

#[derive(Clone, Debug, Default)]
pub struct WebviewProxyEndpoint(pub Arc<std::sync::RwLock<Option<String>>>);

#[derive(Clone)]
pub struct ProxyBridgeState(pub Arc<tokio::sync::RwLock<Option<Arc<proxy_bridge::ProxyBridge>>>>);

pub fn close_oauth_windows(app: &tauri::AppHandle) {
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| *label == "oauth-login" || label.starts_with("oauth-popup-"))
        .cloned()
        .collect();
    for label in labels {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.close();
        }
    }
}

pub fn cleanup_stale_webview_dirs(app: &tauri::AppHandle, include_dd: bool) {
    let Ok(local_data_dir) = app.path().app_local_data_dir() else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&local_data_dir) else {
        return;
    };
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            let is_oauth = name == "webview2_oauth" || name.starts_with("webview2_oauth_");
            let is_dd = include_dd && (name == "webview2_dd" || name.starts_with("webview2_dd_"));
            if is_oauth || is_dd {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }
}

pub async fn sync_proxy_bridge(
    app: &tauri::AppHandle,
    proxy_enabled: bool,
    proxy_url: &str,
) -> Result<Option<String>, String> {
    let bridge_state = app
        .try_state::<ProxyBridgeState>()
        .ok_or_else(|| "ProxyBridgeState not initialized".to_string())?;
    let endpoint_state = app
        .try_state::<WebviewProxyEndpoint>()
        .ok_or_else(|| "WebviewProxyEndpoint not initialized".to_string())?;

    let mut b_guard = bridge_state.0.write().await;

    if !proxy_enabled {
        if let Some(old) = b_guard.take() {
            old.shutdown();
        }
        if let Ok(mut ep_guard) = endpoint_state.0.write() {
            *ep_guard = None;
        }
        return Ok(None);
    }

    let parsed = settings::validate_proxy_url(proxy_url)?;
    let parsed_str = parsed.as_str().trim_end_matches('/');
    let reuse_existing = match *b_guard {
        Some(ref existing) => {
            existing.is_alive() && existing.upstream_url.trim_end_matches('/') == parsed_str
        }
        None => false,
    };

    if reuse_existing && let Some(ref existing) = *b_guard {
        let ep = existing.local_http_str();
        if let Ok(mut ep_guard) = endpoint_state.0.write() {
            *ep_guard = Some(ep.clone());
        }
        return Ok(Some(ep));
    }

    if let Some(old) = b_guard.take() {
        old.shutdown();
    }

    match proxy_bridge::ProxyBridge::start(parsed).await {
        Ok(started) => {
            let ep = started.local_http_str();
            if let Ok(mut ep_guard) = endpoint_state.0.write() {
                *ep_guard = Some(ep.clone());
            }
            *b_guard = Some(started);
            Ok(Some(ep))
        }
        Err(e) => {
            if let Ok(mut ep_guard) = endpoint_state.0.write() {
                *ep_guard = None;
            }
            Err(e)
        }
    }
}

fn shutdown_network_services(app: &tauri::AppHandle) {
    close_oauth_windows(app);
    if let Some(w) = app.get_webview_window("dd-refresh") {
        let _ = w.destroy();
    }
    if let Some(bridge_state) = app.try_state::<ProxyBridgeState>() {
        tauri::async_runtime::block_on(async {
            let mut bridge = bridge_state.0.write().await;
            if let Some(b) = bridge.take() {
                b.shutdown();
            }
        });
    }
    if let Some(client) = app.try_state::<SoundCloudClient>() {
        tauri::async_runtime::block_on(client.shutdown());
    }
    cleanup_stale_webview_dirs(app, true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let _ = app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                            file_name: None,
                        }),
                    ])
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                    .max_file_size(1_000_000)
                    .level(log::LevelFilter::Info)
                    .build(),
            );

            let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());
            cleanup_stale_webview_dirs(app.handle(), true);

            let mut initial_settings = AppSettings::load_or_default(app.handle());
            let mut proxy_bridge_handle: Option<Arc<proxy_bridge::ProxyBridge>> = None;
            let mut is_proxy_active = false;

            let rpc_handle = DiscordRpcHandle::new(initial_settings.discord_rpc_enabled);
            app.manage(rpc_handle);

            let webview2_dir = app.path().app_local_data_dir().ok().map(|d| {
                let dir = d.join("webview2");
                let _ = std::fs::create_dir_all(&dir);
                dir
            });

            #[cfg(windows)]
            let browser_args: Vec<String> = vec![
                "--disable-popup-blocking".to_string(),
                "--disable-blink-features=AutomationControlled".to_string(),
                "--unsafely-treat-insecure-origin-as-secure=http://localhost:5173,http://127.0.0.1"
                    .to_string(),
                "--enable-features=WidevineCdms".to_string(),
                "--disable-features=AutofillServerCommunication".to_string(),
            ];

            let mut webview_proxy_endpoint: Option<String> = None;

            if initial_settings.proxy_enabled {
                match settings::validate_proxy_url(&initial_settings.proxy_url) {
                    Ok(parsed_url) => {
                        match tauri::async_runtime::block_on(proxy_bridge::ProxyBridge::start(
                            parsed_url,
                        )) {
                            Ok(bridge) => {
                                let proxy_server = bridge.local_http_str();
                                webview_proxy_endpoint = Some(proxy_server);
                                proxy_bridge_handle = Some(bridge);
                                is_proxy_active = true;
                            }
                            Err(e) => {
                                log::warn!("Failed to start proxy bridge: {e}");
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Proxy enabled but URL invalid: {e}");
                    }
                }
            }

            #[cfg(windows)]
            let browser_args_str = browser_args.join(" ");
            #[cfg(windows)]
            log::info!("Creating main WebView2 window with browser args: {browser_args_str}");

            initial_settings.proxy_active = is_proxy_active;
            let settings_state = Arc::new(RwLock::new(initial_settings.clone()));
            app.manage(settings_state.clone());
            app.manage(WebviewProxyEndpoint(Arc::new(std::sync::RwLock::new(
                webview_proxy_endpoint,
            ))));
            app.manage(ProxyBridgeState(Arc::new(tokio::sync::RwLock::new(
                proxy_bridge_handle,
            ))));

            let raw_client = soundcloud::build_http_client(
                initial_settings.proxy_enabled && is_proxy_active,
                &initial_settings.proxy_url,
            )
            .unwrap_or_else(|e| {
                log::error!("Failed to build initial HTTP client: {e}");
                reqwest::Client::builder()
                    .user_agent(soundcloud::CHROME_USER_AGENT)
                    .connect_timeout(std::time::Duration::from_secs(15))
                    .read_timeout(std::time::Duration::from_secs(30))
                    .build()
                    .unwrap_or_default()
            });
            let client_arc = Arc::new(tokio::sync::RwLock::new(raw_client));
            let media_relay_instance = tauri::async_runtime::block_on(
                media_relay::MediaRelay::start(client_arc.clone(), Some(settings_state.clone())),
            )
            .ok();

            let sc_client = SoundCloudClient::new(
                app.handle().clone(),
                settings_state.clone(),
                client_arc,
                media_relay_instance,
                initial_settings.cached_client_id.clone(),
            );
            app.manage(sc_client);

            let mut window_builder = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("SoundCloud")
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/128x128@2x.png"
            ))?)?
            .user_agent(soundcloud::CHROME_USER_AGENT)
            .inner_size(1280.0, 800.0)
            .min_inner_size(860.0, 540.0)
            .decorations(false);

            if let Some(ref dir) = webview2_dir {
                window_builder = window_builder.data_directory(dir.clone());
            }

            #[cfg(windows)]
            {
                window_builder = window_builder.additional_browser_args(&browser_args_str);
            }

            let window = window_builder.build()?;

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

            let toggle_item =
                MenuItem::with_id(app, "toggle_window", "Show / Hide", true, None::<&str>)?;
            let play_pause_item =
                MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)?;
            let next_item =
                MenuItem::with_id(app, "next_track", "Next Track", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[&toggle_item, &play_pause_item, &next_item, &quit_item],
            )?;

            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            let tray_builder = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(false)
                .tooltip("SoundCloud Desktop")
                .menu(&tray_menu)
                .show_menu_on_left_click(false);

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
                        let _ = app.emit_to("main", "tray-play-pause", ());
                    }
                    "next_track" => {
                        let _ = app.emit_to("main", "tray-next-track", ());
                    }
                    "quit" => {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            close_oauth_windows(&app_handle);
                            if let Some(w) = app_handle.get_webview_window("dd-refresh") {
                                let _ = w.destroy();
                            }
                            if let Some(bridge_state) = app_handle.try_state::<ProxyBridgeState>() {
                                let mut bridge = bridge_state.0.write().await;
                                if let Some(b) = bridge.take() {
                                    b.shutdown();
                                }
                            }
                            if let Some(client) = app_handle.try_state::<SoundCloudClient>() {
                                client.shutdown().await;
                            }
                            cleanup_stale_webview_dirs(&app_handle, true);
                            app_handle.exit(0);
                        });
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
            get_discord_rpc_status,
            window_action,
            check_update,
            install_update,
            sc_get_discover,
            sc_get_stream,
            sc_search,
            sc_get_library,
            sc_get_playlist,
            sc_toggle_like,
            sc_resolve_stream,
            sc_clear_stream_cache,
            sc_login,
            sc_login_with_token,
            sc_logout,
            sc_get_me,
            sc_get_user_tracks,
            sc_add_track_to_playlist,
            sc_create_playlist,
            sc_get_track_detail,
            sc_get_track_comments,
            sc_post_track_comment,
            sc_update_profile,
            sc_upload_profile_image,
            sc_get_user_profile,
            sc_toggle_follow,
            test_proxy,
            log_frontend_error,
            sc_frontend_ready,
        ])
        .build(tauri::generate_context!())
        .expect("error while building soundcloud-desktop application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            shutdown_network_services(app_handle);
        }
    });
}
