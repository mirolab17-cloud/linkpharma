// src/utils/phone.ts
import { convertArabicNumerals } from './arabicNormalize';

/**
 * تنظيف رقم الهاتف وإبقائه بالصيغة الدولية للأرقام فقط بدون علامة +
 * مثال: +966 50 123 4567 -> 966501234567
 */
export function cleanPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = convertArabicNumerals(String(phone));
  // إزالة كل ما هو غير أرقام
  cleaned = cleaned.replace(/\D/g, '');
  // إذا بدأ بـ 00، تحويله للصيغة العادية
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
}

/**
 * التحقق من صحة رقم الهاتف (طوله من 8 إلى 15 رقماً)
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = cleanPhone(phone);
  return cleaned.length >= 8 && cleaned.length <= 15;
}

/**
 * توليد رابط محادثة واتساب مباشر
 */
export function createWhatsAppLink(phone: string, text?: string): string {
  const clean = cleanPhone(phone);
  const baseUrl = `https://wa.me/${clean}`;
  if (!text) return baseUrl;
  return `${baseUrl}?text=${encodeURIComponent(text)}`;
}

/**
 * تنسيق رقم الهاتف للعرض الجمالي
 */
export function formatPhoneNumber(phone: string): string {
  const clean = cleanPhone(phone);
  if (!clean) return '';
  return `+${clean}`;
}
