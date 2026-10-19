import { PriceRecord, Supplier } from '../types';
import { calculateEffectiveUnitPrice } from './formatPrice';

export type PriceOfferSortMode = 'cheapest' | 'random' | 'updated' | 'alphabetical';

export const PRICE_OFFER_SORT_OPTIONS: Array<{ value: PriceOfferSortMode; label: string }> = [
  { value: 'cheapest', label: 'الأرخص (بعد احتساب البونص)' },
  { value: 'random', label: 'عشوائي' },
  { value: 'updated', label: 'الأحدث تحديثاً' },
  { value: 'alphabetical', label: 'أبجدي حسب اسم المستودع' },
];

const supplierName = (supplierById: Map<string, Supplier>, supplierId: string) =>
  supplierById.get(supplierId)?.name || supplierId;

const updatedAtMillis = (value?: string) => {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Sorts the offers for one product; input is never mutated. */
export function sortPriceOffers<T extends PriceRecord>(
  offers: readonly T[],
  suppliers: readonly Supplier[],
  mode: PriceOfferSortMode = 'cheapest',
): T[] {
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const available = offers.filter((offer) => offer.available);
  const unavailable = offers.filter((offer) => !offer.available);

  if (mode === 'random') {
    return [...shuffle(available), ...shuffle(unavailable)];
  }

  const compare = (a: T, b: T) => {
    let result = 0;
    if (mode === 'updated') {
      result = updatedAtMillis(b.updatedAt) - updatedAtMillis(a.updatedAt);
    } else if (mode === 'alphabetical') {
      result = supplierName(supplierById, a.supplierId).localeCompare(
        supplierName(supplierById, b.supplierId), 'ar', { sensitivity: 'base' },
      );
    } else {
      const priceA = calculateEffectiveUnitPrice(a.price, a.bonus).effectivePrice;
      const priceB = calculateEffectiveUnitPrice(b.price, b.bonus).effectivePrice;
      result = priceA - priceB;
    }

    if (result !== 0) return result;
    const nameOrder = supplierName(supplierById, a.supplierId).localeCompare(
      supplierName(supplierById, b.supplierId), 'ar', { sensitivity: 'base' },
    );
    return nameOrder || a.supplierId.localeCompare(b.supplierId);
  };

  return [...available].sort(compare).concat([...unavailable].sort(compare));
}
