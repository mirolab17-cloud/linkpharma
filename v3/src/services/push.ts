// src/services/push.ts
import OneSignal from 'react-onesignal';
import { auth, db, doc, updateDoc } from '../firebase';

let isPushInitialized = false;
let initPromise: Promise<void> | null = null;

export interface SendPushPayload {
  title: string;
  message: string;
  url?: string;
  audience?: 'all' | 'users' | 'segment';
  userIds?: string[];
  externalIds?: string[];
  sendAfter?: string;
  ttl?: number;
  priority?: 'normal' | 'high' | 'urgent';
  icon?: string;
  image?: string;
}

export interface SendPushResult {
  ok: boolean;
  id?: string;
  recipients?: number;
  error?: string;
}

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission;
  isGranted: boolean;
  isDenied: boolean;
  isSubscribed: boolean;
  token?: string;
  needsReactivation?: boolean;
}

function getServiceWorkerConfig(): { serviceWorkerPath: string; serviceWorkerParam: { scope: string } } {
  if (typeof window === 'undefined') {
    return { serviceWorkerPath: 'OneSignalSDKWorker.js', serviceWorkerParam: { scope: '/' } };
  }

  const isGitHubPages =
    window.location.hostname.includes('github.io') ||
    window.location.pathname.startsWith('/linkpharma');

  if (isGitHubPages) {
    return {
      serviceWorkerPath: 'linkpharma/OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: '/linkpharma/' },
    };
  }

  return {
    serviceWorkerPath: 'OneSignalSDKWorker.js',
    serviceWorkerParam: { scope: '/' },
  };
}

/**
 * تهيئة OneSignal لمرة واحدة فقط بمسارات خدمة موحدة وبدون scope نسبي './'
 */
export async function initPush(): Promise<void> {
  if (isPushInitialized) return;
  if (initPromise) return initPromise;

  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  if (!appId) {
    return;
  }

  initPromise = (async () => {
    try {
      if (typeof window === 'undefined') return;

      const swConfig = getServiceWorkerConfig();

      await OneSignal.init({
        appId,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: swConfig.serviceWorkerPath,
        serviceWorkerParam: swConfig.serviceWorkerParam,
        notifyButton: { enable: false } as any,
      });

      isPushInitialized = true;
    } catch (err) {
      console.warn('OneSignal initialization warning:', err);
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
  if (!uid) return;
  try {
    await initPush();
    await OneSignal.login(uid);
    await syncPushTokenToFirestore(uid);
  } catch (err) {
    console.warn('OneSignal login failed:', err);
  }
}

/**
 * فك ارتباط المستخدم عند تسجيل الخروج
 */
export async function logoutPush(): Promise<void> {
  try {
    if (isPushInitialized) {
      await OneSignal.logout();
    }
  } catch (err) {
    console.warn('OneSignal logout failed:', err);
  }
}

/**
 * مزامنة حالة الاشتراك والتوكن في Firestore
 */
export async function syncPushTokenToFirestore(uid: string): Promise<void> {
  if (!uid || !db) return;
  try {
    const status = getPushStatus();
    const token = status.token || '';
    const pushEnabled = status.isSubscribed && Boolean(token);

    await updateDoc(doc(db, 'users', uid), {
      pushEnabled,
      pushToken: token ? `${token.substring(0, 16)}...` : '',
      pushUpdatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Sync push token warning:', err);
  }
}

/**
 * تفعيل الإشعارات وطلب الإذن والاشتراك
 */
export async function enablePush(uid?: string): Promise<boolean> {
  try {
    await initPush();
    const granted = await OneSignal.Notifications.requestPermission();
    if (granted) {
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch (optErr) {
        console.warn('OneSignal optIn warning:', optErr);
      }

      if (uid) {
        await syncPushTokenToFirestore(uid);
      } else if (auth.currentUser?.uid) {
        await syncPushTokenToFirestore(auth.currentUser.uid);
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
 * إعادة تفعيل الاشتراك عند فقدان التوكن
 */
export async function reactivatePush(uid?: string): Promise<boolean> {
  try {
    await initPush();
    await OneSignal.User.PushSubscription.optIn();
    const targetUid = uid || auth.currentUser?.uid;
    if (targetUid) {
      await syncPushTokenToFirestore(targetUid);
    }
    return true;
  } catch (err) {
    console.warn('Reactivate push error:', err);
    return false;
  }
}

/**
 * فحص دقيق لحالة الإذن واكتمال اشتراك OneSignal
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
  let token = '';

  try {
    const sub = OneSignal.User?.PushSubscription;
    isSubscribed = Boolean(sub?.optedIn);
    token = sub?.token || sub?.id || '';
  } catch {
    isSubscribed = false;
  }

  const needsReactivation = isGranted && (!isSubscribed || !token);

  return {
    supported: true,
    permission: nativePerm,
    isGranted,
    isDenied,
    isSubscribed: isSubscribed && Boolean(token),
    token,
    needsReactivation,
  };
}

/**
 * إرسال إشعار عبر Cloudflare Worker مع معالجة الأخطاء وإعادة المحاولة لمرة واحدة
 */
export async function sendPush(payload: SendPushPayload): Promise<SendPushResult> {
  const rawWorkerUrl = import.meta.env.VITE_PUSH_WORKER_URL;
  if (!rawWorkerUrl) {
    console.warn('sendPush: VITE_PUSH_WORKER_URL is not configured');
    return { ok: false, error: 'Worker URL not configured' };
  }

  const workerUrl = `${rawWorkerUrl.replace(/\/+$/, '')}/send`;

  let token = '';
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (tokenErr) {
      console.warn('Could not retrieve Firebase ID token:', tokenErr);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const userIds = payload.externalIds || payload.userIds;
  const hasUserIds = Array.isArray(userIds) && userIds.length > 0;

  const bodyData: Record<string, any> = {
    title: payload.title,
    message: payload.message,
    audience: payload.audience || (hasUserIds ? 'users' : 'all'),
    externalIds: userIds,
  };

  if (payload.url) bodyData.url = payload.url;
  if (payload.sendAfter) bodyData.sendAfter = payload.sendAfter;
  if (payload.ttl) bodyData.ttl = payload.ttl;
  if (payload.priority) bodyData.priority = payload.priority;
  if (payload.icon) bodyData.icon = payload.icon;
  if (payload.image) bodyData.image = payload.image;

  const executeRequest = async (): Promise<SendPushResult> => {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyData),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return {
      ok: true,
      id: data?.id,
      recipients: data?.recipients,
    };
  };

  try {
    return await executeRequest();
  } catch (err: any) {
    console.warn('First sendPush attempt failed, retrying once...', err);
    try {
      await new Promise((r) => setTimeout(r, 800));
      return await executeRequest();
    } catch (retryErr: any) {
      console.error('sendPush retry failed:', retryErr);
      return { ok: false, error: retryErr?.message || 'Network failure' };
    }
  }
}

/**
 * إلغاء إشعار مجدول عبر Cloudflare Worker
 */
export async function cancelScheduledPush(notificationId: string): Promise<boolean> {
  const rawWorkerUrl = import.meta.env.VITE_PUSH_WORKER_URL;
  if (!rawWorkerUrl || !notificationId) return false;

  const workerUrl = `${rawWorkerUrl.replace(/\/+$/, '')}/cancel/${notificationId}`;

  let token = '';
  if (auth.currentUser) {
    token = await auth.currentUser.getIdToken().catch(() => '');
  }

  try {
    const res = await fetch(workerUrl, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.ok;
  } catch (err) {
    console.error('cancelScheduledPush error:', err);
    return false;
  }
}
