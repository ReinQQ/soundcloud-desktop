# SoundCloud Desktop (`v0.2.1`)

Standalone native desktop client for SoundCloud built with **Tauri v2**, **Rust** (`api-v2.soundcloud.com`, `ProxyBridge`, `MediaRelay`, Discord Rich Presence), and **Vite + Vanilla TypeScript + `hls.js`** (`src/` -> `dist/`).

## Architecture

- **Backend (Rust / Tauri v2):** Communicates directly with SoundCloud API v2 (`api-v2.soundcloud.com`), caches extracted `client_id` values across launches, relays media segments and Widevine manifests via local `MediaRelay`, tunnels authenticated `HTTP`/`HTTPS`/`SOCKS4`/`SOCKS5` proxies through local loopback `ProxyBridge`, drives Discord Rich Presence over local IPC, and manages tray controls, settings, and signed updates.
- **Frontend (Vite / Vanilla TypeScript / `hls.js`):** Renders native views in `src/` with browser history navigation (`pushState` / mouse Back & Forward), HTML5 `<audio>` + `hls.js` stream playback, real-time active equalizer indicators, and local like/queue state.

## Key Features (`v0.2.1`)

- **Playback & Media Pipeline:** Direct stream resolution with cached `client_id` and OAuth fallback, progressive MP3 and HLS streaming via `hls.js` / HTML5 `<audio>` (including Widevine DRM playback and `MediaRelay`), interactive queue drawer, shuffle/repeat modes, and volume popup control.
- **Navigation & Views:**
  - Floating sidebar navigation (`Home`, `Feed`, `Library`, `Likes`, `Playlists`).
  - Top-header search bar (`Ctrl+K`) with instant navigation and `All`, `Tracks`, `Playlists`, and `Users` tabs.
  - Dedicated `TrackDetailView` displaying artwork, metadata, tags, clickable `@ m:ss` timestamped comments, and comment posting.
  - Artist & user profile views with follow/unfollow toggles, verified badges, location/bio metadata, tracks/playlists/likes tabs, and inline own-profile editing (avatar, banner, display name, city, country, bio).
- **Playlists:** Create public or private playlists, add tracks to playlists from any view or dock control, load full paginated created and liked playlists, and play system playlists (including *More of what you like* URNs).
- **Networking, Auth & Integrations:** Multi-protocol proxy support (`HTTP`, `HTTPS`, `SOCKS4`, `SOCKS5`) with local `ProxyBridge` for authenticated upstreams, SoundCloud OAuth sign-in window plus direct `oauth_token` connection fallback, Discord Rich Presence (`ActivityType::Listening` with live timestamps that automatically clears when paused), system tray integration, theme switching, and signed auto-updates via GitHub Releases (`latest.json`).

## Requirements

- Node.js 18+
- Rust 1.90+
- WebView2 runtime (Windows)

## Development & Verification

Install dependencies and build the frontend:

```bash
npm install
npm run build
```

Run the desktop app in development mode:

```bash
npx tauri dev
```

Verify Rust backend compilation, linting, and tests:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Production & Release

Create a local production installer build:

```bash
npm run build
npx tauri build
```

Pushing a version tag (for example `v0.2.1`) triggers [`.github/workflows/release.yml`](.github/workflows/release.yml) to build the Windows NSIS installer, generate cryptographic updater signatures, and publish `latest.json` alongside release artifacts on GitHub Releases.
