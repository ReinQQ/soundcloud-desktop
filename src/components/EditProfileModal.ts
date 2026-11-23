import { scUpdateProfile, scUploadProfileImage } from '../ipc.ts';
import { toHighResArtwork } from '../player/AudioEngine.ts';
import { showToast } from './Toast.ts';
import type { User } from '../types.ts';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export class EditProfileModal {
  private element: HTMLElement;
  private user: User | null = null;
  private pendingAvatarDataUrl: string | null = null;
  private pendingBannerDataUrl: string | null = null;
  private onUpdated: () => void;

  constructor(onUpdated: () => void) {
    this.onUpdated = onUpdated;
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.element.id = 'edit-profile-backdrop';

    this.element.innerHTML = `
      <div class="settings-modal-card" style="width: 500px;">
        <div class="modal-header">
          <span class="modal-title">Edit Profile</span>
          <button class="titlebar-btn close-btn" id="ep-btn-close">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body" id="ep-modal-body"></div>
        <div class="modal-footer">
          <button class="btn-secondary" id="ep-btn-cancel">Cancel</button>
          <button class="btn-primary" id="ep-btn-save">Save Changes</button>
        </div>
      </div>
    `;

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
    this.element.querySelector('#ep-btn-close')?.addEventListener('click', () => this.close());
    this.element.querySelector('#ep-btn-cancel')?.addEventListener('click', () => this.close());
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public open(user: User, triggerPicker?: 'avatar' | 'banner'): void {
    this.user = user;
    this.pendingAvatarDataUrl = null;
    this.pendingBannerDataUrl = null;
    this.render();
    this.element.classList.add('open');

    if (triggerPicker === 'avatar') {
      setTimeout(() => this.element.querySelector<HTMLInputElement>('#ep-avatar-file')?.click(), 60);
    } else if (triggerPicker === 'banner') {
      setTimeout(() => this.element.querySelector<HTMLInputElement>('#ep-banner-file')?.click(), 60);
    }
  }

  public close(): void {
    this.element.classList.remove('open');
  }

  private render(): void {
    const body = this.element.querySelector('#ep-modal-body');
    if (!body || !this.user) return;

    const avatarUrl =
      this.pendingAvatarDataUrl ||
      toHighResArtwork(this.user.avatar_url) ||
      'https://a1.sndcdn.com/images/default_avatar_large.png';
    const bannerUrl =
      this.pendingBannerDataUrl ||
      this.user.visuals?.visuals?.[0]?.visual_url ||
      '';

    body.innerHTML = `
      <div class="ep-images-section">
        <div class="ep-banner-preview" id="ep-banner-preview" style="${bannerUrl ? `background-image: url('${bannerUrl}')` : ''}">
          <label class="ep-image-pick-badge" for="ep-banner-file">Change Banner</label>
          <input type="file" id="ep-banner-file" accept="image/png,image/jpeg,image/webp" style="display: none;" />
        </div>
        <div class="ep-avatar-preview-wrap">
          <img src="${avatarUrl}" alt="Avatar" id="ep-avatar-img" class="ep-avatar-preview" />
          <label class="ep-avatar-pick-btn" for="ep-avatar-file" title="Change Avatar">Change</label>
          <input type="file" id="ep-avatar-file" accept="image/png,image/jpeg,image/webp" style="display: none;" />
        </div>
      </div>

      <div class="settings-group">
        <span class="settings-group-title">Display Name</span>
        <input type="text" class="settings-input" id="ep-username" value="${(this.user.username || '').replace(/"/g, '&quot;')}" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="settings-group">
          <span class="settings-group-title">City</span>
          <input type="text" class="settings-input" id="ep-city" value="${(this.user.city || '').replace(/"/g, '&quot;')}" placeholder="City" />
        </div>
        <div class="settings-group">
          <span class="settings-group-title">Country</span>
          <input type="text" class="settings-input" id="ep-country" value="${(this.user.country || this.user.country_code || '').replace(/"/g, '&quot;')}" placeholder="Country" />
        </div>
      </div>

      <div class="settings-group">
        <span class="settings-group-title">Bio</span>
        <textarea class="settings-input ep-bio-textarea" id="ep-description" rows="4" placeholder="Tell listeners about yourself...">${this.user.description || ''}</textarea>
      </div>
    `;

    const avatarInput = body.querySelector<HTMLInputElement>('#ep-avatar-file');
    avatarInput?.addEventListener('change', async () => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        this.pendingAvatarDataUrl = dataUrl;
        const img = body.querySelector<HTMLImageElement>('#ep-avatar-img');
        if (img) img.src = dataUrl;
      } catch (err) {
        showToast(String(err));
      }
    });

    const bannerInput = body.querySelector<HTMLInputElement>('#ep-banner-file');
    bannerInput?.addEventListener('change', async () => {
      const file = bannerInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        this.pendingBannerDataUrl = dataUrl;
        const preview = body.querySelector<HTMLElement>('#ep-banner-preview');
        if (preview) preview.style.backgroundImage = `url('${dataUrl}')`;
      } catch (err) {
        showToast(String(err));
      }
    });

    const saveBtn = this.element.querySelector<HTMLButtonElement>('#ep-btn-save');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!this.user) return;
        const username = body.querySelector<HTMLInputElement>('#ep-username')?.value.trim() || '';
        const city = body.querySelector<HTMLInputElement>('#ep-city')?.value.trim() ?? '';
        const country = body.querySelector<HTMLInputElement>('#ep-country')?.value.trim() ?? '';
        const description = body.querySelector<HTMLTextAreaElement>('#ep-description')?.value ?? '';

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
          if (this.pendingAvatarDataUrl) {
            await scUploadProfileImage('avatar', this.pendingAvatarDataUrl);
          }
          if (this.pendingBannerDataUrl) {
            await scUploadProfileImage('banner', this.pendingBannerDataUrl);
          }

          await scUpdateProfile({
            username: username || undefined,
            city,
            country,
            description,
          });

          showToast('Profile updated');
          this.close();
          this.onUpdated();
        } catch (err) {
          showToast(`Failed to update profile: ${String(err)}`);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      };
    }
  }
}
