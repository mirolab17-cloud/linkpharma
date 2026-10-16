// src/components/SubscriptionWarningBanner.tsx
import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Clock, MessageCircle, X, Sparkles } from 'lucide-react';

export const SubscriptionWarningBanner: React.FC = () => {
  const { user, getRemainingDays, isExpired } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);

  // يظهر فقط للصيدليات التي لم ينتهِ اشتراكها ولكن متبقي 3 أيام أو أقل
  if (!user || user.role === 'admin' || isExpired() || dismissed) {
    return null;
  }

  const remainingDays = getRemainingDays();
  if (remainingDays > 3 || remainingDays < 0) {
    return null;
  }

  const handleRenewWhatsApp = () => {
    const adminPhone = '966501234567';
    const text = `السلام عليكم ورحمة الله،
أود الاستفسار عن تجديد اشتراك صيدليتي:
🏥 الصيدلية: ${user.pharmacyName || user.name}
📧 البريد: ${user.email}
⏳ الأيام المتبقية: ${remainingDays} أيام
يرجى إرسال تفاصيل باقات التجديد وطرق الدفع. شكراً!`;

    const url = `https://wa.me/${adminPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const daysText = remainingDays === 1 ? 'يوم واحد' : remainingDays === 2 ? 'يومين' : `${remainingDays} أيام`;

  return (
    <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white text-xs px-4 py-2.5 shadow-sm transition-all animate-in fade-in" dir="rtl">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-center sm:text-right">
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <p className="font-semibold leading-tight">
            <span>ينتهي اشتراكك خلال </span>
            <strong className="underline underline-offset-2 font-black">{daysText}</strong>
            <span>. جدّد الآن لضمان استمرار وصولك المباشر لأسعار المستودعات وأفضل العروض.</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRenewWhatsApp}
            className="px-3.5 py-1.5 rounded-lg bg-white text-amber-900 font-bold hover:bg-amber-50 transition shadow-2xs flex items-center gap-1.5 text-xs active:scale-95"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>تجديد الاشتراك</span>
          </button>

          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
            title="إخفاء التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
