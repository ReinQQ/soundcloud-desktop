use base64::prelude::*;
use std::io;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use url::Url;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const RELAY_IDLE_TIMEOUT: Duration = Duration::from_secs(180);

pub struct ProxyBridge {
    pub local_port: u16,
    pub upstream_url: String,
    abort_handle: tokio::task::AbortHandle,
}

impl ProxyBridge {
    pub async fn start(upstream: Url) -> Result<Arc<Self>, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind local proxy bridge on 127.0.0.1: {e}"))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local port: {e}"))?
            .port();

        let upstream_url = upstream.to_string();
        let upstream_clone = upstream.clone();

        // Keep no strong Arc<ProxyBridge> inside the accept loop so Drop always aborts it.
        let handle = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _addr)) => {
                        let _ = stream.set_nodelay(true);
                        let up = upstream_clone.clone();
                        tokio::spawn(async move {
                            if let Err(e) = handle_client(stream, &up).await {
                                log::debug!("[ProxyBridge] Client session ended: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        log::debug!("[ProxyBridge] Listener accept error: {e}");
                        break;
                    }
                }
            }
        });

        let bridge = Arc::new(Self {
            local_port,
            upstream_url: upstream_url.clone(),
            abort_handle: handle.abort_handle(),
        });

        log::info!(
            "[ProxyBridge] Local proxy bridge listening on 127.0.0.1:{local_port} -> {}",
            crate::settings::redact_proxy_url(&upstream_url)
        );
        Ok(bridge)
    }

    pub fn shutdown(&self) {
        self.abort_handle.abort();
        log::info!("[ProxyBridge] Local proxy bridge on port {} shut down", self.local_port);
    }

    pub fn local_http_str(&self) -> String {
        format!("http://127.0.0.1:{}", self.local_port)
    }
}

impl Drop for ProxyBridge {
    fn drop(&mut self) {
        self.abort_handle.abort();
    }
}

async fn read_http_headers<S: AsyncRead + Unpin>(stream: &mut S, max_bytes: usize) -> io::Result<Vec<u8>> {
    let mut header_buf = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];
    while header_buf.len() < max_bytes {
        let n = stream.read(&mut byte).await?;
        if n == 0 {
            break;
        }
        header_buf.push(byte[0]);
        if header_buf.ends_with(b"\r\n\r\n") || header_buf.ends_with(b"\n\n") {
            break;
        }
    }
    Ok(header_buf)
}

async fn handle_client(mut client: TcpStream, upstream: &Url) -> io::Result<()> {
    let header_buf = tokio::time::timeout(HANDSHAKE_TIMEOUT, read_http_headers(&mut client, 16384))
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "Timed out reading client headers"))??;

    if header_buf.is_empty() {
        return Ok(());
    }

    let header_str = String::from_utf8_lossy(&header_buf);
    let request_line = match header_str.lines().next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }

    let method = parts[0].to_uppercase();
    let target = parts[1];
    let scheme = upstream.scheme().to_lowercase();

    if method == "CONNECT" {
        let (host, port) = parse_host_port(target, 443);
        log::debug!(
            "[ProxyBridge] CONNECT {host}:{port} -> {}",
            crate::settings::redact_proxy_url(upstream.as_ref())
        );

        let upstream_io = match tokio::time::timeout(
            HANDSHAKE_TIMEOUT,
            connect_upstream_tunnel(upstream, &host, port),
        )
        .await
        {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                let _ = client
                    .write_all(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
                    .await;
                return Err(e);
            }
            Err(_) => {
                let _ = client
                    .write_all(b"HTTP/1.1 504 Gateway Timeout\r\nConnection: close\r\n\r\n")
                    .await;
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Upstream CONNECT timed out",
                ));
            }
        };

        client
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await?;
        client.flush().await?;

        relay_bidirectional(client, upstream_io).await
    } else if scheme == "http" || scheme == "https" {
        // Forward plain HTTP request directly to HTTP/HTTPS upstream proxy with Proxy-Authorization injected.
        let mut upstream_io = match tokio::time::timeout(
            HANDSHAKE_TIMEOUT,
            connect_raw_upstream(upstream),
        )
        .await
        {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                let _ = client
                    .write_all(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
                    .await;
                return Err(e);
            }
            Err(_) => {
                let _ = client
                    .write_all(b"HTTP/1.1 504 Gateway Timeout\r\nConnection: close\r\n\r\n")
                    .await;
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Upstream HTTP proxy connection timed out",
                ));
            }
        };

        let rewritten = inject_proxy_auth_header(&header_str, upstream);
        upstream_io.write_all(rewritten.as_bytes()).await?;
        upstream_io.flush().await?;

        relay_bidirectional(client, upstream_io).await
    } else {
        // SOCKS4/SOCKS5 upstream: open tunnel to origin and rewrite proxy-form URI to origin-form.
        let (host, port) = parse_host_port_from_request(target, &header_str, 80);
        log::debug!(
            "[ProxyBridge] {method} {host}:{port} -> {}",
            crate::settings::redact_proxy_url(upstream.as_ref())
        );

        let mut upstream_io = match tokio::time::timeout(
            HANDSHAKE_TIMEOUT,
            connect_upstream_tunnel(upstream, &host, port),
        )
        .await
        {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                let _ = client
                    .write_all(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
                    .await;
                return Err(e);
            }
            Err(_) => {
                let _ = client
                    .write_all(b"HTTP/1.1 504 Gateway Timeout\r\nConnection: close\r\n\r\n")
                    .await;
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Upstream SOCKS connect timed out",
                ));
            }
        };

        let origin_req = rewrite_proxy_request_to_origin_form(&header_str);
        upstream_io.write_all(origin_req.as_bytes()).await?;
        upstream_io.flush().await?;

        relay_bidirectional(client, upstream_io).await
    }
}

