import type { Supplier } from '../types';

/** المستودعات المثبّتة أولاً، مع إبقاء الترتيب الأصلي لباقي القائمة (الفرز مستقر). لا يُضاف أي مؤشر «مثبّت» للمستخدم. */
export function pinnedFirst<T extends Pick<Supplier, 'pinned'>>(suppliers: T[]): T[] {
  return [...suppliers].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}
