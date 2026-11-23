# SoundCloud Desktop

Standalone native desktop client for SoundCloud powered by Tauri v2, Rust, Vite, and TypeScript.

## Architecture

- **Backend (Rust / Tauri v2):** Communicates with SoundCloud's API (`api-v2.soundcloud.com`), manages HTTP/SOCKS proxy connections, resolves direct playable audio streams, extracts client IDs, handles Discord Rich Presence, and manages application settings.
- **Frontend (Vite / TypeScript / HLS.js):** 100% standalone desktop client without external web wrappers. Renders native views (Home, Feed, Library, Search, Playlist/Track details) and uses HTML5 audio with `hls.js` for ad-free stream playback.

## Features

- **Standalone Player Engine:** Custom audio pipeline supporting progressive MP3 and HLS audio streaming, shuffle, repeat, queue management, and volume control.
- **Discord Rich Presence:** Displays track title, artist, high-resolution artwork (`t500x500`), and live playback timestamps over local Discord IPC.
- **Proxy Support:** Supports HTTP, HTTPS, SOCKS4, and SOCKS5 proxies for all API and media requests.
- **OAuth Login:** Dedicated sign-in window that authenticates against SoundCloud and saves session credentials locally.
- **Theme System:** Apple Music dark gray default theme with optional AMOLED Deep Dark mode.
- **Frameless Titlebar & Tray:** Native window controls, proxy and RPC status indicators, and background playback via system tray.

## Build Requirements

- Node.js 18+
- Rust 1.80+
- WebView2 runtime (Windows)

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npx tauri build
```