enum UpstreamStream {
    Plain(TcpStream),
    Tls(Box<tokio_native_tls::TlsStream<TcpStream>>),
}

impl UpstreamStream {
    async fn read_exact(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Plain(s) => s.read_exact(buf).await,
            Self::Tls(s) => s.read_exact(buf).await,
        }
    }

    async fn read_headers(&mut self, max_bytes: usize) -> io::Result<Vec<u8>> {
        match self {
            Self::Plain(s) => read_http_headers(s, max_bytes).await,
            Self::Tls(s) => read_http_headers(s, max_bytes).await,
        }
    }

    async fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        match self {
            Self::Plain(s) => s.write_all(buf).await,
            Self::Tls(s) => s.write_all(buf).await,
        }
    }

    async fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Plain(s) => s.flush().await,
            Self::Tls(s) => s.flush().await,
        }
    }
}

async fn connect_raw_upstream(upstream: &Url) -> io::Result<UpstreamStream> {
    let scheme = upstream.scheme().to_lowercase();
    let upstream_host = upstream
        .host_str()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Missing upstream host"))?;
    let default_port = match scheme.as_str() {
        "https" => 443,
        "http" => 8080,
        _ => 1080,
    };
    let upstream_port = upstream.port().unwrap_or(default_port);

    let tcp = TcpStream::connect((upstream_host, upstream_port)).await?;
    let _ = tcp.set_nodelay(true);

    if scheme == "https" {
        let connector = native_tls::TlsConnector::new()
            .map_err(|e| io::Error::other(format!("Failed to create TLS connector: {e}")))?;
        let tls_connector = tokio_native_tls::TlsConnector::from(connector);
        let domain = upstream_host.trim_matches(|c| c == '[' || c == ']');
        let tls_stream = tls_connector
            .connect(domain, tcp)
            .await
            .map_err(|e| io::Error::other(format!("HTTPS proxy TLS handshake failed: {e}")))?;
        Ok(UpstreamStream::Tls(Box::new(tls_stream)))
    } else {
        Ok(UpstreamStream::Plain(tcp))
    }
}

