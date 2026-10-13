// src/components/NotificationBannerHost.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/useNotificationStore';
import { Megaphone, X, ExternalLink } from 'lucide-react';

export const NotificationBannerHost: React.FC = () => {
  const { activeBannerNotif, closeBanner, markAsRead } = useNotificationStore();
  const navigate = useNavigate();

  if (!activeBannerNotif) return null;

  const notif = activeBannerNotif;
  const targetUrl = notif.actionUrl || notif.metadata?.actionUrl;

  const handleAction = async () => {
    await markAsRead(notif.id);
    if (targetUrl) {
      if (targetUrl.startsWith('http')) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } else {
        navigate(targetUrl);
      }
    }
  };

  return (
    <aside 
      aria-label="تنبيه إداري عام"
      className="bg-gradient-to-r from-emerald-600 via-[#0f9d7a] to-teal-700 text-white shadow-sm border-b border-emerald-700/50 relative z-30"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="p-1.5 rounded-lg bg-white/20 text-white shrink-0">
            <Megaphone className="w-4 h-4" />
          </span>
          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="font-black shrink-0">{notif.title}:</span>
            <span className="text-white/95 truncate font-medium">{notif.message}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {targetUrl && (
            <button
              onClick={handleAction}
              className="px-3 py-1 rounded-lg bg-white text-[#0f9d7a] font-bold text-[11px] hover:bg-emerald-50 transition shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <span>عرض</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={() => closeBanner()}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
