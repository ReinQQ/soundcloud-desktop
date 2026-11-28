use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager, Runtime};

static SAVE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct AppSettings {
    pub proxy_enabled: bool,
    pub proxy_url: String,
    pub discord_rpc_enabled: bool,
    pub dark_theme_enabled: bool,
    pub minimize_to_tray: bool,
    pub proxy_active: bool,
    pub oauth_token: Option<String>,
    #[serde(default)]
    pub cached_client_id: Option<String>,
    #[serde(default)]
    pub datadome_cookie: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            proxy_enabled: false,
            proxy_url: "socks5://127.0.0.1:10808".to_string(),
            discord_rpc_enabled: true,
            dark_theme_enabled: true,
            minimize_to_tray: true,
            proxy_active: false,
            oauth_token: None,
            cached_client_id: None,
            datadome_cookie: None,
        }
    }
}

pub fn is_valid_proxy_scheme(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("socks4://")
        || lower.starts_with("socks4a://")
        || lower.starts_with("socks5://")
        || lower.starts_with("socks5h://")
}

pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2]))
        {
            out.push((h << 4) | l);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn encode_userinfo_component(input: &str) -> String {
    // Decode first so already-percent-encoded credentials are not double-encoded.
    let decoded = percent_decode(input);
    let mut out = String::with_capacity(decoded.len());
    for b in decoded.as_bytes() {
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

pub fn parse_proxy_credentials(parsed: &url::Url) -> Option<(String, String)> {
    let raw_user = parsed.username();
    let raw_pass = parsed.password();
    if raw_user.is_empty() && raw_pass.is_none() {
        return None;
    }
    let user = percent_decode(raw_user);
    let pass = raw_pass.map(percent_decode).unwrap_or_default();
    Some((user, pass))
}

pub fn redact_proxy_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(mut parsed) = validate_proxy_url(trimmed) {
        if parsed.password().is_some() {
            let _ = parsed.set_password(Some("***"));
        } else if !parsed.username().is_empty() {
            let _ = parsed.set_username("***");
        }
        return parsed.to_string().trim_end_matches('/').to_string();
    }
    let (scheme_prefix, rest) = if let Some(idx) = trimmed.find("://") {
        (&trimmed[..idx + 3], &trimmed[idx + 3..])
    } else {
        ("", trimmed)
    };
    if let Some((creds, host)) = rest.rsplit_once('@') {
        if let Some((user, _pass)) = creds.split_once(':') {
            return format!("{scheme_prefix}{user}:***@{host}");
        }
        return format!("{scheme_prefix}***@{host}");
    }
    trimmed.to_string()
}

pub fn validate_proxy_url(raw: &str) -> Result<url::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Proxy URL cannot be empty".to_string());
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err("Proxy URL cannot contain control characters or newlines".to_string());
    }

    let (scheme, without_scheme) = if let Some(idx) = trimmed.find("://") {
        let s = trimmed[..idx].to_lowercase();
        if !matches!(
            s.as_str(),
            "http" | "https" | "socks4" | "socks4a" | "socks5" | "socks5h"
        ) {
            return Err(format!("Unsupported proxy scheme: {s}"));
        }
        (s, &trimmed[idx + 3..])
    } else {
        ("socks5".to_string(), trimmed)
    };

    let canonical_url_str = if let Some((creds, host_port)) = without_scheme.rsplit_once('@') {
        if !creds.contains(':') {
            return Err(
                "Proxy credentials format invalid: missing colon ':' between username and password (expected format: username:password@host:port)"
                    .to_string(),
            );
        }
        let (user, pass) = creds.split_once(':').unwrap_or(("", ""));
        if user.is_empty() {
            return Err("Proxy username cannot be empty".to_string());
        }
        let clean_host_port = host_port.trim_end_matches('/');
        let enc_user = encode_userinfo_component(user);
        let enc_pass = encode_userinfo_component(pass);
        format!("{scheme}://{enc_user}:{enc_pass}@{clean_host_port}")
    } else {
        let clean_host_port = without_scheme.trim_end_matches('/');
        format!("{scheme}://{clean_host_port}")
    };

    let parsed = url::Url::parse(&canonical_url_str)
        .map_err(|e| format!("Invalid proxy URL format: {e}"))?;
    if parsed.host().is_none() {
        return Err("Proxy URL must specify a host".to_string());
    }
    if parsed.port().is_none() {
        return Err("Proxy URL must specify a port (e.g. host:port)".to_string());
    }
    if !parsed.path().is_empty() && parsed.path() != "/" {
        return Err("Proxy URL must not contain a path".to_string());
    }
    Ok(parsed)
}

