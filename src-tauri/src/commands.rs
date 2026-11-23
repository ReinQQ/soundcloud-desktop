use crate::discord_rpc::{
    sanitize_text, validate_cover_url, validate_track_url, DiscordRpcHandle, TrackPayload,
};
use crate::settings::AppSettings;
use crate::soundcloud::{self, SoundCloudClient, StreamResolution};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
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
pub async fn save_settings(
    app: AppHandle,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    sc_client: State<'_, SoundCloudClient>,
    rpc: State<'_, DiscordRpcHandle>,
    webview_proxy: State<'_, crate::WebviewProxyEndpoint>,
    proxy_bridge: State<'_, crate::ProxyBridgeState>,
    mut new_settings: AppSettings,
) -> Result<AppSettings, String> {
    if new_settings.proxy_enabled {
        crate::settings::validate_proxy_url(&new_settings.proxy_url)?;
    }
    new_settings.validate_and_sanitize();

    rpc.set_enabled(new_settings.discord_rpc_enabled);
    rpc.set_app_id(new_settings.discord_app_id.clone());

    let mut is_proxy_active = false;

    if new_settings.proxy_enabled {
        match crate::settings::validate_proxy_url(&new_settings.proxy_url) {
            Ok(parsed) => {
                if crate::proxy_bridge::needs_proxy_bridge(&parsed) {
                    let mut b_guard = proxy_bridge.0.write().await;
                    let parsed_str = parsed.as_str().trim_end_matches('/');
                    let need_new = match *b_guard {
                        Some(ref existing) => existing.upstream_url.trim_end_matches('/') != parsed_str,
                        None => true,
                    };
                    if need_new {
                        if let Some(ref old) = *b_guard {
                            old.shutdown();
                        }
                        match crate::proxy_bridge::ProxyBridge::start(parsed).await {
                            Ok(nb) => {
                                if let Ok(mut ep_guard) = webview_proxy.0.write() {
                                    *ep_guard = Some(nb.local_http_str());
                                }
                                *b_guard = Some(nb);
                                is_proxy_active = true;
                            }
                            Err(e) => {
                                log::error!("Failed to restart proxy bridge: {e}");
                                *b_guard = None;
                                if let Ok(mut ep_guard) = webview_proxy.0.write() {
                                    *ep_guard = None;
                                }
                            }
                        }
                    } else if let Some(ref existing) = *b_guard {
                        log::info!("Reusing existing proxy bridge on 127.0.0.1:{}", existing.local_port);
                        if let Ok(mut ep_guard) = webview_proxy.0.write() {
                            *ep_guard = Some(existing.local_http_str());
                        }
                        is_proxy_active = true;
                    }
                } else {
                    let mut b_guard = proxy_bridge.0.write().await;
                    if let Some(ref old) = *b_guard {
                        old.shutdown();
                    }
                    *b_guard = None;
                    if let Ok(mut ep_guard) = webview_proxy.0.write() {
                        *ep_guard = Some(parsed.as_str().trim_end_matches('/').to_string());
                    }
                    is_proxy_active = true;
                }
            }
            Err(_) => {
                let mut b_guard = proxy_bridge.0.write().await;
                if let Some(ref old) = *b_guard {
                    old.shutdown();
                }
                *b_guard = None;
                if let Ok(mut ep_guard) = webview_proxy.0.write() {
                    *ep_guard = None;
                }
            }
        }
    } else {
        let mut b_guard = proxy_bridge.0.write().await;
        if let Some(ref old) = *b_guard {
            old.shutdown();
        }
        *b_guard = None;
        if let Ok(mut ep_guard) = webview_proxy.0.write() {
            *ep_guard = None;
        }
    }

    new_settings.proxy_active = is_proxy_active;

    if let Err(e) = sc_client.rebuild_client(new_settings.proxy_enabled, &new_settings.proxy_url).await {
        log::warn!("Failed to rebuild SoundCloudClient with new settings: {e}");
        return Err(format!("Settings saved but proxy configuration failed: {e}"));
    }

    new_settings
        .save(&app)
        .map_err(|e| format!("Failed to persist settings: {e}"))?;

    if let Ok(mut current) = settings.write() {
        *current = new_settings.clone();
    } else {
        return Err("Failed to acquire write lock on settings".to_string());
    }

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
    app.restart();
}

