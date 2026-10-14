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
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  sendPasswordResetEmail as fbResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
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
import { useNotificationStore } from './useNotificationStore';
import { clearNotificationCache } from '../services/dataStorage';
import { translateAuthError, TranslatedAuthError } from '../utils/authErrorTranslator';
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
  lastAuthError: TranslatedAuthError | null;
  
  clearAuthError: () => void;
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

/** Wait until Firebase's auth listener has published the matching profile in Zustand. */
function waitForUserProfile(uid: string, timeoutMs = 15000): Promise<UserProfile> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let timeout: ReturnType<typeof setTimeout>;

    const finish = (callback: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();
      callback(value);
    };

    const checkState = (state: AuthState) => {
      if (state.user?.uid === uid) {
        finish(resolve, state.user);
      } else if (auth.currentUser?.uid === uid && state.lastAuthError) {
        finish(reject, Object.assign(new Error(state.lastAuthError.message), {
          code: state.lastAuthError.code,
        }));
      }
    };

    timeout = setTimeout(() => {
      finish(reject, Object.assign(
        new Error('تم تسجيل الدخول إلى Google لكن تعذر تحميل ملف المستخدم من Firestore خلال المهلة المحددة.'),
        { code: 'auth/profile-timeout' },
      ));
    }, timeoutMs);

    unsubscribe = useAuthStore.subscribe((state) => checkState(state));
    checkState(useAuthStore.getState());
  });
}

let activeGoogleSignInPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  defaultTrialDays: DEFAULT_TRIAL_DAYS,
  isPasswordUser: false,
  isGoogleUser: false,
  pendingGoogleCredential: null,
  lastAuthError: null,

  clearAuthError: () => set({ lastAuthError: null }),
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

    // التحقق من نتيجة إعادة التوجيه لـ Google OAuth (signInWithRedirect) في حال العودة من مسار خارجي
    try {
      getRedirectResult(auth)
        .then((result) => {
          if (result && result.user) {
            set({ lastAuthError: null });
          }
        })
        .catch((err) => {
          console.warn('getRedirectResult warning:', err);
          const translated = translateAuthError(err);
          set({ lastAuthError: translated });
        });
    } catch (_) {}

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
        // استخدام الإعدادات الافتراضية بهدوء في حال عدم تسجيل الدخول أو تأخر نشر القواعد
      });
    } catch (e) {
      console.warn('Failed to listen to public settings:', e);
    }

    // استماع لحالة المصادقة السحابية في Firebase
    let unsubUserDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (!fbUser) {
        if (safetyTimer) clearTimeout(safetyTimer);
        logoutPush().catch(() => {});
        useNotificationStore.getState().reset();
        clearNotificationCache();
        set({ user: null, loading: false, initialized: true, isPasswordUser: false, isGoogleUser: false });
        return;
      }

      // ربط حساب المستخدم في OneSignal
      loginPush(fbUser.uid).catch(() => {});

      const isPassword = fbUser.providerData.some(p => p.providerId === 'password');
      const isGoogle = fbUser.providerData.some(p => p.providerId === 'google.com');

      // مؤقت إضافي لملف المستخدم
      const docTimeout = setTimeout(() => {
        if (get().loading) {
          console.warn('User profile fetch exceeded timeout, unlocking state');
          set({ loading: false, initialized: true });
        }
      }, 4000);

      try {
        const userDocRef = doc(db, 'users', fbUser.uid);
        let isRuntimeAdmin = false;

        // التحقق مما إذا كان المستخدم مسجلاً في مجموعة admins أو يحمل custom claims أو المشرف الأساسي
        try {
          const tokenRes = await fbUser.getIdTokenResult().catch(() => null);
          if (tokenRes?.claims?.admin === true) {
            isRuntimeAdmin = true;
          } else {
            const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid)).catch(() => null);
            if (adminSnap && adminSnap.exists()) {
              isRuntimeAdmin = true;
            } else if (fbUser.email && fbUser.email.trim().toLowerCase() === 'mirolab17@gmail.com') {
              isRuntimeAdmin = true;
            }
          }
        } catch (e) {
          console.warn('Admin check error:', e);
        }

        // استماع فوري لتغيرات ملف المستخدم (تعديل الاشتراك، انتهاء التجربة، إلخ)
        unsubUserDoc = onSnapshot(userDocRef, async (userSnap) => {
          clearTimeout(docTimeout);
          if (safetyTimer) clearTimeout(safetyTimer);

          try {
            if (userSnap.exists()) {
              const profile = userSnap.data() as UserProfile;
              // لا نعتبر الاسم الافتراضي أو الجوال غير المحلي ملفاً مكتملاً.
              profile.profileComplete = profile.role === 'admin' ? true : isProfileComplete(profile);
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

              set({ 
                user: { ...profile, uid: fbUser.uid, role: shouldBeAdmin ? 'admin' : (profile.role || 'pharmacy') }, 
                loading: false, 
                initialized: true,
                isPasswordUser: isPassword,
                isGoogleUser: isGoogle
              });
            } else {
              // إنشاء ملف Google جديد وفق سياسة التجربة التي تسمح بها قواعد Firestore.
              const now = Date.now();
              const configuredTrialDays = Number(get().defaultTrialDays);
              const activePeriodDays = Number.isFinite(configuredTrialDays) && configuredTrialDays > 0
                ? Math.min(Math.floor(configuredTrialDays), 365)
                : DEFAULT_TRIAL_DAYS;
              const expiresAtMillis = now + activePeriodDays * 24 * 60 * 60 * 1000;
              const expiresAt = new Date(expiresAtMillis).toISOString();

              const newProfile: UserProfile = {
                uid: fbUser.uid,
                name: fbUser.displayName || fbUser.email?.split('@')[0] || (isRuntimeAdmin ? 'مدير النظام' : 'صيدلي جديد'),
                email: fbUser.email || '',
                role: isRuntimeAdmin ? 'admin' : 'pharmacy',
                status: 'active',
                subscriptionStatus: 'trial',
                trialDays: activePeriodDays,
                pharmacyName: isRuntimeAdmin ? 'الإدارة المركزية' : 'صيدليتي',
                allowedSuppliers: [],
                profileComplete: isRuntimeAdmin,
                createdAt: new Date().toISOString(),
                ...(isRuntimeAdmin ? {} : {
                  subscriptionExpiresAt: expiresAt,
                  subscriptionExpiresAtMillis: expiresAtMillis,
                }),
              };

              // لا تخفِ رفض Firestore؛ يلزم حفظ الملف قبل إعلان اكتمال تسجيل الدخول.
              await setDoc(userDocRef, newProfile);

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
            set({
              loading: false,
              initialized: true,
              lastAuthError: translateAuthError(innerErr),
            });
          }
        }, (snapErr) => {
          clearTimeout(docTimeout);
          if (safetyTimer) clearTimeout(safetyTimer);
          console.error('User doc onSnapshot error:', snapErr);
          set({
            loading: false,
            initialized: true,
            lastAuthError: translateAuthError(snapErr),
          });
        });
      } catch (err: any) {
        clearTimeout(docTimeout);
        if (safetyTimer) clearTimeout(safetyTimer);
        console.error('Error in auth state changed:', err);
        set({
          user: null,
          loading: false,
          initialized: true,
          isPasswordUser: false,
          isGoogleUser: false,
          lastAuthError: translateAuthError(err),
        });
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
    set({ loading: true, lastAuthError: null });
    try {
      if (!isFirebaseConfigured) {
        const localUsers = JSON.parse(localStorage.getItem('pharma_db_users') || '[]');
        const found = localUsers.find((u: any) => u.email === email.trim());
        if (found) {
          localStorage.setItem('pharma_local_user', JSON.stringify(found));
          set({ user: found, loading: false, lastAuthError: null });
          useToastStore.getState().success(`أهلاً بك مجدداً`);
          return true;
        }
        const err = translateAuthError({ code: 'auth/user-not-found' });
        set({ lastAuthError: err, loading: false });
        useToastStore.getState().error(err.message);
        return false;
      }

      await signInWithEmailAndPassword(auth, email.trim(), pass);
      set({ lastAuthError: null, loading: false });
      useToastStore.getState().success('تم تسجيل الدخول بنجاح');
      return true;
    } catch (error: any) {
      set({ loading: false });
      const translated = translateAuthError(error);
      set({ lastAuthError: translated });
      useToastStore.getState().error(`${translated.title}: ${translated.message}`);
      return false;
    }
  },

  signupWithEmail: async (email, pass, name) => {
    set({ loading: true, lastAuthError: null });
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
        set({ user: newLocalUser, loading: false, lastAuthError: null });
        useToastStore.getState().success('أهلاً بك! تم تفعيل تجربتك المجانية بنجاح.');
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
        profileComplete: isRuntimeAdmin,
        createdAt: new Date().toISOString(),
        ...(isRuntimeAdmin ? {} : {
          subscriptionExpiresAt: expiresAt,
          subscriptionExpiresAtMillis: expiresAtMillis,
        }),
      };

      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      set({ user: newProfile, loading: false, lastAuthError: null });
      useToastStore.getState().success('أهلاً بك! تم إنشاء وتفعيل حسابك بنجاح.');
      return true;
    } catch (error: any) {
      set({ loading: false });
      const translated = translateAuthError(error);
      set({ lastAuthError: translated });
      useToastStore.getState().error(`${translated.title}: ${translated.message}`);
      return false;
    }
  },

  loginWithGoogle: async () => {
    if (activeGoogleSignInPromise) {
      return activeGoogleSignInPromise;
    }

    activeGoogleSignInPromise = (async () => {
      set({ loading: true, lastAuthError: null });
      try {
        if (!isFirebaseConfigured) {
          const err = translateAuthError({ code: 'auth/invalid-api-key', message: 'إعدادات Firebase غير مكتملة' });
          set({ lastAuthError: err });
          useToastStore.getState().error(err.message);
          return false;
        }

        // إذا كان المستخدم مسجلاً بالفعل
        if (auth.currentUser) {
          await waitForUserProfile(auth.currentUser.uid);
          set({ lastAuthError: null });
          return true;
        }

        try {
          const credential = await signInWithPopup(auth, googleProvider);
          await waitForUserProfile(credential.user.uid);
          set({ lastAuthError: null });
          return true;
        } catch (popupError: any) {
          console.warn('Google signInWithPopup error:', popupError);

          // معالجة خطأ الـ internal assertion الناتج عن race-condition في نوافذ الـ popup
          if (
            popupError?.message?.includes('Pending promise was never set') ||
            popupError?.message?.includes('INTERNAL ASSERTION FAILED')
          ) {
              console.warn('Checking auth.currentUser following popup assertion event...');
              for (let i = 0; i < 5; i++) {
                if (auth.currentUser) {
                  await waitForUserProfile(auth.currentUser.uid);
                  set({ lastAuthError: null });
                  return true;
              }
              await new Promise((r) => setTimeout(r, 200));
            }
            if (auth.currentUser) {
              await waitForUserProfile(auth.currentUser.uid);
              set({ lastAuthError: null });
              return true;
            }
          }

          // المستخدم أغلق النافذة بنفسه قبل الاختيار
          if (
            popupError?.code === 'auth/popup-closed-by-user' || 
            popupError?.code === 'auth/cancelled-popup-request'
          ) {
            const translated = translateAuthError(popupError);
            set({ lastAuthError: translated });
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
            const translated = translateAuthError(error);
            set({ lastAuthError: translated });
            useToastStore.getState().info(translated.message);
            return false;
          }
        }

        const translated = translateAuthError(error);
        set({ lastAuthError: translated });
        useToastStore.getState().error(`${translated.title}: ${translated.message}`);
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
      useNotificationStore.getState().reset();
      clearNotificationCache();
      if (isFirebaseConfigured) {
        await fbSignOut(auth);
      }
      await logoutPush();
      localStorage.removeItem('pharma_local_user');
      set({ user: null });
      useToastStore.getState().info('تم تسجيل الخروج بنجاح.');
    } catch (e) {
      console.error(e);
      await logoutPush();
      useNotificationStore.getState().reset();
      clearNotificationCache();
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
        await updateDoc(doc(db, 'users', current.uid), sanitizedData as any);
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
