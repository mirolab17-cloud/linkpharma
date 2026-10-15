// src/store/useAuthStore.ts
import { create } from 'zustand';
import { UserProfile, SubscriptionStatus } from '../types';
import { 
  auth, 
  db, 
  googleProvider,
  isFirebaseConfigured,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  sendPasswordResetEmail as fbResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  getRedirectResult,
  signInWithRedirect,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from '../firebase';
import { GoogleAuthProvider } from 'firebase/auth';
import { useToastStore } from './useToastStore';
import { setSystemCurrency } from '../utils/formatPrice';
import { loginPush, logoutPush } from '../services/push';
import { isProfileComplete } from '../utils/profile';

// فترة التجربة الافتراضية بالأيام
export const DEFAULT_TRIAL_DAYS = 7;

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  defaultTrialDays: number;
  isPasswordUser: boolean;
  isGoogleUser: boolean;
  pendingGoogleCredential: { credential: any; email: string } | null;
  
  clearPendingGoogleCredential: () => void;
  setDefaultTrialDays: (days: number) => void;
  linkGoogleWithPassword: (password: string) => Promise<boolean>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  initializeAuth: () => () => void;
  loginWithEmail: (email: string, pass: string) => Promise<boolean>;
  signupWithEmail: (email: string, pass: string, name: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<boolean>;
  isExpired: () => boolean;
  getRemainingDays: () => number;
}

let activeGoogleSignInPromise: Promise<boolean> | null = null;

const waitForLoadedUser = async (timeoutMs = 10000): Promise<boolean> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = useAuthStore.getState();
    if (state.initialized && state.user) return true;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return Boolean(useAuthStore.getState().user);
};

const PROFILE_CACHE_KEY = 'pharma_profile_cache_v7';
const readCachedProfile = (uid: string): UserProfile | null => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.uid === uid ? (parsed as UserProfile) : null;
  } catch {
    return null;
  }
};
const writeCachedProfile = (profile: UserProfile) => {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch {}
};
const clearCachedProfile = () => {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
};

