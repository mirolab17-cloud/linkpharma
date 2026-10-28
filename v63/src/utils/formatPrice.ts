// src/utils/formatPrice.ts
import { convertArabicNumerals } from './arabicNormalize';

// العملة الافتراضية للمنصة هي الشيكل ₪
let currentSystemCurrency: string = '₪';

export function getSystemCurrency(): string {
  return currentSystemCurrency;
}

export function setSystemCurrency(currency: string): void {
  if (currency && currency.trim()) {
    currentSystemCurrency = currency.trim();
  }
}

/**
 * تنسيق السعر بالأرقام والعملة (الافتراضي ₪)
 * يتم استخدام الأرقام اللاتينية حصراً لسهولة القراءة
 */
export function formatPrice(
  price: number | string | undefined | null,
  currency: string = currentSystemCurrency
): string {
  if (price === undefined || price === null || isNaN(Number(price))) {
    return `0.00 ${currency}`;
  }
  const num = Number(price);
  return `${num.toFixed(2)} ${currency}`;
}

/**
 * تنسيق السعر كأرقام لاتينية واضحة مع العملة
 */
export function formatCurrency(
  price: number | string | undefined | null,
  currency: string = currentSystemCurrency
): string {
  return formatPrice(price, currency);
}

/**
 * تنظيف واستخراج السعر الرقمي من نص (حذف العملات، الفواصل، الأرقام العربية، رموز ₪، شيكل)
 */
export function cleanPrice(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;

  if (typeof val === 'number') {
    return isNaN(val) || val < 0 ? null : Number(val.toFixed(2));
  }

  let str = String(val).trim();
  str = convertArabicNumerals(str);

  // إزالة رموز العملات الشائعة بما فيها الشيكل ₪، الدينار، الريال، الدولار، اليورو
  str = str.replace(/(₪|شيكل|شواكل|NIS|ILS|ر\.س|د\.أ|\$|€|£|ج\.م|د\.إ|دينار|ريال|ليرة)/gi, '');

  // استبدال الفواصل وإزالة المسافات
  str = str.replace(/,/g, '');
  str = str.replace(/[^\d.]/g, '');

  const parsed = parseFloat(str);
  if (isNaN(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

/**
 * حساب السعر الفعلي بعد البونص (حاسبة البونص)
 * مثال: 10 + 2 -> المجموع 12، يدفع ثمن 10 -> السعر الفعلي = (price * 10) / 12
 */
export function calculateEffectiveUnitPrice(
  price: number,
  bonusText?: string
): { effectivePrice: number; hasBonus: boolean; bonusDetails?: string; discountPercent: number } {
  if (!bonusText || !bonusText.trim() || price <= 0) {
    return { effectivePrice: price, hasBonus: false, discountPercent: 0 };
  }

  // الصيغة الأولى هي عدد الوحدات المدفوعة والثانية البونص؛ نقبل + و* وx و×.
  const normalizedBonus = convertArabicNumerals(bonusText).replace(/×|x/gi, '*');
  const match = normalizedBonus.match(/(\d+)\s*(?:\+|\*)\s*(\d+)/);
  if (match) {
    const buyQty = parseInt(match[1], 10);
    const freeQty = parseInt(match[2], 10);
    if (buyQty > 0 && freeQty > 0) {
      const totalQty = buyQty + freeQty;
      const effectivePrice = Number(((price * buyQty) / totalQty).toFixed(2));
      const discountPercent = Math.round(((price - effectivePrice) / price) * 100);
      return {
        effectivePrice,
        hasBonus: true,
        bonusDetails: `${buyQty}+${freeQty}`,
        discountPercent,
      };
    }
  }

  return { effectivePrice: price, hasBonus: false, discountPercent: 0 };
}
