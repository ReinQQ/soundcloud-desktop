import { scGetLibrary, scGetPlaylist, scLogin } from '../ipc.ts';
import { AudioEngine, getPlaylistCover } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import {
  createTrackRow,
  HEART_ICON,
  ROW_PLAY_ICON,
  ROW_PAUSE_ICON,
} from '../components/TrackRow.ts';
import type { Track, Playlist, LibraryTrackItem } from '../types.ts';

const PLAY_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
const PAUSE_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const SPINNER_ICON = `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path></svg>`;

export class LibraryView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private activeTab: 'likes' | 'playlists' = 'likes';
  private likes: Track[] = [];
  private playlists: Playlist[] = [];
  private onOpenPlaylist: (id: number | string) => void;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeLikes: (() => void) | null = null;
  private destroyed: boolean = false;

  constructor(onOpenPlaylist: (id: number | string) => void, initialTab: 'likes' | 'playlists' = 'likes') {
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.onOpenPlaylist = onOpenPlaylist;
    this.activeTab = initialTab;
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.likes = this.likesStore.getLikedTracks();

    this.unsubscribeAudio = this.engine.subscribe(() => this.updatePlayButtons());
    this.unsubscribeLikes = this.likesStore.subscribe(() => this.onLikesUpdated());
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

  private onLikesUpdated(): void {
    this.likes = this.likesStore.getLikedTracks();
    const pillLikes = this.element.querySelector<HTMLElement>('.protocol-pill[data-tab="likes"]');
    if (pillLikes) {
      pillLikes.textContent = `Likes (${this.likes.length})`;
    }
    const pillPlaylists = this.element.querySelector<HTMLElement>('.protocol-pill[data-tab="playlists"]');
    if (pillPlaylists) {
      pillPlaylists.textContent = `Playlists (${this.playlists.length})`;
    }
    if (this.activeTab === 'likes') {
      this.renderContent();
    }
    this.updateLikeButtons();
  }

  private async loadData(): Promise<void> {
    this.element.innerHTML = `
      <div class="view-section-header">
        <div>
          <div class="skeleton" style="width: 150px; height: 26px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="width: 240px; height: 16px;"></div>
        </div>
      </div>
      <div class="protocol-pills" style="max-width: 240px; margin-bottom: 24px;">
        <div class="protocol-pill active">Likes</div>
        <div class="protocol-pill">Playlists</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.8;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.6;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.4;"></div>
      </div>
    `;

    try {
      const data = await scGetLibrary();
      if (this.destroyed) return;
      const rawLikes = data.likes || [];
      const tracks: Track[] = rawLikes
        .map((item: LibraryTrackItem) => (item.track || item) as unknown as Track)
        .filter((t: Track) => t && t.id && t.title);

      this.likesStore.setTracks(tracks);
      this.likes = this.likesStore.getLikedTracks();
      this.playlists = data.playlists || [];
      this.render();
    } catch (err) {
      if (this.destroyed) return;
      this.element.innerHTML = `
        <div style="padding: 32px; text-align: center; max-width: 440px; margin: 40px auto; background: var(--bg-card); border-radius: var(--radius-xl); border: var(--border-subtle);">
          <h3 style="font-size: 18px; margin-bottom: 8px;">Sign in to view your Library</h3>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
            Access your liked tracks, custom playlists, and listening history in one place.
          </p>
          <button class="btn-primary" id="lib-btn-signin" style="padding: 9px 24px;">Sign In</button>
        </div>
      `;
      this.element.querySelector('#lib-btn-signin')?.addEventListener('click', () => {
        scLogin();
      });
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="view-section-header">
        <div>
          <h2 class="view-section-title">Your Library</h2>
          <p class="view-section-subtitle">Your collection of liked sounds and playlists</p>
        </div>
      </div>

      <div class="protocol-pills" style="max-width: 240px; margin-bottom: 24px;">
        <div class="protocol-pill ${this.activeTab === 'likes' ? 'active' : ''}" data-tab="likes">Likes (${this.likes.length})</div>
        <div class="protocol-pill ${this.activeTab === 'playlists' ? 'active' : ''}" data-tab="playlists">Playlists (${this.playlists.length})</div>
      </div>

      <div id="library-content"></div>
    `;

    const pills = this.element.querySelectorAll<HTMLElement>('.protocol-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeTab = (pill.getAttribute('data-tab') as 'likes' | 'playlists') || 'likes';
        this.renderContent();
      });
    });

    this.renderContent();
  }

  private renderContent(): void {
    const container = this.element.querySelector('#library-content');
    if (!container) return;
    container.innerHTML = '';

    if (this.activeTab === 'likes') {
      if (this.likes.length === 0) {
        container.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">You haven't liked any tracks yet.</div>`;
        return;
      }

      const table = document.createElement('div');
      table.className = 'tracklist-table';

      this.likes.forEach((track, idx) => {
        table.appendChild(
          createTrackRow({
            track,
            index: idx,
            queue: this.likes,
          })
        );
      });

      container.appendChild(table);
    } else {
      if (this.playlists.length === 0) {
        container.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">You haven't created or saved any playlists yet.</div>`;
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'cards-grid';

      this.playlists.forEach((pl) => {
        const title = pl.title;
        const author = pl.user?.username || 'SoundCloud';
        const authorId = pl.user?.id;
        const cover = getPlaylistCover(pl);

        const card = document.createElement('div');
        card.className = 'card-item';
        card.innerHTML = `
          <div class="card-cover-wrapper">
            <img class="card-cover-img" src="${cover}" alt="${title}" loading="lazy" decoding="async" />
            <div class="card-play-hover-btn" data-kind="playlist" data-id="${pl.id}" title="Play playlist">
              ${PLAY_ICON}
            </div>
          </div>
          <div class="card-title" title="${title}">${title}</div>
          <div class="card-author ${authorId ? 'clickable-link' : ''}" title="${author}">${author} &bull; ${pl.track_count || 0} tracks</div>
        `;

        if (authorId) {
          card.querySelector('.card-author')?.addEventListener('click', (e) => {
            e.stopPropagation();
            AppNavigator.openProfile(authorId);
          });
        }

        const playBtn = card.querySelector<HTMLElement>('.card-play-hover-btn');
        playBtn?.addEventListener('click', async (e) => {
          e.stopPropagation();

          if (this.engine.currentCollectionId === pl.id) {
            this.engine.togglePlay();
          } else {
            playBtn.innerHTML = SPINNER_ICON;
            try {
              let tracks: Track[] = [];
              if (Array.isArray(pl.tracks) && pl.tracks.length > 0 && pl.tracks[0]?.media?.transcodings?.length) {
                tracks = pl.tracks;
              } else {
                const fullPl = await scGetPlaylist(pl.id);
                if (this.destroyed) return;
                tracks = (fullPl.tracks || []).filter((t: Track) => t && t.title);
              }
              if (tracks.length > 0) {
                await this.engine.playCollection(pl.id, tracks, 0);
              }
            } catch (err) {
              if (this.destroyed) return;
              console.error('Failed to load playlist for playback:', err);
            } finally {
              if (!this.destroyed) {
                this.updatePlayButtons();
              }
            }
          }
        });

        card.addEventListener('click', () => {
          this.onOpenPlaylist(pl.id);
        });

        grid.appendChild(card);
      });

      container.appendChild(grid);
    }

    this.updatePlayButtons();
  }

  private updateLikeButtons(): void {
    const likeButtons = this.element.querySelectorAll<HTMLElement>('.row-like-btn');
    likeButtons.forEach((btn) => {
      const id = Number(btn.dataset.trackId);
      if (!id) return;
      const isLiked = this.likesStore.isLiked(id);
      btn.classList.toggle('liked', isLiked);
      btn.innerHTML = HEART_ICON(isLiked);
      btn.title = isLiked ? 'Unlike' : 'Like';
    });
  }

  private updatePlayButtons(): void {
    const cardButtons = this.element.querySelectorAll<HTMLElement>('.card-play-hover-btn');
    cardButtons.forEach((btn) => {
      const id = Number(btn.dataset.id);
      if (!id) return;

      const isPlaying = this.engine.isCollectionPlaying(id);
      if (isPlaying) {
        btn.classList.add('playing');
        btn.innerHTML = PAUSE_ICON;
      } else {
        btn.classList.remove('playing');
        btn.innerHTML = PLAY_ICON;
      }
    });

    const rowEls = this.element.querySelectorAll<HTMLElement>('.track-row');
    rowEls.forEach((row) => {
      const id = Number(row.dataset.trackId);
      if (!id) return;
      const isPlaying = this.engine.isTrackPlaying(id);
      row.classList.toggle('playing', isPlaying);
    });

    const rowButtons = this.element.querySelectorAll<HTMLElement>('.row-play-btn');
    rowButtons.forEach((btn) => {
      const id = Number(btn.dataset.trackId);
      if (!id) return;

      const isPlaying = this.engine.isTrackPlaying(id);
      btn.innerHTML = isPlaying ? ROW_PAUSE_ICON : ROW_PLAY_ICON;
    });
  }
}