async fn connect_upstream_tunnel(
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<UpstreamStream> {
    let scheme = upstream.scheme().to_lowercase();
    let mut stream = connect_raw_upstream(upstream).await?;

    if scheme.starts_with("socks5") {
        socks5_handshake(&mut stream, upstream, target_host, target_port).await?;
    } else if scheme.starts_with("socks4") {
        socks4a_handshake(&mut stream, upstream, target_host, target_port).await?;
    } else {
        http_proxy_connect(&mut stream, upstream, target_host, target_port).await?;
    }

    Ok(stream)
}

async fn http_proxy_connect(
    stream: &mut UpstreamStream,
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<()> {
    let host_header = if target_host.contains(':') && !target_host.starts_with('[') {
        format!("[{target_host}]:{target_port}")
    } else {
        format!("{target_host}:{target_port}")
    };

    let mut connect_req = format!("CONNECT {host_header} HTTP/1.1\r\nHost: {host_header}\r\n");

    if let Some((username, password)) = crate::settings::parse_proxy_credentials(upstream) {
        let auth_str = format!("{username}:{password}");
        let encoded = BASE64_STANDARD.encode(auth_str.as_bytes());
        connect_req.push_str(&format!("Proxy-Authorization: Basic {encoded}\r\n"));
    }

    connect_req.push_str("Proxy-Connection: Keep-Alive\r\n\r\n");
    stream.write_all(connect_req.as_bytes()).await?;
    stream.flush().await?;

    let buf = stream.read_headers(8192).await?;
    if buf.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "Upstream HTTP proxy closed during CONNECT",
        ));
    }

    let resp_str = String::from_utf8_lossy(&buf);
    let first_line = resp_str.lines().next().unwrap_or("");
    let status_code = first_line.split_whitespace().nth(1).unwrap_or("");
    if status_code != "200" {
        return Err(io::Error::new(
            io::ErrorKind::ConnectionRefused,
            format!("Upstream proxy rejected CONNECT: {first_line}"),
        ));
    }

    Ok(())
}

async fn socks5_handshake(
    stream: &mut UpstreamStream,
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<()> {
    let creds = crate::settings::parse_proxy_credentials(upstream);

    if creds.is_some() {
        stream.write_all(&[0x05, 0x02, 0x00, 0x02]).await?;
    } else {
        stream.write_all(&[0x05, 0x01, 0x00]).await?;
    }
    stream.flush().await?;

    let mut method_resp = [0u8; 2];
    stream.read_exact(&mut method_resp).await?;
    if method_resp[0] != 0x05 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid SOCKS5 version from server",
        ));
    }

    match method_resp[1] {
        0x00 => {}
        0x02 => {
            let (username, password) = creds.unwrap_or_default();
            let u_bytes = username.as_bytes();
            let p_bytes = password.as_bytes();
            if u_bytes.len() > 255 || p_bytes.len() > 255 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "SOCKS5 credentials exceed 255-byte RFC 1929 limit",
                ));
            }
            let mut auth_req = Vec::with_capacity(3 + u_bytes.len() + p_bytes.len());
            auth_req.push(0x01);
            auth_req.push(u_bytes.len() as u8);
            auth_req.extend_from_slice(u_bytes);
            auth_req.push(p_bytes.len() as u8);
            auth_req.extend_from_slice(p_bytes);

            stream.write_all(&auth_req).await?;
            stream.flush().await?;

            let mut auth_resp = [0u8; 2];
            stream.read_exact(&mut auth_resp).await?;
            if auth_resp[1] != 0x00 {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "SOCKS5 authentication failed",
                ));
            }
        }
        0xFF => {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "No acceptable SOCKS5 auth methods",
            ));
        }
        unknown => {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                format!("Unsupported SOCKS5 auth method: {unknown}"),
            ));
        }
    }

    let clean_host = target_host.trim_matches(|c| c == '[' || c == ']');
    let mut req = Vec::with_capacity(32);
    req.extend_from_slice(&[0x05, 0x01, 0x00]);

    if let Ok(ipv4) = clean_host.parse::<Ipv4Addr>() {
        req.push(0x01);
        req.extend_from_slice(&ipv4.octets());
    } else if let Ok(ipv6) = clean_host.parse::<Ipv6Addr>() {
        req.push(0x04);
        req.extend_from_slice(&ipv6.octets());
    } else {
        let host_bytes = clean_host.as_bytes();
        if host_bytes.len() > 255 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Target hostname exceeds 255 bytes",
            ));
        }
        req.push(0x03);
        req.push(host_bytes.len() as u8);
        req.extend_from_slice(host_bytes);
    }

    req.push((target_port >> 8) as u8);
    req.push((target_port & 0xFF) as u8);

    stream.write_all(&req).await?;
    stream.flush().await?;

    let mut resp_header = [0u8; 4];
    stream.read_exact(&mut resp_header).await?;
    if resp_header[0] != 0x05 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid SOCKS5 reply version",
        ));
    }
    if resp_header[1] != 0x00 {
        return Err(io::Error::new(
            io::ErrorKind::ConnectionRefused,
            format!("SOCKS5 connect failed with status 0x{:02x}", resp_header[1]),
        ));
    }

    match resp_header[3] {
        0x01 => {
            let mut addr = [0u8; 6];
            stream.read_exact(&mut addr).await?;
        }
        0x03 => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len).await?;
            let mut domain = vec![0u8; len[0] as usize + 2];
            stream.read_exact(&mut domain).await?;
        }
        0x04 => {
            let mut addr = [0u8; 18];
            stream.read_exact(&mut addr).await?;
        }
        _ => {}
    }

    Ok(())
}

