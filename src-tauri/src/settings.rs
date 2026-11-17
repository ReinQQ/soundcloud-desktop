use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

pub const DISCORD_APP_ID: &str = "1572112482062045194";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct AppSettings {
    pub proxy_enabled: bool,
    pub proxy_url: String,
    pub discord_rpc_enabled: bool,
    pub discord_app_id: String,
    pub adblock_enabled: bool,
    pub dark_theme_enabled: bool,
    pub minimize_to_tray: bool,
    pub proxy_active: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            proxy_enabled: false,
            proxy_url: "socks5://127.0.0.1:10808".to_string(),
            discord_rpc_enabled: true,
            discord_app_id: DISCORD_APP_ID.to_string(),
            adblock_enabled: true,
            dark_theme_enabled: true,
            minimize_to_tray: true,
            proxy_active: false,
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

pub fn validate_proxy_url(raw: &str) -> Result<url::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Proxy URL cannot be empty".to_string());
    }

    let full_url_str = if is_valid_proxy_scheme(trimmed) {
        trimmed.to_string()
    } else {
        // Auto-prefix with socks5:// if scheme is missing
        format!("socks5://{trimmed}")
    };

    let parsed = url::Url::parse(&full_url_str)
        .map_err(|e| format!("Invalid proxy URL format: {e}"))?;
    if parsed.host().is_none() {
        return Err("Proxy URL must specify a host".to_string());
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
        if !path.exists() {
            let defaults = Self::default();
            let _ = Self::save_to_path(path, &defaults);
            return defaults;
        }

        match fs::read_to_string(path) {
            Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                Ok(mut settings) => {
                    // Hardcode Discord App ID to DISCORD_APP_ID regardless of settings.json content
                    settings.discord_app_id = DISCORD_APP_ID.to_string();
                    settings
                }
                Err(err) => {
                    log::warn!("Failed to parse {path:?}: {err}. Falling back to defaults.");
                    Self::default()
                }
            },
            Err(err) => {
                log::warn!("Failed to read {path:?}: {err}. Falling back to defaults.");
                Self::default()
            }
        }
    }

    pub fn save_to_path(path: &Path, settings: &AppSettings) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
        }
        let mut to_save = settings.clone();
        to_save.discord_app_id = DISCORD_APP_ID.to_string();
        let json = serde_json::to_string_pretty(&to_save)
            .map_err(|e| format!("Failed to serialize settings: {e}"))?;
        fs::write(path, json).map_err(|e| format!("Failed to write settings to {path:?}: {e}"))?;
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
        self.discord_app_id = DISCORD_APP_ID.to_string();
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
        assert_eq!(s.discord_app_id, "1572112482062045194");
        assert!(s.adblock_enabled);
        assert!(s.dark_theme_enabled);
        assert!(s.minimize_to_tray);
    }

    #[test]
    fn test_proxy_url_validation() {
        assert!(validate_proxy_url("http://127.0.0.1:8080").is_ok());
        assert!(validate_proxy_url("https://proxy.example.com:8443").is_ok());
        assert!(validate_proxy_url("socks4://10.0.0.1:1080").is_ok());
        assert!(validate_proxy_url("socks4a://10.0.0.1:1080").is_ok());
        assert!(validate_proxy_url("socks5://127.0.0.1:10808").is_ok());
        assert!(validate_proxy_url("socks5h://user:secret@127.0.0.1:10808").is_ok());

        // Test auto-prefixing when user pastes without scheme
        let auto_prefixed = validate_proxy_url("user:pass@127.0.0.1:10808");
        assert!(auto_prefixed.is_ok());
        assert_eq!(auto_prefixed.unwrap().scheme(), "socks5");

        assert!(validate_proxy_url("").is_err());
    }
}
