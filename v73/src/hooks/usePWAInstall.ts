// src/hooks/usePWAInstall.ts
import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// نلتقط حدث التثبيت على مستوى الوحدة حتى لا يضيع إذا وقع قبل تركيب أي مكوّن.
let sharedPrompt: BeforeInstallPromptEvent | null = null;
let sharedInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    sharedPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    sharedInstalled = true;
    sharedPrompt = null;
    notify();
  });
}

function detectStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [, force] = useState(0);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  // يحاول فتح نافذة التثبيت الأصلية؛ إن لم تتوفر يعيد 'manual' لعرض خطوات التثبيت اليدوية.
  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (!sharedPrompt) return 'manual';
    const promptEvent = sharedPrompt;
    sharedPrompt = null;
    notify();
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      sharedInstalled = true;
      notify();
    }
    return outcome;
  }, []);

  return {
    isInstallable: !!sharedPrompt,
    isInstalled: sharedInstalled || detectStandalone(),
    isIOS,
    install,
  };
}
