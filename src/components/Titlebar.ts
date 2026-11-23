import { windowAction, getDiscordRpcStatus, checkUpdate, installUpdate } from '../ipc.ts';
import type { AppSettings, UpdateCheckResponse } from '../types.ts';

const OFFICIAL_SC_CLOUD_SVG = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="#FF5500" style="flex-shrink: 0;">
  <path d="M1.175 12.222c-.324 0-.588.263-.588.587v3.63c0 .325.264.588.588.588s.588-.263.588-.588v-3.63c0-.324-.264-.587-.588-.587zm2.35-1.175c-.324 0-.588.263-.588.587v4.805c0 .325.264.588.588.588s.588-.263.588-.588v-4.805c0-.324-.264-.587-.588-.587zm2.35-1.763c-.324 0-.587.264-.587.588v6.568c0 .325.263.588.587.588.325 0 .588-.263.588-.588V9.872c0-.324-.263-.588-.588-.588zm2.352-.587c-.325 0-.588.263-.588.587v7.155c0 .325.263.588.588.588.324 0 .587-.263.587-.588V9.284c0-.324-.263-.587-.587-.587zm2.35-1.176c-.324 0-.587.263-.587.588v8.33c0 .325.263.588.587.588.325 0 .588-.263.588-.588V8.11c0-.325-.263-.588-.588-.588zm8.613 2.518c-.44 0-.865.084-1.258.236-.268-2.617-2.478-4.663-5.168-4.663-.648 0-1.274.122-1.855.344-.223.085-.285.174-.285.348v10.22c0 .18.14.327.318.345h8.248c1.79 0 3.243-1.452 3.243-3.243s-1.453-3.242-3.243-3.242z"/>
</svg>
`;

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
      this.proxyPill.setAttribute('title', `Active Proxy: ${settings.proxy_url}`);
    } else {
      this.proxyPill.classList.remove('active');
      this.proxyPill.setAttribute('title', settings.proxy_enabled ? 'Proxy enabled (restart required)' : 'Proxy disabled');
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
