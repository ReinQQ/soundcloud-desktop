use base64::prelude::*;
use futures::StreamExt;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;
use url::Url;

pub const CHROME_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const MAX_POST_BODY_BYTES: usize = 1024 * 1024;

pub fn generate_session_token() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let state = RandomState::new();
    let mut hasher1 = state.build_hasher();
    hasher1.write_u128(now);
    hasher1.write_u32(std::process::id());
    let h1 = hasher1.finish();

    let mut hasher2 = state.build_hasher();
    hasher2.write_u64(h1);
    hasher2.write_u128(now.rotate_left(17));
    let h2 = hasher2.finish();

    format!("{h1:016x}{h2:016x}")
}

struct MediaRelayInner {
    local_port: u16,
    session_token: String,
    client: Arc<RwLock<reqwest::Client>>,
    settings: Option<Arc<std::sync::RwLock<crate::settings::AppSettings>>>,
}

pub struct MediaRelay {
    pub local_port: u16,
    inner: Arc<MediaRelayInner>,
    abort_handle: tokio::task::AbortHandle,
}

fn is_allowed_upstream_host(host: &str) -> bool {
    let h = host.to_lowercase();
    h == "sndcdn.com"
        || h.ends_with(".sndcdn.com")
        || h == "soundcloud.com"
        || h.ends_with(".soundcloud.com")
        || h == "soundcloud.cloud"
        || h.ends_with(".soundcloud.cloud")
}

pub fn is_api_host(host: &str) -> bool {
    let h = host.to_lowercase();
    h == "api-v2.soundcloud.com"
        || h == "api.soundcloud.com"
        || h == "api-auth.soundcloud.com"
        || h == "api-partner.soundcloud.com"
}

pub fn determine_content_type(target_url: &str, upstream_ct: &str) -> String {
    let lower_url = target_url.to_lowercase();
    let path = lower_url.split('?').next().unwrap_or(&lower_url);
    if path.ends_with(".m3u8") || upstream_ct.contains("mpegurl") || upstream_ct.contains("m3u8") {
        "application/vnd.apple.mpegurl".to_string()
    } else if path.ends_with(".m4s")
        || path.ends_with(".mp4")
        || path.contains("init")
        || upstream_ct.contains("mp4")
    {
        "audio/mp4".to_string()
    } else if path.ends_with(".aac") || upstream_ct.contains("aac") {
        "audio/aac".to_string()
    } else if path.ends_with(".mp3") || upstream_ct.contains("mpeg") || upstream_ct.contains("mp3")
    {
        "audio/mpeg".to_string()
    } else if lower_url.contains("/playback/widevine") || lower_url.contains("/playback/playready")
    {
        "application/octet-stream".to_string()
    } else if !upstream_ct.is_empty()
        && upstream_ct != "binary/octet-stream"
        && upstream_ct != "application/octet-stream"
    {
        upstream_ct.to_string()
    } else if lower_url.contains(".m4s") || lower_url.contains(".mp4") {
        "audio/mp4".to_string()
    } else {
        "audio/mpeg".to_string()
    }
}

