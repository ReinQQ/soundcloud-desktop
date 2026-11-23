use base64::prelude::*;
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tokio::net::TcpListener;
use url::Url;

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

        let (bridge_tx, bridge_rx) = tokio::sync::oneshot::channel::<Arc<ProxyBridge>>();

        let handle = tokio::spawn(async move {
            let _bridge_ref = match bridge_rx.await {
                Ok(b) => b,
                Err(_) => return,
            };
            loop {
                match listener.accept().await {
                    Ok((tokio_stream, _addr)) => {
                        let up = upstream_clone.clone();
                        tokio::task::spawn_blocking(move || {
                            if let Ok(std_stream) = tokio_stream.into_std()
                                && let Err(e) = handle_client(std_stream, &up) {
                                    log::debug!("Proxy bridge client session ended: {e}");
                                }
                        });
                    }
                    Err(e) => {
                        log::debug!("Proxy bridge listener closed or accept error: {e}");
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

        let _ = bridge_tx.send(bridge.clone());

        log::info!(
            "Local authenticated proxy bridge running on 127.0.0.1:{local_port} -> {}",
            crate::settings::redact_proxy_url(&upstream_url)
        );
        Ok(bridge)
    }

    pub fn shutdown(&self) {
        self.abort_handle.abort();
        log::info!("[ProxyBridge] Local proxy bridge on port {} shut down", self.local_port);
    }

    #[allow(dead_code)]
    pub fn local_http_url(&self) -> Result<Url, url::ParseError> {
        Url::parse(&self.local_http_str())
    }

    pub fn local_http_str(&self) -> String {
        format!("http://127.0.0.1:{}", self.local_port)
    }

    pub fn current_local_endpoint(&self) -> Option<String> {
        Some(format!("http://127.0.0.1:{}", self.local_port))
    }
}

impl Drop for ProxyBridge {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub fn needs_proxy_bridge(parsed_url: &Url) -> bool {
    let scheme = parsed_url.scheme().to_lowercase();
    let has_credentials = !parsed_url.username().is_empty() || parsed_url.password().is_some();

    // SOCKS proxies or any proxy with credentials require our local loopback bridge
    scheme.starts_with("socks") || has_credentials
}

fn handle_client(mut client: TcpStream, upstream: &Url) -> io::Result<()> {
    client.set_read_timeout(Some(Duration::from_secs(30)))?;
    client.set_write_timeout(Some(Duration::from_secs(30)))?;

    // Read initial request headers from WebView2 (until \r\n\r\n)
    let mut header_buf = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];
    while header_buf.len() < 16384 {
        if client.read(&mut byte)? == 0 {
            return Ok(());
        }
        header_buf.push(byte[0]);
        if header_buf.ends_with(b"\r\n\r\n") || header_buf.ends_with(b"\n\n") {
            break;
        }
    }

    let header_str = String::from_utf8_lossy(&header_buf);
    let mut lines = header_str.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }

    let method = parts[0].to_uppercase();
    let target = parts[1];

    if method == "CONNECT" {
        // HTTPS Tunneling
        let (host, port) = parse_host_port(target, 443);
        log::info!(
            "[ProxyBridge] CONNECT {}:{} -> upstream {}",
            host,
            port,
            crate::settings::redact_proxy_url(upstream.as_ref())
        );
        let upstream_stream = connect_upstream_tunnel(upstream, &host, port)?;

        // Send 200 Connection Established back to client
        client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")?;
        client.flush()?;

        // Apply streaming keep-alive idle timeouts (180s)
        client.set_read_timeout(Some(Duration::from_secs(180)))?;
        client.set_write_timeout(Some(Duration::from_secs(180)))?;
        upstream_stream.set_read_timeout(Some(Duration::from_secs(180)))?;
        upstream_stream.set_write_timeout(Some(Duration::from_secs(180)))?;

        // Bidirectional relay
        relay_bidirectional(client, upstream_stream)?;
    } else {
        // Plain HTTP Request
        let (host, port) = parse_host_port_from_request(target, &header_str, 80);
        log::info!(
            "[ProxyBridge] {} {}:{} -> upstream {}",
            method,
            host,
            port,
            crate::settings::redact_proxy_url(upstream.as_ref())
        );
        let mut upstream_stream = connect_upstream_tunnel(upstream, &host, port)?;

        // Forward the original request bytes
        upstream_stream.write_all(&header_buf)?;
        upstream_stream.flush()?;

        client.set_read_timeout(Some(Duration::from_secs(180)))?;
        client.set_write_timeout(Some(Duration::from_secs(180)))?;
        upstream_stream.set_read_timeout(Some(Duration::from_secs(180)))?;
        upstream_stream.set_write_timeout(Some(Duration::from_secs(180)))?;

        relay_bidirectional(client, upstream_stream)?;
    }

    Ok(())
}

fn parse_host_port(target: &str, default_port: u16) -> (String, u16) {
    if let Some((h, p)) = target.split_once(':') {
        (h.to_string(), p.parse::<u16>().unwrap_or(default_port))
    } else {
        (target.to_string(), default_port)
    }
}

fn parse_host_port_from_request(target: &str, headers: &str, default_port: u16) -> (String, u16) {
    if (target.starts_with("http://") || target.starts_with("https://"))
        && let Ok(u) = Url::parse(target) {
            let h = u.host_str().unwrap_or("127.0.0.1").to_string();
            let p = u.port().unwrap_or(default_port);
            return (h, p);
        }

    for line in headers.lines() {
        if line.to_lowercase().starts_with("host:") {
            let host_val = line[5..].trim();
            return parse_host_port(host_val, default_port);
        }
    }

    ("127.0.0.1".to_string(), default_port)
}

fn connect_upstream_tunnel(upstream: &Url, target_host: &str, target_port: u16) -> io::Result<TcpStream> {
    let scheme = upstream.scheme().to_lowercase();
    let upstream_host = upstream.host_str().unwrap_or("127.0.0.1");

    if scheme.starts_with("socks5") {
        let upstream_port = upstream.port().unwrap_or(1080);
        let mut stream = TcpStream::connect_timeout(
            &resolve_host_port(upstream_host, upstream_port)?,
            Duration::from_secs(10),
        )?;
        socks5_handshake(&mut stream, upstream, target_host, target_port)?;
        Ok(stream)
    } else if scheme.starts_with("socks4") {
        let upstream_port = upstream.port().unwrap_or(1080);
        let mut stream = TcpStream::connect_timeout(
            &resolve_host_port(upstream_host, upstream_port)?,
            Duration::from_secs(10),
        )?;
        socks4a_handshake(&mut stream, upstream, target_host, target_port)?;
        Ok(stream)
    } else {
        // HTTP / HTTPS Proxy
        let upstream_port = upstream.port().unwrap_or(8080);
        let mut stream = TcpStream::connect_timeout(
            &resolve_host_port(upstream_host, upstream_port)?,
            Duration::from_secs(10),
        )?;
        http_proxy_connect(&mut stream, upstream, target_host, target_port)?;
        Ok(stream)
    }
}

fn resolve_host_port(host: &str, port: u16) -> io::Result<SocketAddr> {
    use std::net::ToSocketAddrs;
    let addrs = format!("{host}:{port}").to_socket_addrs()?;
    addrs
        .into_iter()
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("Could not resolve host '{host}'")))
}