async fn socks4a_handshake(
    stream: &mut UpstreamStream,
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<()> {
    let username = crate::settings::parse_proxy_credentials(upstream)
        .map(|(u, _)| u)
        .unwrap_or_default();

    let mut req = Vec::with_capacity(32);
    req.push(0x04);
    req.push(0x01);
    req.push((target_port >> 8) as u8);
    req.push((target_port & 0xFF) as u8);

    if let Ok(ipv4) = target_host.parse::<Ipv4Addr>() {
        req.extend_from_slice(&ipv4.octets());
        req.extend_from_slice(username.as_bytes());
        req.push(0x00);
    } else {
        req.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
        req.extend_from_slice(username.as_bytes());
        req.push(0x00);
        req.extend_from_slice(target_host.as_bytes());
        req.push(0x00);
    }

    stream.write_all(&req).await?;
    stream.flush().await?;

    let mut resp = [0u8; 8];
    stream.read_exact(&mut resp).await?;
    if resp[1] != 0x5A {
        return Err(io::Error::new(
            io::ErrorKind::ConnectionRefused,
            format!("SOCKS4 request rejected with code 0x{:02x}", resp[1]),
        ));
    }

    Ok(())
}

async fn copy_with_half_close<R, W>(mut reader: R, mut writer: W) -> io::Result<u64>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buf = [0u8; 16384];
    let mut total = 0u64;
    loop {
        let n = match tokio::time::timeout(RELAY_IDLE_TIMEOUT, reader.read(&mut buf)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => n,
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Proxy relay idle timeout",
                ));
            }
        };
        writer.write_all(&buf[..n]).await?;
        total += n as u64;
    }
    // Half-close write side (Shutdown::Write) so the peer finishes draining remaining TLS/HTTP frames.
    let _ = writer.shutdown().await;
    Ok(total)
}

async fn relay_streams<U>(client: TcpStream, upstream: U) -> io::Result<()>
where
    U: AsyncRead + AsyncWrite + Unpin,
{
    let (cr, cw) = tokio::io::split(client);
    let (ur, uw) = tokio::io::split(upstream);

    let c2u = copy_with_half_close(cr, uw);
    let u2c = copy_with_half_close(ur, cw);

    let (_r1, _r2) = tokio::join!(c2u, u2c);
    Ok(())
}

async fn relay_bidirectional(client: TcpStream, upstream: UpstreamStream) -> io::Result<()> {
    match upstream {
        UpstreamStream::Plain(s) => relay_streams(client, s).await,
        UpstreamStream::Tls(s) => relay_streams(client, *s).await,
    }
}

fn parse_host_port(target: &str, default_port: u16) -> (String, u16) {
    let trimmed = target.trim();
    if let Some(rest) = trimmed.strip_prefix('[')
        && let Some((host, after)) = rest.split_once(']')
    {
        let port = after
            .strip_prefix(':')
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(default_port);
        return (host.to_string(), port);
    }
    if let Some((h, p)) = trimmed.rsplit_once(':')
        && let Ok(port) = p.parse::<u16>()
    {
        return (h.to_string(), port);
    }
    (trimmed.to_string(), default_port)
}

