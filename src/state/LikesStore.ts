import { scGetLibrary, scToggleLike } from '../ipc.ts';
import { showToast } from '../components/Toast.ts';
import type { Track, LibraryTrackItem } from '../types.ts';

type LikesListener = () => void;

export class LikesStore {
  private static instance: LikesStore;

  private likedIds: Set<number> = new Set();
  private likedTracks: Track[] = [];
  private listeners: Set<LikesListener> = new Set();
  private initialized: boolean = false;
  private isLoading: boolean = false;

  private constructor() {}

  public static getInstance(): LikesStore {
    if (!LikesStore.instance) {
      LikesStore.instance = new LikesStore();
    }
    return LikesStore.instance;
  }

  public subscribe(listener: LikesListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public isLiked(trackId?: number | null): boolean {
    if (!trackId) return false;
    return this.likedIds.has(trackId);
  }

  public getLikedTracks(): Track[] {
    return [...this.likedTracks];
  }

  public getLikedCount(): number {
    return this.likedTracks.length;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public setTracks(tracks: Track[]): void {
    const remoteIds = new Set(tracks.map(t => t.id));
    const localLikedOnly = this.likedTracks.filter(t => this.likedIds.has(t.id) && !remoteIds.has(t.id));
    this.likedTracks = [...localLikedOnly, ...tracks];
    for (const t of tracks) {
      this.likedIds.add(t.id);
    }
    this.initialized = true;
    this.notify();
  }

  public async init(force: boolean = false): Promise<void> {
    if (this.initialized && !force) return;
    if (this.isLoading) return;

    this.isLoading = true;
    try {
      const data = await scGetLibrary();
      const rawLikes = data.likes || [];
      const tracks: Track[] = rawLikes
        .map((item: LibraryTrackItem) => (item.track || item) as unknown as Track)
        .filter((t: Track) => t && t.id && t.title);

      this.setTracks(tracks);
    } catch (err) {
      console.error('Failed to initialize likes library:', err);
    } finally {
      this.isLoading = false;
    }
  }

  public async toggleLike(track: Track): Promise<boolean> {
    const wasLiked = this.likedIds.has(track.id);
    const newLiked = !wasLiked;

    if (newLiked) {
      this.likedIds.add(track.id);
      this.likedTracks = [track, ...this.likedTracks.filter(t => t.id !== track.id)];
      this.notify();

      try {
        await scToggleLike(track.id, true);
        return true;
      } catch (err) {
        console.error('Failed to sync like on SoundCloud for track', track.id, err);
        showToast('Could not sync like with SoundCloud');
        return true;
      }
    } else {
      try {
        await scToggleLike(track.id, false);
        this.likedIds.delete(track.id);
        this.likedTracks = this.likedTracks.filter(t => t.id !== track.id);
        this.notify();
        return false;
      } catch (err) {
        console.error('Failed to sync unlike on SoundCloud for track', track.id, err);
        showToast('Could not sync like with SoundCloud');
        return true;
      }
    }
  }

  public clear(): void {
    this.likedIds.clear();
    this.likedTracks = [];
    this.initialized = false;
    this.notify();
  }
}
