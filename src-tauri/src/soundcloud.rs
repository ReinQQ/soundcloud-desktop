use regex::Regex;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::settings::AppSettings;
use crate::media_relay::MediaRelay;

pub const CHROME_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const FALLBACK_CLIENT_ID: &str = "glXhJxvYKPM87la70dG2G1bJ03AdA3hN";
static DD_PROFILE_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamResolution {
    pub stream_url: String,
    pub protocol: String,
    pub mime_type: String,
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub encrypted: bool,
    #[serde(default)]
    pub license_url: Option<String>,
    #[serde(default)]
    pub license_auth_token: Option<String>,
}

type InFlightMap = Arc<tokio::sync::Mutex<HashMap<u64, tokio::sync::watch::Receiver<Option<Result<StreamResolution, String>>>>>>;

#[derive(Clone)]
pub struct SoundCloudClient {
    app_handle: AppHandle,
    settings: Arc<RwLock<AppSettings>>,
    client: Arc<tokio::sync::RwLock<reqwest::Client>>,
    media_relay: Arc<tokio::sync::RwLock<Option<Arc<MediaRelay>>>>,
    cached_client_id: Arc<RwLock<Option<String>>>,
    cached_user_id: Arc<RwLock<Option<(String, u64)>>>,
    stream_cache: Arc<RwLock<HashMap<u64, (StreamResolution, Instant)>>>,
    negative_stream_cache: Arc<RwLock<HashMap<u64, (String, Instant)>>>,
    response_cache: Arc<RwLock<HashMap<String, (serde_json::Value, Instant)>>>,
    in_flight: InFlightMap,
    dd_refresh_lock: Arc<tokio::sync::Mutex<()>>,
    cache_epoch: Arc<AtomicU64>,
}

#[derive(Debug, Clone)]
pub enum GetMeError {
    Unauthorized(String),
    Recoverable(String),
}

impl std::fmt::Display for GetMeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(msg) | Self::Recoverable(msg) => write!(f, "{msg}"),
        }
    }
}

#[derive(Debug)]
enum ApiJsonError {
    DataDome(String),
    Unauthorized(String),
    Recoverable(String),
}

impl ApiJsonError {
    fn into_message(self) -> String {
        match self {
            Self::DataDome(m) | Self::Unauthorized(m) | Self::Recoverable(m) => m,
        }
    }
}

pub(crate) fn is_html_body(content_type: &str, body: &str) -> bool {
    if content_type.to_lowercase().contains("text/html") {
        return true;
    }
    let trimmed = body.trim_start().to_lowercase();
    trimmed.starts_with("<!doctype")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<head")
        || trimmed.starts_with("<body")
}

pub(crate) fn is_datadome_response(status: reqwest::StatusCode, content_type: &str, body: &str) -> bool {
    let lower = body.to_lowercase();
    lower.contains("geo.captcha-delivery.com")
        || lower.contains("captcha-delivery.com")
        || (lower.contains("datadome") && (status == reqwest::StatusCode::FORBIDDEN || is_html_body(content_type, body)))
}

