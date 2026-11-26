import {
  scGetMe,
  scGetUserTracks,
  scGetLibrary,
  scGetPlaylist,
  scGetUserProfile,
  scToggleFollow,
  scLogin,
} from '../ipc.ts';
import { AudioEngine, toHighResArtwork, getPlaylistCover } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import { showToast } from '../components/Toast.ts';
import { EditProfileModal } from '../components/EditProfileModal.ts';
import {
  createTrackRow,
  HEART_ICON,
  ROW_PLAY_ICON,
  ROW_PAUSE_ICON,
} from '../components/TrackRow.ts';
import type { Track, Playlist, User, LibraryTrackItem } from '../types.ts';

const PLAY_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
const PAUSE_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const SPINNER_ICON = `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path></svg>`;

const CAMERA_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
    <circle cx="12" cy="13" r="3"></circle>
  </svg>
`;

const VERIFIED_BADGE = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#38bdf8" title="Verified" style="flex-shrink: 0;">
    <path d="M12 2l2.9 2.3 3.7-.3 1.2 3.5 3.1 2-1.1 3.6 1.1 3.6-3.1 2-1.2 3.5-3.7-.3L12 22l-2.9-2.3-3.7.3-1.2-3.5-3.1-2 1.1-3.6-1.1-3.6 3.1-2 1.2-3.5 3.7.3L12 2zm-1.1 13.4l5.4-5.4-1.4-1.4-4 4-2-2-1.4 1.4 3.4 3.4z"/>
  </svg>
`;

