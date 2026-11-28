import { scGetPlaylist } from '../ipc.ts';
import { AudioEngine, getPlaylistCover } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import {
  createTrackRow,
  syncTrackRowStates,
} from '../components/TrackRow.ts';
import { escapeHtml } from '../utils/format.ts';
import type { Playlist, Track } from '../types.ts';

export class CollectionDetailView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private playlistId: number | string;
  private playlist: Playlist | null = null;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeLikes: (() => void) | null = null;
  private destroyed: boolean = false;
  private loadSeq: number = 0;

  constructor(playlistId: number | string) {
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.playlistId = playlistId;
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.unsubscribeAudio = this.engine.subscribe(() => this.updatePlayAllBtn());
    this.unsubscribeLikes = this.likesStore.subscribe(() => this.updateLikeButtons());
    this.loadData();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.unsubscribeAudio) {
      this.unsubscribeAudio();
      this.unsubscribeAudio = null;
    }
    if (this.unsubscribeLikes) {
      this.unsubscribeLikes();
      this.unsubscribeLikes = null;
    }
  }

  private async loadData(): Promise<void> {
    const seq = ++this.loadSeq;
    this.element.innerHTML = `
      <div class="collection-header">
        <div class="collection-cover skeleton" style="border: none;"></div>
        <div class="collection-meta" style="flex: 1;">
          <div class="skeleton" style="width: 70px; height: 16px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="width: 280px; height: 32px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="width: 140px; height: 16px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="width: 180px; height: 14px; margin-bottom: 12px;"></div>
          <div style="display: flex; gap: 10px;">
            <div class="skeleton" style="width: 100px; height: 36px; border-radius: var(--radius-md);"></div>
            <div class="skeleton" style="width: 90px; height: 36px; border-radius: var(--radius-md);"></div>
          </div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.8;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.6;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.4;"></div>
      </div>
    `;

    try {
      this.playlist = await scGetPlaylist(this.playlistId);
      if (this.destroyed || seq !== this.loadSeq) return;
      this.render();
    } catch (err) {
      if (this.destroyed || seq !== this.loadSeq) return;
      this.element.innerHTML = `
        <div style="padding: 24px; color: var(--text-secondary);">
          <h3>Failed to load collection</h3>
          <p style="margin-top: 6px; margin-bottom: 14px; font-size: 13px; color: var(--text-tertiary);">${escapeHtml(String(err))}</p>
          <button class="btn-secondary" id="collection-btn-retry">Retry</button>
        </div>
      `;
      this.element.querySelector('#collection-btn-retry')?.addEventListener('click', () => {
        this.loadData();
      });
    }
  }

  private render(): void {
    if (!this.playlist) return;

    const pl = this.playlist;
    const title = pl.title || 'Untitled Playlist';
    const author = pl.user?.username || 'SoundCloud';
    const cover = getPlaylistCover(pl);
    const tracks: Track[] = (pl.tracks || []).filter(t => t && t.title);
    const count = tracks.length;

    let totalSec = 0;
    tracks.forEach(t => {
      if (t.duration) totalSec += t.duration / 1000;
    });

    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const durationFormatted = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;

    const safeTitle = escapeHtml(title);
    const safeAuthor = escapeHtml(author);
    const safeCover = escapeHtml(cover);

    this.element.innerHTML = `
      <div class="collection-header">
        <div class="collection-cover">
          <img src="${safeCover}" alt="${safeTitle}" />
        </div>
        <div class="collection-meta">
          <span class="collection-badge">Playlist</span>
          <h1 class="collection-title">${safeTitle}</h1>
          <span class="collection-artist ${pl.user?.id ? 'clickable-link' : ''}" id="collection-artist-link">${safeAuthor}</span>
          <span class="collection-counts">${count} tracks &bull; ${durationFormatted}</span>
          <div class="collection-actions">
            <button class="btn-primary" id="collection-btn-playall" style="display: flex; align-items: center; gap: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
              Play All
            </button>
            <button class="btn-secondary" id="collection-btn-shuffle" style="display: flex; align-items: center; gap: 8px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
              Shuffle
            </button>
          </div>
        </div>
      </div>

      <div class="tracklist-table" id="collection-tracklist"></div>
    `;

    this.element.querySelector('#collection-btn-playall')?.addEventListener('click', () => {
      if (tracks.length > 0) {
        if (this.engine.isCollectionPlaying(this.playlistId)) {
          this.engine.togglePlay();
        } else {
          this.engine.shuffle = false;
          this.engine.playCollection(this.playlistId, tracks, 0);
        }
      }
    });

    this.element.querySelector('#collection-btn-shuffle')?.addEventListener('click', () => {
      if (tracks.length > 0) {
        this.engine.shuffle = true;
        const randomIdx = Math.floor(Math.random() * tracks.length);
        this.engine.playCollection(this.playlistId, tracks, randomIdx);
      }
    });

    if (pl.user?.id) {
      this.element.querySelector('#collection-artist-link')?.addEventListener('click', () => {
        AppNavigator.openProfile(pl.user.id);
      });
    }

    const tracklistEl = this.element.querySelector('#collection-tracklist');
    if (!tracklistEl) return;

    tracks.forEach((track, idx) => {
      tracklistEl.appendChild(
        createTrackRow({
          track,
          index: idx,
          queue: tracks,
          collectionId: this.playlistId,
          fallbackCover: cover,
          fallbackArtist: author,
        })
      );
    });

    this.updatePlayAllBtn();
  }

  private updateLikeButtons(): void {
    syncTrackRowStates(this.element, this.engine, this.likesStore);
  }

  private updatePlayAllBtn(): void {
    const btn = this.element.querySelector<HTMLElement>('#collection-btn-playall');
    if (btn) {
      const isPlaying = this.engine.isCollectionPlaying(this.playlistId);
      if (isPlaying) {
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`;
      } else {
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg> Play All`;
      }
    }

    syncTrackRowStates(this.element, this.engine);
  }
}