fn decode_upstream_url(encoded: &str) -> Result<String, String> {
    let bytes = BASE64_URL_SAFE_NO_PAD
        .decode(encoded)
        .or_else(|_| BASE64_URL_SAFE.decode(encoded))
        .or_else(|_| BASE64_STANDARD.decode(encoded))
        .map_err(|e| format!("Base64 decode error: {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("UTF-8 decode error: {e}"))
}

fn resolve_url(base: &Url, relative_or_absolute: &str) -> String {
    if relative_or_absolute.starts_with("http://") || relative_or_absolute.starts_with("https://") {
        relative_or_absolute.to_string()
    } else {
        base.join(relative_or_absolute)
            .map(|u| u.to_string())
            .unwrap_or_else(|_| relative_or_absolute.to_string())
    }
}

fn rewrite_tag_uri(line: &str, base: &Url, inner: &MediaRelayInner) -> String {
    if let Some(pos) = line.find("URI=\"") {
        let val_start = pos + 5;
        if let Some(val_len) = line[val_start..].find('"') {
            let uri_val = &line[val_start..val_start + val_len];
            if !uri_val.starts_with("data:") && !uri_val.starts_with("skd:") {
                let full_uri = resolve_url(base, uri_val);
                let relay_uri = inner.create_relay_url(&full_uri);
                let mut rewritten = String::with_capacity(line.len() + relay_uri.len());
                rewritten.push_str(&line[..val_start]);
                rewritten.push_str(&relay_uri);
                rewritten.push_str(&line[val_start + val_len..]);
                return rewritten;
            }
        }
    }
    line.to_string()
}

impl MediaRelayInner {
    fn create_relay_url(&self, upstream_url: &str) -> String {
        let encoded = BASE64_URL_SAFE_NO_PAD.encode(upstream_url);
        format!(
            "http://127.0.0.1:{}/stream?t={}&u={}",
            self.local_port, self.session_token, encoded
        )
    }

    async fn handle_connection(&self, mut socket: TcpStream) {
        let mut buffer = [0u8; 4096];
        let mut request_bytes = Vec::new();

        let header_pos = match tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                match socket.read(&mut buffer).await {
                    Ok(0) => return None,
                    Ok(n) => {
                        request_bytes.extend_from_slice(&buffer[..n]);
                        if let Some(pos) = request_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                            return Some(pos);
                        }
                        if request_bytes.len() > 16384 {
                            let _ = socket
                                .write_all(
                                    b"HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n",
                                )
                                .await;
                            return None;
                        }
                    }
                    Err(_) => return None,
                }
            }
        })
        .await
        {
            Ok(Some(pos)) => pos,
            _ => return,
        };

        let request_str = match std::str::from_utf8(&request_bytes[..header_pos]) {
            Ok(s) => s,
            Err(_) => {
                let _ = socket
                    .write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
                    .await;
                return;
            }
        };

        let mut lines = request_str.lines();
        let request_line = match lines.next() {
            Some(l) => l,
            None => return,
        };

        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("").to_uppercase();
        let uri = parts.next().unwrap_or("");

        let mut range_header: Option<String> = None;
        let mut auth_header: Option<String> = None;
        let mut content_type_header: Option<String> = None;
        let mut content_length: usize = 0;

        for line in lines {
            if line.is_empty() {
                break;
            }
            if let Some((name, val)) = line.split_once(':') {
                let n = name.trim();
                let v = val.trim();
                if n.eq_ignore_ascii_case("range") {
                    range_header = Some(v.to_string());
                } else if n.eq_ignore_ascii_case("authorization") {
                    auth_header = Some(v.to_string());
                } else if n.eq_ignore_ascii_case("content-type") {
                    content_type_header = Some(v.to_string());
                } else if n.eq_ignore_ascii_case("content-length") {
                    content_length = v.parse::<usize>().unwrap_or(0);
                }
            }
        }

        if method == "OPTIONS" {
            let response = "HTTP/1.1 204 No Content\r\n\
                Access-Control-Allow-Origin: *\r\n\
                Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n\
                Access-Control-Allow-Headers: *\r\n\
                Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, Content-Type\r\n\
                Access-Control-Allow-Private-Network: true\r\n\
                Content-Length: 0\r\n\
                Connection: close\r\n\r\n";
            let _ = socket.write_all(response.as_bytes()).await;
            return;
        }

        if method != "GET" && method != "HEAD" && method != "POST" {
            let _ = socket
                .write_all(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
                .await;
            return;
        }

        if content_length > MAX_POST_BODY_BYTES {
            let _ = socket
                .write_all(b"HTTP/1.1 413 Payload Too Large\r\nConnection: close\r\n\r\n")
                .await;
            return;
        }

        let mut body_bytes = request_bytes[header_pos + 4..].to_vec();
        if content_length > body_bytes.len() {
            let _ = tokio::time::timeout(Duration::from_secs(15), async {
                while body_bytes.len() < content_length {
                    match socket.read(&mut buffer).await {
                        Ok(0) => break,
                        Ok(n) => body_bytes.extend_from_slice(&buffer[..n]),
                        Err(_) => break,
                    }
                }
            })
            .await;
        }
        if content_length > 0 && body_bytes.len() > content_length {
            body_bytes.truncate(content_length);
        }

        let query_str = match uri.split_once('?') {
            Some(("/stream", q)) => q,
            _ => {
                let _ = socket
                    .write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
                    .await;
                return;
            }
        };

        let mut token_opt: Option<String> = None;
        let mut url_param_opt: Option<String> = None;

        for pair in query_str.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "t" {
                    token_opt = Some(v.to_string());
                } else if k == "u" {
                    url_param_opt = Some(v.to_string());
                }
            }
        }

        let token = match token_opt {
            Some(t) => t,
            None => {
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nMissing session token",
                    )
                    .await;
                return;
            }
        };

        if token != self.session_token {
            let _ = socket
                .write_all(
                    b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nInvalid session token",
                )
                .await;
            return;
        }

        let encoded_url = match url_param_opt {
            Some(u) => u,
            None => {
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nMissing upstream URL parameter",
                    )
                    .await;
                return;
            }
        };

        let target_url_str = match decode_upstream_url(&encoded_url) {
            Ok(u) => u,
            Err(e) => {
                let err_resp =
                    format!("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n{e}");
                let _ = socket.write_all(err_resp.as_bytes()).await;
                return;
            }
        };

        let parsed_target = match Url::parse(&target_url_str) {
            Ok(u) => u,
            Err(e) => {
                let err_resp = format!(
                    "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid target URL: {e}"
                );
                let _ = socket.write_all(err_resp.as_bytes()).await;
                return;
            }
        };

        let host = parsed_target.host_str().unwrap_or("");
        if !is_allowed_upstream_host(host) {
            log::warn!("[MediaRelay] Blocked request for unapproved host: {host}");
            let _ = socket
                .write_all(
                    b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nHost not in allowlist",
                )
                .await;
            return;
        }

        let client = self.client.read().await.clone();
        let mut req = if method == "HEAD" {
            client.head(&target_url_str)
        } else if method == "POST" {
            let mut post_req = client.post(&target_url_str).body(body_bytes);
            if let Some(ref ct) = content_type_header {
                post_req = post_req.header("Content-Type", ct);
            } else {
                post_req = post_req.header("Content-Type", "application/octet-stream");
            }
            post_req
        } else {
            client.get(&target_url_str)
        };

        if let Some(ref range) = range_header {
            req = req.header("Range", range);
        }

        let is_license_request = host.contains("license")
            || host.contains("widevine")
            || parsed_target.path().contains("/widevine")
            || parsed_target.path().contains("/playback/");

        if is_api_host(host) || is_license_request {
            req = req
                .header("Origin", "https://soundcloud.com")
                .header("Referer", "https://soundcloud.com/");
            let (stored_oauth, stored_dd) = if let Some(ref s_lock) = self.settings
                && let Ok(s) = s_lock.read()
            {
                (
                    s.oauth_token.clone().filter(|t| !t.is_empty()),
                    s.datadome_cookie.clone().filter(|d| !d.is_empty()),
                )
            } else {
                (None, None)
            };

            if let Some(ref auth) = auth_header {
                req = req.header("Authorization", auth);
            } else if let Some(oauth) = stored_oauth {
                req = req.header("Authorization", format!("OAuth {oauth}"));
            }

            if let Some(dd) = stored_dd {
                req = req.header("Cookie", format!("datadome={dd}"));
            }
        }
        // Do NOT send Authorization or Origin to *.sndcdn.com or *.soundcloud.cloud CDN media segments.
        req = req.header("User-Agent", CHROME_USER_AGENT);

        let upstream_resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                log::warn!("[MediaRelay] Upstream request failed for {host}: {e}");
                let err_resp = format!(
                    "HTTP/1.1 502 Bad Gateway\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nUpstream proxy fetch failed: {e}"
                );
                let _ = socket.write_all(err_resp.as_bytes()).await;
                return;
            }
        };

        let status = upstream_resp.status();
        if status == reqwest::StatusCode::PROXY_AUTHENTICATION_REQUIRED {
            log::error!("[MediaRelay] Upstream proxy returned HTTP 407 Proxy Authentication Required");
            let err_resp = "HTTP/1.1 502 Bad Gateway\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nProxy authentication failed (HTTP 407 from upstream proxy)";
            let _ = socket.write_all(err_resp.as_bytes()).await;
            return;
        }
        if is_license_request {
            log::info!(
                "[MediaRelay] Widevine license request to {host} (method: {method}) -> upstream status: {status}"
            );
        }

        let upstream_content_type = upstream_resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        let lower_ct = upstream_content_type.to_lowercase();
        let lower_url = target_url_str.to_lowercase();
        let is_m3u8 = lower_ct.contains("mpegurl")
            || lower_ct.contains("m3u8")
            || lower_url.contains(".m3u8");

        if method == "GET" && status.is_success() && is_m3u8 {
            let playlist_body = match upstream_resp.text().await {
                Ok(t) => t,
                Err(e) => {
                    let err_resp = format!(
                        "HTTP/1.1 502 Bad Gateway\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nFailed to read playlist: {e}"
                    );
                    let _ = socket.write_all(err_resp.as_bytes()).await;
                    return;
                }
            };

            let mut rewritten_lines = Vec::new();
            for line in playlist_body.lines() {
                if line.starts_with("#EXT-X-MAP:")
                    || line.starts_with("#EXT-X-KEY:")
                    || line.starts_with("#EXT-X-SESSION-KEY:")
                    || line.starts_with("#EXT-X-MEDIA:")
                    || line.starts_with("#EXT-X-I-FRAME-STREAM-INF:")
                {
                    rewritten_lines.push(rewrite_tag_uri(line, &parsed_target, self));
                } else if !line.starts_with('#') && !line.trim().is_empty() {
                    let full_uri = resolve_url(&parsed_target, line.trim());
                    let relay_uri = self.create_relay_url(&full_uri);
                    rewritten_lines.push(relay_uri);
                } else {
                    rewritten_lines.push(line.to_string());
                }
            }

            let rewritten_body = rewritten_lines.join("\n");
            let header_str = format!(
                "HTTP/1.1 200 OK\r\n\
                Content-Type: application/vnd.apple.mpegurl\r\n\
                Content-Length: {}\r\n\
                Access-Control-Allow-Origin: *\r\n\
                Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n\
                Access-Control-Allow-Headers: *\r\n\
                Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, Content-Type\r\n\
                Access-Control-Allow-Private-Network: true\r\n\
                Connection: close\r\n\r\n",
                rewritten_body.len()
            );

            let _ = socket.write_all(header_str.as_bytes()).await;
            let _ = socket.write_all(rewritten_body.as_bytes()).await;
            let _ = socket.flush().await;
            return;
        }

        let content_type = determine_content_type(&target_url_str, &upstream_content_type);

        let content_length = upstream_resp
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let content_range = upstream_resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let status_code = status.as_u16();
        let reason = status.canonical_reason().unwrap_or("OK");

        let mut response_headers = format!("HTTP/1.1 {status_code} {reason}\r\n");
        response_headers.push_str(&format!("Content-Type: {content_type}\r\n"));
        response_headers.push_str("Accept-Ranges: bytes\r\n");
        response_headers.push_str("Access-Control-Allow-Origin: *\r\n");
        response_headers.push_str("Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n");
        response_headers.push_str("Access-Control-Allow-Headers: *\r\n");
        response_headers.push_str(
            "Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, Content-Type\r\n",
        );
        response_headers.push_str("Access-Control-Allow-Private-Network: true\r\n");
        response_headers.push_str("Connection: close\r\n");

        if let Some(ref cr) = content_range {
            response_headers.push_str(&format!("Content-Range: {cr}\r\n"));
        }
        if let Some(ref cl) = content_length {
            response_headers.push_str(&format!("Content-Length: {cl}\r\n"));
        }
        response_headers.push_str("\r\n");

        if socket.write_all(response_headers.as_bytes()).await.is_err() {
            return;
        }

        if method == "HEAD" {
            let _ = socket.flush().await;
            return;
        }

        let mut stream = upstream_resp.bytes_stream();
        while let Some(chunk_res) = stream.next().await {
            match chunk_res {
                Ok(chunk) => {
                    if socket.write_all(&chunk).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    log::warn!("[MediaRelay] Streaming error from upstream {host}: {e}");
                    break;
                }
            }
        }
        let _ = socket.flush().await;
    }
}