export class ProfileView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private onOpenPlaylist: (id: number | string) => void;
  private targetUserId?: number;
  private isOwnProfile: boolean = true;
  private isFollowing: boolean = false;
  private user: User | null = null;
  private activeTab: 'tracks' | 'playlists' | 'likes' = 'tracks';
  private tracks: Track[] = [];
  private playlists: Playlist[] = [];
  private likes: Track[] = [];
  private editModal: EditProfileModal;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeLikes: (() => void) | null = null;
  private destroyed: boolean = false;

  constructor(onOpenPlaylist: (id: number | string) => void, userId?: number) {
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.onOpenPlaylist = onOpenPlaylist;
    this.targetUserId = userId;
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.editModal = new EditProfileModal(() => {
      if (!this.destroyed) {
        this.loadData();
      }
    });

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
    this.editModal.getElement().remove();
  }

  private onLikesUpdated(): void {
    if (this.isOwnProfile) {
      this.likes = this.likesStore.getLikedTracks();
      const pillLikes = this.element.querySelector<HTMLElement>('.protocol-pill[data-tab="likes"]');
      if (pillLikes) {
        pillLikes.textContent = `Likes (${this.likes.length})`;
      }
      if (this.activeTab === 'likes') {
        this.renderContent();
      }
    }
    this.updateLikeButtons();
  }

  private async loadData(): Promise<void> {
    this.element.innerHTML = `
      <div class="profile-banner skeleton" style="height: 200px; width: 100%; border-radius: var(--radius-xl); margin-bottom: 24px;"></div>
      <div style="display: flex; gap: 20px; align-items: flex-end; margin-top: -60px; margin-left: 24px; margin-bottom: 24px;">
        <div class="skeleton" style="width: 120px; height: 120px; border-radius: 50%; flex-shrink: 0;"></div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
          <div class="skeleton" style="width: 220px; height: 28px;"></div>
          <div class="skeleton" style="width: 320px; height: 16px;"></div>
        </div>
      </div>
      <div class="protocol-pills" style="max-width: 380px; margin-bottom: 24px;">
        <div class="protocol-pill active">Tracks</div>
        <div class="protocol-pill">Playlists</div>
        <div class="protocol-pill">Likes</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.8;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.6;"></div>
      </div>
    `;

    try {
      let me: User | null = null;
      let meError: unknown = null;
      try {
        me = await scGetMe();
      } catch (err) {
        meError = err;
      }
      if (this.destroyed) return;

      const viewingOwn = !this.targetUserId || (me !== null && me.id === this.targetUserId);
      this.isOwnProfile = viewingOwn;

      if (viewingOwn) {
        if (meError) {
          this.element.innerHTML = `
            <div style="padding: 24px; color: var(--text-secondary);">
              <h3>Could not reach SoundCloud</h3>
              <p style="margin-top: 6px; font-size: 13px; color: var(--text-tertiary);">${String(meError)}</p>
              <button class="btn-secondary" id="profile-btn-retry" style="margin-top: 14px;">Retry</button>
            </div>
          `;
          this.element.querySelector('#profile-btn-retry')?.addEventListener('click', () => {
            this.loadData();
          });
          return;
        }
        if (!me || !me.id) {
          this.renderNotLoggedIn();
          return;
        }
        this.user = me;

        const [tracksRes, libraryRes] = await Promise.allSettled([
          scGetUserTracks(me.id),
          scGetLibrary(me.id),
        ]);
        if (this.destroyed) return;

        if (tracksRes.status === 'fulfilled') {
          const raw = tracksRes.value;
          const list = Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object' && Array.isArray((raw as { collection?: Track[] }).collection)
              ? (raw as { collection: Track[] }).collection
              : [];
          this.tracks = (list as Track[]).filter(t => t && t.id && t.title);
        }

        if (libraryRes.status === 'fulfilled') {
          const lib = libraryRes.value;
          const rawLikes = lib.likes || [];
          const likedTracks: Track[] = rawLikes
            .map((item: LibraryTrackItem) => (item.track || item) as unknown as Track)
            .filter((t: Track) => t && t.id && t.title);
          this.likesStore.setTracks(likedTracks);
          this.likes = this.likesStore.getLikedTracks();
          this.playlists = lib.playlists || [];
        } else {
          this.likes = this.likesStore.getLikedTracks();
        }
      } else if (this.targetUserId) {
        const profileData = await scGetUserProfile(this.targetUserId);
        if (this.destroyed) return;
        this.user = profileData.user;
        this.tracks = (profileData.tracks || []).filter((t: Track) => t && t.id && t.title);
        this.playlists = profileData.playlists || [];
        this.likes = (profileData.likes || []).filter((t: Track) => t && t.id && t.title);
        this.isFollowing = Boolean(profileData.is_following);
      }

      if (this.destroyed) return;
      this.render();
    } catch (err) {
      if (this.destroyed) return;
      console.error('Failed to load profile:', err);
      this.element.innerHTML = `
        <div style="padding: 24px; color: var(--text-secondary);">
          <h3>Failed to load profile</h3>
          <p style="margin-top: 6px; font-size: 13px; color: var(--text-tertiary);">${String(err)}</p>
        </div>
      `;
    }
  }

  private renderNotLoggedIn(): void {
    this.element.innerHTML = `
      <div style="padding: 32px; text-align: center; max-width: 440px; margin: 40px auto; background: var(--bg-card); border-radius: var(--radius-xl); border: var(--border-subtle);">
        <h3 style="font-size: 18px; margin-bottom: 8px;">Sign in to view your Profile</h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
          Connect your SoundCloud account to see your profile, uploads, playlists, and statistics.
        </p>
        <button class="btn-primary" id="profile-btn-signin" style="padding: 9px 24px; display: inline-flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" style="flex-shrink: 0;">
            <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>
          </svg>
          <span>Sign In</span>
        </button>
      </div>
    `;
    this.element.querySelector('#profile-btn-signin')?.addEventListener('click', () => {
      scLogin().catch(console.error);
    });
  }

  private render(): void {
    if (!this.user) return;

    const bannerVisual = this.user.visuals?.visuals?.[0]?.visual_url || '';
    const avatarUrl = toHighResArtwork(this.user.avatar_url) || 'https://a1.sndcdn.com/images/default_avatar_large.png';
    const username = this.user.username || 'User';
    const bio = this.user.description || '';
    const followers = this.user.followers_count ?? 0;
    const following = this.user.followings_count ?? 0;
    const trackCount = this.user.track_count ?? this.tracks.length;
    const locationParts = [this.user.city, this.user.country || this.user.country_code].filter(Boolean);
    const locationStr = locationParts.join(', ');

    const bannerHtml = bannerVisual
      ? `<div class="profile-banner-img" style="background-image: url('${bannerVisual}');"></div>`
      : `<div class="profile-banner-placeholder"></div>`;

    this.element.innerHTML = `
      <div class="profile-header-container">
        <div class="profile-banner-wrapper">
          ${bannerHtml}
          ${this.isOwnProfile ? `
            <button class="profile-banner-cam-btn" id="profile-cam-banner" title="Change Banner">${CAMERA_ICON}<span>Edit Banner</span></button>
          ` : ''}
        </div>
        <div class="profile-info-row">
          <div class="profile-avatar-wrapper">
            <img class="profile-avatar-img" src="${avatarUrl}" alt="${username}" />
            ${this.isOwnProfile ? `
              <div class="profile-avatar-cam-overlay" id="profile-cam-avatar" title="Change Avatar">${CAMERA_ICON}</div>
            ` : ''}
          </div>
          <div class="profile-info-main">
            <div class="profile-title-row" style="justify-content: space-between; width: 100%; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                <h1 class="profile-username">${username}</h1>
                ${this.user.verified ? VERIFIED_BADGE : ''}
              </div>
              <div style="display: flex; gap: 10px; align-items: center;">
                ${this.isOwnProfile ? `
                  <button class="btn-secondary" id="profile-btn-edit" style="height: 34px; padding: 0 16px; font-size: 13px;">Edit Profile</button>
                ` : `
                  <button class="${this.isFollowing ? 'btn-secondary' : 'btn-primary'}" id="profile-btn-follow" style="height: 34px; padding: 0 18px; font-size: 13px;">
                    ${this.isFollowing ? 'Following' : 'Follow'}
                  </button>
                `}
              </div>
            </div>
            ${locationStr ? `<div style="font-size: 12.5px; color: var(--text-tertiary);">${locationStr}</div>` : ''}
            ${bio ? `<p class="profile-bio">${bio}</p>` : ''}
            <div class="profile-stats-row">
              <div class="profile-stat-item">
                <span class="profile-stat-num">${trackCount.toLocaleString()}</span>
                <span class="profile-stat-label">Tracks</span>
              </div>
              <div class="profile-stat-item">
                <span class="profile-stat-num" id="profile-followers-count">${followers.toLocaleString()}</span>
                <span class="profile-stat-label">Followers</span>
              </div>
              <div class="profile-stat-item">
                <span class="profile-stat-num">${following.toLocaleString()}</span>
                <span class="profile-stat-label">Following</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="protocol-pills" style="max-width: 380px; margin-bottom: 24px;">
        <div class="protocol-pill ${this.activeTab === 'tracks' ? 'active' : ''}" data-tab="tracks">Tracks (${this.tracks.length})</div>
        <div class="protocol-pill ${this.activeTab === 'playlists' ? 'active' : ''}" data-tab="playlists">Playlists (${this.playlists.length})</div>
        <div class="protocol-pill ${this.activeTab === 'likes' ? 'active' : ''}" data-tab="likes">Likes (${this.likes.length})</div>
      </div>

      <div id="profile-content"></div>
    `;

    if (!this.editModal.getElement().parentElement) {
      document.body.appendChild(this.editModal.getElement());
    }

    this.element.querySelector('#profile-btn-edit')?.addEventListener('click', () => {
      if (this.user) this.editModal.open(this.user);
    });
    this.element.querySelector('#profile-cam-avatar')?.addEventListener('click', () => {
      if (this.user) this.editModal.open(this.user, 'avatar');
    });
    this.element.querySelector('#profile-cam-banner')?.addEventListener('click', () => {
      if (this.user) this.editModal.open(this.user, 'banner');
    });

    const followBtn = this.element.querySelector<HTMLButtonElement>('#profile-btn-follow');
    followBtn?.addEventListener('click', async () => {
      if (!this.user) return;
      const nextFollow = !this.isFollowing;
      followBtn.disabled = true;
      try {
        await scToggleFollow(this.user.id, nextFollow);
        if (this.destroyed) return;
        this.isFollowing = nextFollow;
        followBtn.className = this.isFollowing ? 'btn-secondary' : 'btn-primary';
        followBtn.textContent = this.isFollowing ? 'Following' : 'Follow';
        const followersEl = this.element.querySelector('#profile-followers-count');
        const base = this.user.followers_count ?? 0;
        const nextCount = Math.max(0, base + (this.isFollowing ? 1 : -1));
        this.user.followers_count = nextCount;
        if (followersEl) followersEl.textContent = nextCount.toLocaleString();
        showToast(this.isFollowing ? `Followed ${this.user.username}` : `Unfollowed ${this.user.username}`);
      } catch (err) {
        if (this.destroyed) return;
        showToast(`Action failed: ${String(err)}`);
      } finally {
        if (!this.destroyed) {
          followBtn.disabled = false;
        }
      }
    });

    const pills = this.element.querySelectorAll<HTMLElement>('.protocol-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeTab = (pill.getAttribute('data-tab') as 'tracks' | 'playlists' | 'likes') || 'tracks';
        this.renderContent();
      });
    });

    this.renderContent();
  }

  private renderContent(): void {
    const container = this.element.querySelector('#profile-content');
    if (!container) return;
    container.innerHTML = '';

    if (this.activeTab === 'tracks') {
      if (this.tracks.length === 0) {
        container.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No uploaded tracks found.</div>`;
        return;
      }
      container.appendChild(this.buildTrackTable(this.tracks));
    } else if (this.activeTab === 'likes') {
      if (this.likes.length === 0) {
        container.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No liked tracks yet.</div>`;
        return;
      }
      container.appendChild(this.buildTrackTable(this.likes));
    } else {
      if (this.playlists.length === 0) {
        container.innerHTML = `<div style="color: var(--text-tertiary); padding: 16px;">No playlists found.</div>`;
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
          if (this.engine.currentCollectionId !== null && String(this.engine.currentCollectionId) === String(pl.id)) {
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
              console.error('Failed to play playlist:', err);
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

  private buildTrackTable(tracks: Track[]): HTMLElement {
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