const profileFallback = (fbUser: any, cached?: UserProfile | null): UserProfile => ({
  uid: fbUser.uid,
  name: cached?.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'مستخدم فارما لينك',
  email: cached?.email || fbUser.email || '',
  role: cached?.role || 'pharmacy',
  status: cached?.status || 'active',
  subscriptionStatus: cached?.subscriptionStatus || 'trial',
  trialDays: cached?.trialDays || DEFAULT_TRIAL_DAYS,
  pharmacyName: cached?.pharmacyName || 'صيدليتي',
  ownerName: cached?.ownerName,
  phone: cached?.phone,
  address: cached?.address,
  addressDetail: cached?.addressDetail,
  governorate: cached?.governorate,
  city: cached?.city,
  allowedSuppliers: cached?.allowedSuppliers || [],
  profileComplete: cached?.profileComplete === true || Boolean(cached && isProfileComplete(cached)),
  createdAt: cached?.createdAt || new Date().toISOString(),
  subscriptionExpiresAt: cached?.subscriptionExpiresAt,
  subscriptionExpiresAtMillis: cached?.subscriptionExpiresAtMillis,
});

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  defaultTrialDays: DEFAULT_TRIAL_DAYS,
  isPasswordUser: false,
  isGoogleUser: false,
  pendingGoogleCredential: null,

  clearPendingGoogleCredential: () => set({ pendingGoogleCredential: null }),
  setDefaultTrialDays: (days: number) => set({ defaultTrialDays: days }),

  initializeAuth: () => {
    // التحقق عند عدم ربط السحابة
    if (!isFirebaseConfigured) {
      const savedSettings = localStorage.getItem('pharma_db_settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed.defaultTrialDays) {
            set({ defaultTrialDays: parsed.defaultTrialDays });
          }
        } catch (_) {}
      }
      const savedUser = localStorage.getItem('pharma_local_user');
      if (savedUser) {
        try {
          set({ user: JSON.parse(savedUser), loading: false, initialized: true });
        } catch {
          set({ user: null, loading: false, initialized: true });
        }
      } else {
        set({ user: null, loading: false, initialized: true });
      }
      return () => {};
    }

    // استماع مباشر لإعدادات النظام العامة (أيام التجربة المحددة من الإدارة والعملة)
    let unsubSettings: (() => void) | null = null;
    let safetyTimer: any = null;

    // مهلة أمان قصوى: 5 ثوانٍ لضمان عدم تعليق الواجهة في حالة انقطاع الشبكة أو بطء فايربيس
    safetyTimer = setTimeout(() => {
      const state = get();
      if (!state.initialized || state.loading) {
        console.warn('Auth initialization reached 5s timeout - unlocking UI state');
        set({ loading: false, initialized: true });
      }
    }, 5000);

    try {
      unsubSettings = onSnapshot(doc(db, 'settings', 'public'), (settingsSnap) => {
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          if (typeof data.defaultTrialDays === 'number') {
            set({ defaultTrialDays: data.defaultTrialDays });
          }
          if (data.currency && typeof data.currency === 'string') {
            setSystemCurrency(data.currency);
          }
        }
      }, () => {
        // الإعدادات العامة اختيارية: نستخدم القيم الافتراضية بهدوء
      });
    } catch (e) {
      console.warn('Failed to listen to settings:', e);
    }

    // استماع لحالة المصادقة السحابية قبل استهلاك نتيجة redirect.
    // هذا الترتيب مهم على Android حتى لا تضيع إشارة تسجيل الدخول بين إعادة تحميل الصفحة.
    let unsubUserDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.info('[auth] onAuthStateChanged ' + (fbUser ? 'uid=' + fbUser.uid : 'signed-out'));
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (!fbUser) {
        if (safetyTimer) clearTimeout(safetyTimer);
        logoutPush().catch(() => {});
        clearCachedProfile();
        set({ user: null, loading: false, initialized: true, isPasswordUser: false, isGoogleUser: false });
        return;
      }

      // ربط حساب المستخدم في OneSignal
      loginPush(fbUser.uid).catch(() => {});

      const isPassword = fbUser.providerData.some(p => p.providerId === 'password');
      const isGoogle = fbUser.providerData.some(p => p.providerId === 'google.com');

      // المستخدم موجود في Firebase Auth: لم يعد المؤقت الأمني الأول مطلوباً
      if (safetyTimer) clearTimeout(safetyTimer);

      // استعادة فورية للملف الشخصي المحفوظ محلياً (دخول لحظي عند إعادة التحميل)،
      // ثم يتولى الاستماع المباشر لـ Firestore تحديثه
      const cachedProfile = readCachedProfile(fbUser.uid);
      if (cachedProfile) {
        set({
          user: cachedProfile,
          loading: false,
          initialized: true,
          isPasswordUser: isPassword,
          isGoogleUser: isGoogle,
        });
      }

      // مؤقت أخير لملف المستخدم (يبقى المستخدم في شاشة التحميل ولا يُعاد لصفحة الدخول قبل ذلك)
      const docTimeout = setTimeout(() => {
        if (get().loading || !get().user) {
          console.warn('User profile fetch exceeded timeout, unlocking state');
          set({ loading: false, initialized: true });
        }
      }, 10000);

      try {
        const userDocRef = doc(db, 'users', fbUser.uid);
        let isRuntimeAdmin = false;
        let lastUserSnap: any = null;

        // فحص صلاحية المشرف يعمل في الخلفية ولا يؤخر الدخول (كان سبب التأخير 15 ثانية)
        const adminCheck: Promise<void> = Promise.all([
          getDoc(doc(db, 'admins', fbUser.uid)).catch(() => null),
          getDoc(doc(db, 'settings', 'system')).catch(() => null),
        ]).then(([adminSnap, settingsSnap]) => {
          let found = false;
          if (adminSnap && adminSnap.exists()) {
            found = true;
          }
          if (settingsSnap && settingsSnap.exists()) {
            const adminEmails: string[] = settingsSnap.data().adminEmails || [];
            if (fbUser.email && adminEmails.map((e) => e.trim().toLowerCase()).includes(fbUser.email.trim().toLowerCase())) {
              found = true;
            }
          }
          if (found && !isRuntimeAdmin) {
            isRuntimeAdmin = true;
            // إعادة تطبيق آخر نسخة من ملف المستخدم لترقية الصلاحية فوراً
            if (lastUserSnap && lastUserSnap.exists()) {
              void handleUserSnap(lastUserSnap);
            }
          }
        }).catch((e) => {
          console.warn('Admin check error:', e);
        });

        const handleUserSnap = async (userSnap: any) => {
          try {
            if (userSnap.exists()) {
              const profile = userSnap.data() as UserProfile;
              profile.profileComplete = profile.role === 'admin' ? true : (profile.profileComplete === true || isProfileComplete(profile));
              const shouldBeAdmin = isRuntimeAdmin || profile.role === 'admin';

              if (shouldBeAdmin && profile.role !== 'admin') {
                profile.role = 'admin';
                profile.status = 'active';
                profile.subscriptionStatus = 'active';
                await setDoc(userDocRef, profile, { merge: true }).catch(() => null);
              }

              if (shouldBeAdmin) {
                try {
                  await setDoc(doc(db, 'admins', fbUser.uid), {
                    uid: fbUser.uid,
                    email: fbUser.email || '',
                    addedAt: new Date().toISOString()
                  }, { merge: true });
                } catch (adminErr) {
                  console.warn('Failed to register in admins collection:', adminErr);
                }
              }

              writeCachedProfile({ ...profile, uid: fbUser.uid, role: shouldBeAdmin ? 'admin' : (profile.role || 'pharmacy') });
              set({ 
                user: { ...profile, uid: fbUser.uid, role: shouldBeAdmin ? 'admin' : (profile.role || 'pharmacy') }, 
                loading: false, 
                initialized: true,
                isPasswordUser: isPassword,
                isGoogleUser: isGoogle
              });
            } else {
              // مستخدم جديد يسجل لأول مرة عبر Google -> ننتظر فحص المشرف بحد أقصى 3 ثوانٍ فقط
              await Promise.race([adminCheck, new Promise<void>((r) => setTimeout(r, 3000))]);
              const now = Date.now();
              const activePeriodDays = 365;
              const expiresAtMillis = now + activePeriodDays * 24 * 60 * 60 * 1000;
              const expiresAt = new Date(expiresAtMillis).toISOString();

              const newProfile: UserProfile = {
                uid: fbUser.uid,
                name: fbUser.displayName || fbUser.email?.split('@')[0] || (isRuntimeAdmin ? 'مدير النظام' : 'صيدلي جديد'),
                email: fbUser.email || '',
                role: isRuntimeAdmin ? 'admin' : 'pharmacy',
                status: 'active', // تفعيل فوري ومباشر
                subscriptionStatus: 'active', // تفعيل مباشر كحساب نشط بدون قيود
                trialDays: activePeriodDays,
                pharmacyName: isRuntimeAdmin ? 'الإدارة المركزية' : 'صيدليتي',
                allowedSuppliers: [],
                profileComplete: false,
                createdAt: new Date().toISOString(),
                ...(isRuntimeAdmin ? {} : {
                  subscriptionExpiresAt: expiresAt,
                  subscriptionExpiresAtMillis: expiresAtMillis,
                }),
              };

              await setDoc(userDocRef, newProfile).catch(() => null);

              if (isRuntimeAdmin) {
                try {
                  await setDoc(doc(db, 'admins', fbUser.uid), {
                    uid: fbUser.uid,
                    email: fbUser.email || '',
                    addedAt: new Date().toISOString()
                  }, { merge: true });
                } catch (adminErr) {
                  console.warn('Failed to register in admins collection:', adminErr);
                }
              }

              writeCachedProfile(newProfile);
              set({ 
                user: newProfile, 
                loading: false, 
                initialized: true,
                isPasswordUser: isPassword,
                isGoogleUser: isGoogle
              });
            }
          } catch (innerErr) {
            console.error('Error handling user doc snapshot:', innerErr);
            const fallback = profileFallback(fbUser, readCachedProfile(fbUser.uid));
            writeCachedProfile(fallback);
            set({ user: fallback, loading: false, initialized: true, isPasswordUser: isPassword, isGoogleUser: isGoogle });
          }
        };

        // استماع فوري لتغيرات ملف المستخدم (يعرض النسخة المخزنة محلياً فوراً عند إعادة التحميل)
        unsubUserDoc = onSnapshot(userDocRef, (userSnap) => {
          clearTimeout(docTimeout);
          lastUserSnap = userSnap;
          console.info('[auth] user doc snapshot exists=' + userSnap.exists() + ' fromCache=' + userSnap.metadata?.fromCache);
          void handleUserSnap(userSnap);
        }, async (snapErr) => {
          clearTimeout(docTimeout);
          if (safetyTimer) clearTimeout(safetyTimer);
          console.error('User doc onSnapshot error:', snapErr);
          // ننتظر فحص المدير القصير فقط، ولا نعيد المستخدم إلى الدخول بسبب خطأ قراءة مؤقت.
          await Promise.race([adminCheck, new Promise<void>((resolve) => setTimeout(resolve, 1800))]);
          const cached = get().user || readCachedProfile(fbUser.uid);
          const fallback = profileFallback(fbUser, cached);
          if (isRuntimeAdmin) {
            fallback.role = 'admin';
            fallback.status = 'active';
            fallback.subscriptionStatus = 'active';
            fallback.profileComplete = true;
          }
          writeCachedProfile(fallback);
          set({ user: fallback, loading: false, initialized: true, isPasswordUser: isPassword, isGoogleUser: isGoogle });
          // لا نترك المستخدم عالقاً في صفحة الدخول بصمت: نوضح السبب
            const code = (snapErr as any)?.code || '';
            useToastStore.getState().error(
              code === 'permission-denied'
                ? 'تم تسجيل الدخول لكن Firestore رفض قراءة ملفك (permission-denied). يجب نشر قواعد firestore.rules الحديثة من لوحة Firebase.'
                : 'تم تسجيل الدخول لكن تعذر تحديث ملفك الشخصي الآن. ستستمر الجلسة ويمكن إعادة المحاولة لاحقاً.'
            );
        });
      } catch (err: any) {
        clearTimeout(docTimeout);
        if (safetyTimer) clearTimeout(safetyTimer);
        console.error('Error in auth state changed:', err);
        const fallback = readCachedProfile(fbUser.uid) || profileFallback(fbUser);
        writeCachedProfile(fallback);
        set({ user: fallback, loading: false, initialized: true, isPasswordUser: isPassword, isGoogleUser: isGoogle });
      }
    });

    // بعد تركيب المستمع، نستهلك نتيجة Google redirect ونترك onAuthStateChanged
    // يتولى تحميل الملف الشخصي والصلاحيات بنفس المسار المستخدم للبريد.
    getRedirectResult(auth).then((result) => {
      if (result?.user) console.info('[auth] redirect returned uid=' + result.user.uid);
    }).catch((error: any) => {
      if (error?.code && !['auth/no-auth-event', 'auth/popup-closed-by-user'].includes(error.code)) {
        console.warn('[auth] redirect result:', error.code);
        useToastStore.getState().error('تعذر استعادة جلسة Google. حاول تسجيل الدخول مرة أخرى.');
      }
    });

    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      if (unsubSettings) unsubSettings();
      if (unsubUserDoc) unsubUserDoc();
      unsubscribe();
    };
  },

  loginWithEmail: async (email, pass) => {
    set({ loading: true });
    try {
      if (!isFirebaseConfigured) {
        const localUsers = JSON.parse(localStorage.getItem('pharma_db_users') || '[]');
        const found = localUsers.find((u: any) => u.email === email);
        if (found) {
          localStorage.setItem('pharma_local_user', JSON.stringify(found));
          set({ user: found, loading: false });
          useToastStore.getState().success(`أهلاً بك مجدداً`);
          return true;
        }
        useToastStore.getState().error('البريد الإلكتروني غير مسجل.');
        set({ loading: false });
        return false;
      }

      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      useToastStore.getState().success('تم تسجيل الدخول بنجاح');
      return true;
    } catch (error: any) {
      set({ loading: false });
      let msg = 'فشل تسجيل الدخول. تأكد من صحة البريد وكلمة المرور.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'تم حظر المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. انتظر قليلاً.';
      }
      useToastStore.getState().error(msg);
      return false;
    }
  },

  signupWithEmail: async (email, pass, name) => {
    set({ loading: true });
    try {
      const now = Date.now();
      const expiresAtMillis = now + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(expiresAtMillis).toISOString();

      if (!isFirebaseConfigured) {
        const newLocalUser: UserProfile = {
          uid: 'user_' + Date.now(),
          name: name.trim() || 'صيدلي جديد',
          email: email.trim(),
          role: 'pharmacy',
          status: 'active', // تفعيل فوري
          subscriptionStatus: 'trial',
          subscriptionExpiresAt: expiresAt,
          subscriptionExpiresAtMillis: expiresAtMillis,
          trialDays: DEFAULT_TRIAL_DAYS,
          pharmacyName: 'صيدليتي',
          allowedSuppliers: [],
          profileComplete: false,
          createdAt: new Date().toISOString(),
        };

        const existingUsers = JSON.parse(localStorage.getItem('pharma_db_users') || '[]');
        existingUsers.push(newLocalUser);
        localStorage.setItem('pharma_db_users', JSON.stringify(existingUsers));
        localStorage.setItem('pharma_local_user', JSON.stringify(newLocalUser));
        set({ user: newLocalUser, loading: false });
        useToastStore.getState().success('أهلاً بك! تم تفعيل تجربتك المجانية لمدة 7 أيام بنجاح.');
        return true;
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      let isRuntimeAdmin = false;
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'system')).catch(() => null);
        if (settingsSnap && settingsSnap.exists()) {
          const adminEmails: string[] = settingsSnap.data().adminEmails || [];
          if (adminEmails.map((e) => e.trim().toLowerCase()).includes(email.trim().toLowerCase())) {
            isRuntimeAdmin = true;
          }
        }
      } catch (_) {}

      const newProfile: UserProfile = {
        uid: cred.user.uid,
        name: name.trim() || (isRuntimeAdmin ? 'مدير النظام' : 'صيدلي جديد'),
        email: email.trim(),
        role: isRuntimeAdmin ? 'admin' : 'pharmacy',
        status: 'active', // تفعيل فوري ومباشر
        subscriptionStatus: isRuntimeAdmin ? 'active' : 'trial',
        trialDays: isRuntimeAdmin ? 0 : DEFAULT_TRIAL_DAYS,
        pharmacyName: isRuntimeAdmin ? 'الإدارة المركزية' : 'صيدليتي',
        allowedSuppliers: [],
        profileComplete: false,
        createdAt: new Date().toISOString(),
        ...(isRuntimeAdmin ? {} : {
          subscriptionExpiresAt: expiresAt,
          subscriptionExpiresAtMillis: expiresAtMillis,
        }),
      };

      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      set({ user: newProfile, loading: false });
      useToastStore.getState().success('أهلاً بك! تم تفعيل تجربتك المجانية لمدة 7 أيام بنجاح.');
      return true;
    } catch (error: any) {
      set({ loading: false });
      let msg = 'تعذر إنشاء الحساب.';
      if (error.code === 'auth/email-already-in-use') {
        msg = 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'كلمة المرور ضعيفة جداً. استخدم 6 خانات على الأقل.';
      }
      useToastStore.getState().error(msg);
      return false;
    }
  },

  loginWithGoogle: async () => {
    if (activeGoogleSignInPromise) {
      return activeGoogleSignInPromise;
    }

    activeGoogleSignInPromise = (async () => {
      set({ loading: true });
      try {
        if (!isFirebaseConfigured) {
          useToastStore.getState().error('يرجى التحقق من إعدادات الاتصال بـ Firebase.');
          return false;
        }

        // إذا كان المستخدم مسجلاً بالفعل
        if (auth.currentUser) {
          return await waitForLoadedUser();
        }

        const isMobile = typeof window !== 'undefined' && (window.matchMedia('(max-width: 768px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
        try {
          console.info('[auth] opening Google popup' + (isMobile ? ' on mobile' : ''));
          const cred = await signInWithPopup(auth, googleProvider);
          console.info('[auth] popup returned uid=' + cred.user.uid);
          const loaded = await waitForLoadedUser(12000);
          return loaded || Boolean(auth.currentUser);
        } catch (popupError: any) {
          // معالجة خطأ الـ internal assertion الناتج عن race-condition في نوافذ الـ popup
          if (
            popupError?.message?.includes('Pending promise was never set') ||
            popupError?.message?.includes('INTERNAL ASSERTION FAILED')
          ) {
            console.warn('Recovered from Firebase popup internal race condition:', popupError.message);
            // إعطاء مهلة قصيرة لاكتمال ربط الحساب بواسطة onAuthStateChanged
            for (let i = 0; i < 5; i++) {
              if (auth.currentUser) {
                return true;
              }
              await new Promise((r) => setTimeout(r, 200));
            }
            return await waitForLoadedUser();
          }

          if (
            popupError?.code === 'auth/popup-blocked' ||
            popupError?.code === 'auth/operation-not-supported-in-this-environment' ||
            (isMobile && popupError?.code === 'auth/popup-closed-by-user')
          ) {
            console.info('[auth] popup unavailable; falling back to Google redirect');
            await signInWithRedirect(auth, googleProvider);
            return true;
          }

          if (popupError?.code === 'auth/cancelled-popup-request' || popupError?.code === 'auth/popup-closed-by-user') {
            return false;
          }

          throw popupError;
        }
      } catch (error: any) {
        if (error.code === 'auth/account-exists-with-different-credential') {
          const email = error.customData?.email || error.email;
          const credential = GoogleAuthProvider.credentialFromError(error);
          if (credential && email) {
            set({
              pendingGoogleCredential: {
                credential,
                email,
              },
            });
            useToastStore.getState().info('هذا البريد مسجل مسبقاً بكلمة مرور. أدخل كلمة المرور لربط حساب Google تلقائياً.');
            return false;
          }
        }
        if (
          error.code === 'auth/popup-closed-by-user' || 
          error.code === 'auth/cancelled-popup-request' ||
          error?.message?.includes('Pending promise was never set') ||
          error?.message?.includes('INTERNAL ASSERTION FAILED')
        ) {
          return await waitForLoadedUser();
        }
        useToastStore.getState().error('تعذر تسجيل الدخول عبر Google: ' + (error.message || ''));
        return false;
      } finally {
        set({ loading: false });
        activeGoogleSignInPromise = null;
      }
    })();

    return activeGoogleSignInPromise;
  },

  linkGoogleWithPassword: async (password: string) => {
    const pending = get().pendingGoogleCredential;
    if (!pending) return false;
    set({ loading: true });
    try {
      const userCred = await signInWithEmailAndPassword(auth, pending.email, password);
      await linkWithCredential(userCred.user, pending.credential);
      set({ pendingGoogleCredential: null, loading: false });
      useToastStore.getState().success('تم ربط حساب Google بحسابك بنجاح! يمكنك الآن تسجيل الدخول بكلا الطريقتين.');
      return true;
    } catch (err: any) {
      set({ loading: false });
      let msg = 'تعذر ربط الحساب.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'كلمة المرور غير صحيحة. يرجى التأكد والمحاولة مرة أخرى.';
      }
      useToastStore.getState().error(msg);
      return false;
    }
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    if (!isFirebaseConfigured) {
      useToastStore.getState().success('تم تغيير كلمة المرور بنجاح (محلياً).');
      return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      return { success: false, message: 'المستخدم غير مسجل الدخول' };
    }

    try {
      // 1. إعادة التحقق من كلمة المرور الحالية
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
    } catch (reauthErr: any) {
      if (reauthErr.code === 'auth/wrong-password' || reauthErr.code === 'auth/invalid-credential') {
        return { success: false, message: 'كلمة المرور الحالية غير صحيحة.' };
      }
      return { success: false, message: 'تعذر التحقق من كلمة المرور الحالية: ' + (reauthErr.message || '') };
    }

    try {
      // 2. تحديث كلمة المرور
      await updatePassword(currentUser, newPassword);
      useToastStore.getState().success('تم تحديث كلمة المرور بنجاح!');
      return { success: true, message: 'تم تحديث كلمة المرور بنجاح!' };
    } catch (upErr: any) {
      if (upErr.code === 'auth/weak-password') {
        return { success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' };
      }
      return { success: false, message: 'تعذر تحديث كلمة المرور: ' + (upErr.message || '') };
    }
  },

  resetPassword: async (email) => {
    try {
      if (!isFirebaseConfigured) {
        useToastStore.getState().success('تم إرسال رابط استعادة كلمة المرور إلى بريدك.');
        return true;
      }
      await fbResetEmail(auth, email.trim());
      useToastStore.getState().success('تم إرسال رابط استعادة كلمة المرور إلى بريدك.');
      return true;
    } catch {
      useToastStore.getState().error('تعذر إرسال الرابط. تأكد من صحة البريد المسجل.');
      return false;
    }
  },

  logout: async () => {
    try {
      if (isFirebaseConfigured) {
        await fbSignOut(auth);
      }
      await logoutPush();
      clearCachedProfile();
      localStorage.removeItem('pharma_local_user');
      set({ user: null });
      useToastStore.getState().info('تم تسجيل الخروج بنجاح.');
    } catch (e) {
      console.error(e);
      await logoutPush();
      set({ user: null });
    }
  },

  updateUserProfile: async (data) => {
    const current = get().user;
    if (!current) return false;

    // منع تعديل الحقول الحساسة من جهة العميل
    const sanitizedData = { ...data };
    delete (sanitizedData as any).role;
    delete (sanitizedData as any).status;
    delete (sanitizedData as any).subscriptionStatus;
    delete (sanitizedData as any).subscriptionExpiresAt;
    delete (sanitizedData as any).subscriptionExpiresAtMillis;
    delete (sanitizedData as any).allowedSuppliers;

    try {
      const updated = { ...current, ...sanitizedData };
      if (isFirebaseConfigured) {
        try {
          await updateDoc(doc(db, 'users', current.uid), sanitizedData as any);
        } catch (updateError: any) {
          // الحسابات القديمة أو التي فشل إنشاؤها أول مرة تحتاج دمجاً كاملاً بعد السماح بها في القواعد.
          await setDoc(doc(db, 'users', current.uid), updated, { merge: true });
        }
      } else {
        localStorage.setItem('pharma_local_user', JSON.stringify(updated));
      }
      set({ user: updated });
      useToastStore.getState().success('تم حفظ بيانات الملف بنجاح.');
      return true;
    } catch (err: any) {
      useToastStore.getState().error('حدث خطأ أثناء حفظ الملف: ' + err.message);
      return false;
    }
  },

  isExpired: () => {
    const u = get().user;
    if (!u) return false;
    if (u.role === 'admin') return false;
    if (u.subscriptionStatus === 'expired') return true;
    if (u.status === 'suspended') return true;

    const expiryMillis = u.subscriptionExpiresAtMillis || (u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt).getTime() : 0);
    if (!expiryMillis) return false;
    return Date.now() > expiryMillis;
  },

  getRemainingDays: () => {
    const u = get().user;
    if (!u || u.role === 'admin') return 999;
    const expiryMillis = u.subscriptionExpiresAtMillis || (u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt).getTime() : 0);
    if (!expiryMillis) return 0;
    const diff = expiryMillis - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },
}));
