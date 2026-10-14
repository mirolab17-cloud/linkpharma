// src/pages/admin/AdminLogin.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { ShieldCheck, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

export const AdminLogin: React.FC = () => {
  const { loginWithGoogle, user, logout, loading } = useAuthStore();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAdminGoogleLogin = async () => {
    if (submitting || loading) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const ok = await loginWithGoogle();
      if (ok) {
        // التحقق من أن المستخدم لديه دور الأدمن
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.role === 'admin') {
          useToastStore.getState().success('مرحباً بك في لوحة تحكم الإدارة');
          navigate('/admin');
        } else {
          // الحساب ليس أدمن -> تسجيل خروج فوري وعرض رسالة خطأ
          await logout();
          setErrorMessage(
            `عذراً، الحساب (${currentUser?.email || 'المستخدم'}) غير مصرح له كمدير للنظام. الدخول مخصص للمشرفين المعتمدين فقط.`
          );
        }
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء محاولة تسجيل الدخول: ' + (err.message || ''));
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

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleAdminGoogleLogin}
            disabled={loading || submitting}
            className="w-full py-3.5 px-4 rounded-xl border border-slate-600 bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-3 shadow-md active:scale-98 disabled:opacity-50"
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
            <span>{loading ? 'جاري التحقق...' : 'دخول المدير بحساب Google'}</span>
          </button>

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
