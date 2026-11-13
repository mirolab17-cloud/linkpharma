import { Product } from '../types';
import { normalizeArabic } from '../utils/arabicNormalize';

export type DuplicateReason = 'barcode' | 'identity';
export interface DuplicateGroup { key: string; reason: DuplicateReason; label: string; products: Product[]; }

const clean = (value = '') => normalizeArabic(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const productIdentityKey = (product: Pick<Product, 'tradeName' | 'strength' | 'form' | 'manufacturer'>) => [product.tradeName, product.strength, product.form, product.manufacturer].map(clean).join('|');

export function detectProductDuplicates(products: Product[]): DuplicateGroup[] {
  const buckets = new Map<string, { reason: DuplicateReason; label: string; products: Product[] }>();
  products.forEach((product) => {
    const barcode = clean(product.barcode || '');
    if (barcode) {
      const key = `barcode:${barcode}`;
      const bucket = buckets.get(key) || { reason: 'barcode' as const, label: `باركود ${product.barcode}`, products: [] };
      bucket.products.push(product); buckets.set(key, bucket);
    }
    const identity = productIdentityKey(product);
    if (identity.replace(/\|/g, '').trim()) {
      const key = `identity:${identity}`;
      const bucket = buckets.get(key) || { reason: 'identity' as const, label: `${product.tradeName} · ${[product.strength, product.form, product.manufacturer].filter(Boolean).join(' · ')}`, products: [] };
      bucket.products.push(product); buckets.set(key, bucket);
    }
  });
  return [...buckets.entries()].filter(([, value]) => value.products.length > 1).map(([key, value]) => ({ key, ...value }));
}

export function findProductDuplicate(product: Product, products: Product[]) {
  return detectProductDuplicates(products.filter((item) => item.id !== product.id)).filter((group) => group.products.some((item) => item.id === product.id));
}

export function duplicateMessage(product: Product, products: Product[]): string | null {
  const matches = findProductDuplicate(product, products);
  if (!matches.length) return null;
  const barcode = matches.find((group) => group.reason === 'barcode');
  return barcode ? `لا يمكن حفظ الصنف: الباركود ${product.barcode} مستخدم في صنف آخر.` : `لا يمكن حفظ الصنف: توجد هوية مطابقة للاسم والجرعة والشكل والشركة (${matches[0].label}).`;
}
