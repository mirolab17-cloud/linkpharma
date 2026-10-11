// src/pages/auth/PendingApproval.tsx
import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Clock, LogOut, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PendingApproval: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-amber-50 text-amber-500 border border-amber-200 flex items-center justify-center mx-auto animate-pulse">
          <Clock className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">
            حسابك بانتظار التفعيل من الإدارة
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            أهلاً بك يا دكتور <strong className="text-slate-800">{user?.name}</strong>. تم تسجيل طلب انضمام صيدليتك بنجاح، ويقوم فريق الإدارة بمراجعة الحساب وتفعيله خلال وقت وجيز.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-2xl text-right text-xs space-y-2 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>تم استلام بيانات التسجيل</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>بانتظار موافقة مدير المنصة</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 pt-1 border-t border-slate-200/60 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <span>متصل سحابياً: سيتم تحويلك فور اعتماد التفعيل بالوقت الفعلي</span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 rounded-xl text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج والعودة لاحقاً</span>
          </button>
        </div>
      </div>
    </div>
  );
};
