import { getSettings, saveSettings, checkUpdate, installUpdate, testProxy, scLogin, scLoginWithToken, scLogout, scGetMe, onAuthUpdated } from '../ipc.ts';
import { LikesStore } from '../state/LikesStore.ts';
import type { AppSettings, UpdateCheckResponse, User } from '../types.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class SettingsModal {
  private element: HTMLElement;
  private settings: AppSettings | null = null;
  private currentUser: User | null = null;
  private authCheckError: string | null = null;
  private isOpen: boolean = false;
  private selectedProtocol: string = 'socks5';
  private onSettingsUpdated: (settings: AppSettings) => void;

  constructor(onSettingsUpdated: (settings: AppSettings) => void) {
    this.onSettingsUpdated = onSettingsUpdated;
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';

    this.render();
    this.initGlobalKeys();

    onAuthUpdated(async () => {
      if (!this.isOpen) return;
      await this.refreshState();
      this.render();
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private async refreshState(): Promise<void> {
    this.settings = await getSettings();
    try {
      this.currentUser = await scGetMe();
      this.authCheckError = null;
    } catch (err: unknown) {
      this.authCheckError = err instanceof Error ? err.message : String(err);
    }
    this.parseProxyProtocol();
  }

  public async open(): Promise<void> {
    try {
      await this.refreshState();
      this.render();
      this.isOpen = true;
      this.element.classList.add('open');
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  public close(): void {
    this.isOpen = false;
    this.element.classList.remove('open');
  }

  private initGlobalKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });
  }

  private parseProxyProtocol(): void {
    if (!this.settings) return;
    const url = this.settings.proxy_url.toLowerCase();
    if (url.startsWith('http://')) this.selectedProtocol = 'http';
    else if (url.startsWith('https://')) this.selectedProtocol = 'https';
    else if (url.startsWith('socks4://')) this.selectedProtocol = 'socks4';
    else this.selectedProtocol = 'socks5';
  }

  private getHostAndPort(): string {
    if (!this.settings) return '127.0.0.1:10808';
    return this.settings.proxy_url.replace(/^[a-z0-9]+:\/\//i, '');
  }

  private renderAccountSection(): string {
    if (this.currentUser && this.currentUser.username) {
      const avatarUrl = this.currentUser.avatar_url || 'https://a1.sndcdn.com/images/default_avatar_large.png';
      return `
        <div class="settings-row" style="align-items: center;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${escapeHtml(avatarUrl)}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;" alt="${escapeHtml(this.currentUser.username)}" />
            <div>
              <div class="settings-label-title">${escapeHtml(this.currentUser.username)}</div>
              <div class="settings-label-desc" style="color: #22c55e;">Connected to SoundCloud</div>
            </div>
          </div>
          <button class="btn-secondary" id="modal-btn-signout" style="padding: 0 14px; height: 32px; font-size: 12px;">Sign Out</button>
        </div>
      `;
    }

    if (this.settings?.oauth_token && this.authCheckError) {
      return `
        <div class="settings-row" style="align-items: center;">
          <div>
            <div class="settings-label-title">Session Saved (Offline)</div>
            <div class="settings-label-desc" style="color: #f59e0b;">Could not verify account: ${escapeHtml(this.authCheckError)}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" id="modal-btn-retry-auth" style="padding: 0 12px; height: 32px; font-size: 12px;">Retry</button>
            <button class="btn-secondary" id="modal-btn-signout" style="padding: 0 12px; height: 32px; font-size: 12px;">Sign Out</button>
          </div>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button class="btn-primary" id="modal-btn-signin" style="padding: 0 16px; height: 34px; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" style="flex-shrink: 0;">
              <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>
            </svg>
            <span>Sign In</span>
          </button>
          <span style="font-size: 12px; color: var(--text-tertiary);">Or paste oauth_token:</span>
          <input type="password" class="settings-input" id="setting-oauth-token-input" placeholder="Paste oauth_token here..." style="flex: 1; min-width: 170px; height: 34px; font-size: 12px;" />
          <button class="btn-secondary" id="setting-btn-connect-token" style="padding: 0 14px; height: 34px; font-size: 12px; white-space: nowrap;">Connect</button>
        </div>
        <div id="modal-token-status" style="font-size: 12px; display: none;"></div>
      </div>
    `;
  }

  private render(): void {
    if (!this.settings) return;

    this.element.innerHTML = `
      <div class="settings-modal-card">
        <div class="modal-header">
          <span class="modal-title">Settings</span>
          <button class="titlebar-btn close-btn" id="modal-btn-close">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- Account Section -->
          <div class="settings-group">
            <span class="settings-group-title">Account</span>
            ${this.renderAccountSection()}
          </div>

          <!-- Appearance Section -->
          <div class="settings-group">
            <span class="settings-group-title">Appearance</span>
            <div class="settings-row">
              <div>
                <div class="settings-label-title">AMOLED Deep Dark</div>
                <div class="settings-label-desc">Pure pitch-black palette with higher contrast</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-dark-theme" ${this.settings.dark_theme_enabled ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Integrations Section -->
          <div class="settings-group">
            <span class="settings-group-title">Integrations & System</span>
            <div class="settings-row">
              <div>
                <div class="settings-label-title">Discord Rich Presence</div>
                <div class="settings-label-desc">Display active track, artist and high-res cover on Discord</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-discord-rpc" ${this.settings.discord_rpc_enabled ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-label-title">Minimize to System Tray</div>
                <div class="settings-label-desc">Keep audio playing in background when window is closed</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-minimize-tray" ${this.settings.minimize_to_tray ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Proxy Section -->
          <div class="settings-group">
            <span class="settings-group-title">Network & Proxy</span>
            <div class="settings-row">
              <div>
                <div class="settings-label-title">Enable Proxy</div>
                <div class="settings-label-desc">Route all SoundCloud API and audio streams through proxy</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-proxy-enabled" ${this.settings.proxy_enabled ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="protocol-pills">
              <div class="protocol-pill ${this.selectedProtocol === 'socks5' ? 'active' : ''}" data-proto="socks5">SOCKS5</div>
              <div class="protocol-pill ${this.selectedProtocol === 'http' ? 'active' : ''}" data-proto="http">HTTP</div>
              <div class="protocol-pill ${this.selectedProtocol === 'https' ? 'active' : ''}" data-proto="https">HTTPS</div>
              <div class="protocol-pill ${this.selectedProtocol === 'socks4' ? 'active' : ''}" data-proto="socks4">SOCKS4</div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <input type="text" class="settings-input" id="setting-proxy-address" value="${escapeHtml(this.getHostAndPort())}" placeholder="127.0.0.1:10808 or user:pass@host:port" style="flex: 1;" />
              <button class="btn-secondary" id="btn-test-proxy" style="white-space: nowrap; padding: 0 14px;">Test Proxy</button>
            </div>
            <div id="proxy-test-status" style="margin-top: 8px; font-size: 12px; line-height: 1.5; color: var(--text-secondary); display: none;"></div>
          </div>

          <!-- Updates Section -->
          <div class="settings-group">
            <span class="settings-group-title">Software Updates</span>
            <div class="settings-row">
              <div>
                <div class="settings-label-title">SoundCloud Desktop Client</div>
                <div class="settings-label-desc" id="setting-update-status">Checking for updates...</div>
              </div>
              <button class="btn-secondary" id="btn-check-updates">Check Now</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="modal-btn-cancel">Close</button>
          <button class="btn-primary" id="modal-btn-save">Save</button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.runUpdateCheck();
  }

  private bindEvents(): void {
    const closeBtn = this.element.querySelector('#modal-btn-close');
    const cancelBtn = this.element.querySelector('#modal-btn-cancel');
    const saveBtn = this.element.querySelector<HTMLButtonElement>('#modal-btn-save');

    closeBtn?.addEventListener('click', () => this.close());
    cancelBtn?.addEventListener('click', () => this.close());

    const signInBtn = this.element.querySelector('#modal-btn-signin');
    signInBtn?.addEventListener('click', () => {
      scLogin().catch(err => console.error('Sign in error:', err));
    });

    const retryAuthBtn = this.element.querySelector('#modal-btn-retry-auth');
    retryAuthBtn?.addEventListener('click', async () => {
      await this.refreshState();
      this.render();
    });

    const signOutBtn = this.element.querySelector('#modal-btn-signout');
    signOutBtn?.addEventListener('click', async () => {
      await scLogout();
      LikesStore.getInstance().clear();
      this.currentUser = null;
      this.authCheckError = null;
      this.settings = await getSettings();
      this.render();
      this.onSettingsUpdated(this.settings);
    });

    const connectTokenBtn = this.element.querySelector<HTMLButtonElement>('#setting-btn-connect-token');
    const tokenInput = this.element.querySelector<HTMLInputElement>('#setting-oauth-token-input');
    const tokenStatus = this.element.querySelector<HTMLElement>('#modal-token-status');

    connectTokenBtn?.addEventListener('click', async () => {
      const rawToken = tokenInput?.value.trim() || '';
      if (!rawToken) {
        if (tokenStatus) {
          tokenStatus.style.display = 'block';
          tokenStatus.style.color = '#ef4444';
          tokenStatus.textContent = 'Please enter an oauth_token.';
        }
        return;
      }

      if (tokenStatus) {
        tokenStatus.style.display = 'block';
        tokenStatus.style.color = '#60a5fa';
        tokenStatus.textContent = 'Validating token with SoundCloud...';
      }
      if (connectTokenBtn) connectTokenBtn.disabled = true;

      try {
        const user = await scLoginWithToken(rawToken);
        this.currentUser = user;
        this.settings = await getSettings();
        this.render();
        this.onSettingsUpdated(this.settings);
      } catch (err: unknown) {
        if (tokenStatus) {
          tokenStatus.style.display = 'block';
          tokenStatus.style.color = '#ef4444';
          tokenStatus.textContent = err instanceof Error ? err.message : String(err);
        }
        if (connectTokenBtn) connectTokenBtn.disabled = false;
      }
    });

    const darkToggle = this.element.querySelector<HTMLInputElement>('#setting-dark-theme');
    darkToggle?.addEventListener('change', async () => {
      if (!this.settings) return;
      this.settings.dark_theme_enabled = darkToggle.checked;
      if (this.settings.dark_theme_enabled) {
        document.documentElement.classList.add('sc-dark-theme');
      } else {
        document.documentElement.classList.remove('sc-dark-theme');
      }
      this.settings = await saveSettings(this.settings);
      this.onSettingsUpdated(this.settings);
    });

    const discordToggle = this.element.querySelector<HTMLInputElement>('#setting-discord-rpc');
    discordToggle?.addEventListener('change', async () => {
      if (!this.settings) return;
      this.settings.discord_rpc_enabled = discordToggle.checked;
      this.settings = await saveSettings(this.settings);
      this.onSettingsUpdated(this.settings);
    });

    const trayToggle = this.element.querySelector<HTMLInputElement>('#setting-minimize-tray');
    trayToggle?.addEventListener('change', async () => {
      if (!this.settings) return;
      this.settings.minimize_to_tray = trayToggle.checked;
      this.settings = await saveSettings(this.settings);
      this.onSettingsUpdated(this.settings);
    });

    const pills = this.element.querySelectorAll<HTMLElement>('.protocol-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.selectedProtocol = pill.getAttribute('data-proto') || 'socks5';
      });
    });

    const testProxyBtn = this.element.querySelector<HTMLButtonElement>('#btn-test-proxy');
    const proxyStatusEl = this.element.querySelector<HTMLElement>('#proxy-test-status');

    testProxyBtn?.addEventListener('click', async () => {
      const addressInput = this.element.querySelector<HTMLInputElement>('#setting-proxy-address');
      const raw = addressInput?.value.trim() || '';
      if (!raw) {
        if (proxyStatusEl) {
          proxyStatusEl.style.display = 'block';
          proxyStatusEl.style.color = '#ef4444';
          proxyStatusEl.textContent = 'Proxy address cannot be empty.';
        }
        return;
      }

      const stripped = raw.replace(/^[a-z0-9]+:\/\//i, '');
      const lastAt = stripped.lastIndexOf('@');
      if (lastAt >= 0) {
        const creds = stripped.slice(0, lastAt);
        if (!creds.includes(':')) {
          if (proxyStatusEl) {
            proxyStatusEl.style.display = 'block';
            proxyStatusEl.style.color = '#ef4444';
            proxyStatusEl.innerHTML = '<strong>Format Error:</strong> Missing colon \':\' between username and password.<br>Expected: <code>username:password@host:port</code>';
          }
          return;
        }
      }

      const fullUrl = `${this.selectedProtocol}://${stripped}`;

      if (proxyStatusEl) {
        proxyStatusEl.style.display = 'block';
        proxyStatusEl.style.color = 'var(--text-secondary)';
        proxyStatusEl.innerHTML = '<span style="color:#60a5fa;">Testing proxy connection... (Step 1: Exit IP -> Step 2: SoundCloud API &amp; resolve -> Step 3: Media fetch)</span>';
      }
      if (testProxyBtn) testProxyBtn.disabled = true;

      try {
        const res = await testProxy(fullUrl);
        if (proxyStatusEl) {
          if (res.success) {
            proxyStatusEl.style.color = '#22c55e';
            proxyStatusEl.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 4px;">Proxy Verified Successfully!</div>
              <div>Direct IP: ${escapeHtml(res.direct_ip || 'N/A')} | Exit IP: <strong>${escapeHtml(res.exit_ip || 'N/A')}</strong>${res.country ? ` (${escapeHtml(res.country)})` : ''}</div>
              <div>Step 1 (Exit IP): ${escapeHtml(res.step1_ip_status)}</div>
              <div>Step 2 (Stream Resolution): ${escapeHtml(res.step2_resolve_status)}</div>
              <div>Step 3 (Media Fetch): ${escapeHtml(res.step3_media_status)}</div>
            `;
          } else {
            proxyStatusEl.style.color = '#ef4444';
            proxyStatusEl.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 4px;">Proxy Test Failed:</div>
              <div>Direct IP: ${escapeHtml(res.direct_ip || 'N/A')} | Exit IP: ${escapeHtml(res.exit_ip || 'N/A')}</div>
              <div>Step 1: ${escapeHtml(res.step1_ip_status)}</div>
              <div>Step 2: ${escapeHtml(res.step2_resolve_status)}</div>
              <div>Step 3: ${escapeHtml(res.step3_media_status)}</div>
              ${res.error ? `<div style="margin-top: 4px; color: #f87171;"><strong>Error:</strong> ${escapeHtml(res.error)}</div>` : ''}
            `;
          }
        }
      } catch (err: unknown) {
        if (proxyStatusEl) {
          proxyStatusEl.style.color = '#ef4444';
          const msg = err instanceof Error ? err.message : String(err);
          proxyStatusEl.textContent = `Proxy test command error: ${msg}`;
        }
      } finally {
        if (testProxyBtn) testProxyBtn.disabled = false;
      }
    });

    const checkBtn = this.element.querySelector('#btn-check-updates');
    checkBtn?.addEventListener('click', () => this.runUpdateCheck(true));

    saveBtn?.addEventListener('click', async () => {
      if (!this.settings) return;
      const proxyEnabled = this.element.querySelector<HTMLInputElement>('#setting-proxy-enabled')?.checked || false;
      const proxyAddress = this.element.querySelector<HTMLInputElement>('#setting-proxy-address')?.value.trim() || '127.0.0.1:10808';
      const strippedAddr = proxyAddress.replace(/^[a-z0-9]+:\/\//i, '');
      const lastAt = strippedAddr.lastIndexOf('@');

      if (proxyEnabled && lastAt >= 0) {
        const creds = strippedAddr.slice(0, lastAt);
        if (!creds.includes(':')) {
          if (proxyStatusEl) {
            proxyStatusEl.style.display = 'block';
            proxyStatusEl.style.color = '#ef4444';
            proxyStatusEl.innerHTML = '<strong>Save Blocked:</strong> Missing colon \':\' in proxy credentials.<br>Format must be: <code>username:password@host:port</code>';
          }
          return;
        }
      }

      this.settings.proxy_enabled = proxyEnabled;
      this.settings.proxy_url = `${this.selectedProtocol}://${strippedAddr}`;

      try {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
        }
        this.settings = await saveSettings(this.settings);
        this.onSettingsUpdated(this.settings);
        if (proxyStatusEl) {
          proxyStatusEl.style.display = 'block';
          proxyStatusEl.style.color = '#22c55e';
          proxyStatusEl.textContent = 'Settings saved and applied successfully.';
        }
        if (saveBtn) {
          saveBtn.textContent = 'Saved!';
          setTimeout(() => {
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save';
            }
          }, 1500);
        }
      } catch (e: unknown) {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
        if (proxyStatusEl) {
          proxyStatusEl.style.display = 'block';
          proxyStatusEl.style.color = '#ef4444';
          const msg = e instanceof Error ? e.message : String(e);
          proxyStatusEl.textContent = `Save error: ${msg}`;
        }
      }
    });
  }

  private async runUpdateCheck(manual: boolean = false): Promise<void> {
    const statusEl = this.element.querySelector('#setting-update-status');
    const checkBtn = this.element.querySelector<HTMLButtonElement>('#btn-check-updates');
    if (manual && statusEl) statusEl.textContent = 'Checking for updates...';

    try {
      const res: UpdateCheckResponse = await checkUpdate();
      if (!statusEl) return;

      if (res.available && res.version) {
        statusEl.textContent = `New version v${res.version} is available!`;
        if (checkBtn) {
          checkBtn.textContent = 'Install & Restart';
          checkBtn.onclick = async () => {
            statusEl.textContent = 'Downloading update...';
            checkBtn.disabled = true;
            await installUpdate();
          };
        }
      } else {
        statusEl.textContent = `You are on the latest version (v${res.current_version}).`;
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = `Update check failed.`;
    }
  }
}
