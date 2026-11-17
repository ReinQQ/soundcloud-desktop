import { sendWindowAction } from './ipc';

export interface TitlebarCallbacks {
  onOpenSettings: () => void;
  onOpenUpdate?: () => void;
}

export class Titlebar {
  private container: HTMLDivElement | null = null;
  private proxyBadge: HTMLSpanElement | null = null;
  private discordBadge: HTMLSpanElement | null = null;
  private adBadge: HTMLSpanElement | null = null;
  private updateBadge: HTMLSpanElement | null = null;
  private settingsBtn: HTMLButtonElement | null = null;

  constructor(private callbacks: TitlebarCallbacks) {}

  public mount(): void {
    if (document.getElementById('sc-desktop-titlebar')) {
      return;
    }

    document.body.classList.add('sc-desktop-active');

    const bar = document.createElement('div');
    bar.id = 'sc-desktop-titlebar';
    bar.setAttribute('data-tauri-drag-region', 'true');

    // --- Left Section: Branding ---
    const left = document.createElement('div');
    left.className = 'sc-titlebar-left';
    left.setAttribute('data-tauri-drag-region', 'true');

    // SVG Cloud Icon
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.classList.add('sc-brand-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z'
    );
    svgIcon.appendChild(path);

    const titleText = document.createElement('span');
    titleText.className = 'sc-brand-title';
    titleText.textContent = 'SoundCloud';

    const subText = document.createElement('span');
    subText.className = 'sc-brand-sub';
    subText.textContent = 'Desktop';

    left.appendChild(svgIcon);
    left.appendChild(titleText);
    left.appendChild(subText);

    // --- Center Section: Status Badges ---
    const center = document.createElement('div');
    center.className = 'sc-titlebar-center';
    center.setAttribute('data-tauri-drag-region', 'true');

    // Proxy Badge
    const proxyBadge = document.createElement('span');
    proxyBadge.className = 'sc-status-badge sc-no-drag';
    proxyBadge.setAttribute('data-tauri-drag-region', 'false');
    const proxyDot = document.createElement('span');
    proxyDot.className = 'sc-status-dot';
    const proxyText = document.createElement('span');
    proxyText.textContent = 'Direct';
    proxyBadge.appendChild(proxyDot);
    proxyBadge.appendChild(proxyText);
    this.proxyBadge = proxyBadge;

    // Discord Badge
    const discordBadge = document.createElement('span');
    discordBadge.className = 'sc-status-badge sc-no-drag';
    discordBadge.setAttribute('data-tauri-drag-region', 'false');
    const discordDot = document.createElement('span');
    discordDot.className = 'sc-status-dot';
    const discordText = document.createElement('span');
    discordText.textContent = 'Discord Off';
    discordBadge.appendChild(discordDot);
    discordBadge.appendChild(discordText);
    this.discordBadge = discordBadge;

    // Audio Ad Muted Badge (hidden by default)
    const adBadge = document.createElement('span');
    adBadge.className = 'sc-status-badge sc-no-drag ad-muted';
    adBadge.setAttribute('data-tauri-drag-region', 'false');
    adBadge.style.display = 'none';
    const adDot = document.createElement('span');
    adDot.className = 'sc-status-dot';
    const adText = document.createElement('span');
    adText.textContent = 'Ad Muted';
    adBadge.appendChild(adDot);
    adBadge.appendChild(adText);
    this.adBadge = adBadge;

    // Update Available Badge (hidden by default)
    const updateBadge = document.createElement('span');
    updateBadge.className = 'sc-status-badge sc-no-drag update-available';
    updateBadge.setAttribute('data-tauri-drag-region', 'false');
    updateBadge.style.display = 'none';
    const updateDot = document.createElement('span');
    updateDot.className = 'sc-status-dot';
    const updateText = document.createElement('span');
    updateText.textContent = 'Update';
    updateBadge.appendChild(updateDot);
    updateBadge.appendChild(updateText);
    updateBadge.addEventListener('mousedown', (e) => e.stopPropagation());
    updateBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onOpenUpdate) {
        this.callbacks.onOpenUpdate();
      } else {
        this.callbacks.onOpenSettings();
      }
    });
    this.updateBadge = updateBadge;

    center.appendChild(proxyBadge);
    center.appendChild(discordBadge);
    center.appendChild(adBadge);
    center.appendChild(updateBadge);

    // --- Right Section: Actions & Window Controls ---
    const right = document.createElement('div');
    right.className = 'sc-titlebar-right sc-no-drag';
    right.setAttribute('data-tauri-drag-region', 'false');

    // Settings Gear Button
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'sc-titlebar-btn sc-no-drag';
    settingsBtn.title = 'Settings (Ctrl+,)';
    settingsBtn.setAttribute('aria-label', 'Open Settings');
    settingsBtn.setAttribute('data-tauri-drag-region', 'false');

    const gearSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gearSvg.setAttribute('viewBox', '0 0 24 24');
    const gearPath1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    gearPath1.setAttribute('cx', '12');
    gearPath1.setAttribute('cy', '12');
    gearPath1.setAttribute('r', '3');
    const gearPath2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    gearPath2.setAttribute(
      'd',
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'
    );
    gearSvg.appendChild(gearPath1);
    gearSvg.appendChild(gearPath2);
    settingsBtn.appendChild(gearSvg);

    // Stop propagation on mousedown so drag region does not capture click
    settingsBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.callbacks.onOpenSettings();
    });
    this.settingsBtn = settingsBtn;

    // Window Minimize Button
    const minBtn = document.createElement('button');
    minBtn.className = 'sc-titlebar-btn sc-win-btn sc-no-drag';
    minBtn.title = 'Minimize';
    minBtn.setAttribute('aria-label', 'Minimize Window');
    minBtn.setAttribute('data-tauri-drag-region', 'false');
    const minSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    minSvg.setAttribute('viewBox', '0 0 16 16');
    const minLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    minLine.setAttribute('x1', '3');
    minLine.setAttribute('y1', '8');
    minLine.setAttribute('x2', '13');
    minLine.setAttribute('y2', '8');
    minSvg.appendChild(minLine);
    minBtn.appendChild(minSvg);

    minBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      sendWindowAction('minimize').catch(console.error);
    });

    // Window Maximize/Restore Button
    const maxBtn = document.createElement('button');
    maxBtn.className = 'sc-titlebar-btn sc-win-btn sc-no-drag';
    maxBtn.title = 'Maximize / Restore';
    maxBtn.setAttribute('aria-label', 'Maximize or Restore Window');
    maxBtn.setAttribute('data-tauri-drag-region', 'false');
    const maxSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    maxSvg.setAttribute('viewBox', '0 0 16 16');
    const maxRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    maxRect.setAttribute('x', '3.5');
    maxRect.setAttribute('y', '3.5');
    maxRect.setAttribute('width', '9');
    maxRect.setAttribute('height', '9');
    maxSvg.appendChild(maxRect);
    maxBtn.appendChild(maxSvg);

    maxBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    maxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      sendWindowAction('toggle_maximize').catch(console.error);
    });

    // Window Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sc-titlebar-btn sc-win-btn sc-win-close sc-no-drag';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close Window');
    closeBtn.setAttribute('data-tauri-drag-region', 'false');
    const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('viewBox', '0 0 16 16');
    const closeLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    closeLine1.setAttribute('x1', '4');
    closeLine1.setAttribute('y1', '4');
    closeLine1.setAttribute('x2', '12');
    closeLine1.setAttribute('y2', '12');
    const closeLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    closeLine2.setAttribute('x1', '12');
    closeLine2.setAttribute('y1', '4');
    closeLine2.setAttribute('x2', '4');
    closeLine2.setAttribute('y2', '12');
    closeSvg.appendChild(closeLine1);
    closeSvg.appendChild(closeLine2);
    closeBtn.appendChild(closeSvg);

    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      sendWindowAction('close').catch(console.error);
    });

    right.appendChild(settingsBtn);
    right.appendChild(minBtn);
    right.appendChild(maxBtn);
    right.appendChild(closeBtn);

    bar.appendChild(left);
    bar.appendChild(center);
    bar.appendChild(right);

    document.body.prepend(bar);
    this.container = bar;
  }

  public updateProxyBadge(enabled: boolean): void {
    if (!this.proxyBadge) return;
    const textSpan = this.proxyBadge.querySelector('span:not(.sc-status-dot)');
    if (enabled) {
      this.proxyBadge.classList.add('proxy-active');
      if (textSpan) textSpan.textContent = 'Proxy Active';
    } else {
      this.proxyBadge.classList.remove('proxy-active');
      if (textSpan) textSpan.textContent = 'Direct';
    }
  }

  public updateDiscordBadge(enabled: boolean): void {
    if (!this.discordBadge) return;
    const textSpan = this.discordBadge.querySelector('span:not(.sc-status-dot)');
    if (enabled) {
      this.discordBadge.classList.add('discord-active');
      if (textSpan) textSpan.textContent = 'Discord RPC';
    } else {
      this.discordBadge.classList.remove('discord-active');
      if (textSpan) textSpan.textContent = 'Discord Off';
    }
  }

  public updateAdMutedBadge(muted: boolean): void {
    if (!this.adBadge) return;
    this.adBadge.style.display = muted ? 'inline-flex' : 'none';
  }

  public updateAvailableBadge(version: string | null): void {
    if (!this.updateBadge) return;
    const textSpan = this.updateBadge.querySelector('span:not(.sc-status-dot)');
    if (version) {
      this.updateBadge.style.display = 'inline-flex';
      if (textSpan) textSpan.textContent = `Update v${version}`;
    } else {
      this.updateBadge.style.display = 'none';
    }
  }

  public setSettingsActive(active: boolean): void {
    if (!this.settingsBtn) return;
    if (active) {
      this.settingsBtn.classList.add('active');
    } else {
      this.settingsBtn.classList.remove('active');
    }
  }
}
