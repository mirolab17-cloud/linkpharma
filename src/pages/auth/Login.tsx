// src/pages/auth/Login.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  User,
  Sparkles,
  ArrowRight,
  Send,
  MessageCircle,
  WifiOff
} from 'lucide-react';
import { SplashHero } from '../../components/SplashHero';
import { PharmacyBrandLoader } from '../../components/Loader';
import { AuthErrorCard } from '../../components/AuthErrorCard';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { 
    loginWithGoogle, 
    loginWithEmail, 
    signupWithEmail, 
    resetPassword,
    lastAuthError, 
    clearAuthError,
    user, 
    initialized, 
    loading 
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'google' | 'email' | 'register'>('google');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('pharma_remember_me') !== 'off');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // حقول تسجيل الدخول بالبريد
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // حقول إنشاء حساب جديد
  const [registerName, setRegisterName] = useState('');
  const [registerPharmacyName, setRegisterPharmacyName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  // نافذة استعادة كلمة المرور
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmailInput, setResetEmailInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  useEffect(() => {
    localStorage.setItem('pharma_remember_me', rememberMe ? 'on' : 'off');
  }, [rememberMe]);

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

  // مسح الأخطاء السابقة عند تبديل التبويب
  const handleTabChange = (tab: 'google' | 'email' | 'register') => {
    setActiveTab(tab);
    clearAuthError();
  };

  // 1. تسجيل الدخول عبر Google
  const handleGoogleAuth = async () => {
    if (isSubmitting || loading) return;
    clearAuthError();
    setIsSubmitting(true);
    try {
      const ok = await loginWithGoogle();
      if (ok) {
        const currentUser = useAuthStore.getState().user;
        if (currentUser?.role === 'admin') {
          useToastStore.getState().success('مرحباً بك في لوحة الإدارة');
        } else {
          useToastStore.getState().success('مرحباً بك في منصة الصيدلية');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. تسجيل الدخول بالبريد الإلكتروني وكلمة المرور
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || loading) return;
    if (!email.trim() || !password) {
      useToastStore.getState().warning('يرجى ملء حقلي البريد وكلمة المرور');
      return;
    }

    clearAuthError();
    setIsSubmitting(true);
    try {
      const ok = await loginWithEmail(email.trim(), password);
      if (ok) {
        const currentUser = useAuthStore.getState().user;
        if (currentUser?.role === 'admin') {
          useToastStore.getState().success('مرحباً بك في لوحة الإدارة');
          navigate('/admin', { replace: true });
        } else {
          useToastStore.getState().success('مرحباً بك في منصة الصيدلية');
          navigate('/app/prices', { replace: true });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. إنشاء حساب جديد
  const handleRegisterAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || loading) return;
    if (!registerName.trim() || !registerEmail.trim() || !registerPassword) {
      useToastStore.getState().warning('يرجى تعبئة كافة الحقول المطلوبة');
      return;
    }
    if (registerPassword.length < 6) {
      useToastStore.getState().warning('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');
      return;
    }

    clearAuthError();
    setIsSubmitting(true);
    try {
      const ok = await signupWithEmail(registerEmail.trim(), registerPassword, registerName.trim());
      if (ok) {
        useToastStore.getState().success('تم تفعيل حسابك بنجاح! مرحباً بك');
        navigate('/app/prices', { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. استعادة كلمة المرور
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmailInput.trim()) {
      useToastStore.getState().warning('يرجى إدخال عنوان البريد الإلكتروني');
      return;
    }
    setIsResetting(true);
    try {
      const ok = await resetPassword(resetEmailInput.trim());
      if (ok) {
        setShowResetModal(false);
        setResetEmailInput('');
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8" dir="rtl">
      {!isOnline && <div className="mb-4 max-w-6xl w-full mx-auto rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs font-bold flex items-center gap-2"><WifiOff className="w-4 h-4" /> لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.</div>}
      {/* شبكة العرض الرئيسية */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* العمود الأول: العرض السينمائي المتحرك وحاسبة التوفير (للشاشات الكبيرة) */}
        <div className="hidden lg:block lg:col-span-7 pr-2">
          <SplashHero 
            onGoogleSignIn={handleGoogleAuth}
            hideActionButtons={true}
          />
        </div>

        {/* العمود الثاني: بطاقة الدخول الموحدة */}
        <div className="lg:col-span-5 w-full">
          <div className="bg-white py-7 px-6 sm:px-8 shadow-xl rounded-3xl border border-slate-200/90 relative overflow-hidden">
            {/* زخرفة دائرية جمالية */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-28 h-28 bg-teal-500/5 rounded-full -ml-12 -mb-12 pointer-events-none" />

            {/* أيقونة المنصة وترويسة البطاقة */}
            <div className="text-center mb-5">
              <div className="mb-3 flex justify-center">
                <PharmacyBrandLoader size="lg" glow={true} />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                بوابة الصيدلية الموحدة
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                مقارنة أسعار وتوريد الأدوية بين كافة المستودعات المعتمدة
              </p>
            </div>

            {/* بطاقة التنبيه بالخطأ بالعربية مع كافة التفاصيل وإرشادات الحل */}
            {lastAuthError && (
              <div className="mb-5">
                <AuthErrorCard
                  error={lastAuthError}
                  onRetry={activeTab === 'google' ? handleGoogleAuth : undefined}
                  onDismiss={clearAuthError}
                  onSwitchToEmail={() => handleTabChange('email')}
                />
              </div>
            )}

            {/* تبويبات خيارات تسجيل الدخول */}
            <div className="flex p-1 bg-slate-100 rounded-2xl mb-5 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleTabChange('google')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  activeTab === 'google'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>حساب Google</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('email')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  activeTab === 'email'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>البريد وكلمة المرور</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  activeTab === 'register'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>حساب جديد</span>
              </button>
            </div>

            {/* 1. تبويب تسجيل الدخول عبر Google */}
            {activeTab === 'google' && (
              <div className="space-y-4">
                {/* بطاقة المزايا السريعة */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/70 to-emerald-50/50 border border-emerald-200/90 text-emerald-950 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-black text-emerald-900 text-[12.5px]">
                    <TrendingDown className="w-4 h-4 text-[#0f9d7a] shrink-0" />
                    <span>دخول سريع بنقرة واحدة بحساب Google</span>
                  </div>
                  <p className="text-[11.5px] text-slate-600 leading-relaxed">
                    يتم التحقق فورياً وتوجيهك مباشرة إلى كشف أسعار وبونص كافة المستودعات مع حفظ إعدادات صيدليتك.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={loading || isSubmitting}
                  className="w-full py-3.5 px-5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/90 text-slate-800 font-black text-sm sm:text-base transition-all flex items-center justify-center gap-3.5 shadow-md hover:shadow-lg active:scale-98 disabled:opacity-60 cursor-pointer"
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
              </div>
            )}

            {/* 2. تبويب تسجيل الدخول بالبريد الإلكتروني وكلمة المرور */}
            {activeTab === 'email' && (
              <form onSubmit={handleEmailAuth} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="pharmacy@example.com"
                      dir="ltr"
                      required
                      className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      كلمة المرور
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      required
                      className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-60 cursor-pointer mt-2"
                >
                  {loading || isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <PharmacyBrandLoader size="xs" glow={false} />
                      <span>جاري تسجيل الدخول...</span>
                    </div>
                  ) : (
                    <span>تسجيل الدخول</span>
                  )}
                </button>
              </form>
            )}

            {/* 3. تبويب إنشاء حساب صيدلية جديد */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegisterAuth} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الصيدلي / المسؤول
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="د. محمد أحمد"
                      required
                      className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الصيدلية
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={registerPharmacyName}
                      onChange={(e) => setRegisterPharmacyName(e.target.value)}
                      placeholder="صيدلية الشفاء"
                      className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="pharmacy@example.com"
                      dir="ltr"
                      required
                      className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كلمة المرور (6 أحرف أو أرقام على الأقل)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      minLength={6}
                      required
                      className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-60 cursor-pointer mt-2"
                >
                  {loading || isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <PharmacyBrandLoader size="xs" glow={false} />
                      <span>جاري إنشاء الحساب...</span>
                    </div>
                  ) : (
                    <span>إنشاء الحساب وبدء التجربة المجانية</span>
                  )}
                </button>
              </form>
            )}

            <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-2">
              <input id="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              <label htmlFor="remember-me" className="text-xs font-bold text-slate-700">تذكرني على هذا الجهاز</label>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed text-center">بدخولك أنت توافق على استخدام بيانات الحساب لتجهيز الطلبات فقط. لا نشارك بياناتك خارج أطراف التوريد اللازمة.</p>
            {/* نقاط الأمان والموثوقية */}
            <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
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
                <span>ربط آمن ومشفر مع حفظ فوري لبيانات وطلبيات صيدليتك</span>
              </div>
            </div>

            {/* رابط مباشر لبوابة إدارة النظام */}
            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <Link
                to="/admin/login"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-700 font-bold transition"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>بوابة مدراء النظام (الإدارة المركزية)</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* شريط معلومات موثوق أسفل البطاقة */}
          <div className="mt-3 text-center">
            <p className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>منصة مهنية مشفرة مخصصة للصيادلة والمستودعات الطبية المعتمدة</span>
            </p>
          </div>
        </div>

      </div>

      {/* نافذة منبثقة لاستعادة كلمة المرور */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">
                استعادة كلمة المرور
              </h3>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              أدخل عنوان البريد الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور فوراً.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={resetEmailInput}
                  onChange={(e) => setResetEmailInput(e.target.value)}
                  placeholder="pharmacy@example.com"
                  dir="ltr"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="py-2 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isResetting ? 'جاري الإرسال...' : 'إرسال الرابط'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <a href="https://wa.me/?text=مرحباً، أحتاج مساعدة في تسجيل الدخول إلى LinkPharma" target="_blank" rel="noreferrer" className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-4 py-3 text-xs font-black shadow-lg hover:scale-105 transition-transform" aria-label="مساعدة عبر واتساب">
        <MessageCircle className="w-4 h-4" /> مساعدة واتساب
      </a>
    </div>
  );
};
