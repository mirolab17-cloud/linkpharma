// src/components/BrandLogo.tsx — شعار LinkPharma الموحد (نفس شعار الصفحة الرئيسية)
import React from 'react';

/**
 * الشعار هو نفس الأيقونة الظاهرة بجانب اسم LinkPharma في صفحة الهبوط:
 * سلسلتان متصلتان داخل مربع أخضر مدوّر. المسارات مطابقة تماماً لملف index.html.
 */
const LINK_A = 'M14 25.5 10.5 29a7 7 0 0 1-9.9-9.9l8-8a7 7 0 0 1 9.9 0';
const LINK_B = 'm26 14.5 3.5-3.5a7 7 0 0 1 9.9 9.9l-8 8a7 7 0 0 1-9.9 0';
const LINK_BAR = 'm12 28 16-16';

export const BrandMark: React.FC<{
  size?: number;
  animated?: boolean;
  className?: string;
  title?: string;
}> = ({ size = 40, animated = false, className = '', title = 'LinkPharma' }) => {
  const radius = Math.round(size * 0.36);
  const icon = Math.round(size * 0.64);

  return (
    <span
      role="img"
      aria-label={title}
      className={`lp-mark ${animated ? 'lp-mark-animated' : ''} ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <svg width={icon} height={icon} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path className="lp-link lp-link-a" d={LINK_A} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path className="lp-link lp-link-b" d={LINK_B} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path className="lp-link lp-link-bar" d={LINK_BAR} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
};

export default BrandMark;
