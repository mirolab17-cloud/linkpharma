// src/pages/auth/Login.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Zap,
  TrendingDown,
  Building,
  Lock,
  Sparkles,
  MessageCircle,
  WifiOff
} from 'lucide-react';
import { SplashHero } from '../../components/SplashHero';
import { PharmacyBrandLoader } from '../../components/Loader';
import { getPublicLoginSettings } from '../../services/dataStorage';
import { auth } from '../../firebase';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, user, initialized, loading } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('pharma_remember_me') !== 'off');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [loginWhatsApp, setLoginWhatsApp] = useState('970599999999');
  const [loginWhatsAppEnabled, setLoginWhatsAppEnabled] = useState(true);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  const justSignedIn = useRef(false);

  useEffect(() => { const on=()=>setIsOnline(true), off=()=>setIsOnline(false); window.addEventListener('online',on); window.addEventListener('offline',off); return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}; }, []);
  useEffect(() => { localStorage.setItem('pharma_remember_me', rememberMe ? 'on' : 'off'); getPublicLoginSettings().then(s => { setLoginWhatsApp(s.loginWhatsApp); setLoginWhatsAppEnabled(s.loginWhatsAppEnabled); }).catch(() => {}); }, [rememberMe]);

  // الحساب موجود في Firebase لكن الملف الشخصي لم يصل بعد => شاشة تحميل بدل صفحة الدخول
  const waitingForProfile = Boolean(auth.currentUser) && !user && !gaveUpWaiting;
  const showBootLoader = !initialized || waitingForProfile;

  useEffect(() => {
    if (!waitingForProfile) return;
    const t = setTimeout(() => setGaveUpWaiting(true), 20000);
    return () => clearTimeout(t);
  }, [waitingForProfile]);

  // التوجيه التلقائي فور جاهزية المستخدم (بعد تسجيل الدخول أو عند إعادة التحميل)
  useEffect(() => {
    if (initialized && user) {
      if (justSignedIn.current) {
        justSignedIn.current = false;
        useToastStore.getState().success(user.role === 'admin' ? 'مرحباً بك في لوحة الإدارة' : 'مرحباً بك في منصة الصيدلية');
      }
      navigate(user.role === 'admin' ? '/admin' : '/app/home', { replace: true });
    }
  }, [initialized, user, navigate]);

  // تسجيل الدخول المباشر والحصري عبر Google
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
      }
    } catch (err: any) {
      justSignedIn.current = false;
      setErrorMessage('حدث خطأ أثناء الاتصال بخدمة Google: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showBootLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <PharmacyBrandLoader size="lg" text="جاري فتح حسابك..." subtext="لحظات ونكون جاهزين" />
      </div>
    );
  }

  return (
    <>
    {!isOnline && <div className="fixed top-3 left-3 right-3 z-50 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs font-bold flex items-center gap-2"><WifiOff className="w-4 h-4"/> لا يوجد اتصال بالإنترنت</div>}
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8" dir="rtl">
      {/* شبكة العرض الرئيسية */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

        {/* العمود الأول: العرض السينمائي المتحرك وحاسبة التوفير (للشاشات الكبيرة) */}
        <div className="hidden lg:block lg:col-span-7 pr-2">
          <SplashHero
            onGoogleSignIn={handleGoogleAuth}
            hideActionButtons={true}
          />
        </div>

        {/* العمود الثاني: بطاقة الدخول الحصرية عبر حساب Google */}
        <div className="lg:col-span-5 w-full">
          <div className="bg-white py-8 px-6 sm:px-9 shadow-xl rounded-3xl border border-slate-200/90 relative overflow-hidden">
            {/* زخرفة دائرية جمالية */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-28 h-28 bg-teal-500/5 rounded-full -ml-12 -mb-12 pointer-events-none" />

            {/* أيقونة المنصة الحصرية الجديدة وترويسة البطاقة */}
            <div className="text-center mb-6">
              <div className="mb-3.5 flex justify-center">
                <PharmacyBrandLoader size="lg" glow={true} />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                بوابة الصيدلية الموحدة
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                فارما لينك لتوريد الأدوية بين كافة المستودعات المعتمدة
              </p>
            </div>

            {/* رسالة الخطأ إن وجدت */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* هوك القيمة المضافة لصيدليتك */}
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/70 to-emerald-50/50 border border-emerald-200/90 text-emerald-950 text-xs space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 font-black text-emerald-900 text-[13px]">
                <TrendingDown className="w-4 h-4 text-[#0f9d7a] shrink-0" />
                <span>قارن الأسعار فوراً واكشف أفضل بونص</span>
              </div>
              <p className="text-[11.5px] text-slate-600 leading-relaxed">
                وصول مباشر وفوري لكافة عروض مستودعات الأدوية المعتمدة، مقارنة حية لأرخص الأسعار، وتوليد طلبياتك المجمعة عبر واتساب بضغطة زر واحدة.
              </p>
            </div>

            {/* زر الدخول الرئيسي: الدخول بحساب Google */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading || isSubmitting}
                className="w-full py-4 px-5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/90 text-slate-800 font-black text-sm sm:text-base transition-all flex items-center justify-center gap-3.5 shadow-md hover:shadow-lg active:scale-98 disabled:opacity-60 cursor-pointer"
              >
                {loading || isSubmitting ? (
                  <div className="flex items-center gap-2.5 text-slate-700">
                    <PharmacyBrandLoader size="xs" glow={false} />
                    <span className="text-xs sm:text-sm">جاري تسجيل الدخول عبر Google...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>المتابعة المباشرة بحساب Google</span>
                  </>
                )}
              </button>

              <label className="flex items-center gap-2 text-xs text-slate-600 font-bold"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} className="accent-emerald-600"/> تذكرني على هذا الجهاز</label>
              <p className="text-[11px] text-slate-500 text-center">نستخدم بيانات الحساب لتجهيز الطلبات فقط ونحافظ على خصوصيتك.</p>
              {/* نقاط الأمان والموثوقية */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>تحديث يومي لأسعار وبونص كافة المستودعات المعتمدة</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>توليد طلبيات الشراء وإرسالها مباشرة لواتساب مندوب المستودع</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ربط آمن ومشفر بحساب Google مع توجيه فوري لصيدليتك</span>
                </div>
              </div>
            </div>
          </div>

          {/* شريط معلومات موثوق أسفل البطاقة */}
          <div className="mt-4 text-center">
            <p className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>منصة مهنية مشفرة مخصصة للصيادلة والمستودعات الطبية المعتمدة</span>
            </p>
          </div>
        </div>

      </div>
    </div>
      {loginWhatsAppEnabled && <a href={`https://wa.me/${loginWhatsApp.replace(/\D/g, '')}?text=مرحباً، أحتاج مساعدة في تسجيل الدخول`} target="_blank" rel="noreferrer" className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-4 py-3 text-xs font-black shadow-lg"><MessageCircle className="w-4 h-4"/> مساعدة واتساب</a>}
    </>
  );
};
