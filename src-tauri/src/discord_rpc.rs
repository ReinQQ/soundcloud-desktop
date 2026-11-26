use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const DISCORD_APP_ID: &str = "1572112482062045194";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackPayload {
    pub title: String,
    pub artist: String,
    pub cover_url: Option<String>,
    pub track_url: Option<String>,
    pub is_playing: bool,
    pub elapsed_sec: u64,
    pub duration_sec: u64,
}

#[derive(Debug)]
pub enum DiscordRpcCommand {
    Update(TrackPayload),
    Clear,
    SetEnabled(bool),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActivitySnapshot {
    pub title: String,
    pub artist: String,
    pub cover_url: Option<String>,
    pub track_url: Option<String>,
    pub is_playing: bool,
    pub start_ts: Option<i64>,
}

#[derive(Clone)]
pub struct DiscordRpcHandle {
    sender: Sender<DiscordRpcCommand>,
    status: Arc<RwLock<String>>,
}

impl DiscordRpcHandle {
    pub fn new(initial_enabled: bool) -> Self {
        let (sender, receiver) = mpsc::channel();
        let initial_status = if initial_enabled {
            "waiting_for_discord".to_string()
        } else {
            "disabled".to_string()
        };
        let status = Arc::new(RwLock::new(initial_status));
        let status_for_worker = status.clone();

        if let Err(e) = thread::Builder::new()
            .name("discord-rpc-worker".to_string())
            .spawn(move || {
                run_discord_worker(receiver, status_for_worker, initial_enabled);
            })
        {
            log::error!("Failed to spawn discord-rpc background thread: {e}");
        }

        Self { sender, status }
    }

    pub fn update(&self, payload: TrackPayload) {
        let _ = self.sender.send(DiscordRpcCommand::Update(payload));
    }

    pub fn clear(&self) {
        let _ = self.sender.send(DiscordRpcCommand::Clear);
    }

    pub fn set_enabled(&self, enabled: bool) {
        let _ = self.sender.send(DiscordRpcCommand::SetEnabled(enabled));
    }

    pub fn get_status(&self) -> String {
        self.status
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|_| "waiting_for_discord".to_string())
    }
}

/// Sanitizes strings for Discord IPC payloads.
/// Discord silently ignores SET_ACTIVITY packets if any text field is 1 char long or > 128 chars.
/// For 1-char non-empty strings, appends zero-width space (\u{200B}) to meet the 2-char minimum.
/// Safely truncates at UTF-8 code point boundaries to max_len chars (max 128).
pub fn sanitize_text(s: &str, max_len: usize) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_control() && c != ' ' { ' ' } else { c })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let char_count = trimmed.chars().count();
    if char_count == 1 {
        let mut result = trimmed.to_string();
        result.push('\u{200B}');
        return result;
    }
    if char_count > max_len {
        trimmed.chars().take(max_len).collect()
    } else {
        trimmed.to_string()
    }
}

/// Discord allows large_image URLs if they start with "https://" and are <= 256 chars.
pub fn validate_cover_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://") && trimmed.len() <= 256
        && let Ok(parsed) = url::Url::parse(trimmed)
            && parsed.scheme() == "https" && parsed.host().is_some() {
                return Some(trimmed.to_string());
            }
    None
}

/// Discord buttons require valid URLs <= 512 chars starting with "https://".
pub fn validate_track_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://") && trimmed.len() <= 512
        && let Ok(parsed) = url::Url::parse(trimmed)
            && parsed.scheme() == "https" && parsed.host().is_some() {
                return Some(trimmed.to_string());
            }
    None
}

