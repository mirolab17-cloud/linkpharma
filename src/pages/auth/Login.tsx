// src/pages/auth/Login.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { 
  Pill, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  X,
  AlertCircle,
  Zap,
  TrendingDown,
  FileSpreadsheet
} from 'lucide-react';
import { SplashHero } from '../../components/SplashHero';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, user, initialized, loading } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showMobileIntro, setShowMobileIntro] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // إذا كان المستخدم مسجلاً بالفعل، يتم توجيهه تلقائياً وفقاً لصلاحيته
  useEffect(() => {
    if (initialized && user) {
      if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/app/prices', { replace: true });
      }
    }
  }, [initialized, user, navigate]);

  // تسجيل الدخول المباشر والحصري عبر Google
  const handleGoogleAuth = async () => {
    if (isSubmitting || loading) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const ok = await loginWithGoogle();
      if (ok) {
        // التحقق من صلاحيات المستخدم بعد تسجيل الدخول
        const currentUser = useAuthStore.getState().user;
        if (currentUser?.role === 'admin') {
          useToastStore.getState().success('مرحباً بك في لوحة الإدارة');
          navigate('/admin', { replace: true });
        } else {
          useToastStore.getState().success('مرحباً بك في منصة الصيدلية');
          navigate('/app/prices', { replace: true });
        }
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء الاتصال بخدمة Google: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8" dir="rtl">
      {/* شبكة العرض الرئيسية */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* العمود الأول: الشرح الترويجي وحاسبة التوفير (للشاشات الكبيرة) */}
        <div className="hidden lg:block lg:col-span-7 pr-2">
          <SplashHero 
            onGoogleSignIn={handleGoogleAuth}
            hideActionButtons={true}
          />
        </div>

        {/* زر استعراض المزايا الترويجية على شاشات الهواتف */}
        <div className="lg:hidden col-span-1 text-center">
          <button
            type="button"
            onClick={() => setShowMobileIntro(true)}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md flex items-center justify-between gap-3 text-xs font-bold active:scale-98 transition"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-200 animate-spin" />
              <span>استكشف كيف توفر المنصة حتى 25% من مشتريات صيدليتك!</span>
            </div>
            <span className="text-[11px] bg-white/20 px-2.5 py-1 rounded-xl">عرض المزايا</span>
          </button>
        </div>

        {/* العمود الثاني: بطاقة الدخول الحصرية عبر حساب Google */}
        <div className="lg:col-span-5 w-full">
          <div className="bg-white py-8 px-6 sm:px-9 shadow-xl rounded-3xl border border-slate-200/90 relative overflow-hidden">
            {/* زخرفة دائرية جمالية */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-28 h-28 bg-teal-500/5 rounded-full -ml-12 -mb-12 pointer-events-none" />

            {/* أيقونة المنصة وترويسة البطاقة */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-700/20 mb-3.5">
                <Pill className="w-9 h-9 rotate-45" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                بوابة الصيدلية الموحدة
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                مقارنة أسعار الأدوية بين المستودعات وإرسال الطلبيات الذكية
              </p>
            </div>

            {/* رسالة الخطأ إن وجدت */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* هوك القيمة المضافة الجذاب للصيدلي */}
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/70 to-emerald-50/50 border border-emerald-200/90 text-emerald-950 text-xs space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 font-black text-emerald-900 text-[13px]">
                <TrendingDown className="w-4 h-4 text-[#0f9d7a] shrink-0" />
                <span>وفّر حتى 25% من تكلفة طلبيات صيدليتك فوراً</span>
              </div>
              <p className="text-[11.5px] text-slate-600 leading-relaxed">
                وصول مباشر وفوري لكافة عروض مستودعات الأدوية المعتمدة، مقارنة حية لأرخص الأسعار، وتوليد طلبياتك المجمعة عبر واتساب بضغطة زر واحدة!
              </p>
            </div>

            {/* زر الدخول الوحيد والأساسي: الدخول بحساب Google */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading || isSubmitting}
                className="w-full py-4 px-5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/90 text-slate-800 font-black text-sm sm:text-base transition-all flex items-center justify-center gap-3.5 shadow-md hover:shadow-lg active:scale-98 disabled:opacity-60 cursor-pointer"
              >
                {loading || isSubmitting ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="w-5 h-5 border-2 border-slate-300 border-t-[#0f9d7a] rounded-full animate-spin" />
                    <span>جاري تسجيل الدخول عبر Google...</span>
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
                    <span>المتابعة المباشرة باستخدام حساب Google</span>
                  </>
                )}
              </button>

              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>مقارنة حية لأسعار الأدوية والبونص بين كافة المستودعات</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>توليد طلبيات الشراء وإرسالها مباشرة لمبيعات المستودع عبر واتساب</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>دخول فوري بحساب Google وتوجيه تلقائي لصيدليتك</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نافذة المودال لعرض المزايا والشرح على الجوال */}
      {showMobileIntro && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto flex items-center justify-center">
          <div className="bg-white rounded-3xl p-5 max-w-lg w-full relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowMobileIntro(false)}
              className="absolute top-4 left-4 p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
            <SplashHero
              onGoogleSignIn={() => {
                setShowMobileIntro(false);
                handleGoogleAuth();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
