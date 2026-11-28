import { scGetMe, scGetLibrary, scAddTrackToPlaylist, scCreatePlaylist } from '../ipc.ts';
import { getPlaylistCover, toHighResArtwork } from '../player/AudioEngine.ts';
import { showToast } from './Toast.ts';
import { escapeHtml } from '../utils/format.ts';
import type { Playlist, Track } from '../types.ts';

export class AddToPlaylistModal {
  private element: HTMLElement;
  private targetTrack: Track | null = null;
  private playlists: Playlist[] = [];
  private searchQuery: string = '';
  private showCreateForm: boolean = false;
  private isLoading: boolean = false;
  private openSeq: number = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.element.id = 'add-to-playlist-backdrop';
    this.element.innerHTML = `
      <div class="settings-modal-card" style="width: 440px;">
        <div class="modal-header">
          <span class="modal-title" id="atp-modal-title">Add to Playlist</span>
          <button class="titlebar-btn close-btn" id="atp-btn-close">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body" id="atp-modal-body" style="gap: 14px;"></div>
      </div>
    `;

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    this.element.querySelector('#atp-btn-close')?.addEventListener('click', () => this.close());
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public async open(track: Track): Promise<void> {
    const seq = ++this.openSeq;
    this.targetTrack = track;
    this.searchQuery = '';
    this.showCreateForm = false;
    this.isLoading = true;
    this.element.classList.add('open');
    this.renderBody();

    try {
      const me = await scGetMe();
      if (seq !== this.openSeq) return;
      if (!me || !me.id) {
        this.isLoading = false;
        this.renderNotSignedIn();
        return;
      }

      const lib = await scGetLibrary(me.id);
      if (seq !== this.openSeq) return;
      const allPlaylists = lib.playlists || [];
      this.playlists = allPlaylists.filter((pl) => pl && (!pl.user?.id || pl.user.id === me.id));
    } catch (err) {
      if (seq !== this.openSeq) return;
      console.error('Failed to fetch user playlists:', err);
      this.playlists = [];
    } finally {
      if (seq === this.openSeq) {
        this.isLoading = false;
        this.renderBody();
      }
    }
  }

  public close(): void {
    this.openSeq++;
    this.element.classList.remove('open');
    this.targetTrack = null;
  }