impl MediaRelay {
    pub async fn start(
        client: Arc<RwLock<reqwest::Client>>,
        settings: Option<Arc<std::sync::RwLock<crate::settings::AppSettings>>>,
    ) -> Result<Arc<Self>, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind loopback MediaRelay listener: {e}"))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get MediaRelay port: {e}"))?
            .port();
        let session_token = generate_session_token();

        let inner = Arc::new(MediaRelayInner {
            local_port,
            session_token,
            client,
            settings,
        });
        let inner_for_loop = inner.clone();

        // Accept loop only holds inner state (never MediaRelay), so Drop always aborts cleanly.
        let handle = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((socket, _addr)) => {
                        let r = inner_for_loop.clone();
                        tokio::spawn(async move {
                            r.handle_connection(socket).await;
                        });
                    }
                    Err(e) => {
                        log::debug!("[MediaRelay] Listener accept error: {e}");
                        break;
                    }
                }
            }
        });

        let relay = Arc::new(Self {
            local_port,
            inner,
            abort_handle: handle.abort_handle(),
        });

        log::info!(
            "[MediaRelay] Loopback media streaming relay listening on 127.0.0.1:{local_port}"
        );
        Ok(relay)
    }

    pub fn shutdown(&self) {
        self.abort_handle.abort();
        log::info!(
            "[MediaRelay] Loopback media relay on port {} shut down",
            self.inner.local_port
        );
    }

    pub fn create_relay_url(&self, upstream_url: &str) -> String {
        self.inner.create_relay_url(upstream_url)
    }
}

