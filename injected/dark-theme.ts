export class DarkThemeManager {
  private enabled: boolean = false;

  constructor(initialEnabled: boolean) {
    this.setEnabled(initialEnabled);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.enabled) {
      document.documentElement.classList.add('sc-dark-theme');
      document.body?.classList.add('sc-dark-theme');
    } else {
      document.documentElement.classList.remove('sc-dark-theme');
      document.body?.classList.remove('sc-dark-theme');
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}
