import type { Track } from '../types.ts';

interface NavigationHandlers {
  onOpenTrack?: (trackId: number) => void;
  onOpenProfile?: (userId?: number) => void;
  onOpenAddToPlaylist?: (track: Track) => void;
}

const handlers: NavigationHandlers = {};

export const AppNavigator = {
  register(newHandlers: NavigationHandlers): void {
    Object.assign(handlers, newHandlers);
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