  private renderNotSignedIn(): void {
    const body = this.element.querySelector('#atp-modal-body');
    if (!body) return;
    body.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--text-secondary); font-size: 13px;">
        Please sign in to SoundCloud to add tracks to your playlists.
      </div>
    `;
  }

  private renderBody(): void {
    const body = this.element.querySelector('#atp-modal-body');
    if (!body || !this.targetTrack) return;

    const track = this.targetTrack;
    const trackCover = toHighResArtwork(track.artwork_url) || 'https://a1.sndcdn.com/images/default_avatar_large.png';

    const filtered = this.playlists.filter((pl) =>
      pl.title.toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    const safeTitle = escapeHtml(track.title);
    const safeArtist = escapeHtml(track.user?.username || 'SoundCloud');
    const safeCover = escapeHtml(trackCover);

    body.innerHTML = `
      <div class="atp-track-preview">
        <img src="${safeCover}" alt="${safeTitle}" class="atp-track-thumb" />
        <div style="min-width: 0; flex: 1;">
          <div style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeTitle}</div>
          <div style="font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeArtist}</div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; align-items: center;">
        <input type="text" class="settings-input" id="atp-search-input" placeholder="Filter your playlists..." value="${escapeHtml(this.searchQuery)}" style="flex: 1; height: 34px; font-size: 12.5px;" />
        <button class="btn-secondary" id="atp-toggle-new" style="height: 34px; padding: 0 12px; font-size: 12px; white-space: nowrap;">+ New Playlist</button>
      </div>

      <div id="atp-new-form" style="display: ${this.showCreateForm ? 'flex' : 'none'}; flex-direction: column; gap: 10px; padding: 12px; background: var(--bg-card); border-radius: var(--radius-md); border: var(--border-subtle);">
        <input type="text" class="settings-input" id="atp-new-title" placeholder="New playlist title..." style="height: 34px; font-size: 12.5px;" />
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="atp-new-public" checked />
            Public playlist
          </label>
          <button class="btn-primary" id="atp-btn-create" style="height: 30px; padding: 0 14px; font-size: 12px;">Create &amp; Add</button>
        </div>
      </div>

      <div class="atp-list" id="atp-playlist-list"></div>
    `;

    const searchInput = body.querySelector<HTMLInputElement>('#atp-search-input');
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.renderListOnly(body);
    });

    body.querySelector('#atp-toggle-new')?.addEventListener('click', () => {
      this.showCreateForm = !this.showCreateForm;
      const formEl = body.querySelector<HTMLElement>('#atp-new-form');
      if (formEl) {
        formEl.style.display = this.showCreateForm ? 'flex' : 'none';
        if (this.showCreateForm) {
          body.querySelector<HTMLInputElement>('#atp-new-title')?.focus();
        }
      }
    });

    const createBtn = body.querySelector<HTMLButtonElement>('#atp-btn-create');
    createBtn?.addEventListener('click', async () => {
      const titleEl = body.querySelector<HTMLInputElement>('#atp-new-title');
      const publicEl = body.querySelector<HTMLInputElement>('#atp-new-public');
      const title = titleEl?.value.trim() || '';
      if (!title || !this.targetTrack) {
        showToast('Enter a playlist title');
        return;
      }

      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';
      try {
        const created = await scCreatePlaylist(title, publicEl?.checked ?? true, this.targetTrack.id);
        this.playlists.unshift(created);
        showToast(`Added to ${created.title || title}`);
        this.close();
      } catch (err) {
        showToast(`Failed to create playlist: ${String(err)}`);
        createBtn.disabled = false;
        createBtn.textContent = 'Create & Add';
      }
    });

    this.renderListItems(body.querySelector('#atp-playlist-list'), filtered);
  }

  private renderListOnly(body: Element): void {
    const filtered = this.playlists.filter((pl) =>
      pl.title.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    this.renderListItems(body.querySelector('#atp-playlist-list'), filtered);
  }

  private renderListItems(listEl: Element | null, items: Playlist[]): void {
    if (!listEl) return;
    if (this.isLoading) {
      listEl.innerHTML = `
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.7;"></div>
      `;
      return;
    }

    if (items.length === 0) {
      listEl.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-tertiary); font-size: 12.5px;">No playlists match</div>`;
      return;
    }

    listEl.innerHTML = '';
    items.forEach((pl) => {
      const alreadyIn = Boolean(
        this.targetTrack &&
        Array.isArray(pl.tracks) &&
        pl.tracks.some((t) => t && t.id === this.targetTrack?.id)
      );
      const cover = getPlaylistCover(pl);
      const safePlTitle = escapeHtml(pl.title);

      const row = document.createElement('div');
      row.className = 'atp-playlist-row';
      row.innerHTML = `
        <img src="${escapeHtml(cover)}" alt="${safePlTitle}" class="atp-pl-thumb" />
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safePlTitle}</div>
          <div style="font-size: 11.5px; color: var(--text-tertiary);">${pl.track_count ?? pl.tracks?.length ?? 0} tracks</div>
        </div>
        <span class="atp-check-badge" style="color: ${alreadyIn ? 'var(--accent)' : 'var(--text-tertiary)'};">
          ${alreadyIn
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`}
        </span>
      `;

      row.addEventListener('click', async () => {
        if (!this.targetTrack) return;
        const badge = row.querySelector<HTMLElement>('.atp-check-badge');
        if (badge) {
          badge.innerHTML = `<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path></svg>`;
        }
        try {
          await scAddTrackToPlaylist(pl.id, this.targetTrack.id);
          showToast(`Added to ${pl.title}`);
          this.close();
        } catch (err) {
          showToast(`Failed to add: ${String(err)}`);
          if (badge) {
            badge.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          }
        }
      });

      listEl.appendChild(row);
    });
  }
}
