import { scGetDiscover, scGetPlaylist } from '../ipc.ts';
import { AudioEngine, toHighResArtwork, getPlaylistCover } from '../player/AudioEngine.ts';
import { showToast } from '../components/Toast.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import type { Track, Playlist, DiscoverResponse, MixedSelectionItem } from '../types.ts';

type DiscoverItem = Partial<Track & Playlist> & {
  id?: number;
  urn?: string;
  title?: string;
  kind?: string;
  is_album?: boolean;
  track_count?: number;
  computed_artwork_url?: string | null;
  calculated_artwork_url?: string | null;
};

const PLAY_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
const PAUSE_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const SPINNER_ICON = `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path></svg>`;

export class HomeView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private onOpenPlaylist: (id: number | string) => void;
  private unsubscribeAudio: (() => void) | null = null;
  private destroyed: boolean = false;

  constructor(onOpenPlaylist: (id: number | string) => void) {
    this.engine = AudioEngine.getInstance();
    this.onOpenPlaylist = onOpenPlaylist;
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.unsubscribeAudio = this.engine.subscribe(() => this.updatePlayButtons());
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
  }

  private async loadData(): Promise<void> {
    this.element.innerHTML = `
      <div class="view-section">
        <div class="view-section-header">
          <div>
            <div class="skeleton" style="width: 160px; height: 26px; margin-bottom: 8px;"></div>
            <div class="skeleton" style="width: 240px; height: 16px;"></div>
          </div>
        </div>
        <div class="cards-grid">
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
        </div>
      </div>
      <div class="view-section">
        <div class="view-section-header">
          <div>
            <div class="skeleton" style="width: 180px; height: 26px; margin-bottom: 8px;"></div>
            <div class="skeleton" style="width: 220px; height: 16px;"></div>
          </div>
        </div>
        <div class="cards-grid">
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
          <div class="card-item skeleton" style="height: 220px;"></div>
        </div>
      </div>
    `;

    try {
      const data = await scGetDiscover();
      if (this.destroyed) return;
      this.render(data);
    } catch (err) {
      if (this.destroyed) return;
      this.element.innerHTML = `
        <div style="padding: 24px; color: var(--text-secondary);">
          <h3>Could not load recommendations</h3>
          <p style="margin-top: 8px; font-size: 13px; color: var(--text-tertiary);">${String(err)}</p>
        </div>
      `;
    }
  }

  private render(data: DiscoverResponse): void {
    this.element.innerHTML = '';

    if (!data.collection || data.collection.length === 0) {
      this.element.innerHTML = `<div style="padding: 24px; color: var(--text-secondary);">No selections found.</div>`;
      return;
    }

    data.collection.forEach((section: MixedSelectionItem) => {
      const sectionTitle = section.title || 'Recommended';
      const itemsCollection = (section.items && 'collection' in section.items) ? section.items.collection : section.items;
      const rawItems: DiscoverItem[] = Array.isArray(itemsCollection) ? (itemsCollection as DiscoverItem[]) : [];

      const seenKeys = new Set<string>();
      const items = rawItems.filter((item: DiscoverItem) => {
        if (!item) return false;
        const idKey = item.urn
          ? item.urn
          : item.id && item.id > 0
            ? `${item.kind || 'item'}:${item.id}`
            : null;
        const titleKey = item.title ? `t:${item.title}:${item.user?.username || ''}` : null;
        if (idKey && seenKeys.has(idKey)) return false;
        if (titleKey && seenKeys.has(titleKey)) return false;
        if (idKey) seenKeys.add(idKey);
        if (titleKey) seenKeys.add(titleKey);
        return true;
      });

      if (items.length === 0) return;

      const secEl = document.createElement('div');
      secEl.className = 'view-section';

      const header = document.createElement('div');
      header.className = 'view-section-header';
      header.innerHTML = `
        <div>
          <h2 class="view-section-title">${sectionTitle}</h2>
          ${section.description ? `<p class="view-section-subtitle">${section.description}</p>` : ''}
        </div>
      `;
      secEl.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'cards-grid';

      items.forEach((item: DiscoverItem) => {
        const isTrack = item.kind === 'track' || (!item.kind && !item.urn && !item.track_count && !Array.isArray(item.tracks) && !item.is_album);
        const title = item.title || 'Untitled';
        const author = item.user?.username || 'SoundCloud';
        const authorId = item.user?.id;
        const cover = isTrack
          ? (toHighResArtwork(item.artwork_url) || getPlaylistCover(item))
          : getPlaylistCover(item);

        const collectionKey = item.urn && item.urn.length > 0
          ? item.urn
          : (typeof item.id === 'number' && item.id > 0 ? String(item.id) : '');
        const btnDataId = isTrack ? String(item.id || '') : collectionKey;

        const card = document.createElement('div');
        card.className = 'card-item';
        card.innerHTML = `
          <div class="card-cover-wrapper">
            <img class="card-cover-img" src="${cover}" alt="${title}" loading="lazy" decoding="async" />
            <div class="card-play-hover-btn" data-kind="${isTrack ? 'track' : 'playlist'}" data-id="${btnDataId}" title="${isTrack ? 'Play track' : 'Play playlist'}">
              ${PLAY_ICON}
            </div>
          </div>
          <div class="card-title ${isTrack && item.id ? 'clickable-link' : ''}" title="${title}">${title}</div>
          <div class="card-author ${authorId ? 'clickable-link' : ''}" title="${author}">${author}</div>
        `;

        if (isTrack && item.id) {
          card.querySelector('.card-title')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.id) AppNavigator.openTrack(item.id);
          });
        }

        if (authorId) {
          card.querySelector('.card-author')?.addEventListener('click', (e) => {
            e.stopPropagation();
            AppNavigator.openProfile(authorId);
          });
        }

        const playBtn = card.querySelector<HTMLElement>('.card-play-hover-btn');
        playBtn?.addEventListener('click', async (e) => {
          e.stopPropagation();

          if (isTrack) {
            if (this.engine.currentTrack?.id === item.id) {
              this.engine.togglePlay();
            } else {
              await this.engine.playTrack(item as Track, [item as Track]);
            }
          } else {
            if (collectionKey && this.engine.currentCollectionId !== null && String(this.engine.currentCollectionId) === collectionKey) {
              this.engine.togglePlay();
            } else {
              playBtn.innerHTML = SPINNER_ICON;
              try {
                let tracks: Track[] = [];
                if (collectionKey) {
                  const pl = await scGetPlaylist(collectionKey);
                  if (this.destroyed) return;
                  tracks = (pl.tracks || []).filter((t: Track) => t && t.title);
                } else if (Array.isArray(item.tracks) && item.tracks.length > 0) {
                  tracks = item.tracks.filter((t: Track) => t && t.title);
                }

                if (tracks.length > 0) {
                  const colId = collectionKey || tracks[0].id;
                  await this.engine.playCollection(colId, tracks, 0);
                } else {
                  showToast('No playable tracks found in this playlist');
                }
              } catch (err) {
                if (this.destroyed) return;
                console.error('Failed to load playlist for playback:', err);
                showToast('Could not load playlist tracks');
              } finally {
                if (!this.destroyed) {
                  this.updatePlayButtons();
                }
              }
            }
          }
        });

        card.addEventListener('click', () => {
          if (isTrack) {
            this.engine.playTrack(item as Track, [item as Track]);
          } else if (collectionKey) {
            this.onOpenPlaylist(collectionKey);
          } else if (Array.isArray(item.tracks) && item.tracks.length > 0) {
            const validTracks = item.tracks.filter((t: Track) => t && t.title);
            if (validTracks.length > 0) {
              const fallbackId = validTracks[0]?.id || 0;
              this.engine.playCollection(fallbackId, validTracks, 0);
            } else {
              showToast('No playable tracks found in this selection');
            }
          }
        });

        grid.appendChild(card);
      });

      secEl.appendChild(grid);
      this.element.appendChild(secEl);
    });

    this.updatePlayButtons();
  }

  private updatePlayButtons(): void {
    const buttons = this.element.querySelectorAll<HTMLElement>('.card-play-hover-btn');
    buttons.forEach((btn) => {
      const kind = btn.dataset.kind;
      const rawId = btn.dataset.id;
      if (!rawId) return;

      const isPlaying = kind === 'track'
        ? this.engine.isTrackPlaying(Number(rawId))
        : this.engine.isCollectionPlaying(rawId);

      if (isPlaying) {
        btn.classList.add('playing');
        btn.innerHTML = PAUSE_ICON;
      } else {
        btn.classList.remove('playing');
        btn.innerHTML = PLAY_ICON;
      }
    });
  }
}
