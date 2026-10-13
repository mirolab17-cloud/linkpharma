// src/store/useNotificationStore.ts
import { create } from 'zustand';
import { 
  AppNotification, 
  NotificationSettings 
} from '../types';
import { 
  subscribeToNotifications, 
  subscribeToNotificationSettings,
  markNotificationAsRead as apiMarkRead,
  markAllNotificationsAsRead as apiMarkAllRead,
  deleteNotification as apiDelete,
  recordNotificationEvent,
  DEFAULT_NOTIFICATION_SETTINGS
} from '../services/dataStorage';
import { useToastStore } from './useToastStore';

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  settings: NotificationSettings;
  activeModalNotif: AppNotification | null;
  activeBannerNotif: AppNotification | null;
  isInitialized: boolean;
  init: (uid: string, role?: string) => () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  closeModal: (dontShowAgain?: boolean) => Promise<void>;
  closeBanner: () => Promise<void>;
}

// صوت خفيف عند وصول إشعار جديد في الجلسة الحية
function playChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

function getSeenIds(uid: string): string[] {
  try {
    const raw = localStorage.getItem(`seen_notifs_${uid}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addSeenId(uid: string, notifId: string): void {
  try {
    const list = getSeenIds(uid);
    if (!list.includes(notifId)) {
      list.unshift(notifId);
      const capped = list.slice(0, 200);
      localStorage.setItem(`seen_notifs_${uid}`, JSON.stringify(capped));
    }
  } catch {}
}

let activeUid: string | null = null;
let unsubNotifs: (() => void) | null = null;
let unsubSettings: (() => void) | null = null;
let sessionStartTime = 0;
let isInitialSnapshot = true;
let sessionModalsShown = 0;
let lastModalShownTimestamp = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  settings: DEFAULT_NOTIFICATION_SETTINGS,
  activeModalNotif: null,
  activeBannerNotif: null,
  isInitialized: false,

  init: (uid: string, role?: string) => {
    if (!uid) return () => {};

    // حماية ضد إعادة التسجيل المتكررة في React StrictMode لنفس المستخدم
    if (activeUid === uid && unsubNotifs) {
      return () => {};
    }

    activeUid = uid;
    sessionStartTime = Date.now();
    isInitialSnapshot = true;
    sessionModalsShown = 0;
    lastModalShownTimestamp = 0;

    // تنظيف أي اشتراك سابق
    if (unsubNotifs) unsubNotifs();
    if (unsubSettings) unsubSettings();

    // 1) استماع لإعدادات الإشعارات
    unsubSettings = subscribeToNotificationSettings((newSettings) => {
      set({ settings: newSettings });
    });

    // 2) استماع لقائمة الإشعارات
    unsubNotifs = subscribeToNotifications(uid, (list) => {
      const seenSet = new Set(getSeenIds(uid));
      const unread = list.filter((n) => !n.read).length;
      const currentSettings = get().settings;

      // عند أول snapshot لا نطلق توست، وإنما نحدث القائمة والـ unread فقط
      if (isInitialSnapshot) {
        isInitialSnapshot = false;

        // فحص النوافذ المنبثقة والبانر المستحقة للمستخدم
        checkEligibleModalAndBanner(list, currentSettings, uid);

        set({
          notifications: list,
          unreadCount: unread,
          isInitialized: true,
        });
        return;
      }

      // الإشعارات الجديدة فعلاً الواصلة أثناء الجلسة الحية
      const newItems = list.filter((n) => {
        const createdAtTime = new Date(n.createdAt).getTime();
        return createdAtTime >= sessionStartTime && !seenSet.has(n.id);
      });

      if (newItems.length > 0 && currentSettings.toast?.enabled !== false) {
        // نأخذ إشعاراً واحداً فقط كطابور
        const newest = newItems[0];
        addSeenId(uid, newest.id);
        playChime();
        useToastStore.getState().info(newest.message, newest.title);
      }

      // تحديث فحص الـ Modal والـ Banner
      checkEligibleModalAndBanner(list, currentSettings, uid);

      set({
        notifications: list,
        unreadCount: unread,
        isInitialized: true,
      });
    }, role === 'admin');

    return () => {
      if (unsubNotifs) {
        unsubNotifs();
        unsubNotifs = null;
      }
      if (unsubSettings) {
        unsubSettings();
        unsubSettings = null;
      }
      activeUid = null;
    };
  },

  markAsRead: async (id: string) => {
    if (!activeUid) return;
    await apiMarkRead(id, activeUid);
    set((state) => {
      const updated = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });
  },

  markAllAsRead: async () => {
    if (!activeUid) return;
    await apiMarkAllRead(activeUid);
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  deleteNotification: async (id: string) => {
    if (!activeUid) return;
    await apiDelete(id, activeUid, false);
    set((state) => {
      const updated = state.notifications.filter((n) => n.id !== id);
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });
  },

  closeModal: async (dontShowAgain = false) => {
    const { activeModalNotif } = get();
    if (!activeModalNotif || !activeUid) {
      set({ activeModalNotif: null });
      return;
    }

    const notifId = activeModalNotif.id;
    set({ activeModalNotif: null });

    if (dontShowAgain) {
      await recordNotificationEvent(notifId, activeUid, 'dismiss');
    } else {
      await recordNotificationEvent(notifId, activeUid, 'view');
    }
  },

  closeBanner: async () => {
    const { activeBannerNotif } = get();
    if (!activeBannerNotif || !activeUid) {
      set({ activeBannerNotif: null });
      return;
    }

    const notifId = activeBannerNotif.id;
    set({ activeBannerNotif: null });
    await recordNotificationEvent(notifId, activeUid, 'dismiss');
  },
}));

function checkEligibleModalAndBanner(
  list: AppNotification[],
  settings: NotificationSettings,
  uid: string
) {
  const store = useNotificationStore.getState();
  const now = Date.now();

  // 1) فحص الـ Banner
  if (!store.activeBannerNotif) {
    const bannerCandidate = list.find((n) => {
      if (n.dismissed) return false;
      return n.channels?.includes('banner');
    });
    if (bannerCandidate) {
      useNotificationStore.setState({ activeBannerNotif: bannerCandidate });
    }
  }

  // 2) فحص الـ Modal
  if (store.activeModalNotif) return;

  const maxPerSession = settings.modal?.maxPerSession ?? 1;
  if (sessionModalsShown >= maxPerSession) return;

  const cooldownMs = (settings.modal?.cooldownMinutes ?? 30) * 60 * 1000;
  if (lastModalShownTimestamp > 0 && now - lastModalShownTimestamp < cooldownMs) return;

  // البحث عن إشعار مؤهل من قناة modal
  const modalCandidate = list.find((n) => {
    if (n.dismissed) return false;
    if (!n.channels?.includes('modal')) return false;

    // فحص شروط التكرار
    const repeat = n.repeat;
    const shownCount = n.shownCount || 0;
    const lastShownAt = n.lastShownAt ? new Date(n.lastShownAt).getTime() : 0;

    if (repeat) {
      if (repeat.maxShows && shownCount >= repeat.maxShows) return false;

      if (repeat.mode === 'once') {
        return shownCount === 0;
      }
      if (repeat.mode === 'every_hours' && repeat.everyHours) {
        const hoursMs = repeat.everyHours * 60 * 60 * 1000;
        return now - lastShownAt >= hoursMs;
      }
      if (repeat.mode === 'daily') {
        const dayMs = 24 * 60 * 60 * 1000;
        return now - lastShownAt >= dayMs;
      }
      if (repeat.mode === 'every_session') {
        return shownCount === 0 || now - lastShownAt > 60 * 60 * 1000;
      }
      if (repeat.mode === 'until_dismissed') {
        return !n.dismissed;
      }
    }

    // الوضع الافتراضي: مرة واحدة
    return shownCount === 0;
  });

  if (modalCandidate) {
    sessionModalsShown++;
    lastModalShownTimestamp = now;
    useNotificationStore.setState({ activeModalNotif: modalCandidate });
  }
}