impl Drop for MediaRelay {
    fn drop(&mut self) {
        self.abort_handle.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rewrite_tag_uri() {
        let base = Url::parse(
            "https://playback.media-streaming.soundcloud.cloud/cbcs/track/playlist.m3u8",
        )
        .unwrap();
        let inner = MediaRelayInner {
            local_port: 50000,
            session_token: "testtoken123".to_string(),
            client: Arc::new(RwLock::new(reqwest::Client::new())),
            settings: None,
        };

        let aes_line = r#"#EXT-X-KEY:METHOD=AES-128,URI="https://playback.media-streaming.soundcloud.cloud/keys/key1.bin",IV=0x1234"#;
        let rewritten_aes = rewrite_tag_uri(aes_line, &base, &inner);
        assert!(rewritten_aes.contains("http://127.0.0.1:50000/stream?t=testtoken123&u="));
        assert!(rewritten_aes.contains("IV=0x1234"));

        let skd_line = r#"#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://726bbffaf9b35c949259c11bac3a44c1",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1""#;
        assert_eq!(rewrite_tag_uri(skd_line, &base, &inner), skd_line);

        let data_line = r#"#EXT-X-KEY:METHOD=SAMPLE-AES,URI="data:text/plain;base64,AAAAa3Bzc2g=",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed""#;
        assert_eq!(rewrite_tag_uri(data_line, &base, &inner), data_line);

        let map_line = r#"#EXT-X-MAP:URI="init.mp4""#;
        let rewritten_map = rewrite_tag_uri(map_line, &base, &inner);
        assert!(rewritten_map.starts_with(r#"#EXT-X-MAP:URI="http://127.0.0.1:50000/stream?t=testtoken123&u="#));

        let media_line = r#"#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="HQ",URI="audio_hq.m3u8""#;
        let rewritten_media = rewrite_tag_uri(media_line, &base, &inner);
        assert!(rewritten_media.contains(r#"URI="http://127.0.0.1:50000/stream?t=testtoken123&u="#));
    }
}
