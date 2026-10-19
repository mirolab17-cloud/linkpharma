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
  signOut as fbSignOut,
  sendPasswordResetEmail as fbResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  getRedirectResult,
  signInWithRedirect,
  signInWithPopup,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from '../firebase';
import { GoogleAuthProvider } from 'firebase/auth';
import { useToastStore } from './useToastStore';
import { setSystemCurrency } from '../utils/formatPrice';
import { isProfileComplete } from '../utils/profile';

// فترة التجربة الافتراضية بالأيام
export const DEFAULT_TRIAL_DAYS = 7;

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  initializationError: string | null;
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

// تلميح الجلسة: يعني أن هذا المتصفح كان مسجل دخول. طالما وُجد لا نعرض صفحة الدخول قبل حسم حالة Firebase.
const SESSION_HINT_KEY = 'pharma_session_hint_v1';
const hasSessionHint = (): boolean => {
  try { return Boolean(localStorage.getItem(SESSION_HINT_KEY)); } catch { return false; }
};
const writeSessionHint = (uid: string) => {
  try { localStorage.setItem(SESSION_HINT_KEY, uid); } catch {}
};
const clearSessionHint = () => {
  try { localStorage.removeItem(SESSION_HINT_KEY); } catch {}
};
const isGoogleRedirectPending = (): boolean => {
  try { return sessionStorage.getItem('pharma_google_redirect_pending') === '1'; } catch { return false; }
};

// أقصى مهلة تُنتظر لتسخين البيانات الأساسية قبل فتح المنصة (لا تمنع الدخول إن تعثرت الشبكة)
const BOOT_DATA_WARMUP_MS = 6000;
// أقصى مهلة لانتظار نتيجة redirect من Google
const REDIRECT_RESULT_MAX_WAIT_MS = 8000;
// مهلة سماح عند وصول إشارة "غير مسجل" مع وجود تلميح جلسة سابقة (بعض المتصفحات تُرجع null قبل استعادة الجلسة)
const SIGNED_OUT_GRACE_MS = 6000;
// بعد هذه المهلة نقبل ملف الحساب المخزن محلياً في Firestore إذا تعذر تأكيده من الخادم (وضع عدم الاتصال)
const SERVER_PROFILE_WAIT_MS = 10000;

