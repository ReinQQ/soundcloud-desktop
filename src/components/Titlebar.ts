import { windowAction, getDiscordRpcStatus, checkUpdate, installUpdate } from '../ipc.ts';
import type { AppSettings, UpdateCheckResponse } from '../types.ts';

const OFFICIAL_SC_CLOUD_SVG = `
<svg width="22" height="22" viewBox="0 0 24 24" fill="#fa243c" style="flex-shrink: 0;">
  <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>
</svg>
`;

function redactProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const schemeIdx = trimmed.indexOf('://');
  const schemePrefix = schemeIdx >= 0 ? trimmed.slice(0, schemeIdx + 3) : '';
  const rest = schemeIdx >= 0 ? trimmed.slice(schemeIdx + 3) : trimmed;
  const atIdx = rest.lastIndexOf('@');
  if (atIdx >= 0) {
    const creds = rest.slice(0, atIdx);
    const host = rest.slice(atIdx + 1);
    const colonIdx = creds.indexOf(':');
    if (colonIdx >= 0) {
      return `${schemePrefix}${creds.slice(0, colonIdx)}:***@${host}`;
    }
    return `${schemePrefix}***@${host}`;
  }
  return trimmed;
}

export class Titlebar {
  private element: HTMLElement;
  private proxyPill: HTMLElement;
  private discordPill: HTMLElement;
  private updatePill: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchClearBtn!: HTMLButtonElement;
  private searchShortcutBadge!: HTMLElement;
  private searchTimeout: number | null = null;

  private onOpenSettings: () => void;
  private onSearchFocus: () => void;
  private onSearchQuery: (query: string, immediate: boolean) => void;