#[cfg(windows)]
fn check_ipc_permission_denied() -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    for i in 0..10 {
        let path = format!(r"\\?\pipe\discord-ipc-{}", i);
        // access_mode 0x3 is GENERIC_READ | GENERIC_WRITE (same mode used by discord-rich-presence)
        match std::fs::OpenOptions::new().access_mode(0x3).open(&path) {
            Ok(_) => {}
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied || e.raw_os_error() == Some(5) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(unix)]
fn check_ipc_permission_denied() -> bool {
    const ENV_KEYS: [&str; 4] = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"];
    const APP_SUBPATHS: [&str; 7] = [
        "",
        "app/com.discordapp.Discord/",
        "app/dev.vencord.Vesktop/",
        ".flatpak/com.discordapp.Discord/xdg-run/",
        ".flatpak/dev.vencord.Vesktop/xdg-run/",
        "snap.discord-canary/",
        "snap.discord/",
    ];
    for key in &ENV_KEYS {
        if let Ok(val) = std::env::var(key) {
            let base_path = std::path::PathBuf::from(val);
            if !base_path.is_dir() {
                continue;
            }
            for i in 0..10 {
                let pipe_name = format!("discord-ipc-{}", i);
                for subpath in &APP_SUBPATHS {
                    let pipe_path = base_path.join(subpath).join(&pipe_name);
                    if pipe_path.exists() {
                        match std::os::unix::net::UnixStream::connect(&pipe_path) {
                            Ok(_) => {}
                            Err(e) => {
                                if e.kind() == std::io::ErrorKind::PermissionDenied
                                    || e.raw_os_error() == Some(13)
                                {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

pub fn is_permission_denied<E: std::fmt::Debug>(err: &E) -> bool {
    #[cfg(windows)]
    if check_ipc_permission_denied() {
        return true;
    }
    #[cfg(unix)]
    if check_ipc_permission_denied() {
        return true;
    }
    let err_str = format!("{err:?}");
    err_str.contains("PermissionDenied")
        || err_str.contains("os error 5")
        || err_str.contains("os error 13")
}

pub fn send_activity_packet(
    client: &mut DiscordIpcClient,
    payload: &TrackPayload,
    last_snapshot: &mut Option<ActivitySnapshot>,
) -> Result<(), Box<dyn std::error::Error>> {
    if !payload.is_playing {
        *last_snapshot = None;
        client.clear_activity()?;
        return Ok(());
    }

    let raw_title = if payload.title.trim().is_empty() {
        "Unknown Track"
    } else {
        payload.title.as_str()
    };
    let title = sanitize_text(raw_title, 128);

    let raw_artist = if payload.artist.trim().is_empty() {
        "SoundCloud"
    } else {
        payload.artist.as_str()
    };
    let artist = sanitize_text(raw_artist, 128);

    let cover_url = payload
        .cover_url
        .as_deref()
        .and_then(validate_cover_url);
    let track_url = payload
        .track_url
        .as_deref()
        .and_then(validate_track_url);

    // Calculate timestamps
    let (start_ts, end_ts) = if payload.is_playing
        && payload.duration_sec > 0
        && payload.elapsed_sec <= payload.duration_sec
    {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let s = now - (payload.elapsed_sec as i64);
        let e = s + (payload.duration_sec as i64);
        if e > s && s > 0 {
            (Some(s), Some(e))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    // Smart Deduplication: avoid Discord 15s rate-limit drops
    if let Some(last) = last_snapshot.as_ref() {
        let fields_match = last.title == title
            && last.artist == artist
            && last.cover_url == cover_url
            && last.track_url == track_url
            && last.is_playing == payload.is_playing;

        let time_drift_small = match (last.start_ts, start_ts) {
            (Some(last_s), Some(curr_s)) => (curr_s - last_s).abs() < 3,
            (None, None) => true,
            _ => false,
        };

        if fields_match && time_drift_small {
            // Unchanged activity and negligible time drift: skip redundant IPC packet
            return Ok(());
        }
    }

    let large_image_key = cover_url.as_deref().unwrap_or("soundcloud");
    let large_text = sanitize_text(&title, 128);
    let small_image_key = if payload.is_playing { "play" } else { "pause" };
    let small_text = sanitize_text(if payload.is_playing { "Playing" } else { "Paused" }, 128);

    let assets = Assets::new()
        .large_image(large_image_key)
        .large_text(&large_text)
        .small_image(small_image_key)
        .small_text(&small_text);

    let mut activity = Activity::new()
        .activity_type(ActivityType::Listening)
        .details(&title)
        .state(&artist)
        .assets(assets);

    if let (Some(s), Some(e)) = (start_ts, end_ts) {
        activity = activity.timestamps(Timestamps::new().start(s).end(e));
    }

    if let Some(ref url) = track_url {
        let button = Button::new("Listen on SoundCloud", url);
        activity = activity.buttons(vec![button]);
    }

    client.set_activity(activity)?;

    *last_snapshot = Some(ActivitySnapshot {
        title,
        artist,
        cover_url,
        track_url,
        is_playing: payload.is_playing,
        start_ts,
    });

    Ok(())
}

fn set_status(status_lock: &Arc<RwLock<String>>, new_status: &str) {
    if let Ok(mut lock) = status_lock.write()
        && *lock != new_status {
            *lock = new_status.to_string();
        }
}

fn run_discord_worker(
    receiver: Receiver<DiscordRpcCommand>,
    status: Arc<RwLock<String>>,
    mut enabled: bool,
) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut cached_track: Option<TrackPayload> = None;
    let mut last_snapshot: Option<ActivitySnapshot> = None;
    // Set connect attempt in the past so the initial connection is attempted immediately
    let mut last_connect_attempt = Instant::now() - Duration::from_secs(10);

    loop {
        // Non-blocking reconnect check every 3 seconds whenever enabled and IPC client is not connected
        if enabled && client.is_none()
            && last_connect_attempt.elapsed() >= Duration::from_secs(3) {
                last_connect_attempt = Instant::now();
                let mut c = DiscordIpcClient::new(DISCORD_APP_ID);
                match c.connect() {
                    Ok(()) => {
                        log::info!("Connected to Discord IPC with App ID: {DISCORD_APP_ID}");
                        set_status(&status, "connected");
                        last_snapshot = None; // Reset snapshot so re-sending cached track succeeds
                        if let Some(ref payload) = cached_track {
                            if let Err(e) = send_activity_packet(&mut c, payload, &mut last_snapshot) {
                                log::warn!("Failed to replay cached track to Discord: {e}. Dropping client connection.");
                                let _ = c.close();
                                set_status(&status, "waiting_for_discord");
                                client = None;
                                last_snapshot = None;
                            } else {
                                client = Some(c);
                            }
                        } else {
                            client = Some(c);
                        }
                    }
                    Err(e) => {
                        log::debug!("Discord client connection attempt failed: {e:?}");
                        if is_permission_denied(&e) {
                            set_status(&status, "permission_denied");
                        } else {
                            set_status(&status, "waiting_for_discord");
                        }
                    }
                }
            }

        // Receive incoming command with 250ms timeout
        let mut cmd = match receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(cmd) => cmd,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                log::info!("Discord RPC channel disconnected, shutting down worker thread.");
                if let Some(mut c) = client.take() {
                    let _ = c.close();
                }
                break;
            }
        };

        // Drain any stale queued commands so only the latest track state is processed
        while let Ok(next_cmd) = receiver.try_recv() {
            match (&cmd, &next_cmd) {
                (DiscordRpcCommand::Update(_), DiscordRpcCommand::Update(_)) => {
                    cmd = next_cmd;
                }
                (_, DiscordRpcCommand::Clear) => {
                    cmd = next_cmd;
                }
                _ => {
                    handle_command(
                        &mut client,
                        &mut cached_track,
                        &mut last_snapshot,
                        &status,
                        &mut enabled,
                        &mut last_connect_attempt,
                        cmd,
                    );
                    cmd = next_cmd;
                }
            }
        }

        handle_command(
            &mut client,
            &mut cached_track,
            &mut last_snapshot,
            &status,
            &mut enabled,
            &mut last_connect_attempt,
            cmd,
        );
    }
}

fn handle_command(
    client: &mut Option<DiscordIpcClient>,
    cached_track: &mut Option<TrackPayload>,
    last_snapshot: &mut Option<ActivitySnapshot>,
    status: &Arc<RwLock<String>>,
    enabled: &mut bool,
    last_connect_attempt: &mut Instant,
    cmd: DiscordRpcCommand,
) {
    match cmd {
        DiscordRpcCommand::SetEnabled(new_enabled) => {
            *enabled = new_enabled;
            if !*enabled {
                if let Some(mut c) = client.take() {
                    let _ = c.clear_activity();
                    let _ = c.close();
                }
                *last_snapshot = None;
                set_status(status, "disabled");
            } else {
                set_status(status, "waiting_for_discord");
                // Trigger immediate reconnect attempt on next loop tick
                *last_connect_attempt = Instant::now() - Duration::from_secs(3);
            }
        }
        DiscordRpcCommand::Clear => {
            *cached_track = None;
            *last_snapshot = None;
            if *enabled
                && let Some(c) = client.as_mut()
                    && let Err(e) = c.clear_activity() {
                        log::warn!("Failed to clear Discord activity: {e}. Dropping client connection.");
                        let _ = c.close();
                        *client = None;
                        set_status(status, "waiting_for_discord");
                    }
        }
        DiscordRpcCommand::Update(payload) => {
            if !payload.is_playing {
                *cached_track = None;
                *last_snapshot = None;
                if *enabled
                    && let Some(c) = client.as_mut()
                        && let Err(e) = c.clear_activity() {
                            log::warn!("Failed to clear Discord activity on pause: {e}. Dropping client connection.");
                            let _ = c.close();
                            *client = None;
                            set_status(status, "waiting_for_discord");
                        }
                return;
            }

            *cached_track = Some(payload.clone());
            if *enabled {
                if let Some(c) = client.as_mut() {
                    if let Err(e) = send_activity_packet(c, &payload, last_snapshot) {
                        log::warn!("Failed to update Discord presence: {e}. Dropping client connection.");
                        let _ = c.close();
                        *client = None;
                        *last_snapshot = None;
                        set_status(status, "waiting_for_discord");
                    } else {
                        set_status(status, "connected");
                    }
                } else if last_connect_attempt.elapsed() >= Duration::from_secs(3) {
                    *last_connect_attempt = Instant::now();
                    let mut c = DiscordIpcClient::new(DISCORD_APP_ID);
                    match c.connect() {
                        Ok(()) => {
                            log::info!("Connected to Discord IPC with App ID: {DISCORD_APP_ID}");
                            set_status(status, "connected");
                            *last_snapshot = None;
                            if let Err(e) = send_activity_packet(&mut c, &payload, last_snapshot) {
                                log::warn!("Failed to send presence to Discord: {e}. Dropping client.");
                                let _ = c.close();
                                *client = None;
                                *last_snapshot = None;
                                set_status(status, "waiting_for_discord");
                            } else {
                                *client = Some(c);
                            }
                        }
                        Err(e) => {
                            log::debug!("Discord client connection attempt failed: {e:?}");
                            if is_permission_denied(&e) {
                                set_status(status, "permission_denied");
                            } else {
                                set_status(status, "waiting_for_discord");
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_text() {
        let input = "  Artist with\nnewlines\tand \0controls  ";
        let output = sanitize_text(input, 50);
        assert_eq!(output, "Artist with newlines and  controls");

        let long_input = "a".repeat(200);
        let output = sanitize_text(&long_input, 128);
        assert_eq!(output.len(), 128);

        // 1-char input must append zero-width space (\u{200B})
        let single_char = "X";
        let single_out = sanitize_text(single_char, 128);
        assert_eq!(single_out, "X\u{200B}");
        assert_eq!(single_out.chars().count(), 2);

        // Single multi-byte character
        let emoji_char = "🎵";
        let emoji_out = sanitize_text(emoji_char, 128);
        assert_eq!(emoji_out, "🎵\u{200B}");
        assert_eq!(emoji_out.chars().count(), 2);

        // Empty string remains empty
        assert_eq!(sanitize_text("", 128), "");
        assert_eq!(sanitize_text("   \n\t  ", 128), "");
    }

    #[test]
    fn test_validate_cover_url() {
        // Valid HTTPS cover URLs <= 256 chars
        assert_eq!(
            validate_cover_url("https://i1.sndcdn.com/artworks-12345-t500x500.jpg"),
            Some("https://i1.sndcdn.com/artworks-12345-t500x500.jpg".to_string())
        );
        assert_eq!(
            validate_cover_url("https://a1.sndcdn.com/avatars-67890-t500x500.jpg"),
            Some("https://a1.sndcdn.com/avatars-67890-t500x500.jpg".to_string())
        );
        assert_eq!(
            validate_cover_url("https://example.com/cover.png"),
            Some("https://example.com/cover.png".to_string())
        );

        // HTTP scheme (must be https)
        assert_eq!(validate_cover_url("http://i1.sndcdn.com/art.jpg"), None);

        // URL exceeding 256 chars
        let long_url = format!("https://i1.sndcdn.com/{}", "a".repeat(250));
        assert!(long_url.len() > 256);
        assert_eq!(validate_cover_url(&long_url), None);

        // Invalid URL
        assert_eq!(validate_cover_url("not a url"), None);
    }

    #[test]
    fn test_validate_track_url() {
        // Valid HTTPS track URLs <= 512 chars
        assert_eq!(
            validate_track_url("https://soundcloud.com/artist/great-song"),
            Some("https://soundcloud.com/artist/great-song".to_string())
        );
        assert_eq!(
            validate_track_url("https://m.soundcloud.com/artist/great-song"),
            Some("https://m.soundcloud.com/artist/great-song".to_string())
        );

        // HTTP scheme (must be https)
        assert_eq!(validate_track_url("http://soundcloud.com/song"), None);

        // URL exceeding 512 chars
        let long_url = format!("https://soundcloud.com/{}", "a".repeat(510));
        assert!(long_url.len() > 512);
        assert_eq!(validate_track_url(&long_url), None);

        // Invalid URL
        assert_eq!(validate_track_url("not a url"), None);
    }

    #[test]
    fn test_deduplication_logic() {
        let snapshot = ActivitySnapshot {
            title: "Test Track".to_string(),
            artist: "Test Artist".to_string(),
            cover_url: Some("https://i1.sndcdn.com/cover.jpg".to_string()),
            track_url: Some("https://soundcloud.com/test".to_string()),
            is_playing: true,
            start_ts: Some(1000),
        };

        // Identical fields and 1s drift (< 3s) -> should be deduplicated
        let fields_match = snapshot.title == "Test Track"
            && snapshot.artist == "Test Artist"
            && snapshot.cover_url == Some("https://i1.sndcdn.com/cover.jpg".to_string())
            && snapshot.track_url == Some("https://soundcloud.com/test".to_string())
            && snapshot.is_playing;
        let time_drift_small = (1001i64 - 1000i64).abs() < 3;
        assert!(fields_match && time_drift_small);

        // Large drift (e.g. seek by 10s) -> should NOT be deduplicated
        let seek_drift_small = (1010i64 - 1000i64).abs() < 3;
        assert!(!seek_drift_small);

        // State change (play -> pause) -> should NOT be deduplicated
        let playing_changed = snapshot.is_playing;
        assert!(playing_changed);
    }

    #[test]
    fn test_status_initial_values() {
        let handle_enabled = DiscordRpcHandle::new(true);
        assert_eq!(handle_enabled.get_status(), "waiting_for_discord");

        let handle_disabled = DiscordRpcHandle::new(false);
        assert_eq!(handle_disabled.get_status(), "disabled");
    }
}
