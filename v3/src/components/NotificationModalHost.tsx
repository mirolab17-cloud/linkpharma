// src/components/NotificationModalHost.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/useNotificationStore';
import { 
  X, 
  ExternalLink, 
  Megaphone, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  Sparkles,
  EyeOff
} from 'lucide-react';

export const NotificationModalHost: React.FC = () => {
  const { activeModalNotif, closeModal, markAsRead } = useNotificationStore();
  const navigate = useNavigate();

  if (!activeModalNotif) return null;

  const notif = activeModalNotif;
  const allowDismiss = notif.repeat?.allowDismiss ?? true;
  const targetUrl = notif.actionUrl || notif.metadata?.actionUrl;

  const handleAction = async () => {
    await markAsRead(notif.id);
    await closeModal(false);
    if (targetUrl) {
      if (targetUrl.startsWith('http')) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } else {
        navigate(targetUrl);
      }
    }
  };

  const getPriorityBadge = () => {
    if (notif.priority === 'urgent') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          <span>عاجل ومهم</span>
        </span>
      );
    }
    if (notif.priority === 'high') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>تنبيه هام</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-[#0f9d7a] flex items-center gap-1">
        <Info className="w-3 h-3" />
        <span>إشعار منصة</span>
      </span>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      dir="rtl"
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* شريط علوي مع زر الإغلاق */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-50 text-[#0f9d7a]">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black text-slate-800 block">إعلان وتنبيه صيدلاني</span>
              <span className="text-[10px] text-slate-400">منظومة الإشعارات المباشرة</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {getPriorityBadge()}
            <button
              onClick={() => closeModal(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* صورة اختيارية */}
        {notif.imageUrl && (
          <div className="w-full h-44 sm:h-48 overflow-hidden bg-slate-100 relative">
            <img 
              src={notif.imageUrl} 
              alt={notif.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* المحتوى */}
        <div className="p-5 sm:p-6 space-y-3 text-right">
          <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
            {notif.title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {notif.message}
          </p>
        </div>

        {/* أزرار الإجراء */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          {allowDismiss && (
            <button
              type="button"
              onClick={() => closeModal(true)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 p-2 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>عدم العرض مجدداً</span>
            </button>
          )}

          <div className="flex items-center gap-2 mr-auto">
            <button
              type="button"
              onClick={() => closeModal(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              إغلاق
            </button>

            {targetUrl && (
              <button
                type="button"
                onClick={handleAction}
                className="px-4 py-2 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-black transition shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>الانتقال للرابط</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
