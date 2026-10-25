import { Product, ProductAlias } from '../types';
import { normalizeArabic } from './arabicNormalize';

export interface ProductAliasInput {
  supplierId: string;
  productId: string;
  rawName: string;
  manufacturer?: string;
  strength?: string;
  form?: string;
  packSize?: string;
  barcode?: string;
}

export function normalizeAliasValue(value: unknown): string {
  return normalizeArabic(String(value ?? ''))
    .replace(/\b(?:tabs?|tablets?)\b/g, 'tab')
    .replace(/\b(?:caps?|capsules?)\b/g, 'cap')
    .replace(/\b(?:amps?|ampoules?)\b/g, 'amp')
    .replace(/\b(?:gms?|grams?)\b/g, 'g')
    .replace(/\b(?:milligrams?)\b/g, 'mg')
    .replace(/اقراص|قرص/g, 'tab')
    .replace(/كبسولات|كبسوله/g, 'cap')
    .replace(/حقن|امبولات|امبول/g, 'amp')
    .replace(/شراب/g, 'syrup')
    .replace(/\s*(mg|mcg|g|ml|iu)\b/g, '$1')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

export function aliasFieldCompatible(field: string, left: unknown, right: unknown): boolean {
  const a = normalizeAliasValue(left);
  const b = normalizeAliasValue(right);
  if (!a || !b || a === b) return true;
  if (field !== 'strength') return false;
  const aNumbers = a.match(/\d+(?:\.\d+)?/g)?.join('/') || '';
  const bNumbers = b.match(/\d+(?:\.\d+)?/g)?.join('/') || '';
  const aUnits = /[a-z]/i.test(a);
  const bUnits = /[a-z]/i.test(b);
  return Boolean(aNumbers && aNumbers === bNumbers && (!aUnits || !bUnits));
}

export function createAliasIdentityKey(input: Pick<ProductAliasInput, 'rawName' | 'manufacturer' | 'strength' | 'form' | 'packSize' | 'barcode'>): string {
  const form = normalizeAliasValue(input.form)
    .replace(/^(?:tablets?|اقراص|اقراص)$/i, 'tab')
    .replace(/^(?:capsules?|كبسولات)$/i, 'cap')
    .replace(/^(?:injection|حقن|امبولات)$/i, 'amp');
  return [input.rawName, input.manufacturer, input.strength, form, input.packSize, input.barcode]
    .map(normalizeAliasValue).join('|');
}

function stableHash(value: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function productAliasDocumentId(input: Pick<ProductAliasInput, 'supplierId' | 'rawName' | 'manufacturer' | 'strength' | 'form' | 'packSize' | 'barcode'>): string {
  const identity = createAliasIdentityKey(input);
  return `alias_${stableHash(`${input.supplierId}|${identity}`)}`;
}

export function findProductAliasMatch(
  aliases: ProductAlias[],
  products: Product[],
  supplierId: string,
  row: Pick<ProductAliasInput, 'rawName' | 'manufacturer' | 'strength' | 'form' | 'packSize' | 'barcode'>,
): Product | null {
  const normalizedName = normalizeAliasValue(row.rawName);
  if (!normalizedName) return null;
  const candidates = aliases.filter((alias) => {
    if (alias.supplierId !== supplierId || alias.normalizedName !== normalizedName) return false;
    const fields: Array<[string, unknown, unknown]> = [
      ['barcode', row.barcode, alias.barcode], ['manufacturer', row.manufacturer, alias.manufacturer], ['strength', row.strength, alias.strength],
      ['form', row.form, alias.form], ['packSize', row.packSize, alias.packSize],
    ];
    return fields.every(([field, current, saved]) => aliasFieldCompatible(field, current, saved));
  });
  const uniqueIds = [...new Set(candidates.map((candidate) => candidate.productId))];
  if (uniqueIds.length !== 1) return null;
  const product = products.find((candidate) => candidate.id === uniqueIds[0]);
  if (!product) return null;

  const productFields: Array<[string, unknown, unknown]> = [
    ['barcode', row.barcode, product.barcode], ['manufacturer', row.manufacturer, product.manufacturer], ['strength', row.strength, product.strength],
    ['form', row.form, product.form], ['packSize', row.packSize, product.packSize],
  ];
  const conflicts = productFields.some(([field, current, master]) => !aliasFieldCompatible(field, current, master));
  return conflicts ? null : product;
}
