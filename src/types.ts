export interface AppSettings {
  proxy_enabled: boolean;
  proxy_url: string;
  discord_rpc_enabled: boolean;
  discord_app_id: string;
  adblock_enabled: boolean;
  dark_theme_enabled: boolean;
  minimize_to_tray: boolean;
  proxy_active: boolean;
  oauth_token?: string | null;
}

export interface User {
  id: number;
  username: string;
  avatar_url?: string;
  permalink_url?: string;
  followers_count?: number;
  followings_count?: number;
  track_count?: number;
  playlist_count?: number;
  public_favorites_count?: number;
  likes_count?: number;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  verified?: boolean;
  visuals?: {
    visuals?: Array<{
      visual_url: string;
      urn?: string;
      enabled?: boolean;
    }>;
    enabled?: boolean;
  } | null;
  [key: string]: unknown;
}

export interface TrackTranscoding {
  url: string;
  preset: string;
  duration?: number;
  format: {
    protocol: string;
    mime_type: string;
  };
}

export interface Track {
  id: number;
  title: string;
  user: User;
  duration: number;
  artwork_url?: string | null;
  permalink_url?: string;
  playback_count?: number;
  likes_count?: number;
  reposts_count?: number;
  comment_count?: number;
  created_at?: string;
  description?: string | null;
  genre?: string | null;
  tag_list?: string | null;
  media?: {
    transcodings: TrackTranscoding[];
  };
  track_authorization?: string;
}

export interface TrackComment {
  id: number;
  body: string;
  timestamp?: number | null;
  created_at?: string;
  user: User;
}

export interface UserProfileResponse {
  user: User;
  tracks: Track[];
  playlists: Playlist[];
  likes: Track[];
  is_following: boolean;
}

export interface Playlist {
  id: number;
  urn?: string;
  kind?: string;
  title: string;
  user: User;
  artwork_url?: string | null;
  permalink_url?: string;
  track_count: number;
  duration?: number;
  tracks?: Track[];
}

export interface MixedSelectionItem {
  urn?: string;
  title: string;
  description?: string | null;
  style?: string | null;
  items?: {
    collection: Array<Track | Playlist>;
  } | Array<Track | Playlist>;
}

export interface DiscoverResponse {
  collection: MixedSelectionItem[];
}

export interface StreamItem {
  track?: Track;
  id?: number;
  title?: string;
  user?: User;
  duration?: number;
  artwork_url?: string | null;
  [key: string]: unknown;
}

export interface StreamResponse {
  collection: StreamItem[];
}

export interface SearchResults {
  tracks: Track[];
  playlists: Playlist[];
  users: User[];
}

export interface LibraryTrackItem {
  track?: Track;
  id?: number;
  title?: string;
  user?: User;
  duration?: number;
  artwork_url?: string | null;
  [key: string]: unknown;
}

export interface LibraryResponse {
  likes: LibraryTrackItem[];
  playlists: Playlist[];
}

export interface StreamResolution {
  stream_url: string;
  protocol: 'progressive' | 'hls' | string;
  mime_type: string;
  duration_ms?: number;
  encrypted?: boolean;
  license_url?: string | null;
  license_auth_token?: string | null;
}

export interface UpdateCheckResponse {
  available: boolean;
  current_version: string;
  version?: string | null;
  notes?: string | null;
}

export interface ProxyTestDetails {
  success: boolean;
  direct_ip?: string | null;
  exit_ip?: string | null;
  country?: string | null;
  step1_ip_status: string;
  step2_resolve_status: string;
  step3_media_status: string;
  bytes_received: number;
  error?: string | null;
}

export type ViewType = 'home' | 'feed' | 'library' | 'search' | 'collection' | 'profile' | 'track';
