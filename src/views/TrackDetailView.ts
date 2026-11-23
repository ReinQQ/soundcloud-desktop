import { scGetTrackDetail, scGetTrackComments, scPostTrackComment, scGetMe } from '../ipc.ts';
import { AudioEngine, toHighResArtwork, DEFAULT_COVER_PLACEHOLDER } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import { showToast } from '../components/Toast.ts';
import { HEART_ICON, PLAYLIST_ADD_ICON, formatTrackDuration } from '../components/TrackRow.ts';
import type { Track, TrackComment, User } from '../types.ts';

const FALLBACK_AVATAR_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#27272a"/><stop offset="100%" stop-color="#18181b"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#ag)"/><circle cx="60" cy="46" r="18" fill="#ffffff" fill-opacity="0.32"/><path d="M28 98c4-18 18-28 32-28s28 10 32 28" fill="#ffffff" fill-opacity="0.32"/></svg>`
)}`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAvatarUrl(url?: string | null): string {
  if (!url) return FALLBACK_AVATAR_SVG;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('default_avatar')) {
    return FALLBACK_AVATAR_SVG;
  }
  const hiRes = toHighResArtwork(trimmed);
  if (!hiRes || hiRes === DEFAULT_COVER_PLACEHOLDER) {
    return FALLBACK_AVATAR_SVG;
  }
  return hiRes;
}

function parseTagList(tagList?: string | null): string[] {
  if (!tagList) return [];
  const tags: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null = regex.exec(tagList);
  while (match !== null) {
    const val = (match[1] || match[2] || '').trim();
    if (val) tags.push(val);
    match = regex.exec(tagList);
  }
  return tags;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export class TrackDetailView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private trackId: number;
  private track: Track | null = null;
  private comments: TrackComment[] = [];
  private currentUser: User | null = null;
  private attachCurrentTime: boolean = true;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeLikes: (() => void) | null = null;

  constructor(trackId: number) {
    this.trackId = trackId;
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.unsubscribeAudio = this.engine.subscribe(() => this.syncLiveAudioState());
    this.unsubscribeLikes = this.likesStore.subscribe(() => this.updateLikeButton());
    this.loadData();
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

  private async loadData(): Promise<void> {
    this.element.innerHTML = `
      <div class="collection-header">
        <div class="collection-cover skeleton" style="width: 210px; height: 210px;"></div>
        <div class="collection-meta" style="flex: 1;">
          <div class="skeleton" style="width: 70px; height: 16px;"></div>
          <div class="skeleton" style="width: 300px; height: 32px;"></div>
          <div class="skeleton" style="width: 150px; height: 18px;"></div>
          <div class="skeleton" style="width: 240px; height: 16px;"></div>
          <div style="display: flex; gap: 10px; margin-top: 8px;">
            <div class="skeleton" style="width: 110px; height: 36px; border-radius: var(--radius-md);"></div>
            <div class="skeleton" style="width: 90px; height: 36px; border-radius: var(--radius-md);"></div>
          </div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 24px;">
        <div class="skeleton" style="height: 56px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="height: 56px; border-radius: var(--radius-md); opacity: 0.8;"></div>
        <div class="skeleton" style="height: 56px; border-radius: var(--radius-md); opacity: 0.6;"></div>
      </div>
    `;

    const [trackRes, commentsRes, meRes] = await Promise.allSettled([
      scGetTrackDetail(this.trackId),
      scGetTrackComments(this.trackId),
      scGetMe(),
    ]);

    if (trackRes.status === 'rejected') {
      this.element.innerHTML = `
        <div style="padding: 24px; color: var(--text-secondary);">
          <h3>Failed to load track</h3>
          <p style="margin-top: 6px; font-size: 13px; color: var(--text-tertiary);">${escapeHtml(String(trackRes.reason))}</p>
        </div>
      `;
      return;
    }

    this.track = trackRes.value;
    this.comments = commentsRes.status === 'fulfilled' ? (commentsRes.value.collection || []) : [];
    this.currentUser = meRes.status === 'fulfilled' ? meRes.value : null;

    this.render();
  }

  private render(): void {
    if (!this.track) return;

    const t = this.track;
    const cover = toHighResArtwork(t.artwork_url) || DEFAULT_COVER_PLACEHOLDER;
    const artist = t.user?.username || 'SoundCloud';
    const artistId = t.user?.id;
    const isLiked = this.likesStore.isLiked(t.id);
    const isPlaying = this.engine.isTrackPlaying(t.id);
    const durationSec = t.duration ? t.duration / 1000 : 0;
    const tags = parseTagList(t.tag_list);
    const dateStr = formatDate(t.created_at);

    this.element.innerHTML = `
      <div class="collection-header" style="align-items: flex-end;">
        <div class="collection-cover" style="width: 210px; height: 210px;">
          <img id="td-cover-img" src="${escapeHtml(cover)}" alt="${escapeHtml(t.title)}" />
        </div>
        <div class="collection-meta" style="min-width: 0; flex: 1;">
          <span class="collection-badge">${escapeHtml(t.genre ? t.genre : 'Track')}</span>
          <h1 class="collection-title" style="word-break: break-word;">${escapeHtml(t.title)}</h1>
          <span class="collection-artist ${artistId ? 'clickable-link' : ''}" id="td-artist-link" style="font-size: 15px; font-weight: 600;">${escapeHtml(artist)}</span>

          <div class="td-stats-row">
            <span>${(t.playback_count ?? 0).toLocaleString()} plays</span>
            <span>&bull;</span>
            <span>${(t.likes_count ?? 0).toLocaleString()} likes</span>
            <span>&bull;</span>
            <span>${(t.reposts_count ?? 0).toLocaleString()} reposts</span>
            <span>&bull;</span>
            <span>${formatTrackDuration(durationSec)}</span>
            ${dateStr ? `<span>&bull;</span><span>${escapeHtml(dateStr)}</span>` : ''}
          </div>

          <div class="collection-actions" style="flex-wrap: wrap;">
            <button class="btn-primary" id="td-btn-play" style="display: inline-flex; align-items: center; gap: 8px;">
              ${isPlaying
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg> Play`}
            </button>
            <button class="btn-secondary ${isLiked ? 'liked' : ''}" id="td-btn-like" style="display: inline-flex; align-items: center; gap: 6px;">
              ${HEART_ICON(isLiked)}
              <span>${isLiked ? 'Liked' : 'Like'}</span>
            </button>
            <button class="btn-secondary" id="td-btn-add-playlist" style="display: inline-flex; align-items: center; gap: 6px;">
              ${PLAYLIST_ADD_ICON}
              <span>Add to Playlist</span>
            </button>
          </div>
        </div>
      </div>

      ${t.description || tags.length > 0 ? `
        <div class="td-details-card">
          ${t.description ? `<p class="td-description">${escapeHtml(t.description)}</p>` : ''}
          ${tags.length > 0 ? `
            <div class="td-tags-row">
              ${tags.slice(0, 12).map(tag => `<span class="td-tag-pill">#${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="td-comments-section">
        <div class="view-section-header" style="margin-bottom: 12px;">
          <h3 class="view-section-title" id="td-comments-heading" style="font-size: 17px;">Comments (${t.comment_count ?? this.comments.length})</h3>
        </div>
        <div id="td-comment-composer-slot"></div>
        <div id="td-comments-list" class="td-comments-list"></div>
      </div>
    `;

    const coverImg = this.element.querySelector<HTMLImageElement>('#td-cover-img');
    if (coverImg) {
      coverImg.onerror = () => {
        coverImg.onerror = null;
        coverImg.src = DEFAULT_COVER_PLACEHOLDER;
      };
    }

    if (artistId) {
      this.element.querySelector('#td-artist-link')?.addEventListener('click', () => {
        AppNavigator.openProfile(artistId);
      });
    }

    this.element.querySelector('#td-btn-play')?.addEventListener('click', () => {
      if (!this.track) return;
      if (this.engine.currentTrack?.id === this.track.id) {
        this.engine.togglePlay();
      } else {
        this.engine.playTrack(this.track, [this.track]);
      }
    });

    const likeBtn = this.element.querySelector<HTMLElement>('#td-btn-like');
    likeBtn?.addEventListener('click', async () => {
      if (!this.track) return;
      likeBtn.classList.remove('sc-heart-pop');
      void likeBtn.offsetWidth;
      likeBtn.classList.add('sc-heart-pop');
      try {
        await this.likesStore.toggleLike(this.track);
      } catch (err) {
        console.error('Failed to toggle like in TrackDetailView:', err);
      }
    });

    this.element.querySelector('#td-btn-add-playlist')?.addEventListener('click', () => {
      if (this.track) AppNavigator.openAddToPlaylist(this.track);
    });

    this.renderComposer();
    this.renderComments();
  }

  private renderComposer(): void {
    const slot = this.element.querySelector('#td-comment-composer-slot');
    if (!slot) return;
    slot.innerHTML = '';

    if (!this.currentUser) {
      const msg = document.createElement('div');
      msg.style.fontSize = '12.5px';
      msg.style.color = 'var(--text-tertiary)';
      msg.style.marginBottom = '16px';
      msg.textContent = 'Sign in to leave a comment on this track.';
      slot.appendChild(msg);
      return;
    }

    const avatar = resolveAvatarUrl(this.currentUser.avatar_url);
    const isThisTrackActive = this.engine.currentTrack?.id === this.trackId;
    const currentFormatted = formatTrackDuration(this.engine.currentTime);

    const card = document.createElement('div');
    card.className = 'td-composer-card';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'td-composer-avatar';
    avatarImg.src = avatar;
    avatarImg.alt = this.currentUser.username || 'User';
    avatarImg.onerror = () => {
      avatarImg.onerror = null;
      avatarImg.src = FALLBACK_AVATAR_SVG;
    };

    const formCol = document.createElement('form');
    formCol.setAttribute('autocomplete', 'off');
    formCol.style.flex = '1';
    formCol.style.display = 'flex';
    formCol.style.flexDirection = 'column';
    formCol.style.gap = '8px';
    formCol.addEventListener('submit', (e) => {
      e.preventDefault();
    });

    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex';
    inputRow.style.gap = '8px';
    inputRow.style.alignItems = 'center';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-input';
    input.id = 'td-comment-input';
    input.name = `sc-field-${Math.random().toString(36).slice(2)}`;
    input.placeholder = 'Write a comment...';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    input.setAttribute('aria-autocomplete', 'none');
    input.style.flex = '1';
    input.style.height = '36px';

    const postBtn = document.createElement('button');
    postBtn.type = 'button';
    postBtn.className = 'btn-primary';
    postBtn.id = 'td-comment-post';
    postBtn.style.height = '36px';
    postBtn.style.padding = '0 18px';
    postBtn.textContent = 'Post';

    inputRow.appendChild(input);
    inputRow.appendChild(postBtn);
    formCol.appendChild(inputRow);

    if (isThisTrackActive) {
      const attachRow = document.createElement('div');
      attachRow.style.display = 'flex';
      attachRow.style.alignItems = 'center';
      attachRow.style.gap = '8px';

      const attachBtn = document.createElement('button');
      attachBtn.className = `td-attach-time-btn ${this.attachCurrentTime ? 'active' : ''}`;
      attachBtn.id = 'td-attach-time-btn';
      attachBtn.type = 'button';
      attachBtn.textContent = `Attach current time (${currentFormatted})`;
      attachBtn.addEventListener('click', () => {
        this.attachCurrentTime = !this.attachCurrentTime;
        attachBtn.classList.toggle('active', this.attachCurrentTime);
      });

      attachRow.appendChild(attachBtn);
      formCol.appendChild(attachRow);
    }

    card.appendChild(avatarImg);
    card.appendChild(formCol);
    slot.appendChild(card);

    const submit = async () => {
      const body = input.value.trim();
      if (!body) return;
      postBtn.disabled = true;
      postBtn.textContent = 'Posting...';

      const timestampMs =
        this.engine.currentTrack?.id === this.trackId && this.attachCurrentTime
          ? Math.floor(this.engine.currentTime * 1000)
          : undefined;

      try {
        const posted = await scPostTrackComment(this.trackId, body, timestampMs);
        const commentObj: TrackComment = {
          id: posted.id || Date.now(),
          body: posted.body || body,
          timestamp: posted.timestamp ?? timestampMs ?? 0,
          created_at: posted.created_at || new Date().toISOString(),
          user: posted.user && posted.user.username ? posted.user : (this.currentUser as User),
        };
        this.comments.unshift(commentObj);
        input.value = '';
        const heading = this.element.querySelector('#td-comments-heading');
        if (heading) {
          heading.textContent = `Comments (${Math.max(this.comments.length, (this.track?.comment_count ?? 0) + 1)})`;
        }
        showToast('Comment posted');
        this.renderComments();
      } catch (err) {
        showToast(`Failed to post comment: ${String(err)}`);
      } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Post';
      }
    };

    postBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  private renderComments(): void {
    const listEl = this.element.querySelector('#td-comments-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.comments.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '20px';
      empty.style.color = 'var(--text-tertiary)';
      empty.style.fontSize = '13px';
      empty.textContent = 'No comments yet. Be the first to comment!';
      listEl.appendChild(empty);
      return;
    }

    this.comments.forEach((c) => {
      const user = c.user;
      const username = user?.username || 'SoundCloud User';
      const avatarUrl = resolveAvatarUrl(user?.avatar_url);
      const hasTimestamp = typeof c.timestamp === 'number' && c.timestamp >= 0;
      const timestampSec = hasTimestamp ? (c.timestamp as number) / 1000 : 0;

      const row = document.createElement('div');
      row.className = 'td-comment-item';

      const avatarImg = document.createElement('img');
      avatarImg.className = `td-comment-avatar ${user?.id ? 'clickable-link' : ''}`;
      avatarImg.alt = username;
      avatarImg.loading = 'lazy';
      avatarImg.decoding = 'async';
      avatarImg.src = avatarUrl;
      avatarImg.onerror = () => {
        avatarImg.onerror = null;
        avatarImg.src = FALLBACK_AVATAR_SVG;
      };

      const bodyCol = document.createElement('div');
      bodyCol.className = 'td-comment-body-col';

      const metaRow = document.createElement('div');
      metaRow.className = 'td-comment-meta';

      const authorSpan = document.createElement('span');
      authorSpan.className = `td-comment-author ${user?.id ? 'clickable-link' : ''}`;
      authorSpan.textContent = username;
      metaRow.appendChild(authorSpan);

      if (hasTimestamp) {
        const tsPill = document.createElement('span');
        tsPill.className = 'td-timestamp-pill';
        tsPill.title = `Jump to ${formatTrackDuration(timestampSec)}`;
        tsPill.textContent = `@ ${formatTrackDuration(timestampSec)}`;
        tsPill.addEventListener('click', async () => {
          if (!this.track) return;
          if (this.engine.currentTrack?.id === this.track.id) {
            this.engine.seek(timestampSec);
            if (!this.engine.isPlaying) {
              this.engine.resume();
            }
          } else {
            await this.engine.playTrack(this.track, [this.track]);
            this.engine.seek(timestampSec);
          }
        });
        metaRow.appendChild(tsPill);
      }

      const dateStr = formatDate(c.created_at);
      if (dateStr) {
        const dateSpan = document.createElement('span');
        dateSpan.className = 'td-comment-date';
        dateSpan.textContent = dateStr;
        metaRow.appendChild(dateSpan);
      }

      const textP = document.createElement('p');
      textP.className = 'td-comment-text';
      textP.textContent = c.body || '';

      bodyCol.appendChild(metaRow);
      bodyCol.appendChild(textP);

      if (user?.id) {
        const goProfile = () => AppNavigator.openProfile(user.id);
        avatarImg.addEventListener('click', goProfile);
        authorSpan.addEventListener('click', goProfile);
      }

      row.appendChild(avatarImg);
      row.appendChild(bodyCol);
      listEl.appendChild(row);
    });
  }

  private updateLikeButton(): void {
    const likeBtn = this.element.querySelector<HTMLElement>('#td-btn-like');
    if (!likeBtn || !this.track) return;
    const isLiked = this.likesStore.isLiked(this.track.id);
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.innerHTML = `${HEART_ICON(isLiked)} <span>${isLiked ? 'Liked' : 'Like'}</span>`;
  }

  private syncLiveAudioState(): void {
    const playBtn = this.element.querySelector<HTMLElement>('#td-btn-play');
    if (playBtn && this.track) {
      const isPlaying = this.engine.isTrackPlaying(this.track.id);
      playBtn.innerHTML = isPlaying
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg> Play`;
    }

    const attachBtn = this.element.querySelector<HTMLElement>('#td-attach-time-btn');
    if (attachBtn && this.engine.currentTrack?.id === this.trackId) {
      attachBtn.textContent = `Attach current time (${formatTrackDuration(this.engine.currentTime)})`;
    }
  }
}
