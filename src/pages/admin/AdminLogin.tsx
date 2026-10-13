// src/pages/admin/AdminLogin.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { ShieldCheck, ArrowRight, Lock, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { AuthErrorCard } from '../../components/AuthErrorCard';
import { PharmacyBrandLoader } from '../../components/Loader';

export const AdminLogin: React.FC = () => {
  const { 
    loginWithGoogle, 
    loginWithEmail, 
    lastAuthError, 
    clearAuthError, 
    user, 
    logout, 
    loading 
  } = useAuthStore();
  const navigate = useNavigate();
  const [activeMethod, setActiveMethod] = useState<'google' | 'email'>('google');
  const [submitting, setSubmitting] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const [adminEmail, setAdminEmail] = useState('mirolab17@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // تسجيل الدخول بحساب Google للإدارة
  const handleAdminGoogleLogin = async () => {
    if (submitting || loading) return;
    setCustomError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      const ok = await loginWithGoogle();
      if (ok) {
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.role === 'admin') {
          useToastStore.getState().success('مرحباً بك في لوحة تحكم الإدارة');
          navigate('/admin');
        } else {
          await logout();
          setCustomError(
            `عذراً، الحساب (${currentUser?.email || 'المستخدم'}) غير مصرح له كمدير للنظام. الدخول مخصص للمشرفين المعتمدين فقط.`
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  // تسجيل الدخول بالبريد وكلمة المرور للإدارة
  const handleAdminEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || loading) return;
    if (!adminEmail.trim() || !adminPassword) {
      useToastStore.getState().warning('يرجى إدخال البريد وكلمة المرور');
      return;
    }

    setCustomError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      const ok = await loginWithEmail(adminEmail.trim(), adminPassword);
      if (ok) {
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.role === 'admin') {
          useToastStore.getState().success('مرحباً بك في لوحة تحكم الإدارة');
          navigate('/admin');
        } else {
          await logout();
          setCustomError(
            `عذراً، الحساب (${currentUser?.email || 'المستخدم'}) غير مصرح له كمدير للنظام. الدخول مخصص للمشرفين المعتمدين فقط.`
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-right" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg mb-4">
          <ShieldCheck className="w-9 h-9" />
        </div>
        <h2 className="text-center text-2xl font-black text-white tracking-tight">
          بوابة إدارة النظام
        </h2>
        <p className="mt-2 text-center text-xs text-slate-400">
          لوحة التحكم الإشرافية - منصة مقارنة أسعار الأدوية
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/90 py-8 px-6 shadow-2xl rounded-3xl border border-slate-700/80 sm:px-10 space-y-6 backdrop-blur">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-700 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-400">
              <Lock className="w-4 h-4" />
              <span>منطقة إدارية محمية</span>
            </div>
            <p className="leading-relaxed text-slate-400">
              هذه الواجهة مخصصة لمدراء النظام فقط. يتم التحقق من الصلاحيات الإدارية عبر قائمة المشرفين المعتمدة وسجلات الأمان في Firestore.
            </p>
          </div>

          {/* عرض الأخطاء المترجمة بالعربية إن وجدت */}
          {(lastAuthError || customError) && (
            <AuthErrorCard
              error={customError || lastAuthError}
              onRetry={activeMethod === 'google' ? handleAdminGoogleLogin : undefined}
              onDismiss={() => {
                setCustomError(null);
                clearAuthError();
              }}
              onSwitchToEmail={() => setActiveMethod('email')}
            />
          )}

          {/* تبديل طريقة الدخول للمدير */}
          <div className="flex p-1 bg-slate-900/80 rounded-xl text-xs font-bold border border-slate-700">
            <button
              type="button"
              onClick={() => {
                setActiveMethod('google');
                clearAuthError();
                setCustomError(null);
              }}
              className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                activeMethod === 'google'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              دخول بحساب Google
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMethod('email');
                clearAuthError();
                setCustomError(null);
              }}
              className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                activeMethod === 'email'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              البريد وكلمة المرور
            </button>
          </div>

          {activeMethod === 'google' ? (
            <button
              type="button"
              onClick={handleAdminGoogleLogin}
              disabled={loading || submitting}
              className="w-full py-3.5 px-4 rounded-xl border border-slate-600 bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-3 shadow-md active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              <span>{submitting || loading ? 'جاري التحقق...' : 'دخول المدير بحساب Google'}</span>
            </button>
          ) : (
            <form onSubmit={handleAdminEmailLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  البريد الإلكتروني للإدارة
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    dir="ltr"
                    required
                    className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  كلمة المرور
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    dir="ltr"
                    placeholder="••••••••"
                    required
                    className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || submitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 active:scale-98 disabled:opacity-60 cursor-pointer"
              >
                {submitting || loading ? 'جاري تسجيل الدخول...' : 'تسجيل دخول المشرف'}
              </button>
            </form>
          )}

          <div className="pt-2 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <span>العودة لدخول الصيدليات</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
