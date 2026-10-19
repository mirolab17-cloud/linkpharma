// src/utils/priceOfferSorting.ts — v30: ترتيب عروض المستودعات داخل كل صنف (يحدده المدير من لوحة التحكم)
import { PriceOfferSortMode, PriceRecord, Supplier } from '../types';
import { calculateEffectiveUnitPrice } from './formatPrice';

export type { PriceOfferSortMode };

export const DEFAULT_PRICE_OFFER_SORT_MODE: PriceOfferSortMode = 'cheapest';

export const PRICE_OFFER_SORT_OPTIONS: Array<{ value: PriceOfferSortMode; label: string; hint: string }> = [
  { value: 'cheapest', label: 'الأرخص أولاً', hint: 'حسب السعر الفعلي بعد احتساب البونص' },
  { value: 'random', label: 'عشوائي', hint: 'ترتيب متغير عادلاً بين المستودعات (يتغير عند كل فتح للصفحة)' },
  { value: 'updated', label: 'آخر تحديث', hint: 'المستودع الأحدث تحديثاً للسعر أولاً' },
  { value: 'alphabetical', label: 'أبجدي', hint: 'حسب اسم المستودع' },
];

export const isPriceOfferSortMode = (value: unknown): value is PriceOfferSortMode =>
  value === 'cheapest' || value === 'random' || value === 'updated' || value === 'alphabetical';

export const normalizePriceOfferSortMode = (value: unknown): PriceOfferSortMode =>
  isPriceOfferSortMode(value) ? value : DEFAULT_PRICE_OFFER_SORT_MODE;

export const priceOfferSortLabel = (mode: PriceOfferSortMode): string =>
  PRICE_OFFER_SORT_OPTIONS.find((option) => option.value === mode)?.label || PRICE_OFFER_SORT_OPTIONS[0].label;

// بذرة ثابتة طوال عمر الصفحة: الترتيب العشوائي لا يتغير مع كل إعادة رسم، ويتغير عند فتح الصفحة من جديد.
const SESSION_SEED = Math.floor(Math.random() * 0x7fffffff);

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const updatedAtMillis = (value?: string): number => {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const effectivePriceOf = (offer: PriceRecord): number => {
  const calculated = calculateEffectiveUnitPrice(offer.price, offer.bonus).effectivePrice;
  const value = offer.effectivePrice && offer.effectivePrice > 0 ? offer.effectivePrice : calculated;
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
};

/**
 * يرتب عروض صنف واحد دون تعديل المصفوفة الأصلية.
 * العروض غير المتوفرة تبقى دائماً في آخر القائمة مهما كان نمط الترتيب.
 */
export function sortPriceOffers<T extends PriceRecord>(
  offers: readonly T[],
  suppliers: readonly Pick<Supplier, 'id' | 'name'>[],
  mode: PriceOfferSortMode = DEFAULT_PRICE_OFFER_SORT_MODE,
): T[] {
  const nameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name || supplier.id]));
  const nameOf = (offer: T) => nameById.get(offer.supplierId) || offer.supplierId;
  const byName = (a: T, b: T) => nameOf(a).localeCompare(nameOf(b), 'ar', { sensitivity: 'base' }) || a.supplierId.localeCompare(b.supplierId);

  const compare = (a: T, b: T): number => {
    switch (mode) {
      case 'random': {
        const key = (offer: T) => hashString(`${SESSION_SEED}:${offer.productId}:${offer.supplierId}`);
        return key(a) - key(b) || byName(a, b);
      }
      case 'updated':
        return updatedAtMillis(b.updatedAt) - updatedAtMillis(a.updatedAt) || byName(a, b);
      case 'alphabetical':
        return byName(a, b);
      case 'cheapest':
      default: {
        const priceA = effectivePriceOf(a);
        const priceB = effectivePriceOf(b);
        if (priceA !== priceB) return priceA < priceB ? -1 : 1;
        return byName(a, b);
      }
    }
  };

  const available = offers.filter((offer) => offer.available).sort(compare);
  const unavailable = offers.filter((offer) => !offer.available).sort(compare);
  return [...available, ...unavailable];
}