async fn read_and_parse_json<T: DeserializeOwned>(
    resp: reqwest::Response,
    context: &str,
) -> Result<T, ApiJsonError> {
    let status = resp.status();
    if status == reqwest::StatusCode::PROXY_AUTHENTICATION_REQUIRED {
        return Err(ApiJsonError::Recoverable(
            "Proxy authentication failed (HTTP 407). Verify username and password in Settings.".to_string(),
        ));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = resp
        .text()
        .await
        .map_err(|e| ApiJsonError::Recoverable(format!("{context}: failed to read response body: {e}")))?;

    let snippet: String = body.chars().take(240).collect();

    if is_datadome_response(status, &content_type, &body) {
        return Err(ApiJsonError::DataDome(format!(
            "SoundCloud anti-bot verification challenge ({status})"
        )));
    }

    let html = is_html_body(&content_type, &body);

    if status == reqwest::StatusCode::UNAUTHORIZED {
        if html {
            return Err(ApiJsonError::Recoverable(format!(
                "{context}: received HTML verification/proxy page on HTTP 401: {snippet}"
            )));
        }
        return Err(ApiJsonError::Unauthorized(
            "SoundCloud session expired (HTTP 401 Unauthorized)".to_string(),
        ));
    }

    if !status.is_success() {
        if html {
            return Err(ApiJsonError::Recoverable(format!(
                "{context}: HTTP {status} HTML response (possible proxy/CDN block): {snippet}"
            )));
        }
        return Err(ApiJsonError::Recoverable(format!(
            "{context} failed ({status}): {snippet}"
        )));
    }

    if html {
        return Err(ApiJsonError::Recoverable(format!(
            "{context}: expected JSON but received HTML response (possible proxy/captive portal/captcha): {snippet}"
        )));
    }

    serde_json::from_str::<T>(&body).map_err(|e| {
        ApiJsonError::Recoverable(format!(
            "{context}: invalid JSON response ({e}); body={snippet}"
        ))
    })
}

pub fn build_http_client(proxy_enabled: bool, proxy_url: &str) -> Result<reqwest::Client, String> {
    // Use connect/read timeouts instead of a short total timeout so MediaRelay audio streaming never aborts mid-track.
    let mut builder = reqwest::Client::builder()
        .user_agent(CHROME_USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30));

    if proxy_enabled {
        let parsed = crate::settings::validate_proxy_url(proxy_url)?;
        let scheme = parsed.scheme().to_lowercase();
        let creds = crate::settings::parse_proxy_credentials(&parsed);

        let mut target_url = parsed.clone();
        if scheme == "socks5" {
            let _ = target_url.set_scheme("socks5h");
        } else if scheme == "socks4" {
            let _ = target_url.set_scheme("socks4a");
        }
        let _ = target_url.set_username("");
        let _ = target_url.set_password(None);

        let proxy_str = target_url.as_str().trim_end_matches('/');
        let mut proxy = reqwest::Proxy::all(proxy_str).map_err(|e| {
            format!(
                "Failed to configure proxy with {}: {e}",
                crate::settings::redact_proxy_url(proxy_url)
            )
        })?;

        if let Some((user, pass)) = creds {
            proxy = proxy.basic_auth(&user, &pass);
        }

        builder = builder.proxy(proxy);
        log::info!(
            "SoundCloudClient configured with proxy: {}",
            crate::settings::redact_proxy_url(proxy_url)
        );
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {e}"))
}

fn extract_script_urls(html: &str) -> Vec<String> {
    let re = match Regex::new(r#"https://a-v2\.sndcdn\.com/assets/[^"'\s>]+\.js"#) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    re.find_iter(html).map(|m| m.as_str().to_string()).collect()
}

fn extract_client_id_from_js(js: &str) -> Option<String> {
    let re = match Regex::new(r#"client_id[\"']?\s*[:=]\s*[\"']([a-zA-Z0-9]{32})[\"']"#) {
        Ok(r) => r,
        Err(_) => return None,
    };
    re.captures(js).and_then(|cap| cap.get(1)).map(|m| m.as_str().to_string())
}

fn apply_playlist_artwork_fallback(pl: &mut serde_json::Value) {
    let has_artwork = pl
        .get("artwork_url")
        .and_then(|v| v.as_str())
        .is_some_and(|s| !s.is_empty() && !s.contains("default_avatar"));

    if !has_artwork {
        let mut fallback: Option<String> = None;

        if let Some(art) = pl
            .get("computed_artwork_url")
            .or_else(|| pl.get("calculated_artwork_url"))
            .and_then(|a| a.as_str())
            && !art.is_empty() && !art.contains("default_avatar") {
                fallback = Some(art.to_string());
            }

        if fallback.is_none()
            && let Some(tracks) = pl.get("tracks").and_then(|t| t.as_array()) {
                for t in tracks {
                    if let Some(art) = t.get("artwork_url").and_then(|a| a.as_str())
                        && !art.is_empty() && !art.contains("default_avatar") {
                            fallback = Some(art.to_string());
                            break;
                        }
                    if let Some(avatar) = t
                        .get("user")
                        .and_then(|u| u.get("avatar_url"))
                        .and_then(|a| a.as_str())
                        && !avatar.is_empty() && !avatar.contains("default_avatar") {
                            fallback = Some(avatar.to_string());
                            break;
                        }
                }
            }

        if fallback.is_none()
            && let Some(avatar) = pl
                .get("user")
                .and_then(|u| u.get("avatar_url"))
                .and_then(|a| a.as_str())
                && !avatar.is_empty() && !avatar.contains("default_avatar") {
                    fallback = Some(avatar.to_string());
                }

        if let Some(art) = fallback {
            let high_res = art
                .replace("-large.", "-t500x500.")
                .replace("-badge.", "-t500x500.")
                .replace("-small.", "-t500x500.");
            if let Some(obj) = pl.as_object_mut() {
                obj.insert("artwork_url".to_string(), serde_json::Value::String(high_res));
            }
        }
    } else if let Some(art) = pl.get("artwork_url").and_then(|v| v.as_str())
        && (art.contains("-large.") || art.contains("-badge.") || art.contains("-small.")) {
            let high_res = art
                .replace("-large.", "-t500x500.")
                .replace("-badge.", "-t500x500.")
                .replace("-small.", "-t500x500.");
            if let Some(obj) = pl.as_object_mut() {
                obj.insert("artwork_url".to_string(), serde_json::Value::String(high_res));
            }
        }
}

impl SoundCloudClient {
    pub fn new(
        app_handle: AppHandle,
        settings: Arc<RwLock<AppSettings>>,
        client: Arc<tokio::sync::RwLock<reqwest::Client>>,
        media_relay: Option<Arc<MediaRelay>>,
        cached_client_id: Option<String>,
    ) -> Self {
        Self {
            app_handle,
            settings,
            client,
            media_relay: Arc::new(tokio::sync::RwLock::new(media_relay)),
            cached_client_id: Arc::new(RwLock::new(cached_client_id)),
            cached_user_id: Arc::new(RwLock::new(None)),
            stream_cache: Arc::new(RwLock::new(HashMap::new())),
            negative_stream_cache: Arc::new(RwLock::new(HashMap::new())),
            response_cache: Arc::new(RwLock::new(HashMap::new())),
            in_flight: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            dd_refresh_lock: Arc::new(tokio::sync::Mutex::new(())),
            cache_epoch: Arc::new(AtomicU64::new(0)),
        }
    }

    pub async fn client(&self) -> reqwest::Client {
        self.client.read().await.clone()
    }

    pub async fn ensure_media_relay(&self) -> Result<Arc<MediaRelay>, String> {
        {
            let guard = self.media_relay.read().await;
            if let Some(ref relay) = *guard {
                return Ok(relay.clone());
            }
        }
        let mut guard = self.media_relay.write().await;
        if let Some(ref relay) = *guard {
            return Ok(relay.clone());
        }
        let started = MediaRelay::start(self.client.clone(), Some(self.settings.clone())).await?;
        *guard = Some(started.clone());
        Ok(started)
    }

    pub async fn shutdown(&self) {
        let mut guard = self.media_relay.write().await;
        if let Some(relay) = guard.take() {
            relay.shutdown();
        }
    }

    pub async fn rebuild_client(&self, proxy_enabled: bool, proxy_url: &str) -> Result<(), String> {
        let new_client = build_http_client(proxy_enabled, proxy_url)?;
        {
            let mut guard = self.client.write().await;
            *guard = new_client;
        }
        if proxy_enabled
            && let Err(e) = self.ensure_media_relay().await
        {
            log::warn!("Failed to ensure MediaRelay after client rebuild: {e}");
        }
        self.clear_all_caches();
        log::info!(
            "SoundCloudClient HTTP client rebuilt (proxy_enabled: {proxy_enabled}, proxy_url: {})",
            crate::settings::redact_proxy_url(proxy_url)
        );
        Ok(())
    }

    pub fn clear_all_caches(&self) {
        self.cache_epoch.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.cached_client_id.write() {
            *guard = None;
        }
        if let Ok(mut guard) = self.cached_user_id.write() {
            *guard = None;
        }
        if let Ok(mut guard) = self.stream_cache.write() {
            guard.clear();
        }
        if let Ok(mut guard) = self.negative_stream_cache.write() {
            guard.clear();
        }
        if let Ok(mut guard) = self.response_cache.write() {
            guard.clear();
        }
    }

    pub fn clear_user_cache(&self) {
        self.cache_epoch.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.cached_user_id.write() {
            *guard = None;
        }
        if let Ok(mut guard) = self.response_cache.write() {
            guard.clear();
        }
        if let Ok(mut guard) = self.stream_cache.write() {
            guard.clear();
        }
        if let Ok(mut guard) = self.negative_stream_cache.write() {
            guard.clear();
        }
    }

    pub fn clear_stream_cache(&self, track_id: Option<u64>) {
        if let Ok(mut guard) = self.stream_cache.write() {
            if let Some(id) = track_id {
                guard.remove(&id);
                log::info!("Cleared stream cache for track {id}");
            } else {
                guard.clear();
                log::info!("Cleared entire stream cache");
            }
        }
    }

    pub fn invalidate_response_cache(&self) {
        if let Ok(mut guard) = self.response_cache.write() {
            guard.clear();
        }
    }

    pub async fn get_cached_or_fetch_user_id(&self, oauth_token: &str) -> Result<u64, String> {
        if let Ok(guard) = self.cached_user_id.read()
            && let Some((ref tok, uid)) = *guard
                && tok == oauth_token {
                    return Ok(uid);
                }

        let me = self.get_me(oauth_token).await?;
        let uid = me
            .get("id")
            .and_then(|i| i.as_u64())
            .ok_or_else(|| "Failed to get user ID from profile".to_string())?;

        if let Ok(mut guard) = self.cached_user_id.write() {
            *guard = Some((oauth_token.to_string(), uid));
        }

        Ok(uid)
    }

    pub async fn get_client_id(&self) -> String {
        if let Ok(guard) = self.cached_client_id.read()
            && let Some(ref id) = *guard
                && !id.is_empty() {
                    return id.clone();
                }
        if let Ok(guard) = self.settings.read()
            && let Some(ref id) = guard.cached_client_id
                && !id.is_empty() {
                    if let Ok(mut c_guard) = self.cached_client_id.write() {
                        *c_guard = Some(id.clone());
                    }
                    return id.clone();
                }
        match self.extract_client_id().await {
            Ok(id) => id,
            Err(_) => FALLBACK_CLIENT_ID.to_string(),
        }
    }

    async fn extract_client_id_with_http(
        client: &reqwest::Client,
        datadome_cookie: Option<&str>,
    ) -> Result<String, String> {
        let mut req = client
            .get("https://soundcloud.com")
            .timeout(Duration::from_secs(20))
            .header(reqwest::header::USER_AGENT, CHROME_USER_AGENT)
            .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9");
        if let Some(dd) = datadome_cookie.filter(|s| !s.is_empty()) {
            req = req.header(reqwest::header::COOKIE, format!("datadome={dd}"));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("Failed to fetch soundcloud.com: {e}"))?;
        let status = resp.status();
        let html = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read soundcloud.com html: {e}"))?;

        if is_datadome_response(status, "text/html", &html) {
            return Err("SoundCloud returned a DataDome verification challenge while fetching client_id".to_string());
        }

        let script_urls = extract_script_urls(&html);
        if script_urls.is_empty() {
            return Err(format!("No asset script tags found in HTML (HTTP {status})"));
        }

        let mut seen = std::collections::HashSet::new();
        let mut unique_urls = Vec::new();
        for url in script_urls {
            if seen.insert(url.clone()) {
                unique_urls.push(url);
            }
        }
        unique_urls.reverse();

        for script_url in unique_urls {
            if let Ok(resp) = client
                .get(&script_url)
                .timeout(Duration::from_secs(15))
                .header(reqwest::header::USER_AGENT, CHROME_USER_AGENT)
                .send()
                .await
                && let Ok(js) = resp.text().await
                && let Some(client_id) = extract_client_id_from_js(&js)
            {
                return Ok(client_id);
            }
        }

        Err("Could not find client_id in asset scripts".to_string())
    }

    pub async fn extract_client_id(&self) -> Result<String, String> {
        let client = self.client().await;
        let dd = self
            .settings
            .read()
            .ok()
            .and_then(|s| s.datadome_cookie.clone());
        let client_id = Self::extract_client_id_with_http(&client, dd.as_deref()).await?;
        if let Ok(mut guard) = self.cached_client_id.write() {
            *guard = Some(client_id.clone());
        }
        if let Ok(mut lock) = self.settings.write() {
            lock.cached_client_id = Some(client_id.clone());
            let _ = lock.save(&self.app_handle);
        }
        log::info!("Extracted SoundCloud client_id: {client_id}");
        Ok(client_id)
    }

    pub async fn refresh_client_id(&self) -> Result<String, String> {
        self.extract_client_id().await
    }

    pub fn apply_browser_headers(
        &self,
        req: reqwest::RequestBuilder,
        oauth_token: Option<&str>,
    ) -> reqwest::RequestBuilder {
        let mut r = req
            .header(reqwest::header::USER_AGENT, CHROME_USER_AGENT)
            .header(reqwest::header::ORIGIN, "https://soundcloud.com")
            .header(reqwest::header::REFERER, "https://soundcloud.com/")
            .header(
                reqwest::header::ACCEPT,
                "application/json, text/javascript, */*; q=0.01",
            )
            .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9");

        if let Some(token) = oauth_token
            && !token.is_empty() {
                r = r.header(reqwest::header::AUTHORIZATION, format!("OAuth {}", token));
            }

        if let Ok(guard) = self.settings.read()
            && let Some(ref dd) = guard.datadome_cookie
                && !dd.is_empty() {
                    r = r.header(reqwest::header::COOKIE, format!("datadome={}", dd));
                }

        r
    }

    pub fn harvest_webview_cookies(win: &tauri::WebviewWindow) -> (Option<String>, Option<String>) {
        fn scan_cookies(
            cookies: Vec<tauri::webview::Cookie<'static>>,
            oauth_token: &mut Option<String>,
            datadome: &mut Option<String>,
        ) {
            for c in cookies {
                let name = c.name();
                if name == "oauth_token" && oauth_token.is_none() {
                    let val = c.value().trim().trim_matches('"');
                    if !val.is_empty() {
                        *oauth_token = Some(val.to_string());
                    }
                } else if name == "datadome" && datadome.is_none() {
                    let val = c.value().trim().trim_matches('"');
                    if !val.is_empty() {
                        *datadome = Some(val.to_string());
                    }
                }
            }
        }

        let mut oauth_token: Option<String> = None;
        let mut datadome: Option<String> = None;

        if let Ok(sc_url) = "https://soundcloud.com".parse::<url::Url>()
            && let Ok(cookies) = win.cookies_for_url(sc_url)
        {
            scan_cookies(cookies, &mut oauth_token, &mut datadome);
        }
        if (oauth_token.is_none() || datadome.is_none())
            && let Ok(api_url) = "https://api-v2.soundcloud.com".parse::<url::Url>()
            && let Ok(cookies) = win.cookies_for_url(api_url)
        {
            scan_cookies(cookies, &mut oauth_token, &mut datadome);
        }
        if (oauth_token.is_none() || datadome.is_none())
            && let Ok(cookies) = win.cookies()
        {
            scan_cookies(cookies, &mut oauth_token, &mut datadome);
        }

        (oauth_token, datadome)
    }

    pub async fn refresh_datadome_cookie(&self) -> Result<String, String> {
        let _dd_guard = self.dd_refresh_lock.lock().await;
        log::info!("refresh_datadome_cookie: starting isolated background refresh window...");
        if let Some(existing) = self.app_handle.get_webview_window("dd-refresh") {
            let _ = existing.destroy();
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        crate::cleanup_stale_webview_dirs(&self.app_handle, true);

        let (proxy_enabled, proxy_url) = self
            .settings
            .read()
            .map(|s| (s.proxy_enabled, s.proxy_url.clone()))
            .unwrap_or((false, String::new()));
        let webview_proxy = if proxy_enabled {
            match crate::sync_proxy_bridge(&self.app_handle, true, &proxy_url).await {
                Ok(ep) => ep,
                Err(e) => {
                    log::warn!("refresh_datadome_cookie: failed to ensure ProxyBridge: {e}");
                    self.app_handle
                        .try_state::<crate::WebviewProxyEndpoint>()
                        .and_then(|s| s.0.read().ok().and_then(|g| g.clone()))
                }
            }
        } else {
            None
        };

        #[cfg(windows)]
        let mut browser_args: Vec<String> = vec![
            "--disable-popup-blocking".to_string(),
            "--disable-blink-features=AutomationControlled".to_string(),
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection".to_string(),
        ];
        #[cfg(windows)]
        if let Some(ref endpoint) = webview_proxy {
            let clean = endpoint.trim_end_matches('/');
            browser_args.push(format!("--proxy-server={clean}"));
        }
        #[cfg(windows)]
        let browser_args_str = browser_args.join(" ");

        #[cfg(not(windows))]
        let mut non_windows_proxy_url: Option<url::Url> = None;
        #[cfg(not(windows))]
        if let Some(ref endpoint) = webview_proxy {
            let clean = endpoint.trim_end_matches('/');
            if let Ok(u) = url::Url::parse(clean) {
                non_windows_proxy_url = Some(u);
            }
        }

        // Isolated per-attempt data directory so WebView2 honors --proxy-server and fresh cookies.
        let dd_seq = DD_PROFILE_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
        let webview2_dir = self
            .app_handle
            .path()
            .app_local_data_dir()
            .ok()
            .map(|d| {
                let dir = d.join(format!("webview2_dd_{dd_seq}"));
                let _ = std::fs::create_dir_all(&dir);
                dir
            });

        let sc_login_url = "https://soundcloud.com"
            .parse::<url::Url>()
            .map_err(|e| format!("Invalid URL: {e}"))?;

        let mut builder = WebviewWindowBuilder::new(
            &self.app_handle,
            "dd-refresh",
            WebviewUrl::External(sc_login_url),
        )
        .title("SoundCloud Verification")
        .user_agent(CHROME_USER_AGENT)
        .visible(false)
        .inner_size(480.0, 680.0)
        .center();

        if let Some(ref dir) = webview2_dir {
            builder = builder.data_directory(dir.clone());
        }

        #[cfg(windows)]
        {
            builder = builder.additional_browser_args(&browser_args_str);
        }
        #[cfg(not(windows))]
        if let Some(url) = non_windows_proxy_url {
            builder = builder.proxy_url(url);
        }

        let win = builder
            .build()
            .map_err(|e| format!("Failed to create dd-refresh window: {e}"))?;

        let save_dd = |cookie_val: &str| {
            if let Ok(mut lock) = self.settings.write() {
                lock.datadome_cookie = Some(cookie_val.to_string());
                let _ = lock.save(&self.app_handle);
            }
        };

        // Phase 1: Silent harvest for up to 3.6 seconds
        for _ in 0..12 {
            tokio::time::sleep(Duration::from_millis(300)).await;
            if self.app_handle.get_webview_window("dd-refresh").is_none() {
                if let Some(ref dir) = webview2_dir {
                    let _ = std::fs::remove_dir_all(dir);
                }
                return Err("dd-refresh window closed early".to_string());
            }

            let (_, found) = Self::harvest_webview_cookies(&win);
            if let Some(cookie_val) = found {
                log::info!("Harvested fresh DataDome cookie silently in background!");
                save_dd(&cookie_val);
                let _ = win.destroy();
                if let Some(ref dir) = webview2_dir {
                    let _ = std::fs::remove_dir_all(dir);
                }
                return Ok(cookie_val);
            }
        }

        // Phase 2: If challenge is interactive, show window to user
        log::info!("Interactive challenge detected. Showing verification window...");
        let _ = win.show();
        let _ = win.set_focus();

        for _ in 0..30 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if self.app_handle.get_webview_window("dd-refresh").is_none() {
                break;
            }

            let (_, found) = Self::harvest_webview_cookies(&win);
            if let Some(cookie_val) = found {
                log::info!("User passed DataDome challenge. Saved fresh cookie!");
                save_dd(&cookie_val);
                let _ = win.destroy();
                if let Some(ref dir) = webview2_dir {
                    let _ = std::fs::remove_dir_all(dir);
                }
                return Ok(cookie_val);
            }
        }

        let _ = win.destroy();
        if let Some(ref dir) = webview2_dir {
            let _ = std::fs::remove_dir_all(dir);
        }
        Err("DataDome verification timed out or was closed by user".to_string())
    }

    async fn execute_api_request(
        &self,
        method: reqwest::Method,
        endpoint: &str,
        query_params: &[(&str, &str)],
        body: Option<serde_json::Value>,
        oauth_token: Option<&str>,
    ) -> Result<reqwest::Response, String> {
        let mut client_id = self.get_client_id().await;
        let client = self.client().await;

        for attempt in 0..2 {
            let mut req = client
                .request(method.clone(), endpoint)
                .timeout(Duration::from_secs(20));
            if !endpoint.contains("client_id=") {
                req = req.query(&[("client_id", client_id.as_str())]);
            }
            if !query_params.is_empty() {
                req = req.query(query_params);
            }

            req = self.apply_browser_headers(req, oauth_token);

            if let Some(ref b) = body {
                req = req.header(reqwest::header::CONTENT_TYPE, "application/json");
                req = req.json(b);
            }

            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if (status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN)
                        && attempt == 0
                    {
                        log::warn!("SoundCloud API {status} on {endpoint}, refreshing client_id...");
                        if let Ok(new_id) = self.refresh_client_id().await {
                            client_id = new_id;
                            continue;
                        }
                    }
                    return Ok(resp);
                }
                Err(e) => {
                    if attempt == 1 {
                        return Err(format!("SoundCloud API network error: {e}"));
                    }
                }
            }
        }

        Err("SoundCloud API request failed after retry".to_string())
    }

    async fn execute_api_json<T: DeserializeOwned>(
        &self,
        method: reqwest::Method,
        endpoint: &str,
        query_params: &[(&str, &str)],
        body: Option<serde_json::Value>,
        oauth_token: Option<&str>,
        context: &str,
    ) -> Result<T, String> {
        let resp = self
            .execute_api_request(method.clone(), endpoint, query_params, body.clone(), oauth_token)
            .await?;

        match read_and_parse_json(resp, context).await {
            Ok(parsed) => Ok(parsed),
            Err(ApiJsonError::DataDome(msg)) => {
                log::warn!("DataDome challenge on {context}, refreshing datadome cookie...");
                if self.refresh_datadome_cookie().await.is_ok() {
                    let retry_resp = self
                        .execute_api_request(method, endpoint, query_params, body, oauth_token)
                        .await?;
                    return read_and_parse_json(retry_resp, context)
                        .await
                        .map_err(|e| e.into_message());
                }
                Err(msg)
            }
            Err(e) => Err(e.into_message()),
        }
    }

    pub async fn get_discover(&self, oauth_token: Option<&str>) -> Result<serde_json::Value, String> {
        let epoch = self.cache_epoch.load(Ordering::SeqCst);
        let cache_key = format!("discover:{}", oauth_token.unwrap_or("guest"));
        if let Ok(guard) = self.response_cache.read()
            && let Some((val, timestamp)) = guard.get(&cache_key)
                && timestamp.elapsed() < Duration::from_secs(45) {
                    return Ok(val.clone());
                }

        let main_res: Result<serde_json::Value, String> = self
            .execute_api_json(
                reqwest::Method::GET,
                "https://api-v2.soundcloud.com/mixed-selections",
                &[("limit", "10")],
                None,
                oauth_token,
                "Discover selections",
            )
            .await;

        if let Ok(mut json) = main_res {
            if let Some(collection) = json.get_mut("collection").and_then(|c| c.as_array_mut()) {
                for section in collection {
                    let items_opt = if let Some(items) = section
                        .get_mut("items")
                        .and_then(|i| i.get_mut("collection"))
                        .and_then(|c| c.as_array_mut())
                    {
                        Some(items)
                    } else {
                        section
                            .get_mut("items")
                            .and_then(|i| i.as_array_mut())
                    };

                    if let Some(items) = items_opt {
                        for item in items.iter_mut() {
                            apply_playlist_artwork_fallback(item);
                        }

                        let mut seen_keys = std::collections::HashSet::new();
                        let mut deduped: Vec<serde_json::Value> = Vec::new();

                        for item in items.drain(..) {
                            let kind = item
                                .get("kind")
                                .and_then(|k| k.as_str())
                                .unwrap_or(if item.get("tracks").is_some() { "playlist" } else { "track" });
                            let urn_opt = item
                                .get("urn")
                                .and_then(|u| u.as_str())
                                .filter(|s| !s.is_empty());
                            let id_num = item.get("id").and_then(|i| i.as_u64()).filter(|&n| n > 0);
                            let id_key = if let Some(urn) = urn_opt {
                                urn.to_string()
                            } else if let Some(id_val) = id_num {
                                format!("{kind}:{id_val}")
                            } else {
                                String::new()
                            };

                            let title = item
                                .get("title")
                                .and_then(|t| t.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_lowercase();
                            let username = item
                                .get("user")
                                .and_then(|u| u.get("username"))
                                .and_then(|u| u.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_lowercase();
                            let meta_key = if !title.is_empty() {
                                format!("meta:{title}:{username}")
                            } else {
                                String::new()
                            };

                            let is_duplicate = (!id_key.is_empty() && seen_keys.contains(&id_key))
                                || (!meta_key.is_empty() && seen_keys.contains(&meta_key));

                            if !is_duplicate {
                                if !id_key.is_empty() {
                                    seen_keys.insert(id_key);
                                }
                                if !meta_key.is_empty() {
                                    seen_keys.insert(meta_key);
                                }
                                deduped.push(item);
                            }
                        }

                        *items = deduped;
                    }
                }
            }

            if self.cache_epoch.load(Ordering::SeqCst) == epoch
                && let Ok(mut guard) = self.response_cache.write()
            {
                guard.insert(cache_key, (json.clone(), Instant::now()));
            }
            return Ok(json);
        }

        let mut fallback_json: serde_json::Value = self
            .execute_api_json(
                reqwest::Method::GET,
                "https://api-v2.soundcloud.com/search/tracks",
                &[("q", "top"), ("limit", "20")],
                None,
                oauth_token,
                "Discover fallback",
            )
            .await?;

        if let Some(collection) = fallback_json.get_mut("collection").and_then(|c| c.as_array_mut()) {
            for item in collection {
                apply_playlist_artwork_fallback(item);
            }
        }

        if self.cache_epoch.load(Ordering::SeqCst) == epoch
            && let Ok(mut guard) = self.response_cache.write()
        {
            guard.insert(cache_key, (fallback_json.clone(), Instant::now()));
        }

        Ok(fallback_json)
    }

    pub async fn get_stream(&self, oauth_token: &str) -> Result<serde_json::Value, String> {
        let epoch = self.cache_epoch.load(Ordering::SeqCst);
        let cache_key = format!("stream:{oauth_token}");
        if let Ok(guard) = self.response_cache.read()
            && let Some((val, timestamp)) = guard.get(&cache_key)
                && timestamp.elapsed() < Duration::from_secs(45) {
                    return Ok(val.clone());
                }

        let json: serde_json::Value = self
            .execute_api_json(
                reqwest::Method::GET,
                "https://api-v2.soundcloud.com/stream",
                &[("limit", "25")],
                None,
                Some(oauth_token),
                "Stream feed",
            )
            .await?;

        if self.cache_epoch.load(Ordering::SeqCst) == epoch
            && let Ok(mut guard) = self.response_cache.write()
        {
            guard.insert(cache_key, (json.clone(), Instant::now()));
        }

        Ok(json)
    }

    pub async fn search(
        &self,
        query: &str,
        kind: Option<&str>,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        match kind.unwrap_or("all") {
            "tracks" => {
                self.execute_api_json(
                    reqwest::Method::GET,
                    "https://api-v2.soundcloud.com/search/tracks",
                    &[("q", query), ("limit", "30")],
                    None,
                    oauth_token,
                    "Search tracks",
                )
                .await
            }
            "playlists" => {
                self.execute_api_json(
                    reqwest::Method::GET,
                    "https://api-v2.soundcloud.com/search/playlists",
                    &[("q", query), ("limit", "30")],
                    None,
                    oauth_token,
                    "Search playlists",
                )
                .await
            }
            "users" => {
                self.execute_api_json(
                    reqwest::Method::GET,
                    "https://api-v2.soundcloud.com/search/users",
                    &[("q", query), ("limit", "30")],
                    None,
                    oauth_token,
                    "Search users",
                )
                .await
            }
            _ => {
                let tracks_params = [("q", query), ("limit", "20")];
                let playlists_params = [("q", query), ("limit", "10")];
                let users_params = [("q", query), ("limit", "10")];

                let (tracks_res, playlists_res, users_res) = tokio::join!(
                    self.execute_api_json::<serde_json::Value>(
                        reqwest::Method::GET,
                        "https://api-v2.soundcloud.com/search/tracks",
                        &tracks_params,
                        None,
                        oauth_token,
                        "Search tracks",
                    ),
                    self.execute_api_json::<serde_json::Value>(
                        reqwest::Method::GET,
                        "https://api-v2.soundcloud.com/search/playlists",
                        &playlists_params,
                        None,
                        oauth_token,
                        "Search playlists",
                    ),
                    self.execute_api_json::<serde_json::Value>(
                        reqwest::Method::GET,
                        "https://api-v2.soundcloud.com/search/users",
                        &users_params,
                        None,
                        oauth_token,
                        "Search users",
                    )
                );

                if let (Err(e1), Err(_), Err(_)) = (&tracks_res, &playlists_res, &users_res) {
                    return Err(e1.clone());
                }

                let tracks_val = tracks_res.unwrap_or_else(|_| serde_json::json!({"collection": []}));
                let playlists_val = playlists_res.unwrap_or_else(|_| serde_json::json!({"collection": []}));
                let users_val = users_res.unwrap_or_else(|_| serde_json::json!({"collection": []}));

                Ok(serde_json::json!({
                    "tracks": tracks_val.get("collection").unwrap_or(&serde_json::json!([])),
                    "playlists": playlists_val.get("collection").unwrap_or(&serde_json::json!([])),
                    "users": users_val.get("collection").unwrap_or(&serde_json::json!([])),
                }))
            }
        }
    }

    async fn fetch_paginated_collection(
        &self,
        initial_url: &str,
        max_pages: usize,
        oauth_token: Option<&str>,
    ) -> Vec<serde_json::Value> {
        let mut results = Vec::new();
        let mut next_url = Some(initial_url.to_string());
        let mut pages = 0;
        let mut dd_refreshed = false;

        while let Some(current_url) = next_url {
            if pages >= max_pages {
                break;
            }
            pages += 1;

            let resp = match self
                .execute_api_request(
                    reqwest::Method::GET,
                    &current_url,
                    &[],
                    None,
                    oauth_token,
                )
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    log::warn!("Failed to fetch page {} from {}: {e}", pages, current_url);
                    break;
                }
            };

            let status = resp.status();
            let content_type = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let body = match resp.text().await {
                Ok(b) => b,
                Err(e) => {
                    log::warn!(
                        "Failed to read response body ({}) for {}: {e}",
                        status,
                        current_url
                    );
                    break;
                }
            };

            if is_datadome_response(status, &content_type, &body) && !dd_refreshed {
                dd_refreshed = true;
                log::warn!("DataDome challenge on paginated endpoint {current_url}; refreshing cookie...");
                if self.refresh_datadome_cookie().await.is_ok() {
                    pages -= 1;
                    next_url = Some(current_url);
                    continue;
                }
                break;
            }

            if !status.is_success() {
                let snippet: String = body.chars().take(300).collect();
                log::warn!(
                    "Paginated playlist endpoint returned HTTP {} for {}: {}",
                    status,
                    current_url,
                    snippet
                );
                break;
            }

            if is_html_body(&content_type, &body) {
                log::warn!(
                    "Paginated endpoint returned HTML instead of JSON (HTTP {}) for {}",
                    status,
                    current_url
                );
                break;
            }

            let json: serde_json::Value = match serde_json::from_str(&body) {
                Ok(j) => j,
                Err(e) => {
                    let snippet: String = body.chars().take(300).collect();
                    log::warn!(
                        "Failed to parse JSON (HTTP {}) for {}: {e}; body={}",
                        status,
                        current_url,
                        snippet
                    );
                    break;
                }
            };

            let items_opt = json
                .get("collection")
                .and_then(|c| c.as_array())
                .or_else(|| json.as_array());

            if let Some(items) = items_opt {
                for item in items {
                    let obj = item
                        .get("playlist")
                        .filter(|p| p.is_object())
                        .or_else(|| item.get("track").filter(|t| t.is_object()))
                        .unwrap_or(item);
                    if obj.is_object() {
                        results.push(obj.clone());
                    }
                }
            }

            next_url = json
                .get("next_href")
                .and_then(|n| n.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
        }

        results
    }

    pub async fn get_user_tracks(
        &self,
        user_id: u64,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let url = format!("https://api-v2.soundcloud.com/users/{user_id}/tracks");
        let query_params = &[
            ("limit", "50"),
            ("linked_partitioning", "1"),
        ];
        self.execute_api_json(
            reqwest::Method::GET,
            &url,
            query_params,
            None,
            oauth_token,
            "Get user tracks",
        )
        .await
    }

    pub async fn get_library(
        &self,
        user_id: u64,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let epoch = self.cache_epoch.load(Ordering::SeqCst);
        let cache_key = format!("library:{user_id}:{}", oauth_token.unwrap_or(""));
        if let Ok(guard) = self.response_cache.read()
            && let Some((val, timestamp)) = guard.get(&cache_key)
                && timestamp.elapsed() < Duration::from_secs(45) {
                    return Ok(val.clone());
                }

        let user_created_playlists_url = format!(
            "https://api-v2.soundcloud.com/users/{user_id}/playlists_without_albums?limit=200&linked_partitioning=1"
        );
        let liked_playlists_url = format!(
            "https://api-v2.soundcloud.com/users/{user_id}/playlist_likes?limit=200&linked_partitioning=1"
        );
        let likes_url = format!("https://api-v2.soundcloud.com/users/{user_id}/track_likes");

        let query_params: &[(&str, &str)] = &[
            ("limit", "200"),
            ("offset", "0"),
            ("linked_partitioning", "1"),
        ];

        let (likes_res, created_pls, liked_pls) = tokio::join!(
            self.execute_api_json::<serde_json::Value>(
                reqwest::Method::GET,
                &likes_url,
                query_params,
                None,
                oauth_token,
                "Library likes",
            ),
            self.fetch_paginated_collection(&user_created_playlists_url, 5, oauth_token),
            self.fetch_paginated_collection(&liked_playlists_url, 5, oauth_token),
        );

        let likes_val = likes_res?;

        let mut all_playlists: Vec<serde_json::Value> = Vec::new();
        let mut seen_keys = std::collections::HashSet::new();

        for pl in created_pls.into_iter().chain(liked_pls) {
            let dedup_key = pl
                .get("id")
                .and_then(|i| i.as_u64())
                .filter(|&id| id > 0)
                .map(|id| format!("id:{id}"))
                .or_else(|| {
                    pl.get("urn")
                        .and_then(|u| u.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|u| format!("urn:{u}"))
                });

            if let Some(key) = dedup_key
                && seen_keys.insert(key)
            {
                all_playlists.push(pl);
            }
        }

        for pl in all_playlists.iter_mut() {
            apply_playlist_artwork_fallback(pl);
        }

        let likes_array = likes_val
            .get("collection")
            .cloned()
            .unwrap_or_else(|| {
                likes_val
                    .as_array()
                    .cloned()
                    .map(serde_json::Value::Array)
                    .unwrap_or(serde_json::json!([]))
            });

        let res = serde_json::json!({
            "likes": likes_array,
            "playlists": all_playlists,
        });

        if self.cache_epoch.load(Ordering::SeqCst) == epoch
            && let Ok(mut guard) = self.response_cache.write()
        {
            guard.insert(cache_key, (res.clone(), Instant::now()));
        }

        Ok(res)
    }

    pub async fn get_playlist(
        &self,
        id_or_urn: &str,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let trimmed = id_or_urn.trim();
        let is_system_or_urn =
            trimmed.starts_with("soundcloud:system-playlists:") || trimmed.parse::<u64>().is_err();

        let (url, rep_params): (String, &[(&str, &str)]) = if is_system_or_urn {
            let encoded_urn = encode_path_segment(trimmed);
            (
                format!("https://api-v2.soundcloud.com/system-playlists/{encoded_urn}"),
                &[],
            )
        } else {
            (
                format!("https://api-v2.soundcloud.com/playlists/{trimmed}"),
                &[("representation", "full")],
            )
        };

        let mut playlist_json: serde_json::Value = self
            .execute_api_json(
                reqwest::Method::GET,
                &url,
                rep_params,
                None,
                oauth_token,
                "Get playlist",
            )
            .await?;

        if let Some(tracks) = playlist_json.get_mut("tracks").and_then(|t| t.as_array_mut()) {
            let mut stub_ids: Vec<u64> = Vec::new();
            for item in tracks.iter() {
                let has_title = item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| !s.is_empty());
                let has_media = item
                    .get("media")
                    .and_then(|m| m.get("transcodings"))
                    .and_then(|t| t.as_array())
                    .is_some_and(|arr| !arr.is_empty());
                let has_auth = item
                    .get("track_authorization")
                    .and_then(|a| a.as_str())
                    .is_some_and(|s| !s.is_empty());

                if (!has_title || !has_media || !has_auth)
                    && let Some(id) = item.get("id").and_then(|i| i.as_u64())
                {
                    stub_ids.push(id);
                }
            }

            if !stub_ids.is_empty() {
                let chunks: Vec<String> = stub_ids
                    .chunks(50)
                    .map(|c| {
                        c.iter()
                            .map(|id| id.to_string())
                            .collect::<Vec<String>>()
                            .join(",")
                    })
                    .collect();

                let futures = chunks.iter().map(|ids_str| {
                    let client = self.clone();
                    async move {
                        let ids_params: &[(&str, &str)] = &[("ids", ids_str)];
                        if let Ok(track_batch_resp) = client
                            .execute_api_request(
                                reqwest::Method::GET,
                                "https://api-v2.soundcloud.com/tracks",
                                ids_params,
                                None,
                                oauth_token,
                            )
                            .await
                        {
                            track_batch_resp.json::<Vec<serde_json::Value>>().await.ok()
                        } else {
                            None
                        }
                    }
                });

                let results = futures::future::join_all(futures).await;
                let mut hydrated_map = std::collections::HashMap::new();
                for full_tracks in results.into_iter().flatten() {
                    for full_track in full_tracks {
                        if let Some(target_id) = full_track.get("id").and_then(|i| i.as_u64()) {
                            hydrated_map.insert(target_id, full_track);
                        }
                    }
                }

                for slot in tracks.iter_mut() {
                    if let Some(id) = slot.get("id").and_then(|i| i.as_u64())
                        && let Some(hydrated) = hydrated_map.get(&id)
                    {
                        *slot = hydrated.clone();
                    }
                }
            }
        }

        apply_playlist_artwork_fallback(&mut playlist_json);
        Ok(playlist_json)
    }

    pub async fn get_track(
        &self,
        track_id: u64,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let url = format!("https://api-v2.soundcloud.com/tracks/{track_id}");
        self.execute_api_json(
            reqwest::Method::GET,
            &url,
            &[],
            None,
            oauth_token,
            "Get track",
        )
        .await
    }

    pub async fn toggle_like(
        &self,
        me_id: u64,
        track_id: u64,
        liked: bool,
        oauth_token: &str,
    ) -> Result<bool, String> {
        let url = format!("https://api-v2.soundcloud.com/users/{me_id}/track_likes/{track_id}");
        let method = if liked {
            reqwest::Method::PUT
        } else {
            reqwest::Method::DELETE
        };

        let body = if liked {
            Some(serde_json::json!({}))
        } else {
            None
        };

        let resp = self
            .execute_api_request(method.clone(), &url, &[], body.clone(), Some(oauth_token))
            .await?;

        let status = resp.status();
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        if status.is_success() || status == reqwest::StatusCode::NO_CONTENT {
            self.invalidate_response_cache();
            log::info!("Toggled like for track {track_id} (liked={liked})");
            return Ok(liked);
        }

        let body_text = resp.text().await.unwrap_or_default();
        if is_datadome_response(status, &content_type, &body_text) {
            log::warn!("DataDome challenge detected on toggle_like. Refreshing datadome cookie...");
            if let Ok(new_dd) = self.refresh_datadome_cookie().await {
                log::info!("Fresh datadome cookie acquired ({new_dd:?}). Retrying toggle_like once...");
                let retry_resp = self
                    .execute_api_request(method, &url, &[], body, Some(oauth_token))
                    .await?;
                let retry_status = retry_resp.status();
                if retry_status.is_success() || retry_status == reqwest::StatusCode::NO_CONTENT {
                    self.invalidate_response_cache();
                    log::info!("Toggled like on retry for track {track_id} (liked={liked})");
                    return Ok(liked);
                } else {
                    let retry_body = retry_resp.text().await.unwrap_or_default();
                    log::error!("Retry of toggle_like failed: status={retry_status}, body={retry_body}");
                    return Err(format!("Toggle like failed after DataDome refresh: status={retry_status}"));
                }
            }
        }

        if is_html_body(&content_type, &body_text) {
            log::error!("SoundCloud returned HTML ({status}) on toggle_like for track {track_id}");
            return Err(format!(
                "Toggle like blocked by non-JSON HTML response (HTTP {status})"
            ));
        }

        log::error!(
            "SoundCloud API {status} on toggle_like for track {track_id} (liked={liked}): {body_text}"
        );
        Err(format!(
            "Toggle like failed with status {}: {}",
            status, body_text
        ))
    }

    async fn resolve_stream_inner(
        &self,
        track_id: u64,
        oauth_token: Option<&str>,
    ) -> Result<StreamResolution, String> {
        let track_json = self.get_track(track_id, oauth_token).await?;

        let transcodings = match track_json
            .get("media")
            .and_then(|m| m.get("transcodings"))
            .and_then(|t| t.as_array())
        {
            Some(t) if !t.is_empty() => t,
            _ => {
                return Err(format!("Track {track_id} has no media transcodings"));
            }
        };

        let track_auth = track_json
            .get("track_authorization")
            .and_then(|a| a.as_str())
            .unwrap_or("");
        let duration_ms = track_json.get("duration").and_then(|d| d.as_u64());

        let mut scored_transcodings: Vec<(i32, &serde_json::Value)> = Vec::new();
        for tc in transcodings {
            let protocol = tc
                .get("format")
                .and_then(|f| f.get("protocol"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let mime = tc
                .get("format")
                .and_then(|f| f.get("mime_type"))
                .and_then(|m| m.as_str())
                .unwrap_or("");

            let is_encrypted = protocol.contains("encrypted");
            if mime.contains("ogg") {
                continue;
            }

            let score = if protocol == "progressive" && (mime.contains("mpeg") || mime.contains("mp3")) {
                100
            } else if protocol == "hls" && (mime.contains("mpeg") || mime.contains("mp3")) {
                80
            } else if protocol == "hls" && (mime.contains("mp4") || mime.contains("aac")) {
                60
            } else if protocol == "progressive" {
                40
            } else if protocol.contains("ctr-encrypted") {
                25
            } else if protocol.contains("cbc-encrypted") {
                20
            } else if is_encrypted {
                15
            } else {
                0
            };

            if score > 0 {
                scored_transcodings.push((score, tc));
            }
        }

        scored_transcodings.sort_by_key(|a| std::cmp::Reverse(a.0));

        if scored_transcodings.is_empty() {
            let monetization = track_json
                .get("monetization_model")
                .and_then(|m| m.as_str())
                .unwrap_or("");
            let policy = track_json
                .get("policy")
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let is_go_plus = monetization.contains("SUB_")
                || monetization == "PREMIUM"
                || policy == "SNIP"
                || policy == "BLOCK";

            if is_go_plus {
                log::warn!("Track {track_id} requires SoundCloud Go+ subscription (monetization: {monetization}, policy: {policy})");
                return Err("SoundCloud Go+ track (subscription required)".to_string());
            } else {
                log::warn!("Track {track_id} is a protected stream (DRM not supported in WebView2; policy: {policy}, monetization: {monetization})");
                return Err("Protected stream (DRM not supported in WebView2)".to_string());
            }
        }

        let mut client_id = self.get_client_id().await;
        let mut client_id_refreshed = false;
        let mut last_transport_err: Option<String> = None;
        let client = self.client().await;

        for (score, tc) in &scored_transcodings {
            if let Some(url) = tc.get("url").and_then(|u| u.as_str()) {
                let protocol_str = tc
                    .get("format")
                    .and_then(|f| f.get("protocol"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("unknown");
                let mime_str = tc
                    .get("format")
                    .and_then(|f| f.get("mime_type"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("audio/mpeg");

                let mut req = client
                    .get(url)
                    .timeout(Duration::from_secs(20))
                    .query(&[("client_id", &client_id)]);
                if !track_auth.is_empty() {
                    req = req.query(&[("track_authorization", track_auth)]);
                }
                req = self.apply_browser_headers(req, oauth_token);

                let mut resp_opt = match req.send().await {
                    Ok(r) => Some(r),
                    Err(e) => {
                        last_transport_err = Some(format!("Transcoding network/proxy error: {e}"));
                        None
                    }
                };

                if let Some(ref resp) = resp_opt {
                    let status = resp.status();
                    if status == reqwest::StatusCode::PROXY_AUTHENTICATION_REQUIRED {
                        log::error!("Proxy authentication required (HTTP 407)");
                        return Err("Proxy authentication failed (HTTP 407). Please verify username and password in Settings.".to_string());
                    }
                    if (status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN)
                        && !client_id_refreshed
                    {
                        log::info!("Transcoding request returned {status}, refreshing client_id...");
                        if let Ok(new_id) = self.refresh_client_id().await {
                            client_id = new_id;
                            client_id_refreshed = true;
                            let mut retry_req = client
                                .get(url)
                                .timeout(Duration::from_secs(20))
                                .query(&[("client_id", &client_id)]);
                            if !track_auth.is_empty() {
                                retry_req = retry_req.query(&[("track_authorization", track_auth)]);
                            }
                            retry_req = self.apply_browser_headers(retry_req, oauth_token);
                            resp_opt = match retry_req.send().await {
                                Ok(r) => Some(r),
                                Err(e) => {
                                    last_transport_err = Some(format!("Transcoding network/proxy retry error: {e}"));
                                    None
                                }
                            };
                        }
                    }
                }

                if let Some(resp) = resp_opt {
                    match read_and_parse_json::<serde_json::Value>(resp, "Resolve transcoding").await {
                        Ok(stream_obj) => {
                            if let Some(stream_url) = stream_obj.get("url").and_then(|u| u.as_str()) {
                                let normalized_protocol = if protocol_str == "progressive"
                                    || (stream_url.contains(".mp3") && !stream_url.contains(".m3u8"))
                                {
                                    "progressive".to_string()
                                } else {
                                    "hls".to_string()
                                };

                                let is_encrypted = protocol_str.contains("encrypted");
                                let license_auth_token = stream_obj
                                    .get("licenseAuthToken")
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string());

                                let proxy_enabled = self.settings.read().map(|s| s.proxy_enabled).unwrap_or(false);
                                let relay_opt = if proxy_enabled {
                                    Some(self.ensure_media_relay().await.map_err(|e| {
                                        format!("Proxy relay error: failed to start MediaRelay: {e}")
                                    })?)
                                } else {
                                    None
                                };

                                let final_stream_url = if let Some(ref relay) = relay_opt {
                                    relay.create_relay_url(stream_url)
                                } else {
                                    stream_url.to_string()
                                };

                                let final_license_url = if is_encrypted {
                                    if let Some(ref token) = license_auth_token {
                                        let raw_lic = format!("https://license.media-streaming.soundcloud.cloud/playback/widevine?license_token={token}");
                                        if let Some(ref relay) = relay_opt {
                                            Some(relay.create_relay_url(&raw_lic))
                                        } else {
                                            Some(raw_lic)
                                        }
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                };

                                let resolution = StreamResolution {
                                    stream_url: final_stream_url,
                                    protocol: normalized_protocol.clone(),
                                    mime_type: mime_str.to_string(),
                                    duration_ms,
                                    encrypted: is_encrypted,
                                    license_url: final_license_url,
                                    license_auth_token,
                                };

                                log::info!(
                                    "Resolved stream for track {track_id}: protocol={}, mime={}, encrypted={}, score={score} (proxy: {proxy_enabled})",
                                    normalized_protocol,
                                    mime_str,
                                    is_encrypted
                                );

                                return Ok(resolution);
                            }
                        }
                        Err(ApiJsonError::Recoverable(msg)) if msg.contains("HTTP 407") => {
                            return Err(msg);
                        }
                        Err(e) => {
                            let msg = e.into_message();
                            log::warn!(
                                "Transcoding resolution failed for track {track_id} from {url} (oauth: {}): {msg}",
                                oauth_token.is_some()
                            );
                        }
                    }
                }
            }
        }

        if let Some(transport_err) = last_transport_err {
            return Err(transport_err);
        }

        let monetization = track_json
            .get("monetization_model")
            .and_then(|m| m.as_str())
            .unwrap_or("");
        let policy = track_json
            .get("policy")
            .and_then(|p| p.as_str())
            .unwrap_or("");
        let is_go_plus = monetization.contains("SUB_")
            || monetization == "PREMIUM"
            || policy == "SNIP"
            || policy == "BLOCK";

        if is_go_plus {
            log::warn!("Track {track_id} requires SoundCloud Go+ subscription (monetization: {monetization}, policy: {policy})");
            return Err("SoundCloud Go+ track (subscription required)".to_string());
        }

        log::warn!(
            "Failed to resolve any stream transcoding for track {track_id} (oauth: {})",
            oauth_token.is_some()
        );
        Err(format!(
            "Track stream unavailable (404 / no playable transcoding for track {track_id})"
        ))
    }

    pub async fn resolve_stream(
        &self,
        track_id: u64,
        oauth_token: Option<&str>,
    ) -> Result<StreamResolution, String> {
        if let Ok(guard) = self.stream_cache.read()
            && let Some((res, timestamp)) = guard.get(&track_id)
                && timestamp.elapsed() < Duration::from_secs(600) {
                    return Ok(res.clone());
                }

        if let Ok(guard) = self.negative_stream_cache.read()
            && let Some((err_msg, timestamp)) = guard.get(&track_id)
                && timestamp.elapsed() < Duration::from_secs(60) {
                    log::info!("Track {track_id} returned from negative stream cache (TTL 60s): {err_msg}");
                    return Err(err_msg.clone());
                }

        // Single-flight in-flight request deduplication per track_id
        let (mut rx, is_leader, tx_opt) = {
            let mut guard = self.in_flight.lock().await;
            if let Some(existing_rx) = guard.get(&track_id) {
                (existing_rx.clone(), false, None)
            } else {
                let (tx, rx) = tokio::sync::watch::channel(None);
                guard.insert(track_id, rx.clone());
                (rx, true, Some(tx))
            }
        };

        if !is_leader {
            log::info!("[SoundCloudClient] Sharing in-flight resolve_stream request for track {track_id}");
            while rx.borrow().is_none() {
                if rx.changed().await.is_err() {
                    break;
                }
            }
            if let Some(ref res) = *rx.borrow() {
                return res.clone();
            }
            return Err("In-flight stream resolution was cancelled".to_string());
        }

        let result = self.execute_resolve_stream(track_id, oauth_token).await;

        {
            let mut guard = self.in_flight.lock().await;
            guard.remove(&track_id);
        }
        if let Some(tx) = tx_opt {
            let _ = tx.send(Some(result.clone()));
        }

        result
    }

    async fn execute_resolve_stream(
        &self,
        track_id: u64,
        oauth_token: Option<&str>,
    ) -> Result<StreamResolution, String> {
        let epoch = self.cache_epoch.load(Ordering::SeqCst);
        let proxy_enabled = self.settings.read().map(|s| s.proxy_enabled).unwrap_or(false);
        if proxy_enabled {
            log::info!("[SoundCloudClient] Resolving stream for track {track_id} (Proxy active)");
        }

        match self.resolve_stream_inner(track_id, oauth_token).await {
            Ok(res) => {
                if self.cache_epoch.load(Ordering::SeqCst) == epoch
                    && let Ok(mut guard) = self.stream_cache.write()
                {
                    guard.insert(track_id, (res.clone(), Instant::now()));
                }
                Ok(res)
            }
            Err(stage1_err) => {
                let is_terminal_drm = stage1_err.contains("Protected stream")
                    || stage1_err.contains("DRM not supported")
                    || stage1_err.contains("Go+");
                let is_proxy_or_network_failure = stage1_err.contains("Proxy authentication failed")
                    || stage1_err.contains("HTTP 407")
                    || stage1_err.contains("Proxy relay error")
                    || stage1_err.contains("network error")
                    || stage1_err.contains("network/proxy")
                    || stage1_err.contains("DataDome");

                if oauth_token.is_some() && !is_terminal_drm && !is_proxy_or_network_failure {
                    log::info!(
                        "Falling back to unauthenticated stream resolution for track {track_id} (authenticated error: {stage1_err})"
                    );
                    match self.resolve_stream_inner(track_id, None).await {
                        Ok(guest_res) => {
                            log::info!("Successfully resolved track {track_id} via unauthenticated fallback!");
                            if self.cache_epoch.load(Ordering::SeqCst) == epoch
                                && let Ok(mut guard) = self.stream_cache.write()
                            {
                                guard.insert(track_id, (guest_res.clone(), Instant::now()));
                            }
                            return Ok(guest_res);
                        }
                        Err(guest_err) => {
                            log::warn!("Unauthenticated fallback also failed for track {track_id}: {guest_err}");
                        }
                    }
                }

                if !is_proxy_or_network_failure
                    && self.cache_epoch.load(Ordering::SeqCst) == epoch
                    && let Ok(mut guard) = self.negative_stream_cache.write()
                {
                    guard.insert(track_id, (stage1_err.clone(), Instant::now()));
                }
                Err(stage1_err)
            }
        }
    }

    pub async fn get_me_checked(&self, oauth_token: &str) -> Result<serde_json::Value, GetMeError> {
        let client = self.client().await;
        let mut client_id = self.get_client_id().await;
        let mut cid_refreshed = false;
        let mut dd_refreshed = false;

        for _ in 0..3 {
            let req = client
                .get("https://api-v2.soundcloud.com/me")
                .timeout(Duration::from_secs(20))
                .query(&[("client_id", client_id.as_str())]);
            let req = self.apply_browser_headers(req, Some(oauth_token));

            let resp = req
                .send()
                .await
                .map_err(|e| GetMeError::Recoverable(format!("SoundCloud API network error: {e}")))?;

            match read_and_parse_json::<serde_json::Value>(resp, "Get profile (/me)").await {
                Ok(val) => return Ok(val),
                Err(ApiJsonError::DataDome(msg)) => {
                    if !dd_refreshed {
                        dd_refreshed = true;
                        log::warn!("DataDome challenge on /me; attempting isolated dd-refresh...");
                        if self.refresh_datadome_cookie().await.is_ok() {
                            continue;
                        }
                    }
                    return Err(GetMeError::Recoverable(msg));
                }
                Err(ApiJsonError::Unauthorized(msg)) => {
                    if !cid_refreshed {
                        cid_refreshed = true;
                        // Confirm 401 is not caused by a stale client_id before invalidating oauth_token.
                        match self.refresh_client_id().await {
                            Ok(new_id) => {
                                client_id = new_id;
                                continue;
                            }
                            Err(e) => {
                                return Err(GetMeError::Recoverable(format!(
                                    "Could not verify session (client_id refresh failed): {e}"
                                )));
                            }
                        }
                    }
                    return Err(GetMeError::Unauthorized(msg));
                }
                Err(ApiJsonError::Recoverable(msg)) => {
                    return Err(GetMeError::Recoverable(msg));
                }
            }
        }

        Err(GetMeError::Recoverable(
            "SoundCloud session check failed after retry".to_string(),
        ))
    }

    pub async fn get_me(&self, oauth_token: &str) -> Result<serde_json::Value, String> {
        self.get_me_checked(oauth_token)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn resolve_stream_for_proxy_test(
        &self,
        test_client: &reqwest::Client,
    ) -> Result<(String, String), String> {
        let mut client_id = match Self::extract_client_id_with_http(test_client, None).await {
            Ok(id) => id,
            Err(_) => {
                if let Ok(guard) = self.cached_client_id.read()
                    && let Some(ref id) = *guard
                    && !id.is_empty()
                {
                    id.clone()
                } else {
                    FALLBACK_CLIENT_ID.to_string()
                }
            }
        };

        let fetch_track = |http: &reqwest::Client, cid: &str| {
            let req = http
                .get("https://api-v2.soundcloud.com/tracks/2401939686")
                .timeout(Duration::from_secs(15))
                .query(&[("client_id", cid)])
                .header(reqwest::header::USER_AGENT, CHROME_USER_AGENT)
                .header(reqwest::header::ORIGIN, "https://soundcloud.com")
                .header(reqwest::header::REFERER, "https://soundcloud.com/");
            req.send()
        };

        let mut track_resp = fetch_track(test_client, &client_id)
            .await
            .map_err(|e| format!("SoundCloud API unreachable via proxy: {e}"))?;

        if track_resp.status() == reqwest::StatusCode::PROXY_AUTHENTICATION_REQUIRED {
            return Err("Proxy authentication failed (HTTP 407)".to_string());
        }

        if matches!(
            track_resp.status(),
            reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
        ) && let Ok(fresh_id) = Self::extract_client_id_with_http(test_client, None).await
        {
            client_id = fresh_id;
            track_resp = fetch_track(test_client, &client_id)
                .await
                .map_err(|e| format!("SoundCloud API retry failed via proxy: {e}"))?;
        }

        let track_json: serde_json::Value = if track_resp.status() == reqwest::StatusCode::NOT_FOUND {
            let search_resp = test_client
                .get("https://api-v2.soundcloud.com/search/tracks")
                .timeout(Duration::from_secs(15))
                .query(&[("q", "lofi"), ("limit", "5"), ("client_id", client_id.as_str())])
                .header(reqwest::header::USER_AGENT, CHROME_USER_AGENT)
                .header(reqwest::header::ORIGIN, "https://soundcloud.com")
                .header(reqwest::header::REFERER, "https://soundcloud.com/")
                .send()
                .await
                .map_err(|e| format!("SoundCloud search failed via proxy: {e}"))?;
            let search_json: serde_json::Value =
                read_and_parse_json(search_resp, "Proxy test search")
                    .await
                    .map_err(|e| e.into_message())?;
            search_json
                .get("collection")
                .and_then(|c| c.as_array())
                .and_then(|arr| {
                    arr.iter().find(|t| {
                        t.get("media")
                            .and_then(|m| m.get("transcodings"))
                            .and_then(|tc| tc.as_array())
                            .is_some_and(|a| !a.is_empty())
                    })
                })
                .cloned()
                .ok_or_else(|| "No playable test track returned by SoundCloud API".to_string())?
        } else {
            read_and_parse_json(track_resp, "Proxy test track")
                .await
                .map_err(|e| e.into_message())?
        };

        let transcodings = track_json
            .get("media")
            .and_then(|m| m.get("transcodings"))
            .and_then(|t| t.as_array())
            .filter(|t| !t.is_empty())
            .ok_or_else(|| "Test track has no media transcodings".to_string())?;

        let track_auth = track_json
            .get("track_authorization")
            .and_then(|a| a.as_str())
            .unwrap_or("");

        for tc in transcodings {
            let protocol = tc
                .get("format")
                .and_then(|f| f.get("protocol"))
                .and_then(|p| p.as_str())
                .unwrap_or("unknown");
            if protocol.contains("encrypted") {
                continue;
            }
            let Some(tc_url) = tc.get("url").and_then(|u| u.as_str()) else {
                continue;
            };
            let mut req = test_client
                .get(tc_url)
                .timeout(Duration::from_secs(15))
                .query(&[("client_id", client_id.as_str())])
                .header(reqwest::header::USER_AGENT, CHROME_USER_AGENT)
                .header(reqwest::header::ORIGIN, "https://soundcloud.com")
                .header(reqwest::header::REFERER, "https://soundcloud.com/");
            if !track_auth.is_empty() {
                req = req.query(&[("track_authorization", track_auth)]);
            }
            let resp = req
                .send()
                .await
                .map_err(|e| format!("Transcoding resolve failed via proxy: {e}"))?;
            if resp.status() == reqwest::StatusCode::PROXY_AUTHENTICATION_REQUIRED {
                return Err("Proxy authentication failed (HTTP 407)".to_string());
            }
            if resp.status().is_success()
                && let Ok(obj) = resp.json::<serde_json::Value>().await
                && let Some(raw_url) = obj.get("url").and_then(|u| u.as_str())
            {
                return Ok((protocol.to_string(), raw_url.to_string()));
            }
        }

        Err("Could not resolve playable transcoding stream URL via proxy".to_string())
    }

    async fn execute_json_with_datadome_retry(
        &self,
        method: reqwest::Method,
        endpoint: &str,
        query_params: &[(&str, &str)],
        body: Option<serde_json::Value>,
        oauth_token: Option<&str>,
        action_name: &str,
    ) -> Result<serde_json::Value, String> {
        let resp = self
            .execute_api_request(method.clone(), endpoint, query_params, body.clone(), oauth_token)
            .await?;

        if resp.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(serde_json::json!({}));
        }

        match read_and_parse_json::<serde_json::Value>(resp, action_name).await {
            Ok(val) => Ok(val),
            Err(ApiJsonError::DataDome(msg)) => {
                log::warn!("DataDome challenge on {action_name}, refreshing cookie...");
                if self.refresh_datadome_cookie().await.is_ok() {
                    let retry_resp = self
                        .execute_api_request(method, endpoint, query_params, body, oauth_token)
                        .await?;
                    if retry_resp.status() == reqwest::StatusCode::NO_CONTENT {
                        return Ok(serde_json::json!({}));
                    }
                    return read_and_parse_json(retry_resp, action_name)
                        .await
                        .map_err(|e| e.into_message());
                }
                Err(msg)
            }
            Err(e) => Err(e.into_message()),
        }
    }

    pub async fn add_track_to_playlist(
        &self,
        playlist_id: i64,
        track_id: i64,
        oauth_token: &str,
    ) -> Result<serde_json::Value, String> {
        let url = format!("https://api-v2.soundcloud.com/playlists/{playlist_id}");
        let existing: serde_json::Value = self
            .execute_api_json(
                reqwest::Method::GET,
                &url,
                &[("representation", "compact")],
                None,
                Some(oauth_token),
                "Load playlist for add_track",
            )
            .await?;

        let mut track_ids: Vec<i64> = Vec::new();
        if let Some(arr) = existing.get("tracks").and_then(|t| t.as_array()) {
            for item in arr {
                if let Some(id) = item.get("id").and_then(|v| v.as_i64()).or_else(|| item.as_i64()) {
                    track_ids.push(id);
                }
            }
        }

        if !track_ids.contains(&track_id) {
            track_ids.push(track_id);
        }

        let payload = serde_json::json!({
            "playlist": {
                "tracks": track_ids
            }
        });

        let updated = self
            .execute_json_with_datadome_retry(
                reqwest::Method::PUT,
                &url,
                &[],
                Some(payload),
                Some(oauth_token),
                "add_track_to_playlist",
            )
            .await?;

        self.invalidate_response_cache();
        Ok(updated)
    }

    pub async fn create_playlist(
        &self,
        title: &str,
        is_public: bool,
        initial_track_id: Option<i64>,
        oauth_token: &str,
    ) -> Result<serde_json::Value, String> {
        let clean_title = title.trim();
        if clean_title.is_empty() {
            return Err("Playlist title cannot be empty".to_string());
        }

        let tracks_vec: Vec<i64> = initial_track_id.into_iter().collect();
        let payload = serde_json::json!({
            "playlist": {
                "title": clean_title,
                "sharing": if is_public { "public" } else { "private" },
                "tracks": tracks_vec
            }
        });

        let created = self
            .execute_json_with_datadome_retry(
                reqwest::Method::POST,
                "https://api-v2.soundcloud.com/playlists",
                &[],
                Some(payload),
                Some(oauth_token),
                "create_playlist",
            )
            .await?;

        self.invalidate_response_cache();
        Ok(created)
    }

    pub async fn get_track_detail(
        &self,
        track_id: i64,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        if track_id <= 0 {
            return Err("Invalid track ID".to_string());
        }
        self.get_track(track_id as u64, oauth_token).await
    }

    pub async fn get_track_comments(
        &self,
        track_id: i64,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let initial_url = format!(
            "https://api-v2.soundcloud.com/tracks/{track_id}/comments?limit=100&threaded=1&filter_replies=0&linked_partitioning=1"
        );
        let comments = self
            .fetch_paginated_collection(&initial_url, 3, oauth_token)
            .await;
        Ok(serde_json::json!({ "collection": comments }))
    }

    async fn send_comment_form(
        &self,
        track_id: i64,
        form_fields: &[(&str, &str)],
        oauth_token: &str,
    ) -> Result<serde_json::Value, String> {
        let mut client_id = self.get_client_id().await;
        let client = self.client().await;
        let endpoint = format!("https://api-v2.soundcloud.com/tracks/{track_id}/comments");

        for attempt in 0..2 {
            let req = client
                .post(&endpoint)
                .timeout(Duration::from_secs(20))
                .query(&[("client_id", client_id.as_str())]);
            let req = self.apply_browser_headers(req, Some(oauth_token));
            let resp = req
                .form(form_fields)
                .send()
                .await
                .map_err(|e| format!("post_track_comment network error: {e}"))?;

            let status = resp.status();
            let content_type = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let text = resp.text().await.unwrap_or_default();

            if status.is_success() && !is_html_body(&content_type, &text) {
                if text.trim().is_empty() {
                    return Ok(serde_json::json!({}));
                }
                return serde_json::from_str(&text)
                    .map_err(|e| format!("Failed to parse comment response: {e}"));
            }

            if (status == reqwest::StatusCode::UNAUTHORIZED
                || is_datadome_response(status, &content_type, &text))
                && attempt == 0
            {
                if is_datadome_response(status, &content_type, &text) {
                    log::warn!("DataDome challenge on post_track_comment ({status}), refreshing cookie...");
                    let _ = self.refresh_datadome_cookie().await;
                } else if let Ok(new_id) = self.refresh_client_id().await {
                    client_id = new_id;
                }
                continue;
            }

            if is_html_body(&content_type, &text) {
                return Err(format!(
                    "post_track_comment received HTML instead of JSON (HTTP {status})"
                ));
            }

            let snippet: String = text.chars().take(300).collect();
            return Err(format!("post_track_comment failed ({status}): {snippet}"));
        }

        Err("post_track_comment failed after retry".to_string())
    }

    pub async fn post_track_comment(
        &self,
        track_id: i64,
        body: &str,
        timestamp_ms: Option<i64>,
        oauth_token: &str,
    ) -> Result<serde_json::Value, String> {
        let clean_body = body.trim();
        if clean_body.is_empty() {
            return Err("Comment cannot be empty".to_string());
        }

        let ts = timestamp_ms.unwrap_or(0).max(0);
        let ts_str = ts.to_string();

        let bracketed_fields = [
            ("comment[body]", clean_body),
            ("comment[timestamp]", ts_str.as_str()),
        ];

        match self
            .send_comment_form(track_id, &bracketed_fields, oauth_token)
            .await
        {
            Ok(val) => Ok(val),
            Err(err) if err.contains("400 Bad Request") => {
                log::info!("post_track_comment retrying with flat form fields after 400...");
                let flat_fields = [
                    ("body", clean_body),
                    ("timestamp", ts_str.as_str()),
                ];
                self.send_comment_form(track_id, &flat_fields, oauth_token)
                    .await
            }
            Err(e) => Err(e),
        }
    }

    pub async fn update_profile(
        &self,
        fields: ProfileUpdateFields,
        oauth_token: &str,
    ) -> Result<serde_json::Value, String> {
        let mut user_map = serde_json::Map::new();
        if let Some(u) = fields.username.filter(|s| !s.trim().is_empty()) {
            user_map.insert("username".to_string(), serde_json::Value::String(u.trim().to_string()));
        }
        if let Some(f) = fields.first_name {
            user_map.insert("first_name".to_string(), serde_json::Value::String(f.trim().to_string()));
        }
        if let Some(l) = fields.last_name {
            user_map.insert("last_name".to_string(), serde_json::Value::String(l.trim().to_string()));
        }
        if let Some(c) = fields.city {
            user_map.insert("city".to_string(), serde_json::Value::String(c.trim().to_string()));
        }
        if let Some(co) = fields.country {
            user_map.insert("country".to_string(), serde_json::Value::String(co.trim().to_string()));
        }
        if let Some(d) = fields.description {
            user_map.insert("description".to_string(), serde_json::Value::String(d));
        }

        let payload = serde_json::json!({ "user": serde_json::Value::Object(user_map) });
        let res = self
            .execute_json_with_datadome_retry(
                reqwest::Method::PUT,
                "https://api-v2.soundcloud.com/me",
                &[],
                Some(payload),
                Some(oauth_token),
                "update_profile",
            )
            .await?;

        self.invalidate_response_cache();
        Ok(res)
    }

    pub async fn upload_profile_image(
        &self,
        kind: &str,
        image_data_url: &str,
        oauth_token: &str,
    ) -> Result<serde_json::Value, String> {
        if image_data_url.trim().is_empty() {
            return Err("Image data cannot be empty".to_string());
        }

        let res = match kind {
            "avatar" => {
                let payload = serde_json::json!({
                    "user": { "avatar_data": image_data_url }
                });
                self.execute_json_with_datadome_retry(
                    reqwest::Method::PUT,
                    "https://api-v2.soundcloud.com/me",
                    &[],
                    Some(payload),
                    Some(oauth_token),
                    "upload_avatar",
                )
                .await?
            }
            "banner" => {
                let user_id = self.get_cached_or_fetch_user_id(oauth_token).await?;
                let visuals_url = format!("https://api-v2.soundcloud.com/users/{user_id}/visuals");
                let visuals_payload = serde_json::json!({
                    "visuals": [{ "visual_data": image_data_url }]
                });
                match self
                    .execute_json_with_datadome_retry(
                        reqwest::Method::POST,
                        &visuals_url,
                        &[],
                        Some(visuals_payload),
                        Some(oauth_token),
                        "upload_banner_visuals",
                    )
                    .await
                {
                    Ok(v) => v,
                    Err(_) => {
                        let fallback_payload = serde_json::json!({
                            "user": { "visuals_data": image_data_url }
                        });
                        self.execute_json_with_datadome_retry(
                            reqwest::Method::PUT,
                            "https://api-v2.soundcloud.com/me",
                            &[],
                            Some(fallback_payload),
                            Some(oauth_token),
                            "upload_banner_me",
                        )
                        .await?
                    }
                }
            }
            other => return Err(format!("Unsupported profile image kind: {other}")),
        };

        self.invalidate_response_cache();
        Ok(res)
    }

    pub async fn get_user_profile(
        &self,
        user_id: i64,
        oauth_token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let user_url = format!("https://api-v2.soundcloud.com/users/{user_id}");
        let tracks_url = format!(
            "https://api-v2.soundcloud.com/users/{user_id}/tracks?limit=50&linked_partitioning=1"
        );
        let playlists_url = format!(
            "https://api-v2.soundcloud.com/users/{user_id}/playlists_without_albums?limit=50&linked_partitioning=1"
        );
        let likes_url = format!(
            "https://api-v2.soundcloud.com/users/{user_id}/track_likes?limit=50&linked_partitioning=1"
        );
        let following_url = format!("https://api-v2.soundcloud.com/me/followings/{user_id}");

        let follow_fut = async {
            if let Some(tok) = oauth_token {
                match self
                    .execute_api_request(reqwest::Method::GET, &following_url, &[], None, Some(tok))
                    .await
                {
                    Ok(r) => r.status().is_success() || r.status() == reqwest::StatusCode::NO_CONTENT,
                    Err(_) => false,
                }
            } else {
                false
            }
        };

        let (user_res, tracks, mut playlists, likes, is_following) = tokio::join!(
            self.execute_api_request(reqwest::Method::GET, &user_url, &[], None, oauth_token),
            self.fetch_paginated_collection(&tracks_url, 2, oauth_token),
            self.fetch_paginated_collection(&playlists_url, 2, oauth_token),
            self.fetch_paginated_collection(&likes_url, 2, oauth_token),
            follow_fut,
        );

        let user_resp = user_res?;
        let user_json: serde_json::Value = match read_and_parse_json(user_resp, "Get user profile").await {
            Ok(val) => val,
            Err(ApiJsonError::DataDome(msg)) => {
                if self.refresh_datadome_cookie().await.is_ok() {
                    let retry_resp = self
                        .execute_api_request(reqwest::Method::GET, &user_url, &[], None, oauth_token)
                        .await?;
                    read_and_parse_json(retry_resp, "Get user profile")
                        .await
                        .map_err(|e| e.into_message())?
                } else {
                    return Err(msg);
                }
            }
            Err(e) => return Err(e.into_message()),
        };

        for pl in playlists.iter_mut() {
            apply_playlist_artwork_fallback(pl);
        }

        Ok(serde_json::json!({
            "user": user_json,
            "tracks": tracks,
            "playlists": playlists,
            "likes": likes,
            "is_following": is_following,
        }))
    }

    pub async fn toggle_follow(
        &self,
        user_id: i64,
        follow: bool,
        oauth_token: &str,
    ) -> Result<bool, String> {
        let url = format!("https://api-v2.soundcloud.com/me/followings/{user_id}");
        let method = if follow {
            reqwest::Method::PUT
        } else {
            reqwest::Method::DELETE
        };
        let body = if follow { Some(serde_json::json!({})) } else { None };

        self.execute_json_with_datadome_retry(
            method,
            &url,
            &[],
            body,
            Some(oauth_token),
            "toggle_follow",
        )
        .await?;

        self.invalidate_response_cache();
        Ok(follow)
    }
}

pub struct ProfileUpdateFields {
    pub username: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub description: Option<String>,
}

fn encode_path_segment(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            _ => {
                out.push_str(&format!("%{b:02X}"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_script_urls() {
        let sample_html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <script crossorigin src="https://a-v2.sndcdn.com/assets/0-d1234.js"></script>
                <script src="https://a-v2.sndcdn.com/assets/49-e5678.js"></script>
                <script src="https://other-cdn.com/script.js"></script>
            </head>
            </html>
        "#;
        let urls = extract_script_urls(sample_html);
        assert_eq!(urls.len(), 2);
        assert_eq!(urls[0], "https://a-v2.sndcdn.com/assets/0-d1234.js");
        assert_eq!(urls[1], "https://a-v2.sndcdn.com/assets/49-e5678.js");
    }

    #[test]
    fn test_extract_client_id_from_js() {
        let js1 = r#",client_id:"bY234567890123456789012345678901","#;
        assert_eq!(
            extract_client_id_from_js(js1),
            Some("bY234567890123456789012345678901".to_string())
        );

        let js2 = r#"{"client_id": "aZ987654321098765432109876543210"}"#;
        assert_eq!(
            extract_client_id_from_js(js2),
            Some("aZ987654321098765432109876543210".to_string())
        );

        let js_invalid = r#"client_id:"short""#;
        assert_eq!(extract_client_id_from_js(js_invalid), None);
    }

    #[test]
    fn test_negative_stream_cache_not_cleared_by_clear_stream_cache() {
        let neg_cache = Arc::new(RwLock::new(HashMap::new()));
        let pos_cache = Arc::new(RwLock::new(HashMap::new()));

        let track_id = 2316031016u64;
        neg_cache.write().unwrap().insert(track_id, ("Protected stream (DRM not supported in WebView2)".to_string(), Instant::now()));
        pos_cache.write().unwrap().insert(track_id, (StreamResolution {
            stream_url: "http://example.com".to_string(),
            protocol: "progressive".to_string(),
            mime_type: "audio/mpeg".to_string(),
            duration_ms: None,
            encrypted: false,
            license_url: None,
            license_auth_token: None,
        }, Instant::now()));

        // clear_stream_cache should only clear pos_cache, NOT neg_cache!
        pos_cache.write().unwrap().remove(&track_id);
        assert!(pos_cache.read().unwrap().get(&track_id).is_none());
        assert!(neg_cache.read().unwrap().get(&track_id).is_some());

        // clear_all_caches clears neg_cache
        neg_cache.write().unwrap().clear();
        assert!(neg_cache.read().unwrap().get(&track_id).is_none());
    }

    #[test]
    fn test_encode_path_segment_system_playlist_urn() {
        let urn = "soundcloud:system-playlists:personalized-tracks:123456";
        assert_eq!(
            encode_path_segment(urn),
            "soundcloud%3Asystem-playlists%3Apersonalized-tracks%3A123456"
        );
    }

    #[test]
    fn test_html_and_datadome_detection() {
        assert!(is_html_body("text/html; charset=utf-8", "{}"));
        assert!(is_html_body("application/json", "  <!DOCTYPE html><html></html>"));
        assert!(!is_html_body("application/json", r#"{"id":123}"#));
        assert!(is_datadome_response(
            reqwest::StatusCode::FORBIDDEN,
            "text/html",
            "<html><script src=\"https://geo.captcha-delivery.com/captcha/\"></script></html>"
        ));
        assert!(!is_datadome_response(
            reqwest::StatusCode::UNAUTHORIZED,
            "application/json",
            r#"{"errors":[{"error_message":"401 - Unauthorized"}]}"#
        ));
    }
}
