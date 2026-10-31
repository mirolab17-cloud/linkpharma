// src/components/PWAInstallButton.tsx
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X } from 'lucide-react';

export const PWAInstallGuide: React.FC<{ isIOS: boolean; onClose: () => void }> = ({ isIOS, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl" onClick={onClose}>
    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Download className="w-4 h-4 text-[#0f9d7a]" />
          <span>{isIOS ? 'تثبيت التطبيق على آيفون / آيباد' : 'تثبيت التطبيق على جهازك'}</span>
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="إغلاق">
          <X className="w-5 h-5" />
        </button>
      </div>
      {isIOS ? (
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <span className="block">1. اضغط على زر <strong>مشاركة (Share)</strong> في شريط متصفح سفاري السفلي.</span>
          <span className="block">2. مرّر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</span>
        </p>
      ) : (
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <span className="block">لم يوفّر المتصفح نافذة التثبيت المباشرة الآن. ثبّت التطبيق يدويًا:</span>
          <span className="block">1. افتح قائمة المتصفح (⋮ أو ⋯).</span>
          <span className="block">2. اختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</span>
          <span className="block">إذا لم يظهر الخيار فافتح الرابط في Chrome أو Edge أو Safari.</span>
        </p>
      )}
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-100 dark:bg-slate-800 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
        حسناً، فهمت
      </button>
    </div>
  </div>
);

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isIOS) { setShowGuide(true); return; }
    const result = await install();
    if (result === 'manual') setShowGuide(true);
  };

  return (
    <>
      <button
        onClick={() => void handleClick()}
        className={`flex shrink-0 items-center justify-center gap-1 sm:gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0c8567] text-white text-[10px] sm:text-xs font-bold shadow-xs transition ${className}`}
        title="تثبيت التطبيق على جهازك"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="sr-only sm:not-sr-only">تثبيت التطبيق</span>
      </button>
      {showGuide && <PWAInstallGuide isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </>
  );
};
