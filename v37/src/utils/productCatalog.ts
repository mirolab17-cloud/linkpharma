import { Product } from '../types';

export function normalizeCatalogText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
}

export function productIdentityKey(input: { tradeName?: string; strength?: string; form?: string; packSize?: string; manufacturer?: string; barcode?: string }): string {
  const barcode = normalizeCatalogText(input.barcode);
  if (barcode) return `barcode:${barcode}`;
  return [input.tradeName, input.strength, input.form, input.packSize, input.manufacturer].map(normalizeCatalogText).join('|');
}

export function displayForm(form?: string): string {
  const map: Record<string, string> = { 'أقراص': 'Tab', 'كبسولات': 'Cap', 'شراب': 'Syrup', 'حقن': 'Amp', 'كريم': 'Cream', 'مرهم': 'Ointment', 'قطرة': 'Drops' };
  return map[String(form || '').trim()] || String(form || '').trim();
}
export function productDisplayName(product: Pick<Product, 'tradeName'|'strength'|'form'|'packSize'>): string {
  const contents = product.packSize ? `(${product.packSize})` : '';
  return [product.tradeName, product.strength, displayForm(product.form), contents].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

export function isMedicineCategory(category?: string, activeIngredientId?: string): boolean {
  const text = normalizeCatalogText(category);
  return Boolean(activeIngredientId) || /(medicine|medicines|drug|pharma|antibiotic|analgesic|tablet|capsule|syrup|دواء|أدوية|دوائي)/i.test(text);
}
