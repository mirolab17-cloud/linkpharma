import { Product, ProductCardConfig } from '../types';

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
export function productCompactName(product: Pick<Product, 'tradeName'|'strength'|'form'|'showStrength'>): string {
  return [product.tradeName, product.showStrength === true ? product.strength : '', displayForm(product.form)]
    .map((value) => String(value || '').trim()).filter(Boolean).join(' ');
}
export function productDisplayName(product: Pick<Product, 'tradeName'|'strength'|'form'|'packSize'|'showStrength'>): string {
  const contents = product.packSize ? `(${product.packSize})` : '';
  return [productCompactName(product), contents].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

export function isMedicineCategory(category?: string, activeIngredientId?: string): boolean {
  const text = normalizeCatalogText(category);
  return Boolean(activeIngredientId) || /(medicine|medicines|drug|pharma|antibiotic|analgesic|tablet|capsule|syrup|دواء|أدوية|دوائي)/i.test(text);
}

export const DEFAULT_PRODUCT_CARD_CONFIG: ProductCardConfig = {
  title: [
    { key: 'tradeName', visible: true },
    { key: 'strength', visible: true },
    { key: 'form', visible: true },
    { key: 'packSize', visible: false },
    { key: 'manufacturer', visible: false },
  ],
  titleSeparator: ' ',
  formStyle: 'abbr',
  details: [
    { key: 'activeIngredient', visible: true },
    { key: 'manufacturer', visible: true },
    { key: 'packSize', visible: false },
    { key: 'category', visible: true },
    { key: 'trend', visible: true },
  ],
  showSavings: true,
  showFavorite: true,
  showAlert: true,
  showViewButton: true,
};

export function normalizeProductCardConfig(input?: Partial<ProductCardConfig> | null): ProductCardConfig {
  const d = DEFAULT_PRODUCT_CARD_CONFIG;
  const merge = <K extends string>(saved: Array<{ key: K; visible: boolean }> | undefined, base: Array<{ key: K; visible: boolean }>) => {
    const list = Array.isArray(saved) ? saved.filter((i) => base.some((b) => b.key === i.key)).map((i) => ({ key: i.key, visible: i.visible !== false })) : [];
    base.forEach((b) => { if (!list.some((i) => i.key === b.key)) list.push({ ...b }); });
    return list;
  };
  return {
    title: merge(input?.title, d.title),
    titleSeparator: typeof input?.titleSeparator === 'string' ? input.titleSeparator : d.titleSeparator,
    formStyle: input?.formStyle === 'original' ? 'original' : 'abbr',
    details: merge(input?.details, d.details),
    showSavings: input?.showSavings !== false,
    showFavorite: input?.showFavorite !== false,
    showAlert: input?.showAlert !== false,
    showViewButton: input?.showViewButton !== false,
  };
}

export function productCardTitle(product: Pick<Product, 'tradeName'|'strength'|'form'|'packSize'|'manufacturer'|'showStrength'>, config: ProductCardConfig): string {
  const parts = config.title.filter((item) => item.visible).map((item) => {
    if (item.key === 'form') return config.formStyle === 'original' ? String(product.form || '').trim() : displayForm(product.form);
    if (item.key === 'strength' && product.showStrength !== true) return '';
    if (item.key === 'packSize') return product.packSize ? `(${String(product.packSize).trim()})` : '';
    return String(product[item.key] || '').trim();
  }).filter(Boolean);
  return parts.join(config.titleSeparator === '' ? ' ' : config.titleSeparator);
}
