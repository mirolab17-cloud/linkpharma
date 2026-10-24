// src/components/Skeleton.tsx
import React from 'react';

/** كتلة رمادية نابضة تُستخدم كهيكل تحميل (Skeleton) */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} aria-hidden="true" />
);

/** هيكل تحميل الصفحة الرئيسية للصيدلية */
export const HomeSkeleton: React.FC = () => (
  <div className="space-y-5" role="status" aria-label="جاري التحميل">
    <Skeleton className="h-8 w-48" />
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <Skeleton className="h-5 w-40" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  </div>
);

/** هيكل تحميل عام لصفحات تطبيق الصيدلية أثناء تحميل الصفحة نفسها */
export const PageSkeleton: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6" dir="rtl">
    <HomeSkeleton />
  </div>
);
