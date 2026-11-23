import { getSettings, saveSettings, checkUpdate, installUpdate, testProxy, scLogin, scLoginWithToken, scLogout, scGetMe } from '../ipc.ts';
import { LikesStore } from '../state/LikesStore.ts';
import type { AppSettings, UpdateCheckResponse, User } from '../types.ts';

export class SettingsModal {
  private element: HTMLElement;
  private settings: AppSettings | null = null;
  private currentUser: User | null = null;
  private isOpen: boolean = false;
  private selectedProtocol: string = 'socks5';
  private onSettingsUpdated: (settings: AppSettings) => void;

  constructor(onSettingsUpdated: (settings: AppSettings) => void) {
    this.onSettingsUpdated = onSettingsUpdated;
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';

    this.render();
    this.initGlobalKeys();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public async open(): Promise<void> {
    try {
      this.settings = await getSettings();
      try {
        this.currentUser = await scGetMe();
      } catch (_) {
        this.currentUser = null;
      }
      this.parseProxyProtocol();
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
            <img src="${avatarUrl}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;" alt="${this.currentUser.username}" />
            <div>
              <div class="settings-label-title">${this.currentUser.username}</div>
              <div class="settings-label-desc" style="color: #22c55e;">Connected to SoundCloud</div>
            </div>
          </div>
          <button class="btn-secondary" id="modal-btn-signout" style="padding: 0 14px; height: 32px; font-size: 12px;">Sign Out</button>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button class="btn-primary" id="modal-btn-signin" style="padding: 0 16px; height: 34px; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="18" height="14" viewBox="0 0 640 512" fill="currentColor">
              <path d="M639.8 298.6c-1.3 23.1-11.5 44.8-28.4 60.5s-39.2 24.4-62.3 24.1h-218c-4.8 0-9.4-2-12.8-5.4s-5.3-8-5.3-12.8V130.2c-.2-4 .9-8 3.1-11.4s5.3-6.1 9-7.7c0 0 20.1-13.9 62.3-13.9c25.8 0 51.1 6.9 73.3 20.1c17.3 10.2 32.3 23.8 44.1 40.1s20 34.8 24.2 54.4c7.5-2.1 15.3-3.2 23.1-3.2c11.7-.1 23.3 2.2 34.2 6.7S606.8 226.6 615 235s14.6 18.3 18.9 29.3s6.3 22.6 5.9 34.3zm-354-153.5c.1-1 0-2-.3-2.9s-.8-1.8-1.5-2.6s-1.5-1.3-2.4-1.7s-1.9-.6-2.9-.6s-2 .2-2.9 .6s-1.7 1-2.4 1.7s-1.2 1.6-1.5 2.6s-.4 1.9-.3 2.9c-6 78.9-10.6 152.9 0 231.6c.2 1.7 1 3.3 2.3 4.5s3 1.8 4.7 1.8s3.4-.6 4.7-1.8s2.1-2.8 2.3-4.5c11.3-79.4 6.6-152 0-231.6zm-44 27.3c-.2-1.8-1.1-3.5-2.4-4.7s-3.1-1.9-5-1.9s-3.6 .7-5 1.9s-2.2 2.9-2.4 4.7c-7.9 67.9-7.9 136.5 0 204.4c.3 1.8 1.2 3.4 2.5 4.5s3.1 1.8 4.8 1.8s3.5-.6 4.8-1.8s2.2-2.8 2.5-4.5c8.8-67.8 8.8-136.5 .1-204.4zm-44.3-6.9c-.2-1.8-1-3.4-2.3-4.6s-3-1.8-4.8-1.8s-3.5 .7-4.8 1.8s-2.1 2.8-2.3 4.6c-6.7 72-10.2 139.3 0 211.1c0 1.9 .7 3.7 2.1 5s3.1 2.1 5 2.1s3.7-.7 5-2.1s2.1-3.1 2.1-5c10.5-72.8 7.3-138.2 .1-211.1zm-44 20.6c0-1.9-.8-3.8-2.1-5.2s-3.2-2.1-5.2-2.1s-3.8 .8-5.2 2.1s-2.1 3.2-2.1 5.2c-8.1 63.3-8.1 127.5 0 190.8c.2 1.8 1 3.4 2.4 4.6s3.1 1.9 4.8 1.9s3.5-.7 4.8-1.9s2.2-2.8 2.4-4.6c8.8-63.3 8.9-127.5 .3-190.8zM109 233.7c0-1.9-.8-3.8-2.1-5.1s-3.2-2.1-5.1-2.1s-3.8 .8-5.1 2.1s-2.1 3.2-2.1 5.1c-10.5 49.2-5.5 93.9 .4 143.6c.3 1.6 1.1 3.1 2.3 4.2s2.8 1.7 4.5 1.7s3.2-.6 4.5-1.7s2.1-2.5 2.3-4.2c6.6-50.4 11.6-94.1 .4-143.6zm-44.1-7.5c-.2-1.8-1.1-3.5-2.4-4.8s-3.2-1.9-5-1.9s-3.6 .7-5 1.9s-2.2 2.9-2.4 4.8c-9.3 50.2-6.2 94.4 .3 144.5c.7 7.6 13.6 7.5 14.4 0c7.2-50.9 10.5-93.8 .3-144.5zM20.3 250.8c-.2-1.8-1.1-3.5-2.4-4.8s-3.2-1.9-5-1.9s-3.6 .7-5 1.9s-2.3 2.9-2.4 4.8c-8.5 33.7-5.9 63.8 .3 97.6c.6 3.6 5.8 4.6 8 1.9c5.2-6.4 8.7-13.8 10.5-21.9c4.2-18.8 4.2-49 0-77.6z"/>
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
              <input type="text" class="settings-input" id="setting-proxy-address" value="${this.getHostAndPort()}" placeholder="127.0.0.1:10808 or user:pass@host:port" style="flex: 1;" />
              <button class="btn-secondary" id="btn-test-proxy" style="white-space: nowrap; padding: 0 14px;">Test Proxy</button>
            </div>
            <div id="proxy-test-status" style="margin-top: 8px; font-size: 12px; line-height: 1.5; color: var(--color-text-secondary); display: none;"></div>
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

    const signOutBtn = this.element.querySelector('#modal-btn-signout');
    signOutBtn?.addEventListener('click', async () => {
      await scLogout();
      LikesStore.getInstance().clear();
      this.currentUser = null;
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

      if (raw.includes('@')) {
        const creds = raw.split('@')[0].replace(/^[a-z0-9]+:\/\//i, '');
        if (!creds.includes(':')) {
          if (proxyStatusEl) {
            proxyStatusEl.style.display = 'block';
            proxyStatusEl.style.color = '#ef4444';
            proxyStatusEl.innerHTML = '<strong>Format Error:</strong> Missing colon \':\' between username and password.<br>Expected: <code>username:password@host:port</code>';
          }
          return;
        }
      }

      const clean = raw.replace(/^[a-z0-9]+:\/\//i, '');
      const fullUrl = `${this.selectedProtocol}://${clean}`;

      if (proxyStatusEl) {
        proxyStatusEl.style.display = 'block';
        proxyStatusEl.style.color = 'var(--color-text-secondary)';
        proxyStatusEl.innerHTML = '<span style="color:#60a5fa;">Testing proxy connection... (Step 1: IP check -> Step 2: Stream resolve -> Step 3: Media fetch)</span>';
      }
      if (testProxyBtn) testProxyBtn.disabled = true;

      try {
        const res = await testProxy(fullUrl);
        if (proxyStatusEl) {
          if (res.success) {
            proxyStatusEl.style.color = '#22c55e';
            proxyStatusEl.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 4px;">Proxy Verified Successfully!</div>
              <div>Direct IP: ${res.direct_ip || 'N/A'} | Exit IP: <strong>${res.exit_ip}</strong> (${res.country})</div>
              <div>Step 1 (IP & Country): ${res.step1_ip_status}</div>
              <div>Step 2 (Stream Resolution): ${res.step2_resolve_status}</div>
              <div>Step 3 (Media Fetch): ${res.step3_media_status}</div>
            `;
          } else {
            proxyStatusEl.style.color = '#ef4444';
            proxyStatusEl.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 4px;">Proxy Test Failed:</div>
              <div>Direct IP: ${res.direct_ip || 'N/A'} | Exit IP: ${res.exit_ip || 'N/A'}</div>
              <div>Step 1: ${res.step1_ip_status}</div>
              <div>Step 2: ${res.step2_resolve_status}</div>
              <div>Step 3: ${res.step3_media_status}</div>
              ${res.error ? `<div style="margin-top: 4px; color: #f87171;"><strong>Error:</strong> ${res.error}</div>` : ''}
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

      if (proxyEnabled && proxyAddress.includes('@')) {
        const creds = proxyAddress.split('@')[0].replace(/^[a-z0-9]+:\/\//i, '');
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
      this.settings.proxy_url = `${this.selectedProtocol}://${proxyAddress.replace(/^[a-z0-9]+:\/\//i, '')}`;

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