fn http_proxy_connect(
    stream: &mut TcpStream,
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<()> {
    let mut connect_req = format!("CONNECT {target_host}:{target_port} HTTP/1.1\r\nHost: {target_host}:{target_port}\r\n");

    let username = upstream.username();
    let password = upstream.password().unwrap_or("");
    if !username.is_empty() || !password.is_empty() {
        let auth_str = format!("{username}:{password}");
        let encoded = BASE64_STANDARD.encode(auth_str.as_bytes());
        connect_req.push_str(&format!("Proxy-Authorization: Basic {encoded}\r\n"));
    }

    connect_req.push_str("Proxy-Connection: Keep-Alive\r\n\r\n");
    stream.write_all(connect_req.as_bytes())?;
    stream.flush()?;

    // Read HTTP response
    let mut buf = Vec::with_capacity(512);
    let mut b = [0u8; 1];
    while buf.len() < 8192 {
        if stream.read(&mut b)? == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "Upstream HTTP proxy closed during CONNECT"));
        }
        buf.push(b[0]);
        if buf.ends_with(b"\r\n\r\n") || buf.ends_with(b"\n\n") {
            break;
        }
    }

    let resp_str = String::from_utf8_lossy(&buf);
    let first_line = resp_str.lines().next().unwrap_or("");
    if !first_line.contains(" 200 ") && !first_line.starts_with("HTTP/1.1 200") && !first_line.starts_with("HTTP/1.0 200") {
        return Err(io::Error::new(
            io::ErrorKind::ConnectionRefused,
            format!("Upstream proxy rejected CONNECT: {first_line}"),
        ));
    }

    Ok(())
}

