use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{self, Receiver, Sender};
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
    #[allow(dead_code)]
    SetAppId(String),
}

#[derive(Clone)]
pub struct DiscordRpcHandle {
    sender: Sender<DiscordRpcCommand>,
}

impl DiscordRpcHandle {
    pub fn new(_default_app_id: String, initial_enabled: bool) -> Self {
        let (sender, receiver) = mpsc::channel();
        thread::Builder::new()
            .name("discord-rpc-worker".to_string())
            .spawn(move || {
                run_discord_worker(receiver, initial_enabled);
            })
            .expect("Failed to spawn discord-rpc background thread");

        Self { sender }
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

    pub fn set_app_id(&self, _app_id: String) {
        // App ID is hardcoded to DISCORD_APP_ID for security and stability
    }
}

pub fn sanitize_text(s: &str, max_len: usize) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_control() && c != ' ' { ' ' } else { c })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.chars().count() > max_len {
        trimmed.chars().take(max_len).collect()
    } else {
        trimmed.to_string()
    }
}

pub fn validate_cover_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if (trimmed.starts_with("https://i1.sndcdn.com/") || trimmed.starts_with("https://a1.sndcdn.com/"))
        && url::Url::parse(trimmed).map(|u| u.scheme() == "https").unwrap_or(false)
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

pub fn validate_track_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://soundcloud.com/")
        && url::Url::parse(trimmed).map(|u| u.scheme() == "https").unwrap_or(false)
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn process_command(
    client: &mut Option<DiscordIpcClient>,
    last_payload: &mut Option<TrackPayload>,
    enabled: &mut bool,
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
            } else if let Some(payload) = last_payload.clone() {
                apply_presence(client, &payload);
            }
        }
        DiscordRpcCommand::SetAppId(_) => {
            // App ID is hardcoded to DISCORD_APP_ID
        }
        DiscordRpcCommand::Clear => {
            *last_payload = None;
            if *enabled {
                if let Some(c) = client {
                    let _ = c.clear_activity();
                }
            }
        }
        DiscordRpcCommand::Update(mut payload) => {
            payload.title = sanitize_text(&payload.title, 128);
            payload.artist = sanitize_text(&payload.artist, 128);
            *last_payload = Some(payload.clone());

            if *enabled {
                apply_presence(client, &payload);
            }
        }
    }
}

fn run_discord_worker(
    receiver: Receiver<DiscordRpcCommand>,
    mut enabled: bool,
) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut last_payload: Option<TrackPayload> = None;
    let mut last_connect_attempt = Instant::now() - Duration::from_secs(60);

    loop {
        let mut cmd = match receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(cmd) => cmd,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if enabled && client.is_none() && last_payload.is_some() {
                    if last_connect_attempt.elapsed() > Duration::from_secs(10) {
                        last_connect_attempt = Instant::now();
                        let payload = last_payload.clone().unwrap();
                        apply_presence(&mut client, &payload);
                    }
                }
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

        // Drain any stale queued commands so only the latest track state is sent to Discord
        while let Ok(next_cmd) = receiver.try_recv() {
            match (&cmd, &next_cmd) {
                // If both are Updates, replace with the newest Update
                (DiscordRpcCommand::Update(_), DiscordRpcCommand::Update(_)) => {
                    cmd = next_cmd;
                }
                // Clear overrides prior updates
                (_, DiscordRpcCommand::Clear) => {
                    cmd = next_cmd;
                }
                // When toggling enabled, process current state then switch
                _ => {
                    process_command(&mut client, &mut last_payload, &mut enabled, cmd);
                    cmd = next_cmd;
                }
            }
        }

        process_command(&mut client, &mut last_payload, &mut enabled, cmd);
    }
}

fn apply_presence(
    client: &mut Option<DiscordIpcClient>,
    payload: &TrackPayload,
) {
    if client.is_none() {
        let mut c = DiscordIpcClient::new(DISCORD_APP_ID);
        match c.connect() {
            Ok(()) => {
                log::info!("Connected to Discord IPC with App ID: {DISCORD_APP_ID}");
                *client = Some(c);
            }
            Err(e) => {
                log::debug!("Discord client connection attempt failed: {e}");
                return;
            }
        }
    }

    let c = match client.as_mut() {
        Some(c) => c,
        None => return,
    };

    let title = if payload.title.is_empty() {
        "Unknown Track".to_string()
    } else {
        payload.title.clone()
    };

    let artist = if payload.artist.is_empty() {
        "SoundCloud".to_string()
    } else {
        payload.artist.clone()
    };

    let cover_url = payload
        .cover_url
        .as_deref()
        .and_then(validate_cover_url);
    let track_url = payload
        .track_url
        .as_deref()
        .and_then(validate_track_url);

    let large_image_key = cover_url.as_deref().unwrap_or("soundcloud");
    let small_image_key = if payload.is_playing { "play" } else { "pause" };
    let small_image_text = if payload.is_playing { "Playing" } else { "Paused" };

    let assets = Assets::new()
        .large_image(large_image_key)
        .large_text(&title)
        .small_image(small_image_key)
        .small_text(small_image_text);

    let mut activity = Activity::new()
        .activity_type(ActivityType::Listening)
        .details(&title)
        .state(&artist)
        .assets(assets);

    if payload.is_playing && payload.duration_sec > 0 && payload.elapsed_sec <= payload.duration_sec {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let start = now - (payload.elapsed_sec as i64);
        let end = start + (payload.duration_sec as i64);
        activity = activity.timestamps(Timestamps::new().start(start).end(end));
    }

    if let Some(ref url) = track_url {
        let button = Button::new("Listen on SoundCloud", url);
        activity = activity.buttons(vec![button]);
    }

    if let Err(e) = c.set_activity(activity) {
        log::warn!("Failed to update Discord presence: {e}. Dropping client connection.");
        let _ = c.close();
        *client = None;
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
    }

    #[test]
    fn test_validate_cover_url() {
        assert_eq!(
            validate_cover_url("https://i1.sndcdn.com/artworks-12345-t500x500.jpg"),
            Some("https://i1.sndcdn.com/artworks-12345-t500x500.jpg".to_string())
        );
        assert_eq!(
            validate_cover_url("https://a1.sndcdn.com/avatars-67890-t500x500.jpg"),
            Some("https://a1.sndcdn.com/avatars-67890-t500x500.jpg".to_string())
        );
        // Invalid origin
        assert_eq!(validate_cover_url("https://evil.com/artwork.jpg"), None);
        // Http scheme (must be https)
        assert_eq!(validate_cover_url("http://i1.sndcdn.com/art.jpg"), None);
    }

    #[test]
    fn test_validate_track_url() {
        assert_eq!(
            validate_track_url("https://soundcloud.com/artist/great-song"),
            Some("https://soundcloud.com/artist/great-song".to_string())
        );
        // Invalid domain
        assert_eq!(validate_track_url("https://evil-soundcloud.com/song"), None);
        // Http scheme
        assert_eq!(validate_track_url("http://soundcloud.com/song"), None);
    }
}
