import { scSearch, scGetPlaylist } from '../ipc.ts';
import { AudioEngine, getPlaylistCover } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import {
  createTrackRow,
  HEART_ICON,
  ROW_PLAY_ICON,
  ROW_PAUSE_ICON,
} from '../components/TrackRow.ts';
import type { Track, Playlist, User } from '../types.ts';

const PLAY_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
const PAUSE_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const SPINNER_ICON = `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path></svg>`;

export class SearchView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private query: string = '';
  private searchSeq: number = 0;
  private activeTab: 'all' | 'tracks' | 'playlists' | 'users' = 'all';
  private results: { tracks: Track[]; playlists: Playlist[]; users: User[] } = {
    tracks: [],
    playlists: [],
    users: [],
  };
  private onOpenPlaylist: (id: number | string) => void;
  private onSelectQuery?: (query: string) => void;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeLikes: (() => void) | null = null;

  constructor(
    onOpenPlaylist: (id: number | string) => void,
    onSelectQuery?: (query: string) => void
  ) {
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.onOpenPlaylist = onOpenPlaylist;
    this.onSelectQuery = onSelectQuery;
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.unsubscribeAudio = this.engine.subscribe(() => this.updatePlayButtons());
    this.unsubscribeLikes = this.likesStore.subscribe(() => this.updateLikeButtons());
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public destroy(): void {
    if (this.unsubscribeAudio) {
      this.unsubscribeAudio();
      this.unsubscribeAudio = null;
    }
    if (this.unsubscribeLikes) {
      this.unsubscribeLikes();
      this.unsubscribeLikes = null;
    }
  }

  public setQuery(query: string): void {
    const trimmed = query.trim();
    this.query = trimmed;
    if (!trimmed) {
      this.searchSeq++;
      this.results = { tracks: [], playlists: [], users: [] };
      this.renderTabContent();
      return;
    }
    this.search();
  }

  public async search(): Promise<void> {
    if (!this.query.trim()) return;

    const seq = ++this.searchSeq;
    const contentArea = this.element.querySelector('#search-content');
    const headerTitle = this.element.querySelector('#search-header-title');
    if (headerTitle) {
      headerTitle.textContent = `Results for "${this.query}"`;
    }

    if (contentArea) {
      contentArea.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div class="skeleton" style="height: 48px; border-radius: var(--radius-md);"></div>
          <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.8;"></div>
          <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.6;"></div>
          <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.4;"></div>
        </div>
      `;
    }

    try {
      const data = await scSearch(this.query, 'all');
      if (seq !== this.searchSeq) return;
      this.results = {
        tracks: data.tracks || [],
        playlists: data.playlists || [],
        users: data.users || [],
      };
      this.renderTabContent();
    } catch (err) {
      if (seq !== this.searchSeq) return;
      if (contentArea) {
        contentArea.innerHTML = `<div style="padding: 24px; color: var(--text-secondary);">Search error: ${String(err)}</div>`;
      }
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="view-section-header">
        <div>
          <h2 class="view-section-title" id="search-header-title">Search</h2>
          <p class="view-section-subtitle" id="search-header-subtitle">Find tracks, playlists and artists</p>
        </div>
      </div>

      <div class="protocol-pills" style="max-width: 380px; margin-bottom: 24px;">
        <div class="protocol-pill ${this.activeTab === 'all' ? 'active' : ''}" data-tab="all">All</div>
        <div class="protocol-pill ${this.activeTab === 'tracks' ? 'active' : ''}" data-tab="tracks">Tracks</div>
        <div class="protocol-pill ${this.activeTab === 'playlists' ? 'active' : ''}" data-tab="playlists">Playlists</div>
        <div class="protocol-pill ${this.activeTab === 'users' ? 'active' : ''}" data-tab="users">Users</div>
      </div>

      <div id="search-content"></div>
    `;

    const pills = this.element.querySelectorAll<HTMLElement>('.protocol-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeTab = (pill.getAttribute('data-tab') as 'all' | 'tracks' | 'playlists' | 'users') || 'all';
        this.renderTabContent();
      });
    });

    this.renderTabContent();
  }

  private renderTabContent(): void {
    const contentArea = this.element.querySelector('#search-content');
    const headerTitle = this.element.querySelector('#search-header-title');
    const headerSub = this.element.querySelector('#search-header-subtitle');

    if (headerTitle) {
      headerTitle.textContent = this.query ? `Results for "${this.query}"` : 'Search';
    }

    if (!this.query.trim()) {
      if (headerSub) {
        headerSub.textContent = 'Find tracks, playlists and artists';
      }
      if (contentArea) {
        contentArea.innerHTML = `
          <div style="padding: 40px 20px; text-align: center; color: var(--text-tertiary); font-size: 13.5px;">
            Start typing in the top search bar to discover tracks, playlists, and artists.
          </div>
        `;
      }
      return;
    }

    if (headerSub) {
      if (this.activeTab === 'all') {
        const total = this.results.tracks.length + this.results.playlists.length + this.results.users.length;
        headerSub.textContent = `${total} results found`;
      } else {
        const count = this.activeTab === 'tracks'
          ? this.results.tracks.length
          : this.activeTab === 'playlists'
          ? this.results.playlists.length
          : this.results.users.length;
        headerSub.textContent = `${count} ${this.activeTab} found`;
      }
    }

    if (!contentArea) return;
    contentArea.innerHTML = '';

    if (this.activeTab === 'all') {
      const hasAny = this.results.tracks.length > 0 || this.results.playlists.length > 0 || this.results.users.length > 0;
      if (!hasAny) {
        contentArea.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No results found for "${this.query}"</div>`;
        return;
      }

      if (this.results.tracks.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'view-section';
        sec.innerHTML = `<div class="view-section-header"><h3 class="view-section-title" style="font-size: 16px;">Tracks</h3></div>`;
        sec.appendChild(this.buildTracksTable(this.results.tracks.slice(0, 8)));
        contentArea.appendChild(sec);
      }

      if (this.results.playlists.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'view-section';
        sec.innerHTML = `<div class="view-section-header"><h3 class="view-section-title" style="font-size: 16px;">Playlists</h3></div>`;
        sec.appendChild(this.buildPlaylistsGrid(this.results.playlists.slice(0, 8)));
        contentArea.appendChild(sec);
      }

      if (this.results.users.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'view-section';
        sec.innerHTML = `<div class="view-section-header"><h3 class="view-section-title" style="font-size: 16px;">Users</h3></div>`;
        sec.appendChild(this.buildUsersGrid(this.results.users.slice(0, 8)));
        contentArea.appendChild(sec);
      }
    } else if (this.activeTab === 'tracks') {
      if (this.results.tracks.length === 0) {
        contentArea.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No tracks found</div>`;
        return;
      }
      contentArea.appendChild(this.buildTracksTable(this.results.tracks));
    } else if (this.activeTab === 'playlists') {
      if (this.results.playlists.length === 0) {
        contentArea.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No playlists found</div>`;
        return;
      }
      contentArea.appendChild(this.buildPlaylistsGrid(this.results.playlists));
    } else {
      if (this.results.users.length === 0) {
        contentArea.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No users found</div>`;
        return;
      }
      contentArea.appendChild(this.buildUsersGrid(this.results.users));
    }

    this.updatePlayButtons();
  }

  private buildTracksTable(tracks: Track[]): HTMLElement {
    const table = document.createElement('div');
    table.className = 'tracklist-table';

    tracks.forEach((track, idx) => {
      table.appendChild(
        createTrackRow({
          track,
          index: idx,
          queue: tracks,
        })
      );
    });

    return table;
  }

  private buildPlaylistsGrid(playlists: Playlist[]): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';

    playlists.forEach((pl) => {
      const title = pl.title;
      const author = pl.user?.username || 'SoundCloud';
      const authorId = pl.user?.id;
      const cover = getPlaylistCover(pl);
      const collectionKey = pl.urn || String(pl.id);

      const card = document.createElement('div');
      card.className = 'card-item';
      card.innerHTML = `
        <div class="card-cover-wrapper">
          <img class="card-cover-img" src="${cover}" alt="${title}" loading="lazy" decoding="async" />
          <div class="card-play-hover-btn" data-kind="playlist" data-id="${collectionKey}" title="Play playlist">
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

        if (this.engine.currentCollectionId !== null && String(this.engine.currentCollectionId) === collectionKey) {
          this.engine.togglePlay();
        } else {
          playBtn.innerHTML = SPINNER_ICON;
          try {
            let tracks: Track[] = [];
            if (Array.isArray(pl.tracks) && pl.tracks.length > 0 && pl.tracks[0]?.media?.transcodings?.length) {
              tracks = pl.tracks;
            } else {
              const fullPl = await scGetPlaylist(collectionKey);
              tracks = (fullPl.tracks || []).filter((t: Track) => t && t.title);
            }
            if (tracks.length > 0) {
              await this.engine.playCollection(collectionKey, tracks, 0);
            }
          } catch (err) {
            console.error('Failed to load playlist for playback:', err);
          } finally {
            this.updatePlayButtons();
          }
        }
      });

      card.addEventListener('click', () => {
        this.onOpenPlaylist(collectionKey);
      });

      grid.appendChild(card);
    });

    return grid;
  }

  private buildUsersGrid(users: User[]): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';

    users.forEach((user) => {
      const name = user.username;
      const avatar = user.avatar_url || 'https://a1.sndcdn.com/images/default_avatar_large.png';

      const card = document.createElement('div');
      card.className = 'card-item';
      card.style.alignItems = 'center';
      card.style.textAlign = 'center';
      card.innerHTML = `
        <div class="card-cover-wrapper" style="border-radius: 50%; width: 120px; height: 120px; margin: 0 auto 12px;">
          <img class="card-cover-img" src="${avatar}" alt="${name}" loading="lazy" decoding="async" style="border-radius: 50%;" />
        </div>
        <div class="card-title" title="${name}" style="text-align: center; width: 100%;">${name}</div>
        <div class="card-author" style="text-align: center;">${user.followers_count !== undefined ? `${user.followers_count.toLocaleString()} followers` : 'Artist'}</div>
      `;

      card.addEventListener('click', () => {
        if (user.id) {
          AppNavigator.openProfile(user.id);
        } else if (this.onSelectQuery) {
          this.onSelectQuery(name);
        } else {
          this.setQuery(name);
        }
      });

      grid.appendChild(card);
    });

    return grid;
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
      const id = btn.dataset.id;
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
