export interface AppSettings {
  proxy_enabled: boolean;
  proxy_url: string;
  discord_rpc_enabled: boolean;
  discord_app_id: string;
  adblock_enabled: boolean;
  dark_theme_enabled: boolean;
  minimize_to_tray: boolean;
  proxy_active?: boolean;
}

export interface TrackMetadata {
  title: string;
  artist: string;
  cover_url: string | null;
  track_url: string | null;
  is_playing: boolean;
  elapsed_sec: number;
  duration_sec: number;
}

export interface UpdateInfo {
  available: boolean;
  current_version: string;
  version?: string | null;
  notes?: string | null;
}