impl AppSettings {
    pub fn get_settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
        let config_dir = app
            .path()
            .app_config_dir()
            .map_err(|e| format!("Failed to get app_config_dir: {e}"))?;
        Ok(config_dir.join("settings.json"))
    }

    pub fn load_or_default<R: Runtime>(app: &AppHandle<R>) -> Self {
        match Self::get_settings_path(app) {
            Ok(path) => Self::load_from_path(&path),
            Err(e) => {
                log::warn!("Could not resolve settings path: {e}, using defaults");
                Self::default()
            }
        }
    }

    pub fn load_from_path(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(content) => {
                let clean = content.trim_start_matches('\u{feff}');
                match serde_json::from_str::<AppSettings>(clean) {
                    Ok(settings) => settings,
                    Err(err) => {
                        log::warn!("Failed to parse {path:?}: {err}. Falling back to defaults.");
                        Self::default()
                    }
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                let defaults = Self::default();
                let _ = Self::save_to_path(path, &defaults);
                defaults
            }
            Err(err) => {
                log::warn!("Failed to read {path:?}: {err}. Falling back to defaults.");
                Self::default()
            }
        }
    }

    pub fn save_to_path(path: &Path, settings: &AppSettings) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config dir: {e}"))?;
        }
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {e}"))?;

        let seq = SAVE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("settings.json");
        let tmp_path = path.with_file_name(format!("{file_name}.{pid}.{seq}.tmp"));

        let write_result = (|| -> std::io::Result<()> {
            let mut file = File::create(&tmp_path)?;
            file.write_all(json.as_bytes())?;
            file.sync_all()?;
            Ok(())
        })();

        if let Err(e) = write_result {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!("Failed to write temp settings file {tmp_path:?}: {e}"));
        }

        if let Err(e) = fs::rename(&tmp_path, path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!(
                "Failed to atomically replace settings at {path:?}: {e}"
            ));
        }

        Ok(())
    }

    pub fn save<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        let path = Self::get_settings_path(app)?;
        Self::save_to_path(&path, self)
    }

    pub fn validate_and_sanitize(&mut self) {
        self.proxy_url = self.proxy_url.trim().to_string();
        if self.proxy_url.is_empty() {
            self.proxy_url = "socks5://127.0.0.1:10808".to_string();
        } else if !is_valid_proxy_scheme(&self.proxy_url) {
            self.proxy_url = format!("socks5://{}", self.proxy_url);
        }
        if let Some(token) = &self.oauth_token {
            let trimmed = token.trim().to_string();
            if trimmed.is_empty() {
                self.oauth_token = None;
            } else {
                self.oauth_token = Some(trimmed);
            }
        }
        if let Some(id) = &self.cached_client_id {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                self.cached_client_id = None;
            } else {
                self.cached_client_id = Some(trimmed);
            }
        }
        if let Some(dd) = &self.datadome_cookie {
            let trimmed = dd.trim().to_string();
            if trimmed.is_empty() {
                self.datadome_cookie = None;
            } else {
                self.datadome_cookie = Some(trimmed);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let s = AppSettings::default();
        assert!(!s.proxy_enabled);
        assert_eq!(s.proxy_url, "socks5://127.0.0.1:10808");
        assert!(s.discord_rpc_enabled);
        assert!(s.dark_theme_enabled);
        assert!(s.minimize_to_tray);
        assert_eq!(s.oauth_token, None);
        assert_eq!(s.cached_client_id, None);
        assert_eq!(s.datadome_cookie, None);
    }

    #[test]
    fn test_proxy_url_validation_and_special_chars() {
        assert!(validate_proxy_url("http://127.0.0.1:8080").is_ok());
        assert!(validate_proxy_url("https://proxy.example.com:8443").is_ok());
        assert!(validate_proxy_url("socks4://10.0.0.1:1080").is_ok());
        assert!(validate_proxy_url("socks4a://10.0.0.1:1080").is_ok());
        assert!(validate_proxy_url("socks5://127.0.0.1:10808").is_ok());
        assert!(validate_proxy_url("socks5h://user:secret@127.0.0.1:10808").is_ok());

        let auto_prefixed = validate_proxy_url("user:pass@127.0.0.1:10808").unwrap();
        assert_eq!(auto_prefixed.scheme(), "socks5");

        // Special characters in password: @, :, #, !, %
        let special = validate_proxy_url("socks5://alice:p@ss:w#rd!1@127.0.0.1:10808").unwrap();
        let (u, p) = parse_proxy_credentials(&special).unwrap();
        assert_eq!(u, "alice");
        assert_eq!(p, "p@ss:w#rd!1");

        // Already percent-encoded password should decode cleanly without double-encoding
        let encoded = validate_proxy_url("http://alice:p%40ss%231@127.0.0.1:8080").unwrap();
        let (u2, p2) = parse_proxy_credentials(&encoded).unwrap();
        assert_eq!(u2, "alice");
        assert_eq!(p2, "p@ss#1");

        assert!(validate_proxy_url("").is_err());
        assert!(validate_proxy_url("testuserpass@127.0.0.1:8080").is_err());
        assert!(validate_proxy_url("http://testuserpass@127.0.0.1:8080").is_err());
        assert!(validate_proxy_url("http://testuser:testpass@127.0.0.1:8080").is_ok());

        assert_eq!(
            redact_proxy_url("http://testuser:p@ss:word@127.0.0.1:8080"),
            "http://testuser:***@127.0.0.1:8080"
        );
    }

    #[test]
    fn test_atomic_save_and_load_without_bom() {
        let dir = std::env::temp_dir().join(format!("scdesktop_settings_test_{}", std::process::id()));
        let path = dir.join("settings.json");
        let settings = AppSettings {
            proxy_enabled: true,
            proxy_url: "socks5://user:p@ss@127.0.0.1:10808".to_string(),
            oauth_token: Some("tok-12345".to_string()),
            cached_client_id: Some("cid-999".to_string()),
            datadome_cookie: Some("dd-abc".to_string()),
            ..AppSettings::default()
        };

        AppSettings::save_to_path(&path, &settings).unwrap();
        let raw_bytes = fs::read(&path).unwrap();
        assert!(!raw_bytes.starts_with(&[0xEF, 0xBB, 0xBF]));

        let loaded = AppSettings::load_from_path(&path);
        assert_eq!(loaded, settings);

        let _ = fs::remove_dir_all(&dir);
    }
}
