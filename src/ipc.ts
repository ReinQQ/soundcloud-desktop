import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppSettings,
  Track,
  Playlist,
  User,
  StreamResolution,
  UpdateCheckResponse,
  ProxyTestDetails,
  DiscoverResponse,
  StreamResponse,
  SearchResults,
  LibraryResponse,
  TrackComment,
  UserProfileResponse,
} from './types.ts';

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings');
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>('save_settings', { newSettings: settings });
}

export async function windowAction(action: 'minimize' | 'maximize' | 'unmaximize' | 'toggle_maximize' | 'close'): Promise<void> {
  return invoke('window_action', { action });
}

export async function restartApp(): Promise<void> {
  return invoke('restart_app');
}

export async function checkUpdate(): Promise<UpdateCheckResponse> {
  return invoke<UpdateCheckResponse>('check_update');
}

export async function installUpdate(): Promise<boolean> {
  return invoke<boolean>('install_update');
}

export async function updateDiscordRpc(payload: {
  title: string;
  artist: string;
  cover_url?: string | null;
  track_url?: string | null;
  is_playing: boolean;
  elapsed_sec: number;
  duration_sec: number;
}): Promise<void> {
  return invoke('update_discord_rpc', { payload });
}

export async function clearDiscordRpc(): Promise<void> {
  return invoke('clear_discord_rpc');
}

export async function getDiscordRpcStatus(): Promise<string> {
  return invoke<string>('get_discord_rpc_status');
}

export async function scGetDiscover(): Promise<DiscoverResponse> {
  return invoke<DiscoverResponse>('sc_get_discover');
}

export async function scGetStream(): Promise<StreamResponse> {
  return invoke<StreamResponse>('sc_get_stream');
}

export async function scSearch(query: string, kind?: 'tracks' | 'playlists' | 'users' | 'all'): Promise<SearchResults> {
  return invoke<SearchResults>('sc_search', { query, kind });
}

export async function scGetLibrary(userId?: number): Promise<LibraryResponse> {
  return invoke<LibraryResponse>('sc_get_library', { userId });
}

export async function scGetPlaylist(idOrUrn: number | string): Promise<Playlist> {
  return invoke<Playlist>('sc_get_playlist', { idOrUrn: String(idOrUrn) });
}

export async function scGetTrack(id: number): Promise<Track> {
  return invoke<Track>('sc_get_track', { id });
}

export async function scToggleLike(trackId: number, liked: boolean): Promise<boolean> {
  return invoke<boolean>('sc_toggle_like', { trackId, liked });
}

export async function scResolveStream(trackId: number): Promise<StreamResolution> {
  return invoke<StreamResolution>('sc_resolve_stream', { trackId });
}

export async function scClearStreamCache(trackId?: number): Promise<void> {
  return invoke('sc_clear_stream_cache', { trackId: trackId ?? null });
}

export async function scLogin(): Promise<void> {
  return invoke('sc_login');
}

export async function scLoginWithToken(token: string): Promise<User> {
  return invoke<User>('sc_login_with_token', { token });
}

export async function scGetUserTracks(userId: number): Promise<{ collection?: Track[] } | Track[]> {
  return invoke('sc_get_user_tracks', { userId });
}

export async function scLogout(): Promise<void> {
  return invoke('sc_logout');
}

export async function scGetMe(): Promise<User | null> {
  return invoke<User | null>('sc_get_me');
}

export async function scAddTrackToPlaylist(playlistId: number, trackId: number): Promise<Playlist> {
  return invoke<Playlist>('sc_add_track_to_playlist', { playlistId, trackId });
}

export async function scCreatePlaylist(
  title: string,
  isPublic: boolean,
  initialTrackId?: number
): Promise<Playlist> {
  return invoke<Playlist>('sc_create_playlist', {
    title,
    isPublic,
    initialTrackId: initialTrackId ?? null,
  });
}

export async function scGetTrackDetail(trackId: number): Promise<Track> {
  return invoke<Track>('sc_get_track_detail', { trackId });
}

export async function scGetTrackComments(trackId: number): Promise<{ collection: TrackComment[] }> {
  return invoke<{ collection: TrackComment[] }>('sc_get_track_comments', { trackId });
}

export async function scPostTrackComment(
  trackId: number,
  body: string,
  timestampMs?: number
): Promise<TrackComment> {
  return invoke<TrackComment>('sc_post_track_comment', {
    trackId,
    body,
    timestampMs: timestampMs ?? null,
  });
}

export async function scUpdateProfile(params: {
  username?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  country?: string;
  description?: string;
}): Promise<User> {
  return invoke<User>('sc_update_profile', {
    username: params.username ?? null,
    firstName: params.first_name ?? null,
    lastName: params.last_name ?? null,
    city: params.city ?? null,
    country: params.country ?? null,
    description: params.description ?? null,
  });
}

export async function scUploadProfileImage(kind: 'avatar' | 'banner', imageDataUrl: string): Promise<User> {
  return invoke<User>('sc_upload_profile_image', { kind, imageDataUrl });
}

export async function scGetUserProfile(userId: number): Promise<UserProfileResponse> {
  return invoke<UserProfileResponse>('sc_get_user_profile', { userId });
}

export async function scToggleFollow(userId: number, follow: boolean): Promise<boolean> {
  return invoke<boolean>('sc_toggle_follow', { userId, follow });
}

export async function testProxy(proxyUrl?: string): Promise<ProxyTestDetails> {
  return invoke<ProxyTestDetails>('test_proxy', { proxyUrl });
}

export async function logFrontendError(level: 'error' | 'warn' | 'info' | 'debug', message: string): Promise<void> {
  return invoke('log_frontend_error', { level, message });
}

export async function scFrontendReady(): Promise<void> {
  return invoke('sc_frontend_ready');
}

export function onAuthUpdated(callback: (token?: string) => void): Promise<UnlistenFn> {
  return listen<string | undefined>('auth-updated', (event) => callback(event.payload));
}

export function onTrayPlayPause(callback: () => void): Promise<UnlistenFn> {
  return listen('tray-play-pause', () => callback());
}

export function onTrayNextTrack(callback: () => void): Promise<UnlistenFn> {
  return listen('tray-next-track', () => callback());
}
