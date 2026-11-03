// src/components/Loader.tsx
import React from 'react';
import { BrandMark } from './BrandLogo';

/**
 * شاشة/مؤشر التحميل الرسمي للمنصة: شعار LinkPharma نفسه متحركاً
 * (السلسلتان تنفصلان وتلتحمان بنبضة ناعمة) بدل الدائرة الدوّارة القديمة.
 */
export const PharmacyBrandLoader: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  subtext?: string;
  className?: string;
  glow?: boolean;
}> = ({
  size = 'md',
  text,
  subtext,
  className = '',
  glow = true,
}) => {
  const sizeMap = { xs: 24, sm: 32, md: 48, lg: 64, xl: 96 } as const;
  const px = sizeMap[size];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex flex-col items-center justify-center text-center ${className}`}
    >
      <div className="relative flex items-center justify-center" style={{ width: px, height: px }}>
        {glow && size !== 'xs' && size !== 'sm' && (
          <span
            aria-hidden="true"
            className="lp-halo absolute inset-0"
            style={{ borderRadius: Math.round(px * 0.36) }}
          />
        )}
        <BrandMark size={px} animated />
      </div>

      {text && (
        <p className="mt-3 text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
          {text}
        </p>
      )}
      {subtext && (
        <p className="mt-1 text-[11px] text-slate-500 font-medium">
          {subtext}
        </p>
      )}
    </div>
  );
};

/**
 * التوافقية مع المكون القديم Spinner مع تحويله تلقائياً للهوية البصرية الخاصة بالموقع
 */
export const Spinner: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}> = ({ size = 'md', text, className = '' }) => {
  return (
    <PharmacyBrandLoader
      size={size}
      text={text}
      className={className}
    />
  );
};

/**
 * عنصر هيكلي أحادي يدعم تأثير الشيمر اللامع مثل يوتيوب (YouTube Shimmer Block)
 */
export const YouTubeShimmerBlock: React.FC<{
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}> = ({ className = 'h-4 w-full', rounded = 'lg' }) => {
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  }[rounded];

  return <div className={`shimmer-wave ${roundedClass} ${className}`} />;
};

/**
 * سكيلتون بطاقة الدواء الحقيقية (Product Card Skeleton)
 * يطابق شكل البطاقة النهائي تماماً (الاسم، التركيز، جدول مقارنة المستودعات، الأزرار) لمنع قفزات التخطيط CLS
 */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" dir="rtl">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-0 flex flex-col justify-between shadow-xs overflow-hidden"
        >
          {/* رأس البطاقة: اسم الدواء، المادة، التصنيف، الخصائص */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-3/4 rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="h-3.5 w-1/2 rounded-md bg-emerald-100 dark:bg-emerald-950/60 animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="h-5 w-20 rounded-md bg-slate-100 dark:bg-slate-800/80 animate-pulse" />
              <div className="h-5 w-16 rounded-md bg-slate-100 dark:bg-slate-800/80 animate-pulse" />
              <div className="h-5 w-24 rounded-md bg-slate-100 dark:bg-slate-800/80 animate-pulse" />
            </div>
          </div>

          {/* محتوى المقارنة: صفوف المستودعات والأسعار */}
          <div className="p-3 sm:p-4 bg-slate-50/60 dark:bg-slate-900/60 space-y-2.5">
            <div className="h-3.5 w-28 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-1" />

            {/* عرض مستودع 1 */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-5 w-16 rounded bg-slate-300 dark:bg-slate-600 animate-pulse" />
              </div>
              <div className="flex justify-between items-center pt-1">
                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-7 w-20 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
              </div>
            </div>

            {/* عرض مستودع 2 */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-5 w-14 rounded bg-slate-300 dark:bg-slate-600 animate-pulse" />
              </div>
              <div className="flex justify-between items-center pt-1">
                <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-7 w-20 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * سكيلتون جداول البيانات بأسلوب شيمر يوتيوب (YouTube Table Skeleton)
 */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs" dir="rtl">
      {/* رأس الجدول */}
      <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-4 gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className={`h-4 rounded-md shimmer-wave ${i === 0 ? 'w-32' : 'flex-1'}`}
          />
        ))}
      </div>

      {/* صفوف الجدول مع حركة الشيمر المستمرة */}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="h-14 flex items-center px-4 gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className={`h-3.5 rounded-md shimmer-wave ${
                  c === 0 ? 'w-28' : c === 1 ? 'w-44' : 'flex-1'
                }`}
                style={{ opacity: 0.75 + (c % 3) * 0.1 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * سكيلتون خاص بشاشات التفاصيل وعروض الأسعار الفردية
 */
export const DetailViewSkeleton: React.FC = () => {
  return (
    <div className="w-full bg-white rounded-3xl border border-slate-200 p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl shimmer-wave shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-6 w-2/5 rounded-lg shimmer-wave" />
          <div className="h-4 w-1/4 rounded-md shimmer-wave" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl shimmer-wave" />
        ))}
      </div>
      <div className="space-y-3 pt-4 border-t border-slate-100">
        <div className="h-4 w-full rounded-md shimmer-wave" />
        <div className="h-4 w-5/6 rounded-md shimmer-wave" />
        <div className="h-4 w-2/3 rounded-md shimmer-wave" />
      </div>
    </div>
  );
};
