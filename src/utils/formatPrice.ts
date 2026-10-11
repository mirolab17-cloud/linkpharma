// src/utils/formatPrice.ts
import { convertArabicNumerals } from './arabicNormalize';

/**
 * تنسيق السعر بالأرقام والعملة
 */
export function formatPrice(price: number | string | undefined | null, currency: string = 'ر.س'): string {
  if (price === undefined || price === null || isNaN(Number(price))) {
    return '0.00 ' + currency;
  }
  const num = Number(price);
  return `${num.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * تنسيق السعر كأرقام إنجليزية مع العملة (لقراءة واضحة وسريعة)
 */
export function formatCurrency(price: number | string | undefined | null, currency: string = 'ر.س'): string {
  if (price === undefined || price === null || isNaN(Number(price))) {
    return '0.00 ' + currency;
  }
  const num = Number(price);
  return `${num.toFixed(2)} ${currency}`;
}

/**
 * تنظيف واستخراج السعر الرقمي من نص (حذف العملات، الفواصل، الأرقام العربية)
 */
export function cleanPrice(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  
  if (typeof val === 'number') {
    return isNaN(val) || val < 0 ? null : Number(val.toFixed(2));
  }

  let str = String(val).trim();
  str = convertArabicNumerals(str);

  // إزالة رموز العملات الشائعة والكلمات
  str = str.replace(/[ر\.س|\$|€|£|ج\.م|د\.إ|دينار|ريال|ليرة]/gi, '');
  // استبدال الفواصل الإنجليزية أو العربية بفاصلة عشرية إذا كانت تدل على كسر، أو إزالة فواصل الآلاف
  str = str.replace(/,/g, '');
  str = str.replace(/[^\d.]/g, '');

  const parsed = parseFloat(str);
  if (isNaN(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}