fn socks5_handshake(
    stream: &mut TcpStream,
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<()> {
    let username = upstream.username();
    let password = upstream.password().unwrap_or("");
    let has_auth = !username.is_empty() || !password.is_empty();

    // 1. Send Version & Auth Methods
    if has_auth {
        // VER=5, NMETHODS=2, METHODS=[0x00 (no auth), 0x02 (username/password)]
        stream.write_all(&[0x05, 0x02, 0x00, 0x02])?;
    } else {
        // VER=5, NMETHODS=1, METHODS=[0x00 (no auth)]
        stream.write_all(&[0x05, 0x01, 0x00])?;
    }
    stream.flush()?;

    // 2. Read Server Method Selection
    let mut method_resp = [0u8; 2];
    stream.read_exact(&mut method_resp)?;
    if method_resp[0] != 0x05 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Invalid SOCKS5 version from server"));
    }

    match method_resp[1] {
        0x00 => {
            // No authentication required
        }
        0x02 => {
            // Username/Password subnegotiation (RFC 1929)
            let u_bytes = username.as_bytes();
            let p_bytes = password.as_bytes();
            let mut auth_req = Vec::with_capacity(3 + u_bytes.len() + p_bytes.len());
            auth_req.push(0x01); // Auth version
            auth_req.push(u_bytes.len() as u8);
            auth_req.extend_from_slice(u_bytes);
            auth_req.push(p_bytes.len() as u8);
            auth_req.extend_from_slice(p_bytes);

            stream.write_all(&auth_req)?;
            stream.flush()?;

            let mut auth_resp = [0u8; 2];
            stream.read_exact(&mut auth_resp)?;
            if auth_resp[1] != 0x00 {
                return Err(io::Error::new(io::ErrorKind::PermissionDenied, "SOCKS5 authentication failed"));
            }
        }
        0xFF => {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "No acceptable SOCKS5 auth methods"));
        }
        unknown => {
            return Err(io::Error::new(io::ErrorKind::Unsupported, format!("Unsupported SOCKS5 auth method: {unknown}")));
        }
    }

    // 3. Send SOCKS5 CONNECT Request
    let mut req = Vec::with_capacity(32);
    req.extend_from_slice(&[0x05, 0x01, 0x00]); // VER=5, CMD=1 (CONNECT), RSV=0

    if let Ok(ipv4) = target_host.parse::<Ipv4Addr>() {
        req.push(0x01); // ATYP=1 (IPv4)
        req.extend_from_slice(&ipv4.octets());
    } else {
        req.push(0x03); // ATYP=3 (Domain)
        req.push(target_host.len() as u8);
        req.extend_from_slice(target_host.as_bytes());
    }

    req.push((target_port >> 8) as u8);
    req.push((target_port & 0xFF) as u8);

    stream.write_all(&req)?;
    stream.flush()?;

    // 4. Read SOCKS5 Response
    let mut resp_header = [0u8; 4];
    stream.read_exact(&mut resp_header)?;
    if resp_header[0] != 0x05 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Invalid SOCKS5 reply version"));
    }
    if resp_header[1] != 0x00 {
        return Err(io::Error::new(
            io::ErrorKind::ConnectionRefused,
            format!("SOCKS5 connect failed with status 0x{:02x}", resp_header[1]),
        ));
    }

    // Discard the bound address based on ATYP
    match resp_header[3] {
        0x01 => {
            let mut addr = [0u8; 6]; // 4 bytes IPv4 + 2 bytes port
            stream.read_exact(&mut addr)?;
        }
        0x03 => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len)?;
            let mut domain = vec![0u8; len[0] as usize + 2]; // domain + 2 bytes port
            stream.read_exact(&mut domain)?;
        }
        0x04 => {
            let mut addr = [0u8; 18]; // 16 bytes IPv6 + 2 bytes port
            stream.read_exact(&mut addr)?;
        }
        _ => {}
    }

    Ok(())
}

