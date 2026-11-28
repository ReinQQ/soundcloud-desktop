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
  private loadSeq: number = 0;
  private pendingPromise: Promise<void> | null = null;

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

  public setTracks(tracks: Track[], replace: boolean = false): void {
    if (replace) {
      this.likedIds.clear();
      this.likedTracks = [...tracks];
      for (const t of tracks) {
        this.likedIds.add(t.id);
      }
    } else {
      const remoteIds = new Set(tracks.map(t => t.id));
      const localLikedOnly = this.likedTracks.filter(t => this.likedIds.has(t.id) && !remoteIds.has(t.id));
      this.likedTracks = [...localLikedOnly, ...tracks];
      for (const t of tracks) {
        this.likedIds.add(t.id);
      }
    }
    this.initialized = true;
    this.notify();
  }

  public async init(force: boolean = false): Promise<void> {
    if (this.initialized && !force) return;
    if (!force && this.isLoading && this.pendingPromise) {
      return this.pendingPromise;
    }

    const seq = ++this.loadSeq;
    this.isLoading = true;
    const run = (async () => {
      try {
        const data = await scGetLibrary();
        if (seq !== this.loadSeq) return;
        const rawLikes = data.likes || [];
        const tracks: Track[] = rawLikes
          .map((item: LibraryTrackItem) => (item.track || item) as unknown as Track)
          .filter((t: Track) => t && t.id && t.title);

        this.setTracks(tracks, force);
      } catch (err) {
        if (seq !== this.loadSeq) return;
        console.error('Failed to initialize likes library:', err);
      } finally {
        if (seq === this.loadSeq) {
          this.isLoading = false;
          this.pendingPromise = null;
        }
      }
    })();

    this.pendingPromise = run;
    return run;
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
        this.likedIds.delete(track.id);
        this.likedTracks = this.likedTracks.filter(t => t.id !== track.id);
        this.notify();
        console.error('Failed to sync like on SoundCloud for track', track.id, err);
        showToast('Could not sync like with SoundCloud');
        return false;
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
    this.loadSeq++;
    this.isLoading = false;
    this.pendingPromise = null;
    this.likedIds.clear();
    this.likedTracks = [];
    this.initialized = false;
    this.notify();
  }
}
