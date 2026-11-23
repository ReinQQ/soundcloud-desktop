let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, durationMs: number = 3000): void {
  const c = getContainer();
  const toast = document.createElement('div');
  toast.className = 'toast-pill';
  toast.textContent = message;
  c.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      toast.remove();
    }, 200);
  }, durationMs);
}