fn socks4a_handshake(
    stream: &mut TcpStream,
    upstream: &Url,
    target_host: &str,
    target_port: u16,
) -> io::Result<()> {
    let username = upstream.username();

    // SOCKS4a format:
    // [0x04, 0x01 (CONNECT), port(2), 0x00, 0x00, 0x00, 0x01 (invalid IP), user\0, domain\0]
    let mut req = Vec::with_capacity(32);
    req.push(0x04);
    req.push(0x01);
    req.push((target_port >> 8) as u8);
    req.push((target_port & 0xFF) as u8);
    req.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
    req.extend_from_slice(username.as_bytes());
    req.push(0x00);
    req.extend_from_slice(target_host.as_bytes());
    req.push(0x00);

    stream.write_all(&req)?;
    stream.flush()?;

    let mut resp = [0u8; 8];
    stream.read_exact(&mut resp)?;
    if resp[1] != 0x5A {
        return Err(io::Error::new(
            io::ErrorKind::ConnectionRefused,
            format!("SOCKS4 request rejected with code 0x{:02x}", resp[1]),
        ));
    }

    Ok(())
}

fn copy_directional(mut reader: TcpStream, mut writer: TcpStream) -> io::Result<()> {
    let mut buf = [0u8; 16384];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                let _ = writer.shutdown(std::net::Shutdown::Write);
                break;
            }
            Ok(n) => {
                let mut written = 0;
                while written < n {
                    match writer.write(&buf[written..n]) {
                        Ok(0) => {
                            return Err(io::Error::new(
                                io::ErrorKind::WriteZero,
                                "zero bytes written to stream",
                            ));
                        }
                        Ok(m) => {
                            written += m;
                        }
                        Err(ref e)
                            if e.kind() == io::ErrorKind::WouldBlock
                                || e.kind() == io::ErrorKind::Interrupted =>
                        {
                            thread::yield_now();
                        }
                        Err(e) => return Err(e),
                    }
                }
                let _ = writer.flush();
            }
            Err(ref e)
                if e.kind() == io::ErrorKind::WouldBlock
                    || e.kind() == io::ErrorKind::Interrupted =>
            {
                thread::yield_now();
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

fn relay_bidirectional(client: TcpStream, upstream: TcpStream) -> io::Result<()> {
    client.set_read_timeout(Some(Duration::from_secs(180)))?;
    client.set_write_timeout(Some(Duration::from_secs(180)))?;
    upstream.set_read_timeout(Some(Duration::from_secs(180)))?;
    upstream.set_write_timeout(Some(Duration::from_secs(180)))?;

    let client_read = client.try_clone()?;
    let upstream_write = upstream.try_clone()?;

    let client_to_upstream = thread::Builder::new()
        .name("relay-c2u".to_string())
        .spawn(move || {
            let _ = copy_directional(client_read, upstream_write);
        });

    let _ = copy_directional(upstream, client);

    if let Ok(handle) = client_to_upstream {
        let _ = handle.join();
    }

    Ok(())
}
