export interface AdBlockerCallbacks {
  onAdMutedChanged?: (muted: boolean) => void;
}

/**
 * Strict ad network hostnames & specific ad endpoint paths.
 * Generic paths like '/ads/' or legitimate SoundCloud stream manifests are NEVER blocked.
 */
function isAdUrl(url: string | URL | Request): boolean {
  let rawStr = '';
  if (typeof url === 'string') {
    rawStr = url;
  } else if (url instanceof URL) {
    rawStr = url.href;
  } else if (typeof Request !== 'undefined' && url instanceof Request) {
    rawStr = url.url;
  }
  if (!rawStr) return false;

  try {
    const parsed = new URL(rawStr, window.location.origin);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Whitelist legitimate audio stream manifests, tracks, and media CDN endpoints
    if (
      host === 'media.soundcloud.com' ||
      host.endsWith('.media.soundcloud.com') ||
      host.endsWith('.sndcdn.com') && host !== 'wis.sndcdn.com' ||
      pathname.startsWith('/tracks') ||
      pathname.includes('/stream')
    ) {
      return false;
    }

    // 1. Dedicated SoundCloud audio-ad API endpoint
    if (host === 'api-v2.soundcloud.com' && pathname.startsWith('/audio-ad')) {
      return true;
    }

    // 2. Dedicated SoundCloud promotion host
    if (host === 'promote.soundcloud.com') {
      return true;
    }

    // 3. Known third-party ad networks
    if (
      host === 'wis.sndcdn.com' ||
      host === 'doubleclick.net' ||
      host.endsWith('.doubleclick.net') ||
      host === 'googlesyndication.com' ||
      host.endsWith('.googlesyndication.com') ||
      host === 'adswizz.com' ||
      host.endsWith('.adswizz.com')
    ) {
      return true;
    }
  } catch {
    const lower = rawStr.toLowerCase();
    if (
      lower.includes('api-v2.soundcloud.com/audio-ad') ||
      lower.includes('promote.soundcloud.com') ||
      lower.includes('wis.sndcdn.com') ||
      lower.includes('doubleclick.net') ||
      lower.includes('googlesyndication.com') ||
      lower.includes('adswizz.com')
    ) {
      return true;
    }
  }

  return false;
}

// Global flag to control network-level interception
let isAdBlockingActive = true;

// Wrap window.fetch to safely intercept dedicated audio-ad requests
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isAdBlockingActive && isAdUrl(input)) {
    const urlText = typeof input === 'string' ? input : (input as any).url || '';
    console.log('[SC-Desktop] AdBlock intercepted ad request:', urlText);
    return new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
        'X-AdBlock-Intercepted': 'true',
      },
    });
  }
  return originalFetch.apply(this, [input, init] as any);
};

// Wrap XMLHttpRequest to safely intercept dedicated ad requests
const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSend = XMLHttpRequest.prototype.send;

(XMLHttpRequest.prototype as any).open = function (
  this: XMLHttpRequest & { __is_ad_blocked?: boolean },
  method: string,
  url: string | URL,
  ...rest: any[]
) {
  if (isAdBlockingActive && isAdUrl(url)) {
    this.__is_ad_blocked = true;
    console.log('[SC-Desktop] AdBlock intercepted XHR ad request:', url.toString());
  }
  return originalXhrOpen.apply(this, [method, url, ...rest] as any);
};

(XMLHttpRequest.prototype as any).send = function (
  this: XMLHttpRequest & { __is_ad_blocked?: boolean },
  body?: Document | XMLHttpRequestBodyInit | null
) {
  if (this.__is_ad_blocked) {
    // Return empty 200 OK JSON response without touching the network
    Object.defineProperty(this, 'readyState', { value: 4, writable: true, configurable: true });
    Object.defineProperty(this, 'status', { value: 200, writable: true, configurable: true });
    Object.defineProperty(this, 'statusText', { value: 'OK', writable: true, configurable: true });
    Object.defineProperty(this, 'response', { value: '{}', writable: true, configurable: true });
    Object.defineProperty(this, 'responseText', { value: '{}', writable: true, configurable: true });

    queueMicrotask(() => {
      const readystateEvent = new Event('readystatechange');
      this.dispatchEvent(readystateEvent);
      if (typeof this.onreadystatechange === 'function') {
        this.onreadystatechange(readystateEvent);
      }
      const loadEvent = new ProgressEvent('load');
      this.dispatchEvent(loadEvent);
      if (typeof this.onload === 'function') {
        this.onload(loadEvent);
      }
      const loadEndEvent = new ProgressEvent('loadend');
      this.dispatchEvent(loadEndEvent);
      if (typeof this.onloadend === 'function') {
        this.onloadend(loadEndEvent);
      }
    });
    return;
  }
  return originalXhrSend.apply(this, arguments as any);
};

export class AdBlocker {
  private enabled: boolean = false;
  private checkInterval: number | null = null;

  constructor(initialEnabled: boolean, private callbacks?: AdBlockerCallbacks) {
    this.setEnabled(initialEnabled);
    this.startWatcher();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    isAdBlockingActive = enabled;

    if (this.enabled) {
      document.body?.classList.add('sc-adblock-enabled');
      this.dismissUpsellModals();
    } else {
      document.body?.classList.remove('sc-adblock-enabled');
    }

    if (this.callbacks?.onAdMutedChanged) {
      this.callbacks.onAdMutedChanged(false);
    }
  }

  private startWatcher(): void {
    if (this.checkInterval) {
      window.clearInterval(this.checkInterval);
    }
    // Check every 1 second to dismiss Go+ upsell modal popups if open
    this.checkInterval = window.setInterval(() => {
      if (this.enabled) {
        this.dismissUpsellModals();
      }
    }, 1000);
  }

  /**
   * Safely dismisses intrusive Go+ upsell modals and prompts without affecting audio playback.
   */
  public dismissUpsellModals(): void {
    const upsellModal = document.querySelector('.modal__upsell, .upsellBanner, .trackUpsell');
    if (upsellModal) {
      const closeBtn = upsellModal.querySelector<HTMLButtonElement>(
        'button.modal__closeButton, .modal__closeButton, button.dismiss'
      );
      if (closeBtn) {
        closeBtn.click();
      }
    }
  }
}
