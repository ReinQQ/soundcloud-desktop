# SoundCloud Native Desktop Client

A lightweight, secure, and native-feeling desktop client for **SoundCloud** powered by **Tauri v2 (Rust backend + system WebView wrapper)**.

---

## Key Features

1. **Native Session & Playback Wrapper:**
   - Directly loads `https://soundcloud.com` into the main Tauri v2 window, preserving native OAuth, user recommendations, comments, and playback state without cookie scraping or API workarounds.

2. **Frameless Custom Titlebar:**
   - 36px custom top navigation bar with `data-tauri-drag-region`.
   - Automatically offsets SoundCloud's fixed `.header` down by 36px so no UI elements overlap.
   - Includes SoundCloud logo branding, dynamic status badges (Proxy indicator, Discord RPC status, Audio Ad muted indicator), Settings gear (`Ctrl+,`), and native Minimize / Maximize / Close window controls.

3. **Discord Rich Presence (RPC):**
   - Managed via a dedicated, non-blocking background worker thread over Discord IPC pipe.
   - Pre-configured Application ID (`1572112482062045194`, customizable in Settings).
   - Real-time details:
     - **Details:** Active track title.
     - **State:** Artist name.
     - **Large Artwork:** Upgraded high-res cover art (`t500x500`) validated against `i1.sndcdn.com` / `a1.sndcdn.com`.
     - **Small Icon:** `"play"` / `"pause"` state indicator.
     - **Live Timestamps:** Start/end timestamps calculated dynamically to render Discord's live progress bar when playing; cleared when paused.
     - **Direct Link Button:** "Listen on SoundCloud" linking directly to the track.

4. **WebView-Level Proxy Support:**
   - Configurable SOCKS5 or HTTP proxy (`socks5://127.0.0.1:10808` by default).
   - Applied directly to `WebviewWindowBuilder::proxy_url` at startup without touching system-wide OS network settings.
   - "Save & Restart" button in Settings restarts the desktop client to apply proxy changes cleanly.

5. **Deep Dark Theme:**
   - Re-skins SoundCloud into a refined charcoal dark theme (`#0f0f11` background, `#141418` elevated surfaces, `#f4f4f6` high-contrast typography, `#ff5500` brand accents).
   - Preserves waveform scrubber visibility and cover artwork vibrancy without inverted filters.

6. **SoundCloud AdBlocker:**
   - Injected CSS rules suppress SoundCloud Go+ banners, sponsored sounds, and sidebar promos.
   - Real-time player inspector detects audio ad breaks in the stream and automatically mutes `<audio>` elements, unmuting when regular tracks resume.

7. **System Tray Integration:**
   - Minimizes to system tray when the window close button is clicked (if `minimize_to_tray` is enabled).
   - Context menu options: *Show / Hide*, *Play / Pause* media toggle, *Next Track*, and *Quit*.
   - Left-click tray icon toggles window visibility and focus.

---

## Security Audit & Hardening

- **Remote Origin Isolation:** Remote permissions strictly scoped to `https://soundcloud.com/*` and `https://soundcloud.com` in `capabilities/default.json`.
- **Minimal Custom IPC Commands:** Raw filesystem, shell, process, and external HTTP plugins are **NOT** exposed to the remote WebView.
  - Allowed commands: `update_discord_rpc`, `clear_discord_rpc`, `get_settings`, `save_settings`, `window_action`, `restart_app`.
- **Rust IPC Sanitization & Validation:**
  - Length limits on track titles and artist names (capped at 128 chars, non-control chars).
  - Artwork URLs strictly validated against official SoundCloud CDNs (`https://i1.sndcdn.com/` and `https://a1.sndcdn.com/`).
  - Track URLs strictly validated to ensure `https://soundcloud.com/` origin before passing to Discord buttons.
- **Safe DOM Injection:**
  - Initialization script runs inside an isolated IIFE.
  - Zero `eval()`, zero `innerHTML` with scraped page text, and safe DOM construction APIs (`document.createElement`, `textContent`, `setAttribute`).

---

## Project Structure

```
├── injected/                      # Modular TypeScript & CSS injection pipeline
│   ├── types.ts                   # Settings & Track metadata definitions
│   ├── ipc.ts                     # Hardened Tauri IPC wrapper
│   ├── titlebar.ts                # Custom 36px frameless titlebar component
│   ├── settings-modal.ts          # Translucent settings overlay UI
│   ├── scraper.ts                 # MutationObserver & throttled player scraper
│   ├── adblocker.ts               # CSS blocker & audio ad auto-muter
│   ├── dark-theme.ts              # Deep dark theme manager
│   ├── styles.css                 # Comprehensive desktop stylesheet
│   └── index.ts                   # Injection entrypoint
├── src-tauri/                     # Rust Tauri v2 backend
│   ├── Cargo.toml                 # Rust dependencies (tauri v2, discord-rich-presence, url)
│   ├── tauri.conf.json            # Tauri v2 configuration
│   ├── capabilities/
│   │   └── default.json           # Scoped capabilities for remote origin
│   └── src/
│       ├── main.rs                # App entrypoint
│       ├── lib.rs                 # WebviewWindowBuilder, tray, proxy setup
│       ├── commands.rs            # Validated IPC commands
│       ├── settings.rs            # Persistent configuration (JSON in app_config_dir)
│       └── discord_rpc.rs         # Non-blocking background Discord RPC thread
├── package.json                   # Build scripts & esbuild bundler
└── dist/                          # Static placeholder web assets
```

---

## Building and Running

### Prerequisites
- Node.js (v18+) & npm
- Rust (v1.80+) & Cargo
- Windows WebView2 runtime (pre-installed on Windows 10/11)

### Development
```bash
# Build the injected bundle
npm run build

# Run in debug mode
npm run dev
# or via Cargo
cargo run --manifest-path src-tauri/Cargo.toml
```

### Production Build
```bash
# Compile optimized binary
cargo build --release --manifest-path src-tauri/Cargo.toml
```
The executable is produced at `src-tauri/target/release/app.exe`.