const warmUpBootData = async (profile: UserProfile): Promise<void> => {
  if (profile.role === 'admin') return;
  try {
    const data = await import('../services/dataStorage');
    await Promise.race([
      Promise.allSettled([data.getSystemSettings(), data.getSuppliers(), data.getActiveIngredients()]),
      new Promise<void>((resolve) => setTimeout(resolve, BOOT_DATA_WARMUP_MS)),
    ]);
  } catch (e) {
    console.warn('[auth] boot data warm-up skipped:', e);
  }
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
  initializationError: null,
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
    let unsubUserDoc: (() => void) | null = null;
    let profileTimeout: ReturnType<typeof setTimeout> | null = null;
    let authGeneration = 0;
    let authStateResolved = false;
    // لا ننتظر نتيجة redirect إلا إذا كان المستخدم قد غادر فعلاً إلى Google (علامة في sessionStorage)
    const redirectPendingAtStart = isGoogleRedirectPending();
    let redirectResultResolved = !redirectPendingAtStart;
    let signedOutGraceElapsed = !hasSessionHint();
    let signedOutGraceTimer: ReturnType<typeof setTimeout> | null = null;
    let redirectWaitTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const finalizeSignedOut = () => {
      if (disposed || !authStateResolved || !redirectResultResolved || auth.currentUser) return;
      if (!signedOutGraceElapsed) return;
      authGeneration += 1;
      if (profileTimeout) clearTimeout(profileTimeout);
      if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
      clearCachedProfile();
      clearSessionHint();
      set({ user: null, loading: false, initialized: true, initializationError: null, isPasswordUser: false, isGoogleUser: false });
    };

    set({ loading: true, initialized: false, initializationError: null });

    if (redirectPendingAtStart) {
      redirectWaitTimer = setTimeout(() => { redirectResultResolved = true; finalizeSignedOut(); }, REDIRECT_RESULT_MAX_WAIT_MS);
    }

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
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.info('[auth] onAuthStateChanged ' + (fbUser ? 'uid=' + fbUser.uid : 'signed-out'));
      if (!fbUser) {
        authStateResolved = true;
        authGeneration += 1;
        if (profileTimeout) clearTimeout(profileTimeout);
        if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
        // A null callback can arrive before Google redirect/session restoration has settled.
        if (!redirectResultResolved) {
          set({ user: null, loading: true, initialized: false, initializationError: null });
          return;
        }
        // كان هذا المتصفح مسجل دخول سابقاً: ننتظر مهلة قصيرة لاستعادة الجلسة قبل إظهار صفحة الدخول
        if (!signedOutGraceElapsed) {
          set({ user: null, loading: true, initialized: false, initializationError: null });
          if (signedOutGraceTimer) clearTimeout(signedOutGraceTimer);
          signedOutGraceTimer = setTimeout(() => { signedOutGraceElapsed = true; finalizeSignedOut(); }, SIGNED_OUT_GRACE_MS);
          return;
        }
        finalizeSignedOut();
        return;
      }

      authStateResolved = true;
      if (signedOutGraceTimer) { clearTimeout(signedOutGraceTimer); signedOutGraceTimer = null; }
      // بعد رؤية مستخدم مسجل فعلياً، أي إشارة "غير مسجل" لاحقة (مثل تسجيل الخروج) حقيقية ولا تحتاج مهلة سماح
      signedOutGraceElapsed = true;
      const callbackGeneration = ++authGeneration;
      const isCurrentGeneration = () => !disposed && authGeneration === callbackGeneration;
      if (profileTimeout) clearTimeout(profileTimeout);
      if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
      set({ loading: true, initialized: false, initializationError: null });

      const isPassword = fbUser.providerData.some(p => p.providerId === 'password');
      const isGoogle = fbUser.providerData.some(p => p.providerId === 'google.com');

      // The cached profile is provisional; protected routes remain locked until Firestore confirms it.
      const cachedProfile = readCachedProfile(fbUser.uid);
      if (cachedProfile) {
        set({
          user: cachedProfile,
          loading: true,
          initialized: false,
          initializationError: null,
          isPasswordUser: isPassword,
          isGoogleUser: isGoogle,
        });
      }

      let serverProfileConfirmed = false;
      let cachedUserSnap: any = null;
      let applyUserSnap: ((snap: any) => Promise<void>) | null = null;
      profileTimeout = setTimeout(() => {
        if (!isCurrentGeneration() || !(get().loading || !get().user)) return;
        // الجلسة صحيحة لكن الخادم بطيء/غير متاح: نفتح المنصة من ملف الحساب المخزن محلياً بدل حجز المستخدم أو إظهار صفحة الدخول
        if (cachedUserSnap && cachedUserSnap.exists() && applyUserSnap) {
          console.warn('[auth] server profile unavailable; opening with locally cached profile');
          serverProfileConfirmed = true;
          void applyUserSnap(cachedUserSnap);
          return;
        }
        console.warn('User profile fetch is still pending; protected UI remains locked');
        set({ loading: true, initialized: false, initializationError: 'تعذر تأكيد ملفك من قاعدة البيانات بعد. تحقق من الاتصال ثم أعد تحميل الصفحة.' });
      }, SERVER_PROFILE_WAIT_MS);

      try {
        const userDocRef = doc(db, 'users', fbUser.uid);
        let isRuntimeAdmin = false;
        let lastUserSnap: any = null;
        let bootWarmed = false;

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
            if (!isCurrentGeneration() || (userSnap.metadata?.fromCache && !serverProfileConfirmed)) return;
            if (userSnap.exists()) {
              const profile = userSnap.data() as UserProfile;
              profile.profileComplete = profile.role === 'admin' ? true : (profile.profileComplete === true || isProfileComplete(profile));
              const shouldBeAdmin = isRuntimeAdmin || profile.role === 'admin';

              if (shouldBeAdmin && profile.role !== 'admin') {
                profile.role = 'admin';
                profile.status = 'active';
                profile.subscriptionStatus = 'active';
                await setDoc(userDocRef, profile, { merge: true }).catch(() => null);
                if (!isCurrentGeneration()) return;
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

              if (!isCurrentGeneration()) return;
              const resolvedProfile: UserProfile = { ...profile, uid: fbUser.uid, role: shouldBeAdmin ? 'admin' : (profile.role || 'pharmacy') };
              writeCachedProfile(resolvedProfile);
              writeSessionHint(fbUser.uid);
              // نبقي شاشة التحميل حتى تجهز البيانات الأساسية (بحد أقصى مهلة قصيرة) بدل فتح صفحة فارغة
              if (!bootWarmed) {
                bootWarmed = true;
                await warmUpBootData(resolvedProfile);
                if (!isCurrentGeneration()) return;
              }
              set({
                user: resolvedProfile,
                loading: false,
                initialized: true,
                initializationError: null,
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

              await setDoc(userDocRef, newProfile);
              if (!isCurrentGeneration()) return;

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
              writeSessionHint(fbUser.uid);
              set({
                user: newProfile,
                loading: false,
                initialized: true,
                initializationError: null,
                isPasswordUser: isPassword,
                isGoogleUser: isGoogle
              });
            }
          } catch (innerErr) {
            console.error('Error handling user doc snapshot:', innerErr);
            if (isCurrentGeneration()) set({ loading: true, initialized: false, initializationError: 'تعذر تحميل ملف الحساب بأمان. تحقق من الاتصال ثم أعد تحميل الصفحة.' });
          }
        };

        applyUserSnap = handleUserSnap;

        // Wait for a server-confirmed user profile before unlocking protected routes.
        unsubUserDoc = onSnapshot(userDocRef, { includeMetadataChanges: true }, (userSnap) => {
          if (!isCurrentGeneration()) return;
          if (userSnap.metadata?.fromCache) cachedUserSnap = userSnap;
          if (userSnap.metadata?.fromCache && !serverProfileConfirmed) return;
          if (!userSnap.metadata?.fromCache) serverProfileConfirmed = true;
          if (profileTimeout) clearTimeout(profileTimeout);
          set({ initializationError: null });
          lastUserSnap = userSnap;
          console.info('[auth] user doc snapshot exists=' + userSnap.exists() + ' fromCache=' + userSnap.metadata?.fromCache);
          void handleUserSnap(userSnap);
        }, async (snapErr) => {
          if (!isCurrentGeneration()) return;
          if (profileTimeout) clearTimeout(profileTimeout);
          console.error('User doc onSnapshot error:', snapErr);
          await Promise.race([adminCheck, new Promise<void>((resolve) => setTimeout(resolve, 1800))]);
          if (!isCurrentGeneration()) return;
          const code = (snapErr as any)?.code || '';
          set({ loading: true, initialized: false, initializationError: code === 'permission-denied'
            ? 'تم تسجيل الدخول، لكن Firestore رفض قراءة ملف الحساب. يلزم التحقق من قواعد Firestore.'
            : 'تم تسجيل الدخول لكن تعذر تأكيد ملف الحساب من قاعدة البيانات. تحقق من الاتصال ثم أعد تحميل الصفحة.' });
        });
      } catch (err: any) {
        if (profileTimeout) clearTimeout(profileTimeout);
        console.error('Error in auth state changed:', err);
        if (isCurrentGeneration()) set({ loading: true, initialized: false, initializationError: 'تعذر تأكيد جلسة الحساب وملفه. تحقق من الاتصال ثم أعد تحميل الصفحة.' });
      }
    });

    // بعد تركيب المستمع، نستهلك نتيجة Google redirect ونترك onAuthStateChanged
    // يتولى تحميل الملف الشخصي والصلاحيات بنفس المسار المستخدم للبريد.
    getRedirectResult(auth).then((result) => {
      let wasPending = false;
      try {
        wasPending = sessionStorage.getItem('pharma_google_redirect_pending') === '1';
        sessionStorage.removeItem('pharma_google_redirect_pending');
      } catch {}
      if (result?.user) {
        console.info('[auth] redirect returned uid=' + result.user.uid);
      } else if (wasPending && !auth.currentUser) {
        // رجع المستخدم من Google لكن بدون جلسة: غالباً المتصفح حجب تخزين نطاق Firebase (authDomain مختلف عن نطاق الموقع)
        console.warn('[auth] redirect returned without a user (authDomain=' + auth.config.authDomain + ', host=' + location.host + ')');
        useToastStore.getState().error('لم يكتمل تسجيل الدخول بعد العودة من Google. جرّب فتح الموقع من متصفح آخر، وتأكد أن النطاق مضاف في Firebase Authorized domains.');
      }
    }).catch((error: any) => {
      if (error?.code && !['auth/no-auth-event', 'auth/popup-closed-by-user'].includes(error.code)) {
        console.warn('[auth] redirect result:', error.code);
        useToastStore.getState().error('تعذر استعادة جلسة Google. حاول تسجيل الدخول مرة أخرى.');
      }
    }).finally(() => {
      if (redirectWaitTimer) { clearTimeout(redirectWaitTimer); redirectWaitTimer = null; }
      redirectResultResolved = true;
      finalizeSignedOut();
    });

    return () => {
      disposed = true;
      authGeneration += 1;
      if (profileTimeout) clearTimeout(profileTimeout);
      if (signedOutGraceTimer) clearTimeout(signedOutGraceTimer);
      if (redirectWaitTimer) clearTimeout(redirectWaitTimer);
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

        // نفس أسلوب v1 الناجح: النافذة المنبثقة أولاً مع معالجة خطأ Firebase الداخلي (race condition)
        try {
          console.info('[auth] opening Google popup');
          await signInWithPopup(auth, googleProvider);
          return await waitForLoadedUser();
        } catch (popupError: any) {
          const msg = popupError?.message || '';
          const code = popupError?.code || '';
          if (msg.includes('Pending promise was never set') || msg.includes('INTERNAL ASSERTION FAILED')) {
            console.warn('Recovered from Firebase popup internal race condition:', msg);
            for (let i = 0; i < 25; i++) {
              if (auth.currentUser) return await waitForLoadedUser();
              await new Promise((r) => setTimeout(r, 200));
            }
            return Boolean(auth.currentUser);
          }
          if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
            useToastStore.getState().info('تم إلغاء تسجيل الدخول.');
            return false;
          }
          const canFallback = code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported';
          if (!canFallback) throw popupError;
        }

        // احتياط: النافذة المنبثقة محجوبة أو غير مدعومة -> redirect
        console.info('[auth] popup unavailable, opening Google redirect');
        try { sessionStorage.setItem('pharma_google_redirect_pending', '1'); } catch {}
        await signInWithRedirect(auth, googleProvider);
        return true;
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
      clearSessionHint();
      if (isFirebaseConfigured) {
        await fbSignOut(auth);
      }
      clearCachedProfile();
      clearSessionHint();
      localStorage.removeItem('pharma_local_user');
      set({ user: null, loading: false, initialized: true, initializationError: null });
      useToastStore.getState().info('تم تسجيل الخروج بنجاح.');
    } catch (e) {
      console.error(e);
      clearCachedProfile();
      clearSessionHint();
      set({ user: null, loading: false, initialized: true });
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
    if (u.role === 'admin' || u.role === 'representative') return false;
    if (u.subscriptionStatus === 'expired') return true;
    if (u.status === 'suspended') return true;

    const expiryMillis = u.subscriptionExpiresAtMillis || (u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt).getTime() : 0);
    if (!expiryMillis) return false;
    return Date.now() > expiryMillis;
  },

  getRemainingDays: () => {
    const u = get().user;
    if (!u || u.role === 'admin' || u.role === 'representative') return 999;
    const expiryMillis = u.subscriptionExpiresAtMillis || (u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt).getTime() : 0);
    if (!expiryMillis) return 0;
    const diff = expiryMillis - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },
}));
