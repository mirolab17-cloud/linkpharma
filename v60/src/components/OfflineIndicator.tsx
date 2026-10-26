import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

/**
 * Non-blocking connection status. Never cover the application: cached pages
 * and locally saved drafts should remain accessible while the network is down.
 * Firestore-backed writes still depend on the SDK's configured persistence and
 * security rules; this indicator does not claim that every mutation is queued.
 */
export const OfflineIndicator: React.FC = () => {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && !navigator.onLine
  );
  const [justOnline, setJustOnline] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      setJustOnline(true);
      const timer = window.setTimeout(() => setJustOnline(false), 3500);
      return timer;
    };
    const onOffline = () => {
      setOffline(true);
      setJustOnline(false);
    };
    const handleOnline = () => { void onOnline(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline && !justOnline) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className={`fixed inset-x-2 top-20 z-[90] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur sm:inset-x-4 ${
        offline
          ? 'border-amber-200 bg-amber-50/95 text-amber-950'
          : 'border-emerald-200 bg-emerald-50/95 text-emerald-950'
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
        offline ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
      }`}>
        {offline ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">
          {offline ? 'أنت تعمل دون اتصال' : 'عاد الاتصال بالإنترنت'}
        </p>
        <p className="mt-0.5 text-xs leading-5 opacity-80">
          {offline
            ? 'لن تُغلق المنصة. قد تتطلب بعض العمليات اتصالاً لإتمام الحفظ والمزامنة؛ تحقّق من نجاح الحفظ قبل مغادرة الصفحة.'
            : 'يمكنك متابعة العمل. تحقّق من حالة العمليات التي حاولت تنفيذها أثناء انقطاع الاتصال.'}
        </p>
      </div>
      {offline && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-300 bg-white/70 px-3 py-2 text-xs font-bold hover:bg-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </button>
      )}
    </div>
  );
};