#[tauri::command]
pub async fn sc_get_discover(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.get_discover(token.as_deref()).await
}

#[tauri::command]
pub async fn sc_get_stream(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<serde_json::Value, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required for feed".to_string())?;
    client.get_stream(&token).await
}

#[tauri::command]
pub async fn sc_search(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    query: String,
    kind: Option<String>,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.search(&query, kind.as_deref(), token.as_deref()).await
}

#[tauri::command]
pub async fn sc_get_library(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    user_id: Option<u64>,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    let resolved_user_id = match user_id {
        Some(id) => id,
        None => {
            let t = token
                .as_deref()
                .ok_or_else(|| "Authentication required to fetch library".to_string())?;
            client.get_cached_or_fetch_user_id(t).await?
        }
    };
    client.get_library(resolved_user_id, token.as_deref()).await
}

#[tauri::command]
pub async fn sc_get_playlist(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    id_or_urn: String,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.get_playlist(&id_or_urn, token.as_deref()).await
}

#[tauri::command]
pub async fn sc_get_track(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    id: u64,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.get_track(id, token.as_deref()).await
}

#[tauri::command]
pub async fn sc_toggle_like(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    track_id: u64,
    liked: bool,
) -> Result<bool, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to toggle like".to_string())?;
    let me_id = client.get_cached_or_fetch_user_id(&token).await?;
    client.toggle_like(me_id, track_id, liked, &token).await
}

#[tauri::command]
pub async fn sc_resolve_stream(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    track_id: u64,
) -> Result<StreamResolution, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.resolve_stream(track_id, token.as_deref()).await
}

#[tauri::command]
pub fn sc_clear_stream_cache(
    client: State<'_, SoundCloudClient>,
    track_id: Option<u64>,
) {
    client.clear_stream_cache(track_id);
}

const BRAND_MASK_SCRIPT: &str = r#"
try {
    Object.defineProperty(navigator, 'webdriver', {
        get: function() { return undefined; },
        configurable: true
    });
} catch(e) {}
try {
    delete window.chrome?.webstore;
} catch(e) {}
try {
    var uaData = navigator.userAgentData;
    if (uaData && Array.isArray(uaData.brands)) {
        var cleanBrands = uaData.brands.filter(function(b) {
            return !String(b.brand || '').toLowerCase().includes('webview');
        });
        Object.defineProperty(navigator, 'userAgentData', {
            value: new Proxy(uaData, {
                get: function(target, prop) {
                    if (prop === 'brands') return cleanBrands;
                    var val = Reflect.get(target, prop);
                    return typeof val === 'function' ? val.bind(target) : val;
                }
            }),
            configurable: true
        });
    }
} catch(e) {}
"#;

