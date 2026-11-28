import { AudioEngine, toHighResArtwork } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import { CARD_PAUSE_ICON, CARD_PLAY_ICON, escapeHtml, formatDuration } from '../utils/format.ts';
import type { Track } from '../types.ts';

export const ROW_PLAY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
export const ROW_PAUSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

export const PLAYLIST_ADD_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 12H3"></path>
    <path d="M16 6H3"></path>
    <path d="M16 18H3"></path>
    <path d="M19 10v6"></path>
    <path d="M16 13h6"></path>
  </svg>
`;

export const HEART_ICON = (liked: boolean): string => `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="${liked ? 'var(--accent)' : 'none'}" stroke="${liked ? 'var(--accent)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
  </svg>
`;

export function syncTrackRowStates(
  container: HTMLElement,
  engine: AudioEngine,
  likesStore?: LikesStore,
): void {
  container.querySelectorAll<HTMLElement>('.track-row').forEach((row) => {
    const id = Number(row.dataset.trackId);
    if (!id) return;
    row.classList.toggle('playing', engine.isTrackPlaying(id));
  });

  container.querySelectorAll<HTMLElement>('.row-play-btn').forEach((btn) => {
    const id = Number(btn.dataset.trackId);
    if (!id) return;
    btn.innerHTML = engine.isTrackPlaying(id) ? ROW_PAUSE_ICON : ROW_PLAY_ICON;
  });

  if (likesStore) {
    container.querySelectorAll<HTMLElement>('.row-like-btn').forEach((btn) => {
      const id = Number(btn.dataset.trackId);
      if (!id) return;
      const isLiked = likesStore.isLiked(id);
      btn.classList.toggle('liked', isLiked);
      btn.innerHTML = HEART_ICON(isLiked);
      btn.title = isLiked ? 'Unlike' : 'Like';
    });
  }
}

export function syncCardPlayButtons(container: HTMLElement, engine: AudioEngine): void {
  container.querySelectorAll<HTMLElement>('.card-play-hover-btn').forEach((btn) => {
    const kind = btn.dataset.kind;
    const rawId = btn.dataset.id;
    if (!rawId) return;
    const isPlaying =
      kind === 'track'
        ? engine.isTrackPlaying(Number(rawId))
        : engine.isCollectionPlaying(rawId);
    btn.classList.toggle('playing', isPlaying);
    btn.innerHTML = isPlaying ? CARD_PAUSE_ICON : CARD_PLAY_ICON;
  });
}

export function createTrackRow(options: {
  track: Track;
  index: number;
  queue: Track[];
  queueIndex?: number;
  collectionId?: number | string;
  fallbackCover?: string;
  fallbackArtist?: string;
}): HTMLElement {
  const { track, index, queue, collectionId, fallbackCover, fallbackArtist } = options;
  const playIdx = options.queueIndex ?? index;
  const engine = AudioEngine.getInstance();
  const likesStore = LikesStore.getInstance();

  const title = track.title;
  const artist = track.user?.username || fallbackArtist || 'SoundCloud';
  const artistId = track.user?.id;
  const durationSec = track.duration ? track.duration / 1000 : 0;
  const cover =
    toHighResArtwork(track.artwork_url) ||
    fallbackCover ||
    'https://a1.sndcdn.com/images/default_avatar_large.png';
  const isLiked = likesStore.isLiked(track.id);
  const isPlaying = engine.isTrackPlaying(track.id);
  const safeTitle = escapeHtml(title);
  const safeArtist = escapeHtml(artist);
  const safeCover = escapeHtml(cover);

  const row = document.createElement('div');
  row.className = `track-row ${isPlaying ? 'playing' : ''}`;
  row.dataset.trackId = String(track.id);
  row.innerHTML = `
    <span class="track-row-idx">
      <span class="idx-text">${index + 1}</span>
      <span class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>
    </span>
    <div class="track-row-cover">
      <img src="${safeCover}" alt="${safeTitle}" loading="lazy" decoding="async" />
    </div>
    <div class="track-row-info">
      <span class="track-row-title clickable-link" title="View track details">${safeTitle}</span>
      <span class="track-row-artist ${artistId ? 'clickable-link' : ''}" title="${artistId ? `View ${safeArtist}'s profile` : safeArtist}">${safeArtist}</span>
    </div>
    <button class="track-row-action-btn row-add-playlist-btn" data-track-id="${track.id}" title="Add to playlist">
      ${PLAYLIST_ADD_ICON}
    </button>
    <button class="track-row-action-btn row-like-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" title="${isLiked ? 'Unlike' : 'Like'}">
      ${HEART_ICON(isLiked)}
    </button>
    <span class="track-row-duration">${formatDuration(durationSec)}</span>
    <button class="track-row-action-btn row-play-btn" data-track-id="${track.id}" title="Play">
      ${isPlaying ? ROW_PAUSE_ICON : ROW_PLAY_ICON}
    </button>
  `;

  row.querySelector('.track-row-title')?.addEventListener('click', (e) => {
    e.stopPropagation();
    AppNavigator.openTrack(track.id);
  });

  if (artistId) {
    row.querySelector('.track-row-artist')?.addEventListener('click', (e) => {
      e.stopPropagation();
      AppNavigator.openProfile(artistId);
    });
  }

  row.querySelector('.row-add-playlist-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    AppNavigator.openAddToPlaylist(track);
  });

  const likeBtn = row.querySelector<HTMLElement>('.row-like-btn');
  likeBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    likeBtn.classList.remove('sc-heart-pop');
    void likeBtn.offsetWidth;
    likeBtn.classList.add('sc-heart-pop');
    try {
      await likesStore.toggleLike(track);
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  });

  row.querySelector('.row-play-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (engine.currentTrack?.id === track.id) {
      engine.togglePlay();
    } else {
      engine.playTrack(track, queue, playIdx, collectionId);
    }
  });

  row.addEventListener('click', () => {
    engine.playTrack(track, queue, playIdx, collectionId);
  });

  return row;
}
