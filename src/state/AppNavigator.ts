import type { Track, ViewType } from '../types.ts';

interface NavigationHandlers {
  onNavigate?: (view: ViewType, subTab?: string) => void;
  onOpenPlaylist?: (playlistId: number | string) => void;
  onOpenTrack?: (trackId: number) => void;
  onOpenProfile?: (userId?: number) => void;
  onOpenAddToPlaylist?: (track: Track) => void;
}

const handlers: NavigationHandlers = {};

export const AppNavigator = {
  register(newHandlers: NavigationHandlers): void {
    Object.assign(handlers, newHandlers);
  },

  navigate(view: ViewType, subTab?: string): void {
    handlers.onNavigate?.(view, subTab);
  },

  openPlaylist(playlistId: number | string): void {
    handlers.onOpenPlaylist?.(playlistId);
  },

  openTrack(trackId: number): void {
    if (!trackId) return;
    handlers.onOpenTrack?.(trackId);
  },

  openProfile(userId?: number): void {
    handlers.onOpenProfile?.(userId);
  },

  openAddToPlaylist(track: Track): void {
    handlers.onOpenAddToPlaylist?.(track);
  },
};
