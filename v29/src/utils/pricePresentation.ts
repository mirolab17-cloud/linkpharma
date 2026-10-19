import type { PriceRecord } from '../types';

/** Helpers used on the initial pharmacy routes; keep them independent of Firebase feature services. */
export function filterVisiblePrices(prices: PriceRecord[]): PriceRecord[] {
  return prices.filter((price) => !price.hidden);
}

export function deliveryRuleForSupplier(
  supplier: {
    deliveryDaysByArea?: Record<string, string[]>;
    deliveryCutoffByArea?: Record<string, string>;
    minimumOrderByArea?: Record<string, number>;
    minimumOrderAmount?: number;
  },
  area?: string | Array<string | undefined>
) {
  const requestedAreas = (Array.isArray(area) ? area : [area]).filter((value): value is string => Boolean(value?.trim()));
  const schedules = supplier.deliveryDaysByArea || {};
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s_-]/g, '');
  let matchedKey: string | undefined;
  for (const requested of requestedAreas) {
    matchedKey = Object.keys(schedules).find((key) => normalize(key) === normalize(requested));
    if (matchedKey) break;
  }
  if (!matchedKey) matchedKey = Object.keys(schedules).find((key) => ['عام', 'كلالمناطق', 'جميعالمناطق'].includes(normalize(key)));
  return {
    area: matchedKey,
    days: matchedKey ? schedules[matchedKey] || [] : [],
    cutoffTime: matchedKey ? supplier.deliveryCutoffByArea?.[matchedKey] || '' : '',
    minimumOrderAmount: matchedKey ? supplier.minimumOrderByArea?.[matchedKey] ?? supplier.minimumOrderAmount ?? 0 : supplier.minimumOrderAmount ?? 0,
  };
}

export function deliveryDaysForSupplier(
  supplier: {
    deliveryDaysByArea?: Record<string, string[]>;
    deliveryCutoffByArea?: Record<string, string>;
    minimumOrderByArea?: Record<string, number>;
    minimumOrderAmount?: number;
    serviceAreas?: string[];
  },
  area?: string | Array<string | undefined>
): string[] {
  return deliveryRuleForSupplier(supplier, area).days;
}
