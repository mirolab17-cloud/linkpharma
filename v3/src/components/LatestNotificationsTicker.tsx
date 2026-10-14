// src/components/LatestNotificationsTicker.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/useNotificationStore';
import { AppNotification } from '../types';
import { 
  Bell, 
  ChevronRight, 
  ChevronLeft, 
  ExternalLink, 
  Sparkles, 
  TrendingDown, 
  Truck, 
  PackageCheck, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Megaphone, 
  Info 
} from 'lucide-react';
import { formatGregorianDate } from '../utils/formatDate';

export const LatestNotificationsTicker: React.FC = () => {
  const { notifications, unreadCount, settings, markAsRead } = useNotificationStore();
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const tickerConfig = settings?.ticker || {
    enabled: true,
    visibleCount: 3,
    intervalSeconds: 6,
    maxItems: 10,
    style: 'cards',
    pauseOnHover: true,
  };

  // تصفية أحدث الإشعارات حسب maxItems
  const latestItems = (notifications || []).slice(0, tickerConfig.maxItems || 10);
  const totalItems = latestItems.length;
  const visibleCount = Math.min(tickerConfig.visibleCount || 3, Math.max(1, totalItems));

  // تدوير دوري
  useEffect(() => {
    if (!tickerConfig.enabled || totalItems <= 1 || isPaused) return;

    // احترام prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const intervalMs = Math.max(3, tickerConfig.intervalSeconds || 6) * 1000;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % totalItems);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [tickerConfig.enabled, tickerConfig.intervalSeconds, totalItems, isPaused]);

  if (!tickerConfig.enabled) return null;

  const handleNext = () => {
    if (totalItems <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % totalItems);
  };

  const handlePrev = () => {
    if (totalItems <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    const targetUrl = notif.actionUrl || notif.metadata?.actionUrl;
    if (targetUrl) {
      if (targetUrl.startsWith('http')) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } else {
        navigate(targetUrl);
      }
    } else if (notif.type === 'order_update') {
      navigate('/app/orders');
    } else if (notif.type === 'price_alert') {
      navigate('/app/prices');
    }
  };

  const getNotificationIcon = (type: string, metadata?: any) => {
    if (type === 'price_alert') return <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />;
    if (type === 'order_update') return <Truck className="w-3.5 h-3.5 text-indigo-600" />;
    if (type === 'status_change') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
    if (type === 'admin_announcement') return <Megaphone className="w-3.5 h-3.5 text-[#0f9d7a]" />;
    return <Info className="w-3.5 h-3.5 text-sky-600" />;
  };

  // العناصر المعروضة في الدورة الحالية
  const displayedSlice: AppNotification[] = [];
  if (totalItems > 0) {
    for (let i = 0; i < visibleCount; i++) {
      const idx = (currentIndex + i) % totalItems;
      displayedSlice.push(latestItems[idx]);
    }
  }

  return (
    <div 
      className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 mb-5 transition-all overflow-hidden"
      dir="rtl"
      onMouseEnter={() => tickerConfig.pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => tickerConfig.pauseOnHover && setIsPaused(false)}
      onTouchStart={() => tickerConfig.pauseOnHover && setIsPaused(true)}
      onTouchEnd={() => tickerConfig.pauseOnHover && setIsPaused(false)}
    >
      {/* الترويسة وأزرار التحكم */}
      <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </div>
          <span className="text-xs font-black text-slate-800">آخر الإشعارات والتحديثات</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-[#0f9d7a]">
              {unreadCount} غير مقروء
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {totalItems > 1 && (
            <div className="flex items-center gap-1 text-slate-400">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                title="السابق"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                title="التالي"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* محتوى الإشعارات */}
      {totalItems === 0 ? (
        <div className="py-4 text-center text-slate-400 text-xs font-medium flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-slate-300" />
          <span>لا توجد إشعارات جديدة حالياً، تابع الأسعار والعروض بالأسفل.</span>
        </div>
      ) : tickerConfig.style === 'horizontal' ? (
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {displayedSlice.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition ${
                !item.read
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 hover:bg-emerald-100/70'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="shrink-0">{getNotificationIcon(item.type, item.metadata)}</div>
              <span className="font-bold truncate max-w-xs">{item.title}</span>
              <span className="text-[11px] text-slate-500 truncate max-w-sm hidden sm:inline">{item.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-2.5 ${visibleCount === 1 ? 'grid-cols-1' : visibleCount === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
          {displayedSlice.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`p-2.5 rounded-xl border text-right transition cursor-pointer relative group flex flex-col justify-between ${
                !item.read
                  ? 'bg-emerald-50/40 border-emerald-200/90 hover:bg-emerald-50/80 shadow-2xs'
                  : 'bg-slate-50/70 border-slate-200/70 hover:bg-slate-100/80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="shrink-0 p-1 rounded-lg bg-white shadow-2xs">
                      {getNotificationIcon(item.type, item.metadata)}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 truncate">
                      {item.title}
                    </h4>
                  </div>
                  {!item.read && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                  {item.message}
                </p>
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-100/80 flex items-center justify-between text-[10px] text-slate-400">
                <span>{item.createdAt ? formatGregorianDate(item.createdAt) : ''}</span>
                <span className="text-[#0f9d7a] font-bold opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                  <span>فتح</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* نقاط التنقل السفلية */}
      {totalItems > 1 && (
        <div className="mt-2 pt-2 flex items-center justify-center gap-1">
          {latestItems.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === currentIndex ? 'w-5 bg-[#0f9d7a]' : 'w-1.5 bg-slate-200 hover:bg-slate-300'
              }`}
              title={`إشعار رقم ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
