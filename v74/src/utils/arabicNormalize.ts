// src/utils/arabicNormalize.ts

/**
 * تحويل الأرقام العربية الشرقية (٠-٩) إلى أرقام غربية (0-9)
 */
export function convertArabicNumerals(str: string): string {
  if (!str) return '';
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(str).replace(/[٠-٩]/g, (char) => {
    return arabicNumerals.indexOf(char).toString();
  });
}

/**
 * تطبيع النص العربي:
 * - إزالة التشكيل (الحركات والتنوين والشدة)
 * - توحيد أشكال الألف (أ، إ، آ، ٱ -> ا)
 * - توحيد التاء المربوطة (ة -> ه)
 * - توحيد الياء والألف المقصورة (ى -> ي)
 * - تحويل الأحرف الإنجليزية إلى lowercase
 * - إزالة الرموز الخاصة والتطويل (_)
 * - إزالة المسافات الزائدة
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';

  let normalized = String(text);

  // تحويل الأرقام الشرقية أولاً
  normalized = convertArabicNumerals(normalized);

  // إزالة التشكيل والتطويل
  normalized = normalized
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // تشكيل
    .replace(/\u0640/g, ''); // تطويل

  // توحيد الألف
  normalized = normalized.replace(/[أإآٱ]/g, 'ا');

  // توحيد التاء المربوطة والهاء
  normalized = normalized.replace(/ة/g, 'ه');

  // توحيد الياء
  normalized = normalized.replace(/ى/g, 'ي');

  // تحويل الحروف اللاتينية للصغيرة
  normalized = normalized.toLowerCase();

  // إزالة علامات الترقيم والرموز غير المرغوبة (مع إبقاء الأحرف والأرقام والمسافات)
  normalized = normalized.replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ');

  // إزالة المسافات المتكررة وتقليم الأطراف
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
