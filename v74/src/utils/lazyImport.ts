type ModuleLoader<T> = () => Promise<T>;

const RECOVERY_KEY = 'linkpharma:chunk-recovery:v1';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /dynamically imported module|loading chunk|failed to fetch|importing a module script|module script/i.test(message);
}

async function clearStaleAppCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn('تعذر تنظيف تسجيل Service Worker القديم:', error);
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => /workbox|vite|linkpharma|precache/i.test(key)).map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('تعذر تنظيف كاش المنصة القديم:', error);
  }
}

/**
 * Loads a lazy route and recovers once when an old HTML/SW references a
 * content-hashed chunk that no longer exists after deployment.
 */
export async function importWithRecovery<T>(loader: ModuleLoader<T>): Promise<T> {
  try {
    const module = await loader();
    try {
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch (_) {
      // Private browsing may block sessionStorage; the import still succeeded.
    }
    return module;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    let alreadyRecovered = false;
    try {
      alreadyRecovered = sessionStorage.getItem(RECOVERY_KEY) === '1';
      if (!alreadyRecovered) sessionStorage.setItem(RECOVERY_KEY, '1');
    } catch (_) {
      // Continue with a normal error screen if storage is unavailable.
    }

    if (!alreadyRecovered) {
      await clearStaleAppCaches();
      const url = new URL(window.location.href);
      url.searchParams.set('_lp_refresh', String(Date.now()));
      window.location.replace(url.toString());
      // Keep React.lazy pending while the browser performs the replacement.
      return new Promise<T>(() => {});
    }

    throw error;
  }
}

export async function recoverFromChunkLoadError(): Promise<void> {
  await clearStaleAppCaches();
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch (_) {
    // Ignore unavailable storage.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_lp_refresh', String(Date.now()));
  window.location.replace(url.toString());
}
