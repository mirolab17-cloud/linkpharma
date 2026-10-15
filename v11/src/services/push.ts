// src/services/push.ts
import OneSignal from 'react-onesignal';
import { auth } from '../firebase';

let isPushInitialized = false;
let initPromise: Promise<void> | null = null;
let isPushUnavailable = false;

export interface SendPushPayload {
  title: string;
  message: string;
  url?: string;
  userIds?: string[];
  sendAfter?: string;
}

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission;
  isGranted: boolean;
  isDenied: boolean;
  isSubscribed: boolean;
}

/**
 * تهيئة OneSignal لمرة واحدة فقط مع guard ضد التكرار
 */
export async function initPush(): Promise<void> {
  if (isPushInitialized || isPushUnavailable) return;
  if (initPromise) return initPromise;

  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  if (!appId) {
    // إن لم يوجد App ID يُتجاهل بصمت
    return;
  }

  initPromise = (async () => {
    try {
      if (typeof window === 'undefined') return;

      await OneSignal.init({
        appId,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: 'sw.js',
        serviceWorkerParam: { scope: './' },
        notifyButton: { enable: false } as any,
      });

      isPushInitialized = true;
    } catch (err) {
      isPushUnavailable = true;
      console.warn('OneSignal initialization skipped:', err);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * ربط المستخدم بـ OneSignal ليصبح external_id هو Firebase UID
 */
export async function loginPush(uid: string): Promise<void> {
  if (!uid || isPushUnavailable) return;
  try {
    await initPush();
    await OneSignal.login(uid);
  } catch (err) {
    console.warn('OneSignal login failed:', err);
  }
}

/**
 * فك ارتباط المستخدم عند تسجيل الخروج
 */
export async function logoutPush(): Promise<void> {
  if (!isPushInitialized) return;
  try {
    await OneSignal.logout();
  } catch (err) {
    console.warn('OneSignal logout failed:', err);
  }
}

/**
 * طلب الإذن عبر OneSignal.Notifications.requestPermission() ويرجع true/false
 */
export async function enablePush(): Promise<boolean> {
  try {
    await initPush();
    const granted = await OneSignal.Notifications.requestPermission();
    if (granted) {
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch (optErr) {
        console.warn('OneSignal optIn warning:', optErr);
      }
      return true;
    }
    return false;
  } catch (err) {
    console.warn('OneSignal enablePush error:', err);
    return false;
  }
}

/**
 * التحقق من هل الإذن ممنوح وهل المستخدم مشترك
 */
export function getPushStatus(): PushStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'denied',
      isGranted: false,
      isDenied: false,
      isSubscribed: false,
    };
  }

  const nativePerm = Notification.permission;
  const isGranted = nativePerm === 'granted';
  const isDenied = nativePerm === 'denied';

  let isSubscribed = false;
  try {
    isSubscribed = Boolean(OneSignal.User?.PushSubscription?.optedIn);
  } catch {
    isSubscribed = false;
  }

  return {
    supported: true,
    permission: nativePerm,
    isGranted,
    isDenied,
    isSubscribed,
  };
}

/**
 * إرسال إشعار Push عبر Cloudflare Worker
 * الـ body: { title, message, url, audience: 'users' | 'all', externalIds, sendAfter }
 * الهيدر: Authorization: Bearer <Firebase ID token>
 */
export async function sendPush({
  title,
  message,
  url,
  userIds,
  sendAfter,
}: SendPushPayload): Promise<void> {
  try {
    const rawWorkerUrl = import.meta.env.VITE_PUSH_WORKER_URL;
    if (!rawWorkerUrl) {
      console.warn('sendPush: VITE_PUSH_WORKER_URL is not configured');
      return;
    }
    const workerUrl = rawWorkerUrl.replace(/\/+$/, '');

    let token = '';
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const hasUserIds = Array.isArray(userIds) && userIds.length > 0;
    const body: Record<string, any> = {
      title,
      message,
      audience: hasUserIds ? 'users' : 'all',
      externalIds: userIds,
    };
    if (url) {
      body.url = url;
    }
    if (sendAfter) {
      body.sendAfter = sendAfter;
    }

    const res = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('sendPush worker returned non-200 status:', res.status, errText);
    }
  } catch (err) {
    console.warn('sendPush error:', err);
  }
}