  constructor(
    onOpenSettings: () => void,
    onSearchFocus: () => void,
    onSearchQuery: (query: string, immediate: boolean) => void
  ) {
    this.onOpenSettings = onOpenSettings;
    this.onSearchFocus = onSearchFocus;
    this.onSearchQuery = onSearchQuery;

    this.element = document.createElement('div');
    this.element.className = 'titlebar';
    this.element.setAttribute('data-tauri-drag-region', '');

    this.element.innerHTML = `
      <div class="titlebar-left" data-tauri-drag-region="">
        <div class="titlebar-brand">
          ${OFFICIAL_SC_CLOUD_SVG}
          <span>SoundCloud</span>
        </div>
        <div class="titlebar-status-group">
          <div class="status-pill proxy-pill" id="titlebar-proxy-pill" data-tauri-drag-region="false">
            <span class="indicator-dot"></span>
            <span class="pill-label">Proxy</span>
          </div>
          <div class="status-pill discord-pill" id="titlebar-discord-pill" data-tauri-drag-region="false">
            <span class="indicator-dot"></span>
            <span class="pill-label">Discord</span>
          </div>
          <div class="status-pill update-pill" id="titlebar-update-pill" data-tauri-drag-region="false" style="display: none;">
            <span class="pill-label">Update Available</span>
          </div>
        </div>
      </div>

      <div class="titlebar-center">
        <form class="header-search-container" id="header-search-form" autocomplete="off" data-tauri-drag-region="false" style="-webkit-app-region: no-drag;">
          <svg class="header-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            class="header-search-input"
            id="header-search-input"
            name="sc-field-${Math.random().toString(36).slice(2)}"
            placeholder="Search tracks, playlists, artists..."
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            aria-autocomplete="none"
            data-tauri-drag-region="false"
            style="-webkit-app-region: no-drag;"
          />
          <span class="header-search-shortcut" id="header-search-shortcut">Ctrl+K</span>
          <button
            class="header-search-clear"
            id="header-search-clear"
            type="button"
            title="Clear search"
            data-tauri-drag-region="false"
            style="-webkit-app-region: no-drag; display: none;"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </form>
      </div>

      <div class="titlebar-right" data-tauri-drag-region="false" style="-webkit-app-region: no-drag;">
        <div id="titlebar-account-slot" data-tauri-drag-region="false" style="-webkit-app-region: no-drag;"></div>
        <button class="titlebar-btn settings-btn" title="Settings (Ctrl+,)" id="titlebar-settings-btn" data-tauri-drag-region="false">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button class="titlebar-btn" id="btn-minimize" title="Minimize" data-tauri-drag-region="false">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="1.5" fill="currentColor"/></svg>
        </button>
        <button class="titlebar-btn" id="btn-maximize" title="Maximize" data-tauri-drag-region="false">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="titlebar-btn close-btn" id="btn-close" title="Close" data-tauri-drag-region="false">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;

    this.proxyPill = this.element.querySelector('#titlebar-proxy-pill') as HTMLElement;
    this.discordPill = this.element.querySelector('#titlebar-discord-pill') as HTMLElement;
    this.updatePill = this.element.querySelector('#titlebar-update-pill') as HTMLElement;
    this.searchInput = this.element.querySelector('#header-search-input') as HTMLInputElement;
    this.searchClearBtn = this.element.querySelector('#header-search-clear') as HTMLButtonElement;
    this.searchShortcutBadge = this.element.querySelector('#header-search-shortcut') as HTMLElement;

    this.initEvents();
    this.checkDiscordStatus();
    this.checkForUpdates();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public mountAccountBar(accountEl: HTMLElement): void {
    const slot = this.element.querySelector('#titlebar-account-slot');
    if (slot) {
      slot.innerHTML = '';
      slot.appendChild(accountEl);
    }
  }

  public setSearchQuery(query: string): void {
    this.searchInput.value = query;
    this.syncSearchChrome();
  }

  public focusSearch(selectText: boolean = true): void {
    this.searchInput.focus();
    if (selectText) {
      this.searchInput.select();
    }
  }

  public updateSettings(settings: AppSettings): void {
    if (settings.proxy_enabled && settings.proxy_active) {
      this.proxyPill.classList.add('active');
      this.proxyPill.setAttribute('title', `Active Proxy: ${redactProxyUrl(settings.proxy_url)}`);
    } else {
      this.proxyPill.classList.remove('active');
      this.proxyPill.setAttribute('title', settings.proxy_enabled ? 'Proxy enabled (inactive — check settings)' : 'Proxy disabled');
    }

    if (settings.discord_rpc_enabled) {
      this.discordPill.style.display = 'flex';
    } else {
      this.discordPill.style.display = 'none';
    }
  }

  private syncSearchChrome(): void {
    const hasValue = this.searchInput.value.length > 0;
    const isFocused = document.activeElement === this.searchInput;
    this.searchClearBtn.style.display = hasValue ? 'flex' : 'none';
    this.searchShortcutBadge.style.display = !hasValue && !isFocused ? 'inline-flex' : 'none';
  }

  private initEvents(): void {
    const minBtn = this.element.querySelector('#btn-minimize');
    const maxBtn = this.element.querySelector('#btn-maximize');
    const closeBtn = this.element.querySelector('#btn-close');
    const settingsBtn = this.element.querySelector('#titlebar-settings-btn');

    minBtn?.addEventListener('click', () => windowAction('minimize'));
    maxBtn?.addEventListener('click', () => windowAction('toggle_maximize'));
    closeBtn?.addEventListener('click', () => windowAction('close'));
    settingsBtn?.addEventListener('click', () => this.onOpenSettings());

    this.updatePill.addEventListener('click', async () => {
      const confirmed = confirm('Download and install update now? Application will restart.');
      if (confirmed) {
        this.updatePill.textContent = 'Installing...';
        await installUpdate();
      }
    });

    this.element.querySelector('#header-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
    });

    this.searchInput.addEventListener('focus', () => {
      this.syncSearchChrome();
      this.onSearchFocus();
    });

    this.searchInput.addEventListener('blur', () => {
      this.syncSearchChrome();
    });

    this.searchInput.addEventListener('input', () => {
      this.syncSearchChrome();
      const query = this.searchInput.value.trim();

      if (this.searchTimeout) {
        window.clearTimeout(this.searchTimeout);
      }

      this.searchTimeout = window.setTimeout(() => {
        this.onSearchQuery(query, false);
      }, 300);
    });

    this.searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (this.searchTimeout) {
          window.clearTimeout(this.searchTimeout);
          this.searchTimeout = null;
        }
        this.onSearchQuery(this.searchInput.value.trim(), true);
      } else if (e.key === 'Escape') {
        if (this.searchInput.value.length > 0) {
          this.searchInput.value = '';
          this.syncSearchChrome();
          this.onSearchQuery('', true);
        } else {
          this.searchInput.blur();
        }
      }
    });

    this.searchClearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.searchTimeout) {
        window.clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }
      this.searchInput.value = '';
      this.syncSearchChrome();
      this.onSearchQuery('', true);
      this.searchInput.focus();
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        this.onOpenSettings();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.focusSearch(true);
      }
    });
  }

  private async checkDiscordStatus(): Promise<void> {
    try {
      const status = await getDiscordRpcStatus();
      if (status === 'connected') {
        this.discordPill.classList.add('active');
        this.discordPill.setAttribute('title', 'Discord RPC Connected');
      } else {
        this.discordPill.classList.remove('active');
        this.discordPill.setAttribute('title', `Discord: ${status}`);
      }
    } catch (_) {}

    setTimeout(() => this.checkDiscordStatus(), 5000);
  }

  private async checkForUpdates(): Promise<void> {
    try {
      const res: UpdateCheckResponse = await checkUpdate();
      if (res.available && res.version) {
        this.updatePill.style.display = 'flex';
        this.updatePill.setAttribute('title', `Update v${res.version} available`);
      }
    } catch (_) {}
  }
}
