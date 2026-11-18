import { AppSettings, UpdateInfo } from './types';
import {
  checkUpdate,
  fetchSettings,
  getDiscordRpcStatus,
  installUpdate,
  persistSettings,
  requestAppRestart,
} from './ipc';

export interface SettingsModalCallbacks {
  onSettingsChanged: (newSettings: AppSettings) => void;
  onClose: () => void;
  onUpdateAvailable?: (version: string) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  proxy_enabled: false,
  proxy_url: 'socks5://127.0.0.1:10808',
  discord_rpc_enabled: true,
  discord_app_id: '1572112482062045194',
  adblock_enabled: true,
  dark_theme_enabled: true,
  minimize_to_tray: true,
};

export class SettingsModal {
  private overlay: HTMLDivElement | null = null;
  private currentSettings: AppSettings = { ...DEFAULT_SETTINGS };
  private toastTimer: number | null = null;
  private isLoadedFromBackend: boolean = false;

  // Form controls
  private proxyToggle!: HTMLInputElement;
  private proxyUrlInput!: HTMLInputElement;
  private selectedProtocol: string = 'socks5';
  private protocolPills: Map<string, HTMLButtonElement> = new Map();
  private discordToggle!: HTMLInputElement;
  private discordStatusBadge!: HTMLSpanElement;
  private discordStatusDot!: HTMLSpanElement;
  private discordStatusText!: HTMLSpanElement;
  private discordStatusPollTimer: number | null = null;
  private darkThemeToggle!: HTMLInputElement;
  private adblockToggle!: HTMLInputElement;
  private minimizeToTrayToggle!: HTMLInputElement;
  private toastEl!: HTMLDivElement;

  // Updater elements
  private updaterStatusText!: HTMLSpanElement;
  private updaterActionBtn!: HTMLButtonElement;
  private pendingUpdate: UpdateInfo | null = null;

  constructor(private callbacks: SettingsModalCallbacks) {
    this.mount();
    this.bindShortcuts();
    // Load from backend in background without blocking UI
    this.loadBackendSettings().catch(console.error);
  }

  public async loadBackendSettings(): Promise<AppSettings> {
    try {
      const backendSettings = await fetchSettings();
      this.currentSettings = { ...backendSettings };
      this.isLoadedFromBackend = true;
      this.syncFormWithCurrent();
      this.callbacks.onSettingsChanged(this.currentSettings);
    } catch (err) {
      console.warn('[SC-Desktop] Using default settings, backend fetch failed:', err);
    }
    return this.currentSettings;
  }

  public getSettings(): AppSettings {
    return this.currentSettings;
  }

  public open(): void {
    if (!this.overlay) return;
    this.syncFormWithCurrent();
    this.overlay.classList.add('visible');
    // Refresh backend settings in background if not yet loaded
    if (!this.isLoadedFromBackend) {
      this.loadBackendSettings().catch(console.error);
    }
    this.pollDiscordRpcStatus();
    if (this.discordStatusPollTimer) {
      window.clearInterval(this.discordStatusPollTimer);
    }
    this.discordStatusPollTimer = window.setInterval(() => {
      this.pollDiscordRpcStatus();
    }, 2000);
  }

  public close(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('visible');
    if (this.discordStatusPollTimer) {
      window.clearInterval(this.discordStatusPollTimer);
      this.discordStatusPollTimer = null;
    }
    this.callbacks.onClose();
  }

  public toggle(): void {
    if (!this.overlay) return;
    if (this.overlay.classList.contains('visible')) {
      this.close();
    } else {
      this.open();
    }
  }

  private syncFormWithCurrent(): void {
    this.proxyToggle.checked = this.currentSettings.proxy_enabled;
    this.proxyUrlInput.value = this.currentSettings.proxy_url;
    this.updateActiveProtocolPill(this.currentSettings.proxy_url);
    this.discordToggle.checked = this.currentSettings.discord_rpc_enabled;
    this.darkThemeToggle.checked = this.currentSettings.dark_theme_enabled;
    this.adblockToggle.checked = this.currentSettings.adblock_enabled;
    this.minimizeToTrayToggle.checked = this.currentSettings.minimize_to_tray;
    if (!this.currentSettings.discord_rpc_enabled) {
      this.updateDiscordBadgeStatus('disabled');
    }
  }

