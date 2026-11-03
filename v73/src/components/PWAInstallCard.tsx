import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ActionButton } from './designSystem';
import { PWAInstallGuide } from './PWAInstallButton';

export const PWAInstallCard: React.FC = () => {
  const { isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  if (isInstalled) return null;

  const handleInstall = async () => {
    if (isIOS) { setShowGuide(true); return; }
    const result = await install();
    if (result === 'manual') setShowGuide(true);
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-[#0f9d7a]"><Download className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-black text-emerald-950">ثبّت فارما لينك على جهازك</h2>
            <p className="mt-1 max-w-xl text-xs leading-6 text-emerald-800">نقرة واحدة تضع المنصة على الشاشة الرئيسية لتفتح طلباتك وأسعارك بسرعة، مع بقاء حسابك وبياناتك محفوظة بأمان.</p>
          </div>
        </div>
        <ActionButton onClick={() => void handleInstall()}><Download className="ml-1 inline h-4 w-4" />تثبيت التطبيق</ActionButton>
      </div>
      {showGuide && <PWAInstallGuide isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </section>
  );
};