#[tauri::command]
pub async fn sc_login(
    app: AppHandle,
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    webview_proxy: State<'_, crate::WebviewProxyEndpoint>,
    proxy_bridge: State<'_, crate::ProxyBridgeState>,
) -> Result<(), String> {
    log::info!("sc_login requested: preparing isolated oauth-login session");

    if let Some(w) = app.get_webview_window("oauth-login") {
        let _ = w.destroy();
    }

    let oauth_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {e}"))?
        .join("webview2_oauth");

    if oauth_dir.exists() {
        let _ = std::fs::remove_dir_all(&oauth_dir);
    }
    let _ = std::fs::create_dir_all(&oauth_dir);

    #[cfg(windows)]
    let mut browser_args: Vec<String> = vec![
        "--disable-popup-blocking".to_string(),
        "--disable-blink-features=AutomationControlled".to_string(),
    ];
    #[cfg(not(windows))]
    let mut non_windows_proxy_url: Option<url::Url> = None;

    let proxy_enabled = settings.read().map(|s| s.proxy_enabled).unwrap_or(false);
    let mut live_proxy_endpoint: Option<String> = None;

    if proxy_enabled {
        let b_guard = proxy_bridge.0.read().await;
        if let Some(ref bridge) = *b_guard {
            live_proxy_endpoint = bridge.current_local_endpoint();
        } else if let Ok(s_guard) = settings.read()
            && let Ok(parsed) = crate::settings::validate_proxy_url(&s_guard.proxy_url) {
                let s = format!("{}://{}:{}", parsed.scheme(), parsed.host_str().unwrap_or(""), parsed.port().unwrap_or(8080));
                live_proxy_endpoint = Some(s);
        }
        if live_proxy_endpoint.is_none()
            && let Ok(ep_guard) = webview_proxy.0.read() {
                live_proxy_endpoint = ep_guard.clone();
        }
    }

    if let Some(ref endpoint) = live_proxy_endpoint {
        let clean_endpoint = endpoint.trim_end_matches('/');
        #[cfg(windows)]
        {
            browser_args.push(format!("--proxy-server={clean_endpoint}"));
        }
        #[cfg(not(windows))]
        {
            if let Ok(u) = url::Url::parse(clean_endpoint) {
                non_windows_proxy_url = Some(u);
            }
        }
        log::info!("sc_login using proxy endpoint: {clean_endpoint}");
    }

    #[cfg(windows)]
    let browser_args_str = browser_args.join(" ");

    let nested_popup_script = format!(
        r#"
        {BRAND_MASK_SCRIPT}
        if (window.opener !== null) {{
            var nativeClose = window.close.bind(window);
            window.close = function() {{
                try {{ window.location.href = 'https://close.scdesktop.invalid/'; }} catch(e) {{}}
                try {{ nativeClose(); }} catch(e) {{}}
            }};
        }}
        "#
    );

    let monitor_script = format!(
        r#"
        {BRAND_MASK_SCRIPT}
        (function() {{
            var userInteracted = false;
            window.addEventListener('click', function() {{ userInteracted = true; }}, {{ capture: true }});
            window.addEventListener('keydown', function() {{ userInteracted = true; }}, {{ capture: true }});
            window.addEventListener('submit', function() {{ userInteracted = true; }}, {{ capture: true }});

            function check() {{
                var m = document.cookie.match(/(?:^|;\s*)oauth_token=([^;]+)/);
                var token = null;
                if (m && m[1]) {{
                    token = decodeURIComponent(m[1]).replace(/^"|"$/g, '').trim();
                }}
                if (!token) {{
                    try {{
                        var ls = localStorage.getItem('oauth_token') || localStorage.getItem('token');
                        if (ls) token = ls.replace(/^"|"$/g, '').trim();
                    }} catch (_) {{}}
                }}
                if (token) {{
                    var path = window.location.pathname || '';
                    var isAuthPage = path.indexOf('/signin') !== -1 || path.indexOf('/connect') !== -1;
                    if (isAuthPage && !userInteracted) {{
                        return;
                    }}
                    window.location.href = "https://oauth.scdesktop.callback/?token=" + encodeURIComponent(token);
                }}
            }}
            setInterval(check, 500);
        }})();
        "#
    );

    let app_handle_for_nav = app.clone();
    let settings_for_nav = settings.inner().clone();
    let client_for_nav = client.inner().clone();
    let token_handled = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let token_handled_nav = token_handled.clone();
    let token_handled_poll = token_handled;

    let popup_app = app.clone();
    let popup_oauth_dir = oauth_dir.clone();
    #[cfg(windows)]
    let popup_browser_args = browser_args_str.clone();
    #[cfg(not(windows))]
    let popup_proxy_url = non_windows_proxy_url.clone();
    let popup_script_str = nested_popup_script.clone();

    let signin_url = "https://soundcloud.com/signin"
        .parse::<url::Url>()
        .map_err(|e| format!("Invalid signin URL: {e}"))?;

    let mut builder = WebviewWindowBuilder::new(
        &app,
        "oauth-login",
        WebviewUrl::External(signin_url),
    )
    .title("Sign In - SoundCloud")
    .user_agent(crate::soundcloud::CHROME_USER_AGENT)
    .inner_size(520.0, 720.0)
    .center()
    .data_directory(oauth_dir.clone())
    .initialization_script(&monitor_script)
    .on_navigation(move |nav_url| {
        if nav_url.host_str() == Some("oauth.scdesktop.callback") {
            let token_opt = nav_url
                .query_pairs()
                .find(|(k, _)| k == "token")
                .map(|(_, v)| v.to_string());
            if let Some(token) = token_opt
                && !token.is_empty() {
                    let client_clone = client_for_nav.clone();
                    let settings_clone = settings_for_nav.clone();
                    let app_clone = app_handle_for_nav.clone();
                    let handled_flag = token_handled_nav.clone();
                    tauri::async_runtime::spawn(async move {
                        if handled_flag.compare_exchange(false, true, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst).is_err() {
                            return;
                        }
                        log::info!("Validating intercepted token via /me...");
                        if let Some(win) = app_clone.get_webview_window("oauth-login")
                            && let Ok(cookies) = win.cookies() {
                                for c in cookies {
                                    if c.name() == "datadome" {
                                        let dd = c.value().trim().trim_matches('"').to_string();
                                        if !dd.is_empty() {
                                            if let Ok(mut lock) = settings_clone.write() {
                                                lock.datadome_cookie = Some(dd);
                                                let _ = lock.save(&app_clone);
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                        match client_clone.get_me(&token).await {
                            Ok(user) if user.get("id").is_some() => {
                                let username = user
                                    .get("username")
                                    .and_then(|u| u.as_str())
                                    .unwrap_or("User");
                                log::info!("OAuth token verified successfully for user: {username}");
                                client_clone.clear_user_cache();
                                if let Ok(mut lock) = settings_clone.write() {
                                    lock.oauth_token = Some(token.clone());
                                    let _ = lock.save(&app_clone);
                                }
                                if let Some(w) = app_clone.get_webview_window("oauth-login") {
                                    let _ = w.destroy();
                                }
                                let _ = app_clone.emit_to("main", "auth-updated", token);
                            }
                            other => {
                                log::warn!("OAuth token validation failed: {other:?}. Keeping oauth-login open.");
                                handled_flag.store(false, std::sync::atomic::Ordering::SeqCst);
                            }
                        }
                    });
                    return false;
                }
        }
        true
    })
    .on_new_window(move |url, features| {
        let label = format!(
            "oauth-popup-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );
        let popup_label = label.clone();
        let popup_app_inner = popup_app.clone();
        let mut p_builder = WebviewWindowBuilder::new(
            &popup_app,
            label,
            WebviewUrl::External(url),
        )
        .window_features(features)
        .title("Sign In - SoundCloud")
        .user_agent(crate::soundcloud::CHROME_USER_AGENT)
        .data_directory(popup_oauth_dir.clone())
        .initialization_script(&popup_script_str)
        .on_navigation(move |nav_url| {
            if nav_url.host_str() == Some("close.scdesktop.invalid") {
                if let Some(w) = popup_app_inner.get_webview_window(&popup_label) {
                    let _ = w.destroy();
                }
                return false;
            }
            true
        });

        #[cfg(windows)]
        {
            p_builder = p_builder.additional_browser_args(&popup_browser_args);
        }
        #[cfg(not(windows))]
        if let Some(ref p_url) = popup_proxy_url {
            p_builder = p_builder.proxy_url(p_url.clone());
        }

        match p_builder.build() {
            Ok(win) => {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        let _ = win_clone.destroy();
                    }
                });
                tauri::webview::NewWindowResponse::Create { window: win }
            }
            Err(e) => {
                log::warn!("Failed to create nested OAuth popup window: {e}");
                tauri::webview::NewWindowResponse::Deny
            }
        }
    });

    #[cfg(windows)]
    {
        builder = builder.additional_browser_args(&browser_args_str);
    }
    #[cfg(not(windows))]
    if let Some(ref url) = non_windows_proxy_url {
        builder = builder.proxy_url(url.clone());
    }

    let win = builder
        .build()
        .map_err(|e| format!("Failed to create login window: {e}"))?;

    log::info!("Created oauth-login window successfully with isolated profile");

    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let _ = win_clone.destroy();
        }
    });

    // Background polling loop for cookie detection & /me validation
    let win_poll = win.clone();
    let client_poll = client.inner().clone();
    let settings_poll = settings.inner().clone();
    let app_poll = app.clone();

    tauri::async_runtime::spawn(async move {
        log::info!("Starting background cookie polling for oauth-login window...");
        let sc_url = match "https://soundcloud.com".parse::<url::Url>() {
            Ok(u) => u,
            Err(e) => {
                log::warn!("Failed to parse SoundCloud URL for cookie polling: {e}");
                return;
            }
        };

        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            if app_poll.get_webview_window("oauth-login").is_none() {
                log::info!("oauth-login window was closed. Stopping polling loop.");
                break;
            }

            let mut detected_token: Option<String> = None;
            let mut detected_datadome: Option<String> = None;

            if let Ok(cookies) = win_poll.cookies_for_url(sc_url.clone()) {
                for c in cookies {
                    if c.name() == "oauth_token" {
                        let val = c.value().trim().trim_matches('"');
                        if !val.is_empty() {
                            detected_token = Some(val.to_string());
                        }
                    } else if c.name() == "datadome" {
                        let val = c.value().trim().trim_matches('"');
                        if !val.is_empty() {
                            detected_datadome = Some(val.to_string());
                        }
                    }
                }
            }

            if let Ok(cookies) = win_poll.cookies() {
                for c in cookies {
                    if c.name() == "oauth_token" && detected_token.is_none() {
                        let val = c.value().trim().trim_matches('"');
                        if !val.is_empty() {
                            detected_token = Some(val.to_string());
                        }
                    } else if c.name() == "datadome" && detected_datadome.is_none() {
                        let val = c.value().trim().trim_matches('"');
                        if !val.is_empty() {
                            detected_datadome = Some(val.to_string());
                        }
                    }
                }
            }

            if let Some(ref dd) = detected_datadome
                && let Ok(mut lock) = settings_poll.write()
                    && lock.datadome_cookie.as_ref() != Some(dd) {
                        lock.datadome_cookie = Some(dd.clone());
                        let _ = lock.save(&app_poll);
                    }

            if let Some(token) = detected_token
                && token_handled_poll.compare_exchange(false, true, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst).is_ok()
            {
                log::info!("Detected oauth_token cookie in oauth-login. Verifying via /me API...");
                    match client_poll.get_me(&token).await {
                        Ok(user) if user.get("id").is_some() => {
                            let username = user
                                .get("username")
                                .and_then(|u| u.as_str())
                                .unwrap_or("User");
                            log::info!("Successfully verified OAuth token for user: {username}. Saving credentials and closing oauth-login.");
                            client_poll.clear_user_cache();
                            if let Ok(mut lock) = settings_poll.write() {
                                lock.oauth_token = Some(token.clone());
                                let _ = lock.save(&app_poll);
                            }

                            if let Some(w) = app_poll.get_webview_window("oauth-login") {
                                let _ = w.destroy();
                            }

                            let _ = app_poll.emit_to("main", "auth-updated", token);
                            break;
                        }
                        Ok(_) => {
                            log::warn!("Call to /me succeeded but returned no user ID. Continuing to poll...");
                            token_handled_poll.store(false, std::sync::atomic::Ordering::SeqCst);
                        }
                        Err(err) => {
                            log::warn!("Verification of detected token via /me failed: {err}. Keeping oauth-login open...");
                            token_handled_poll.store(false, std::sync::atomic::Ordering::SeqCst);
                        }
                    }
                }
            }
        });

    Ok(())
}