  private updateActiveProtocolPill(url: string): void {
    const trimmed = url.trim().toLowerCase();
    let matched = '';
    if (trimmed.startsWith('https://')) matched = 'https';
    else if (trimmed.startsWith('http://')) matched = 'http';
    else if (trimmed.startsWith('socks4://') || trimmed.startsWith('socks4a://')) matched = 'socks4';
    else if (trimmed.startsWith('socks5://') || trimmed.startsWith('socks5h://')) matched = 'socks5';

    if (matched) {
      this.selectedProtocol = matched;
    }

    this.protocolPills.forEach((pill, proto) => {
      if (proto.toLowerCase() === this.selectedProtocol) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  private normalizeProxyUrl(raw: string): string {
    let trimmed = raw.trim();
    if (!trimmed) {
      return `${this.selectedProtocol}://127.0.0.1:10808`;
    }
    const schemeRegex = /^[a-zA-Z0-9+-]+:\/\//;
    if (schemeRegex.test(trimmed)) {
      return trimmed;
    }
    return `${this.selectedProtocol}://${trimmed}`;
  }

  private setProtocol(newProto: string): void {
    this.selectedProtocol = newProto.toLowerCase();
    let current = this.proxyUrlInput.value.trim();
    if (current) {
      const schemeRegex = /^[a-zA-Z0-9+-]+:\/\//;
      if (schemeRegex.test(current)) {
        current = current.replace(schemeRegex, `${this.selectedProtocol}://`);
      } else {
        current = `${this.selectedProtocol}://${current}`;
      }
      this.proxyUrlInput.value = current;
    }
    this.updateActiveProtocolPill(current);
  }

  private mount(): void {
    if (document.getElementById('sc-settings-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'sc-settings-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    const card = document.createElement('div');
    card.className = 'sc-settings-card';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'sc-modal-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'sc-modal-title-group';
    const h2 = document.createElement('h2');
    h2.textContent = 'Settings';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Configure desktop client features, proxy, Discord presence, and updater';
    titleGroup.appendChild(h2);
    titleGroup.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sc-modal-close-btn';
    closeBtn.title = 'Close (Esc)';
    closeBtn.setAttribute('aria-label', 'Close Settings');
    const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('viewBox', '0 0 16 16');
    closeSvg.style.width = '14px';
    closeSvg.style.height = '14px';
    closeSvg.style.stroke = 'currentColor';
    closeSvg.style.strokeWidth = '1.5';
    const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l1.setAttribute('x1', '3');
    l1.setAttribute('y1', '3');
    l1.setAttribute('x2', '13');
    l1.setAttribute('y2', '13');
    const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l2.setAttribute('x1', '13');
    l2.setAttribute('y1', '3');
    l2.setAttribute('x2', '3');
    l2.setAttribute('y2', '13');
    closeSvg.appendChild(l1);
    closeSvg.appendChild(l2);
    closeBtn.appendChild(closeSvg);
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleGroup);
    header.appendChild(closeBtn);

    // --- Body ---
    const body = document.createElement('div');
    body.className = 'sc-modal-body';

    // Section 1: Network & Multi-Protocol Proxy
    const netSection = document.createElement('div');
    netSection.className = 'sc-settings-section';
    const netTitle = document.createElement('div');
    netTitle.className = 'sc-section-title';
    netTitle.textContent = 'Network & Proxy';
    netSection.appendChild(netTitle);

    const proxyRow = this.createToggleRow(
      'Enable WebView Proxy',
      'Route SoundCloud traffic through HTTP, HTTPS, SOCKS4, or SOCKS5 proxies cleanly without system-wide changes.',
      (chk) => (this.proxyToggle = chk)
    );
    netSection.appendChild(proxyRow);

    const proxyInputGroup = document.createElement('div');
    proxyInputGroup.className = 'sc-input-group';

    const proxyLabelRow = document.createElement('div');
    proxyLabelRow.className = 'sc-input-label-row';

    const proxyLabel = document.createElement('label');
    proxyLabel.className = 'sc-input-label';
    proxyLabel.textContent = 'Proxy Server Address';

    // Quick Protocol Selector Pills
    const pillsContainer = document.createElement('div');
    pillsContainer.className = 'sc-protocol-pills';

    const protocols = ['HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5'];
    protocols.forEach((proto) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'sc-protocol-pill';
      pill.textContent = proto;
      pill.addEventListener('click', () => {
        this.setProtocol(proto.toLowerCase());
      });
      this.protocolPills.set(proto.toLowerCase(), pill);
      pillsContainer.appendChild(pill);
    });

    proxyLabelRow.appendChild(proxyLabel);
    proxyLabelRow.appendChild(pillsContainer);

    const proxyInput = document.createElement('input');
    proxyInput.type = 'text';
    proxyInput.className = 'sc-text-input';
    proxyInput.placeholder = 'socks5://127.0.0.1:10808 or http://user:pass@host:port';
    proxyInput.addEventListener('input', () => {
      this.updateActiveProtocolPill(proxyInput.value);
    });
    this.proxyUrlInput = proxyInput;

    const proxyHint = document.createElement('span');
    proxyHint.className = 'sc-input-hint';
    proxyHint.textContent = 'Supports http://, https://, socks4://, socks4a://, socks5://, and socks5h:// schemes.';

    proxyInputGroup.appendChild(proxyLabelRow);
    proxyInputGroup.appendChild(proxyInput);
    proxyInputGroup.appendChild(proxyHint);
    netSection.appendChild(proxyInputGroup);

    const proxyNotice = document.createElement('div');
    proxyNotice.className = 'sc-notice-banner';
    const noticeIcon = document.createElement('span');
    noticeIcon.textContent = 'ℹ';
    const noticeText = document.createElement('span');
    noticeText.textContent =
      'WebView proxy changes require creating a fresh window. Click "Save & Restart" below to apply proxy edits.';
    proxyNotice.appendChild(noticeIcon);
    proxyNotice.appendChild(noticeText);
    netSection.appendChild(proxyNotice);

    body.appendChild(netSection);

    // Section 2: Discord Rich Presence
    const discordSection = document.createElement('div');
    discordSection.className = 'sc-settings-section';
    const discordTitle = document.createElement('div');
    discordTitle.className = 'sc-section-title';
    discordTitle.textContent = 'Discord Rich Presence';
    discordSection.appendChild(discordTitle);

    const discordRow = this.createDiscordToggleRow(
      'Broadcast Playback to Discord',
      'Show your current track title, artist, high-res artwork, and live progress bar in Discord.',
      (chk) => (this.discordToggle = chk)
    );
    discordSection.appendChild(discordRow);

    body.appendChild(discordSection);

    // Section 3: Enhancements & Theme
    const enhanceSection = document.createElement('div');
    enhanceSection.className = 'sc-settings-section';
    const enhanceTitle = document.createElement('div');
    enhanceTitle.className = 'sc-section-title';
    enhanceTitle.textContent = 'Enhancements & Behavior';
    enhanceSection.appendChild(enhanceTitle);

    const darkThemeRow = this.createToggleRow(
      'Deep Dark Theme',
      'Re-skins SoundCloud into a refined charcoal dark theme while keeping waveforms and cover artwork crisp.',
      (chk) => (this.darkThemeToggle = chk)
    );
    enhanceSection.appendChild(darkThemeRow);

    const adblockRow = this.createToggleRow(
      'SoundCloud AdBlocker',
      'Block audio ads between tracks and hide sponsored banners.',
      (chk) => (this.adblockToggle = chk)
    );
    enhanceSection.appendChild(adblockRow);

    const trayRow = this.createToggleRow(
      'Minimize to System Tray',
      'Closing the window hides it into the taskbar notification area instead of quitting.',
      (chk) => (this.minimizeToTrayToggle = chk)
    );
    enhanceSection.appendChild(trayRow);

    body.appendChild(enhanceSection);

    // Section 4: Auto-Updater
    const updateSection = document.createElement('div');
    updateSection.className = 'sc-settings-section';
    const updateTitle = document.createElement('div');
    updateTitle.className = 'sc-section-title';
    updateTitle.textContent = 'Updates & Version';
    updateSection.appendChild(updateTitle);

    const updaterRow = document.createElement('div');
    updaterRow.className = 'sc-updater-row';

    const updaterInfo = document.createElement('div');
    updaterInfo.className = 'sc-setting-info';
    const versionLabel = document.createElement('span');
    versionLabel.className = 'sc-setting-label';
    versionLabel.textContent = 'Desktop Client Version';
    const statusText = document.createElement('span');
    statusText.className = 'sc-updater-status';
    statusText.textContent = 'App version: v0.1.3';
    this.updaterStatusText = statusText;
    updaterInfo.appendChild(versionLabel);
    updaterInfo.appendChild(statusText);

    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.className = 'sc-btn sc-btn-secondary sc-btn-sm';
    updateBtn.textContent = 'Check for Updates';
    updateBtn.addEventListener('click', () => this.handleUpdaterAction());
    this.updaterActionBtn = updateBtn;

    updaterRow.appendChild(updaterInfo);
    updaterRow.appendChild(updateBtn);
    updateSection.appendChild(updaterRow);

    body.appendChild(updateSection);

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'sc-modal-footer';

    const restartBtn = document.createElement('button');
    restartBtn.className = 'sc-btn sc-btn-restart';
    restartBtn.textContent = 'Save & Restart';
    restartBtn.title = 'Saves configuration and restarts the desktop app (required for proxy changes)';
    restartBtn.addEventListener('click', async () => {
      await this.saveCurrentForm();
      this.showToast('Restarting application...');
      await requestAppRestart();
    });

    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'sc-footer-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sc-btn sc-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = document.createElement('button');
    saveBtn.className = 'sc-btn sc-btn-primary';
    saveBtn.textContent = 'Save Settings';
    saveBtn.addEventListener('click', async () => {
      await this.saveCurrentForm();
      this.showToast('Settings saved');
      setTimeout(() => this.close(), 400);
    });

    actionsGroup.appendChild(cancelBtn);
    actionsGroup.appendChild(saveBtn);

    footer.appendChild(restartBtn);
    footer.appendChild(actionsGroup);

    // Toast
    const toast = document.createElement('div');
    toast.className = 'sc-toast';
    this.toastEl = toast;

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    card.appendChild(toast);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.syncFormWithCurrent();
  }

  public async checkForUpdates(silent: boolean = false): Promise<UpdateInfo | null> {
    if (!silent) {
      this.updaterStatusText.textContent = 'Checking for updates...';
      this.updaterStatusText.className = 'sc-updater-status';
    }

    try {
      const info = await checkUpdate();
      if (!silent) {
        this.updaterStatusText.textContent = `Current: v${info.current_version}`;
      }

      if (info.available && info.version) {
        this.pendingUpdate = info;
        this.updaterStatusText.textContent = `Update v${info.version} is available!`;
        this.updaterStatusText.className = 'sc-updater-status highlight';
        this.updaterActionBtn.textContent = 'Install & Restart';
        this.updaterActionBtn.className = 'sc-btn sc-btn-primary sc-btn-sm';
        if (this.callbacks.onUpdateAvailable) {
          this.callbacks.onUpdateAvailable(info.version);
        }
        return info;
      } else {
        if (!silent) {
          this.updaterStatusText.textContent = `Up to date (v${info.current_version})`;
          this.showToast('SoundCloud Desktop is up to date');
        }
        return null;
      }
    } catch (err: any) {
      if (!silent) {
        this.updaterStatusText.textContent = 'Update check failed';
        this.showToast('Unable to check for updates');
      }
      return null;
    }
  }

  private async handleUpdaterAction(): Promise<void> {
    if (this.pendingUpdate && this.pendingUpdate.available) {
      this.updaterStatusText.textContent = 'Downloading and verifying update...';
      this.updaterActionBtn.disabled = true;
      try {
        await installUpdate();
      } catch (err: any) {
        this.updaterStatusText.textContent = 'Installation failed';
        this.updaterActionBtn.disabled = false;
        this.showToast('Failed to install update');
      }
    } else {
      await this.checkForUpdates(false);
    }
  }

  private createToggleRow(
    label: string,
    description: string,
    setRef: (input: HTMLInputElement) => void
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'sc-setting-row';

    const info = document.createElement('div');
    info.className = 'sc-setting-info';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'sc-setting-label';
    labelSpan.textContent = label;
    const descSpan = document.createElement('span');
    descSpan.className = 'sc-setting-desc';
    descSpan.textContent = description;
    info.appendChild(labelSpan);
    info.appendChild(descSpan);

    const switchLabel = document.createElement('label');
    switchLabel.className = 'sc-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const slider = document.createElement('span');
    slider.className = 'sc-switch-slider';
    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);
    setRef(input);

    row.appendChild(info);
    row.appendChild(switchLabel);
    return row;
  }

  private createDiscordToggleRow(
    label: string,
    description: string,
    setRef: (input: HTMLInputElement) => void
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'sc-setting-row';

    const info = document.createElement('div');
    info.className = 'sc-setting-info';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'sc-setting-label';
    labelSpan.textContent = label;
    const descSpan = document.createElement('span');
    descSpan.className = 'sc-setting-desc';
    descSpan.textContent = description;
    info.appendChild(labelSpan);
    info.appendChild(descSpan);

    const rightContainer = document.createElement('div');
    rightContainer.style.display = 'flex';
    rightContainer.style.alignItems = 'center';
    rightContainer.style.gap = '12px';

    const badge = document.createElement('span');
    badge.className = 'sc-status-badge';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '6px';
    badge.style.padding = '3px 9px';
    badge.style.borderRadius = '999px';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '500';
    badge.style.transition = 'all 0.2s ease';

    const dot = document.createElement('span');
    dot.className = 'sc-status-dot';
    dot.style.width = '6px';
    dot.style.height = '6px';
    dot.style.borderRadius = '50%';
    dot.style.flexShrink = '0';

    const badgeText = document.createElement('span');
    badgeText.textContent = 'Waiting for Discord desktop app...';

    badge.appendChild(dot);
    badge.appendChild(badgeText);

    this.discordStatusBadge = badge;
    this.discordStatusDot = dot;
    this.discordStatusText = badgeText;

    const switchLabel = document.createElement('label');
    switchLabel.className = 'sc-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      if (!input.checked) {
        this.updateDiscordBadgeStatus('disabled');
      } else {
        this.pollDiscordRpcStatus();
      }
    });
    const slider = document.createElement('span');
    slider.className = 'sc-switch-slider';
    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);
    setRef(input);

    rightContainer.appendChild(badge);
    rightContainer.appendChild(switchLabel);

    row.appendChild(info);
    row.appendChild(rightContainer);
    return row;
  }

  private updateDiscordBadgeStatus(status: string): void {
    if (!this.discordStatusBadge || !this.discordStatusDot || !this.discordStatusText) return;

    if (!this.discordToggle.checked || status === 'disabled') {
      this.discordStatusText.textContent = 'Disabled';
      this.discordStatusBadge.style.background = 'rgba(255, 255, 255, 0.04)';
      this.discordStatusBadge.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      this.discordStatusBadge.style.color = '#8e8e98';
      this.discordStatusDot.style.background = '#6b6b78';
      this.discordStatusDot.style.boxShadow = 'none';
      return;
    }

    switch (status) {
      case 'connected':
        this.discordStatusText.textContent = 'Connected to Discord';
        this.discordStatusBadge.style.background = 'rgba(16, 185, 129, 0.12)';
        this.discordStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        this.discordStatusBadge.style.color = '#34d399';
        this.discordStatusDot.style.background = '#10b981';
        this.discordStatusDot.style.boxShadow = '0 0 6px rgba(16, 185, 129, 0.5)';
        break;
      case 'permission_denied':
        this.discordStatusText.textContent = 'Access denied — Discord is running as Administrator';
        this.discordStatusBadge.style.background = 'rgba(239, 68, 68, 0.12)';
        this.discordStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        this.discordStatusBadge.style.color = '#f87171';
        this.discordStatusDot.style.background = '#ef4444';
        this.discordStatusDot.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.5)';
        break;
      case 'waiting_for_discord':
      default:
        this.discordStatusText.textContent = 'Waiting for Discord desktop app...';
        this.discordStatusBadge.style.background = 'rgba(245, 158, 11, 0.12)';
        this.discordStatusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        this.discordStatusBadge.style.color = '#fbbf24';
        this.discordStatusDot.style.background = '#f59e0b';
        this.discordStatusDot.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.5)';
        break;
    }
  }

  private async pollDiscordRpcStatus(): Promise<void> {
    if (!this.overlay?.classList.contains('visible')) return;
    if (!this.discordToggle.checked) {
      this.updateDiscordBadgeStatus('disabled');
      return;
    }

    try {
      const status = await getDiscordRpcStatus();
      this.updateDiscordBadgeStatus(status);
    } catch (err) {
      console.warn('[SC-Desktop] Failed to get Discord RPC status:', err);
    }
  }

  private async saveCurrentForm(): Promise<AppSettings> {
    const rawUrl = this.proxyUrlInput.value.trim();
    const normalizedUrl = this.normalizeProxyUrl(rawUrl);
    this.proxyUrlInput.value = normalizedUrl;
    this.updateActiveProtocolPill(normalizedUrl);

    const newSettings: AppSettings = {
      proxy_enabled: this.proxyToggle.checked,
      proxy_url: normalizedUrl,
      discord_rpc_enabled: this.discordToggle.checked,
      discord_app_id: '1572112482062045194',
      adblock_enabled: this.adblockToggle.checked,
      dark_theme_enabled: this.darkThemeToggle.checked,
      minimize_to_tray: this.minimizeToTrayToggle.checked,
      proxy_active: this.currentSettings.proxy_active,
    };

    const saved = await persistSettings(newSettings);
    this.currentSettings = saved;
    this.callbacks.onSettingsChanged(saved);

    if (!newSettings.discord_rpc_enabled) {
      this.updateDiscordBadgeStatus('disabled');
    } else {
      this.pollDiscordRpcStatus();
    }

    return saved;
  }

  private showToast(msg: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('visible');

    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2000);
  }

  private bindShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // Ctrl+, or Cmd+, to toggle settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        this.toggle();
      }
      // Escape to close
      if (e.key === 'Escape' && this.overlay?.classList.contains('visible')) {
        e.preventDefault();
        this.close();
      }
    });
  }
}
