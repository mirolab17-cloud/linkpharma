type ModuleLoader<T> = () => Promise<T>;

const RECOVERY_KEY = 'linkpharma:v28:chunk-recovery:v1';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /dynamically imported module|loading chunk|failed to fetch|importing a module script|module script/i.test(message);
}

async function clearStaleCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn('[v28] تعذر تنظيف Service Worker القديم:', error);
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => /workbox|vite|linkpharma|precache/i.test(key)).map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('[v28] تعذر تنظيف الكاش القديم:', error);
  }
}

export async function importWithRecovery<T>(loader: ModuleLoader<T>): Promise<T> {
  try {
    const module = await loader();
    try { sessionStorage.removeItem(RECOVERY_KEY); } catch (_) {}
    return module;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    let alreadyRecovered = false;
    try {
      alreadyRecovered = sessionStorage.getItem(RECOVERY_KEY) === '1';
      if (!alreadyRecovered) sessionStorage.setItem(RECOVERY_KEY, '1');
    } catch (_) {}

    if (!alreadyRecovered) {
      await clearStaleCaches();
      const url = new URL(window.location.href);
      url.searchParams.set('_lp_refresh', String(Date.now()));
      window.location.replace(url.toString());
      return new Promise<T>(() => {});
    }

    throw error;
  }
}

export async function recoverFromChunkLoadError(): Promise<void> {
  await clearStaleCaches();
  try { sessionStorage.removeItem(RECOVERY_KEY); } catch (_) {}
  const url = new URL(window.location.href);
  url.searchParams.set('_lp_refresh', String(Date.now()));
  window.location.replace(url.toString());
}
