// src/components/OfflineIndicator.tsx
import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/95 backdrop-blur-xs text-white px-3.5 py-2 text-xs font-bold shadow-lg border border-amber-500 animate-pulse"
    >
      <WifiOff className="w-4 h-4" />
      <span>وضع عدم الاتصال — يتم استخدام البيانات المحفوظة محلياً</span>
    </div>
  );
};