#[tauri::command]
pub async fn sc_login_with_token(
    app: AppHandle,
    token: String,
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<serde_json::Value, String> {
    let clean_token = token.trim().trim_matches('"').to_string();
    if clean_token.is_empty() {
        return Err("OAuth token cannot be empty".to_string());
    }

    log::info!("sc_login_with_token: validating token via /me...");
    match client.get_me(&clean_token).await {
        Ok(user) if user.get("id").is_some() => {
            let username = user
                .get("username")
                .and_then(|u| u.as_str())
                .unwrap_or("User");
            log::info!("OAuth token verified successfully for user: {username}");
            client.clear_user_cache();
            if let Ok(mut lock) = settings.write() {
                lock.oauth_token = Some(clean_token.clone());
                let _ = lock.save(&app);
            }
            let _ = app.emit_to("main", "auth-updated", clean_token);
            Ok(user)
        }
        Ok(_) => Err("Invalid response from SoundCloud API: missing user ID".to_string()),
        Err(e) => Err(format!("Token validation failed: {e}")),
    }
}

#[tauri::command]
pub async fn sc_get_user_tracks(
    user_id: u64,
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<serde_json::Value, String> {
    let token = {
        let lock = settings.read().map_err(|e| e.to_string())?;
        lock.oauth_token.clone()
    };
    client.get_user_tracks(user_id, token.as_deref()).await
}

#[tauri::command]
pub fn sc_logout(
    app: AppHandle,
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<(), String> {
    log::info!("sc_logout requested: clearing session and cookies");
    client.clear_user_cache();
    if let Ok(mut lock) = settings.write() {
        lock.oauth_token = None;
        let _ = lock.save(&app);
    }
    if let Some(w) = app.get_webview_window("oauth-login") {
        let _ = w.clear_all_browsing_data();
        let _ = w.destroy();
    }
    if let Ok(local_dir) = app.path().app_local_data_dir() {
        let oauth_dir = local_dir.join("webview2_oauth");
        if oauth_dir.exists() {
            let _ = std::fs::remove_dir_all(oauth_dir);
        }
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.clear_all_browsing_data();
    }
    let _ = app.emit_to("main", "auth-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn sc_get_me(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
) -> Result<Option<serde_json::Value>, String> {
    let token = {
        let lock = settings.read().map_err(|e| e.to_string())?;
        lock.oauth_token.clone()
    };

    match token {
        Some(t) => match client.get_me(&t).await {
            Ok(val) => Ok(Some(val)),
            Err(_) => Ok(None),
        },
        None => Ok(None),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyTestDetails {
    pub success: bool,
    pub direct_ip: Option<String>,
    pub exit_ip: Option<String>,
    pub country: Option<String>,
    pub step1_ip_status: String,
    pub step2_resolve_status: String,
    pub step3_media_status: String,
    pub bytes_received: usize,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn test_proxy(
    client: State<'_, SoundCloudClient>,
    proxy_url: Option<String>,
) -> Result<ProxyTestDetails, String> {
    let direct_ip = {
        let dc = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .ok();
        if let Some(c) = dc {
            if let Ok(resp) = c.get("https://api.ipify.org").send().await {
                resp.text().await.ok()
            } else {
                None
            }
        } else {
            None
        }
    };

    let test_client = if let Some(ref raw_url) = proxy_url {
        match soundcloud::build_http_client(true, raw_url) {
            Ok(c) => c,
            Err(e) => {
                return Ok(ProxyTestDetails {
                    success: false,
                    direct_ip,
                    exit_ip: None,
                    country: None,
                    step1_ip_status: format!("Failed to configure proxy client: {e}"),
                    step2_resolve_status: "Skipped".to_string(),
                    step3_media_status: "Skipped".to_string(),
                    bytes_received: 0,
                    error: Some(e),
                });
            }
        }
    } else {
        client.client().await
    };

    let ip_resp = test_client
        .get("http://ip-api.com/json")
        .timeout(Duration::from_secs(10))
        .send()
        .await;

    let (exit_ip, country, step1_status) = match ip_resp {
        Ok(resp) => {
            let status = resp.status();
            if status == reqwest::StatusCode::PROXY_AUTHENTICATION_REQUIRED {
                return Ok(ProxyTestDetails {
                    success: false,
                    direct_ip,
                    exit_ip: None,
                    country: None,
                    step1_ip_status: "HTTP 407 Proxy Authentication Required".to_string(),
                    step2_resolve_status: "Skipped".to_string(),
                    step3_media_status: "Skipped".to_string(),
                    bytes_received: 0,
                    error: Some("Proxy authentication failed (HTTP 407). Check credentials.".to_string()),
                });
            }
            if !status.is_success() {
                return Ok(ProxyTestDetails {
                    success: false,
                    direct_ip,
                    exit_ip: None,
                    country: None,
                    step1_ip_status: format!("HTTP {status}"),
                    step2_resolve_status: "Skipped".to_string(),
                    step3_media_status: "Skipped".to_string(),
                    bytes_received: 0,
                    error: Some(format!("IP query returned HTTP {status}")),
                });
            }
            let json = resp.json::<serde_json::Value>().await.unwrap_or_default();
            let ip = json.get("query").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let c = json.get("country").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let code = json.get("countryCode").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (Some(ip.clone()), Some(format!("{c} ({code})")), format!("HTTP 200 OK (Exit IP: {ip}, Country: {c})"))
        }
        Err(e) => {
            return Ok(ProxyTestDetails {
                success: false,
                direct_ip,
                exit_ip: None,
                country: None,
                step1_ip_status: format!("Connection failed: {e}"),
                step2_resolve_status: "Skipped".to_string(),
                step3_media_status: "Skipped".to_string(),
                bytes_received: 0,
                error: Some(format!("Failed to connect via proxy: {e}")),
            });
        }
    };

    let test_track_id = 2401939686u64;
    let res = match client.resolve_stream(test_track_id, None).await {
        Ok(r) => r,
        Err(e) => {
            return Ok(ProxyTestDetails {
                success: false,
                direct_ip,
                exit_ip,
                country,
                step1_ip_status: step1_status,
                step2_resolve_status: format!("Resolution failed: {e}"),
                step3_media_status: "Skipped".to_string(),
                bytes_received: 0,
                error: Some(format!("Stream resolution failed: {e}")),
            });
        }
    };
    let step2_status = format!("HTTP 200 OK (Protocol: {}, stream URL resolved)", res.protocol);

    let media_resp = if res.stream_url.starts_with("http://127.0.0.1") {
        reqwest::Client::new()
            .get(&res.stream_url)
            .header("Range", "bytes=0-1023")
            .timeout(Duration::from_secs(10))
            .send()
            .await
    } else {
        test_client
            .get(&res.stream_url)
            .header("Range", "bytes=0-1023")
            .header("User-Agent", soundcloud::CHROME_USER_AGENT)
            .timeout(Duration::from_secs(10))
            .send()
            .await
    };

    match media_resp {
        Ok(resp) => {
            let status = resp.status();
            let bytes = resp.bytes().await.unwrap_or_default();
            let byte_count = bytes.len();
            let step3_status = format!("HTTP {} ({} bytes received via relay/proxy)", status.as_u16(), byte_count);
            let ok = (status.is_success() || status == reqwest::StatusCode::PARTIAL_CONTENT) && byte_count > 0;
            Ok(ProxyTestDetails {
                success: ok,
                direct_ip,
                exit_ip,
                country,
                step1_ip_status: step1_status,
                step2_resolve_status: step2_status,
                step3_media_status: step3_status,
                bytes_received: byte_count,
                error: if ok { None } else { Some("Received 0 bytes from media fetch".to_string()) },
            })
        }
        Err(e) => {
            Ok(ProxyTestDetails {
                success: false,
                direct_ip,
                exit_ip,
                country,
                step1_ip_status: step1_status,
                step2_resolve_status: step2_status,
                step3_media_status: format!("Fetch error: {e}"),
                bytes_received: 0,
                error: Some(format!("Media byte fetch failed: {e}")),
            })
        }
    }
}

#[tauri::command]
pub fn log_frontend_error(level: String, message: String) {
    match level.to_lowercase().as_str() {
        "error" => log::error!("[Frontend] {message}"),
        "warn" => log::warn!("[Frontend] {message}"),
        "info" => log::info!("[Frontend] {message}"),
        _ => log::debug!("[Frontend] {message}"),
    }
}

#[tauri::command]
pub async fn sc_frontend_ready() -> Result<(), String> {
    log::info!("[Frontend] Frontend mounted and ready");
    Ok(())
}

#[tauri::command]
pub async fn sc_add_track_to_playlist(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    playlist_id: i64,
    track_id: i64,
) -> Result<serde_json::Value, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to modify playlists".to_string())?;
    client.add_track_to_playlist(playlist_id, track_id, &token).await
}

#[tauri::command]
pub async fn sc_create_playlist(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    title: String,
    is_public: bool,
    initial_track_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to create playlists".to_string())?;
    client.create_playlist(&title, is_public, initial_track_id, &token).await
}

#[tauri::command]
pub async fn sc_get_track_detail(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    track_id: i64,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.get_track_detail(track_id, token.as_deref()).await
}

#[tauri::command]
pub async fn sc_get_track_comments(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    track_id: i64,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.get_track_comments(track_id, token.as_deref()).await
}

#[tauri::command]
pub async fn sc_post_track_comment(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    track_id: i64,
    body: String,
    timestamp_ms: Option<i64>,
) -> Result<serde_json::Value, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to post comments".to_string())?;
    client.post_track_comment(track_id, &body, timestamp_ms, &token).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn sc_update_profile(
    app: AppHandle,
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    username: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    city: Option<String>,
    country: Option<String>,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to update profile".to_string())?;
    let updated = client
        .update_profile(
            crate::soundcloud::ProfileUpdateFields {
                username,
                first_name,
                last_name,
                city,
                country,
                description,
            },
            &token,
        )
        .await?;
    let _ = app.emit_to("main", "auth-updated", token);
    Ok(updated)
}

#[tauri::command]
pub async fn sc_upload_profile_image(
    app: AppHandle,
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    kind: String,
    image_data_url: String,
) -> Result<serde_json::Value, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to update profile images".to_string())?;
    let updated = client
        .upload_profile_image(&kind, &image_data_url, &token)
        .await?;
    let _ = app.emit_to("main", "auth-updated", token);
    Ok(updated)
}

#[tauri::command]
pub async fn sc_get_user_profile(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    user_id: i64,
) -> Result<serde_json::Value, String> {
    let token = settings.read().ok().and_then(|s| s.oauth_token.clone());
    client.get_user_profile(user_id, token.as_deref()).await
}

#[tauri::command]
pub async fn sc_toggle_follow(
    client: State<'_, SoundCloudClient>,
    settings: State<'_, Arc<RwLock<AppSettings>>>,
    user_id: i64,
    follow: bool,
) -> Result<bool, String> {
    let token = settings
        .read()
        .ok()
        .and_then(|s| s.oauth_token.clone())
        .ok_or_else(|| "Authentication required to follow users".to_string())?;
    client.toggle_follow(user_id, follow, &token).await
}