fn parse_host_port_from_request(target: &str, headers: &str, default_port: u16) -> (String, u16) {
    if (target.starts_with("http://") || target.starts_with("https://"))
        && let Ok(u) = Url::parse(target)
    {
        let h = u.host_str().unwrap_or("127.0.0.1").to_string();
        let p = u.port_or_known_default().unwrap_or(default_port);
        return (h, p);
    }

    for line in headers.lines() {
        if line.len() > 5 && line[..5].eq_ignore_ascii_case("host:") {
            let host_val = line[5..].trim();
            return parse_host_port(host_val, default_port);
        }
    }

    ("127.0.0.1".to_string(), default_port)
}

fn inject_proxy_auth_header(header_str: &str, upstream: &Url) -> String {
    let creds = crate::settings::parse_proxy_credentials(upstream);
    let mut lines = header_str.lines();
    let Some(first_line) = lines.next() else {
        return header_str.to_string();
    };

    let mut out = String::with_capacity(header_str.len() + 128);
    out.push_str(first_line);
    out.push_str("\r\n");

    if let Some((user, pass)) = creds {
        let encoded = BASE64_STANDARD.encode(format!("{user}:{pass}").as_bytes());
        out.push_str(&format!("Proxy-Authorization: Basic {encoded}\r\n"));
    }

    for line in lines {
        if line.is_empty() {
            continue;
        }
        if line.len() >= 20 && line[..20].eq_ignore_ascii_case("proxy-authorization:") {
            continue;
        }
        out.push_str(line);
        out.push_str("\r\n");
    }
    out.push_str("\r\n");
    out
}

fn rewrite_proxy_request_to_origin_form(header_str: &str) -> String {
    let mut lines = header_str.lines();
    let Some(first_line) = lines.next() else {
        return header_str.to_string();
    };

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    let mut out = String::with_capacity(header_str.len());

    if parts.len() >= 3
        && (parts[1].starts_with("http://") || parts[1].starts_with("https://"))
        && let Ok(u) = Url::parse(parts[1])
    {
        let mut path_and_query = u.path().to_string();
        if let Some(q) = u.query() {
            path_and_query.push('?');
            path_and_query.push_str(q);
        }
        out.push_str(&format!("{} {} {}\r\n", parts[0], path_and_query, parts[2]));
    } else {
        out.push_str(first_line);
        out.push_str("\r\n");
    }

    for line in lines {
        if line.is_empty() {
            continue;
        }
        if line.len() >= 17 && line[..17].eq_ignore_ascii_case("proxy-connection:") {
            continue;
        }
        out.push_str(line);
        out.push_str("\r\n");
    }
    out.push_str("\r\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_host_port_variants() {
        assert_eq!(parse_host_port("soundcloud.com:443", 443), ("soundcloud.com".to_string(), 443));
        assert_eq!(parse_host_port("soundcloud.com", 443), ("soundcloud.com".to_string(), 443));
        assert_eq!(parse_host_port("[::1]:8443", 443), ("::1".to_string(), 8443));
        assert_eq!(parse_host_port("[2001:db8::1]", 443), ("2001:db8::1".to_string(), 443));
    }

    #[test]
    fn test_rewrite_proxy_request_to_origin_form() {
        let raw = "GET http://example.com/api/test?a=1 HTTP/1.1\r\nHost: example.com\r\nProxy-Connection: keep-alive\r\n\r\n";
        let rewritten = rewrite_proxy_request_to_origin_form(raw);
        assert!(rewritten.starts_with("GET /api/test?a=1 HTTP/1.1\r\n"));
        assert!(!rewritten.to_lowercase().contains("proxy-connection:"));
    }

    #[tokio::test]
    async fn test_proxy_bridge_drop_releases_listener() {
        let upstream = Url::parse("socks5://127.0.0.1:10808").unwrap();
        let bridge = ProxyBridge::start(upstream).await.unwrap();
        let port = bridge.local_port;
        assert!(port > 0);
        assert_eq!(Arc::strong_count(&bridge), 1);
        drop(bridge);
        tokio::time::sleep(Duration::from_millis(50)).await;
        // Listener task should have aborted and released the port.
        assert!(TcpListener::bind(("127.0.0.1", port)).await.is_ok());
    }
}
