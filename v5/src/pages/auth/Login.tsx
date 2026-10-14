// src/pages/auth/Login.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import {
  ShieldCheck,
  AlertCircle,
  Zap,
  TrendingDown,
  Lock,
  MessageCircle,
  WifiOff,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';
import { SplashHero } from '../../components/SplashHero';
import { PharmacyBrandLoader } from '../../components/Loader';
import { getPublicLoginSettings } from '../../services/dataStorage';
import { auth } from '../../firebase';

const FEATURES = [
  { icon: TrendingDown, title: 'قارن الأسعار فوراً', desc: 'أرخص سعر وأفضل بونص بين كل المستودعات' },
  { icon: Zap, title: 'طلبية جاهزة بضغطة', desc: 'تُرسل مباشرة لواتساب مندوب المستودع' },
  { icon: RefreshCw, title: 'أسعار محدّثة يومياً', desc: 'عروض المستودعات المعتمدة أولاً بأول' },
];

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, user, initialized, loading } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('pharma_remember_me') !== 'off');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [loginWhatsApp, setLoginWhatsApp] = useState('970599999999');
  const [loginWhatsAppEnabled, setLoginWhatsAppEnabled] = useState(true);
  // حد أقصى للانتظار حتى لا يبقى المستخدم في شاشة التحميل إلى الأبد
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  const justSignedIn = useRef(false);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('pharma_remember_me', rememberMe ? 'on' : 'off');
  }, [rememberMe]);

  useEffect(() => {
    getPublicLoginSettings()
      .then((s) => {
        setLoginWhatsApp(s.loginWhatsApp);
        setLoginWhatsAppEnabled(s.loginWhatsAppEnabled);
      })
      .catch(() => {});
  }, []);

  // الحساب موجود في Firebase لكن الملف الشخصي لم يصل بعد => نعرض تحميلاً بدل صفحة الدخول
  const waitingForProfile = initialized && !user && Boolean(auth.currentUser) && !gaveUpWaiting;
  const showBootLoader = !initialized || waitingForProfile;

  useEffect(() => {
    if (!waitingForProfile) return;
    const t = setTimeout(() => setGaveUpWaiting(true), 12000);
    return () => clearTimeout(t);
  }, [waitingForProfile]);

  // التوجيه التلقائي فور جاهزية المستخدم (بعد تسجيل الدخول أو عند إعادة التحميل)
  useEffect(() => {
    if (initialized && user) {
      if (justSignedIn.current) {
        justSignedIn.current = false;
        useToastStore.getState().success(user.role === 'admin' ? 'مرحباً بك في لوحة الإدارة' : 'أهلاً بك في فارما لينك');
      }
      navigate(user.role === 'admin' ? '/admin' : '/app/home', { replace: true });
    }
  }, [initialized, user, navigate]);

  const handleGoogleAuth = async () => {
    if (isSubmitting || loading) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      justSignedIn.current = true;
      const ok = await loginWithGoogle();
      if (!ok) {
        justSignedIn.current = false;
      } else {
        setGaveUpWaiting(false);
        // إن كان الملف الشخصي جاهزاً فسيتولى الـ effect أعلاه التوجيه، وإلا تظهر شاشة التحميل
      }
    } catch (err: any) {
      justSignedIn.current = false;
      setErrorMessage('تعذر الاتصال بخدمة Google. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showBootLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-950 via-emerald-900 to-teal-900" dir="rtl">
        <PharmacyBrandLoader
          size="xl"
          text={initialized ? 'جاري فتح حسابك...' : 'جاري التحميل...'}
          subtext="لحظات ونكون جاهزين"
          className="text-white [&_p]:text-white [&_p:last-child]:text-emerald-200"
        />
      </div>
    );
  }

  const busy = loading || isSubmitting;

  return (
    <>
      {!isOnline && (
        <div className="fixed top-3 left-3 right-3 z-50 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs font-bold flex items-center gap-2">
          <WifiOff className="w-4 h-4" /> لا يوجد اتصال بالإنترنت
        </div>
      )}

      <div className="min-h-screen bg-slate-50" dir="rtl">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen">
          {/* الجانب الكبير (حاسوب فقط) */}
          <div className="hidden lg:flex lg:col-span-7 items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-12">
            <div className="max-w-xl w-full">
              <SplashHero onGoogleSignIn={handleGoogleAuth} hideActionButtons={true} />
            </div>
          </div>

          {/* بطاقة الدخول */}
          <div className="lg:col-span-5 flex flex-col">
            {/* ترويسة خضراء تظهر في الجوال */}
            <div className="relative bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700 text-white px-6 pt-12 pb-20 lg:bg-none lg:bg-transparent lg:text-slate-900 lg:pt-16 lg:pb-4 overflow-hidden">
              <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/5 lg:hidden" />
              <div className="absolute top-16 -right-8 w-28 h-28 rounded-full bg-white/5 lg:hidden" />
              <div className="relative text-center">
                <div className="mx-auto mb-4 w-20 h-20 rounded-3xl bg-white shadow-xl flex items-center justify-center lg:shadow-md lg:border lg:border-slate-100">
                  <PharmacyBrandLoader size="lg" glow={false} />
                </div>
                <h1 className="text-3xl font-black tracking-tight">فارما لينك</h1>
                <p className="mt-2 text-sm text-emerald-100 lg:text-slate-500 font-medium leading-relaxed">
                  أرخص الأسعار وأفضل البونص من مستودعاتك في مكان واحد
                </p>
              </div>
            </div>

            <div className="flex-1 px-4 sm:px-8 -mt-10 lg:mt-0 pb-8 w-full max-w-md mx-auto">
              <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-lg font-black text-slate-900">أهلاً بك 👋</h2>
                <p className="text-xs text-slate-500 mt-1 mb-5">سجّل دخولك بضغطة واحدة وابدأ المقارنة.</p>

                {errorMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{errorMessage}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={busy}
                  className="w-full py-4 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm sm:text-base transition-all flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] disabled:opacity-70 cursor-pointer"
                >
                  {busy ? (
                    <>
                      <PharmacyBrandLoader size="xs" glow={false} />
                      <span className="text-xs sm:text-sm">جاري تسجيل الدخول...</span>
                    </>
                  ) : (
                    <>
                      <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                      </span>
                      <span>المتابعة بحساب Google</span>
                      <ChevronLeft className="w-4 h-4 opacity-60" />
                    </>
                  )}
                </button>

                <label className="mt-4 flex items-center gap-2 text-xs text-slate-600 font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="accent-emerald-600 w-4 h-4"
                  />
                  البقاء مسجلاً على هذا الجهاز
                </label>

                <div className="mt-6 pt-5 border-t border-slate-100 space-y-3.5">
                  {FEATURES.map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Icon className="w-4.5 h-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-black text-slate-800 leading-tight">{title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 text-center space-y-1.5">
                <p className="text-[11px] text-slate-500 font-medium flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>نستخدم حسابك لتسجيل الدخول فقط، وخصوصيتك محفوظة.</span>
                </p>
                <p className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>مخصص للصيدليات والمستودعات المعتمدة</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loginWhatsAppEnabled && (
        <a
          href={`https://wa.me/${loginWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent('مرحباً، أحتاج مساعدة في تسجيل الدخول')}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-4 py-3 text-xs font-black shadow-lg"
        >
          <MessageCircle className="w-4 h-4" /> تواصل معنا
        </a>
      )}
    </>
  );
};
