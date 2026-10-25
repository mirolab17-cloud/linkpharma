import { Product } from '../types';
import { normalizeAliasValue } from './productAliases';
import { canonicalFormCode, canonicalStrength, formCompatible, strengthCompatible } from './productIdentity';
import { normalizeArabic, convertArabicNumerals } from './arabicNormalize';

/**
 * v56 — الربط السريع.
 * يقرأ ملف إكسل مُجهَّز مسبقاً (اسم صنف المورد ↔ الصنف في النظام) ويحوّله إلى صفوف
 * يمكن حفظها كأسماء بديلة للمورد دفعة واحدة، فتطابق صفحة رفع الأسعار هذه الأسماء فوراً.
 */

export type QuickLinkFileStatus = 'confirmed' | 'review' | 'new' | 'unknown';

export interface QuickLinkRow {
  rowNumber: number;
  rawName: string;
  pack: string;
  price: number | null;
  fileStatus: QuickLinkFileStatus;
  confidence: number;
  sysName: string;
  sysStrength: string;
  sysForm: string;
  sysPack: string;
  key: string;
  note: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  rawName: ['اسم الصنف في الملف', 'اسم الصنف', 'اسم صنف المورد', 'الاسم', 'name', 'rawname'],
  pack: ['العبوة', 'pack'],
  price: ['السعر', 'price'],
  status: ['حالة الربط', 'الحالة', 'status'],
  confidence: ['نسبة الثقة', 'confidence'],
  sysName: ['الصنف في النظام', 'الصنف المقابل', 'صنف النظام', 'system item', 'trade name', 'tradename'],
  sysStrength: ['التركيز', 'strength'],
  sysForm: ['الشكل', 'form'],
  sysPack: ['عبوة النظام', 'packsize', 'pack size'],
  key: ['مفتاح الربط', 'key'],
  note: ['ملاحظة', 'note'],
};

const clean = (value: unknown) => normalizeArabic(convertArabicNumerals(String(value ?? '')).trim()).toLowerCase();

export function findQuickLinkHeaders(headers: string[]): Record<string, string> {
  const normalized = headers.map((header) => ({ header, norm: clean(header) }));
  const found: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const wanted = aliases.map(clean);
    const hit = normalized.find((item) => wanted.includes(item.norm)) || normalized.find((item) => wanted.some((alias) => alias.length > 3 && item.norm.includes(alias)));
    if (hit) found[field] = hit.header;
  }
  return found;
}

function statusFromText(value: string): QuickLinkFileStatus {
  const text = clean(value);
  if (!text) return 'unknown';
  if (text.includes('مؤكد')) return 'confirmed';
  if (text.includes('مراجع')) return 'review';
  if (text.includes('غير موجود') || text.includes('جديد')) return 'new';
  return 'unknown';
}

const text = (row: Record<string, unknown>, header?: string) => (header ? String(row[header] ?? '').replace(/\s+/g, ' ').trim() : '');

export function parseQuickLinkRows(rows: Array<Record<string, unknown>>): { rows: QuickLinkRow[]; headers: Record<string, string>; hasSystemColumn: boolean } {
  if (!rows.length) return { rows: [], headers: {}, hasSystemColumn: false };
  const headers = findQuickLinkHeaders(Object.keys(rows[0]));
  const out: QuickLinkRow[] = [];
  rows.forEach((row, index) => {
    const rawName = text(row, headers.rawName);
    if (!rawName) return;
    const priceText = text(row, headers.price);
    const price = priceText === '' ? null : Number(convertArabicNumerals(priceText).replace(/[^\d.]/g, ''));
    out.push({
      rowNumber: index + 2,
      rawName,
      pack: text(row, headers.pack),
      price: price !== null && Number.isFinite(price) ? price : null,
      fileStatus: statusFromText(text(row, headers.status)),
      confidence: Number(text(row, headers.confidence)) || 0,
      sysName: text(row, headers.sysName),
      sysStrength: text(row, headers.sysStrength),
      sysForm: text(row, headers.sysForm),
      sysPack: text(row, headers.sysPack),
      key: text(row, headers.key),
      note: text(row, headers.note),
    });
  });
  return { rows: out, headers, hasSystemColumn: Boolean(headers.sysName || headers.key) };
}

export function productKeyOf(parts: { tradeName?: unknown; strength?: unknown; form?: unknown; packSize?: unknown }): string {
  return [parts.tradeName, parts.strength, parts.form, parts.packSize].map((part) => normalizeAliasValue(part)).join('|');
}

export interface QuickLinkProductIndex {
  byKey: Map<string, Product[]>;
  byName: Map<string, Product[]>;
  byId: Map<string, Product>;
}

export function buildQuickLinkIndex(products: Product[]): QuickLinkProductIndex {
  const byKey = new Map<string, Product[]>();
  const byName = new Map<string, Product[]>();
  const byId = new Map<string, Product>();
  const push = (map: Map<string, Product[]>, key: string, product: Product) => {
    const list = map.get(key);
    if (list) list.push(product); else map.set(key, [product]);
  };
  for (const product of products) {
    byId.set(product.id, product);
    push(byKey, productKeyOf(product), product);
    push(byName, normalizeAliasValue(product.tradeName), product);
  }
  return { byKey, byName, byId };
}

export type QuickLinkResolution =
  | { product: Product; how: 'key' | 'name+strength' | 'name+form' | 'name'; candidates: Product[] }
  | { product: null; how: 'ambiguous'; candidates: Product[] }
  | { product: null; how: 'none'; candidates: Product[] };

const unique = (products: Product[]) => [...new Map(products.map((product) => [product.id, product])).values()];

/** يجد صنف النظام المقصود بالصف: المفتاح الكامل أولاً ثم الاسم + التركيز/الشكل، ثم الاسم الفريد. */
export function resolveQuickLinkProduct(row: Pick<QuickLinkRow, 'sysName' | 'sysStrength' | 'sysForm' | 'sysPack' | 'key'>, index: QuickLinkProductIndex): QuickLinkResolution {
  let name = row.sysName;
  let strength = row.sysStrength;
  let form = row.sysForm;
  let pack = row.sysPack;
  if (row.key) {
    const parts = row.key.split('|');
    if (parts.length === 4) [name, strength, form, pack] = parts.map((part) => part.trim());
  }
  if (!name) return { product: null, how: 'none', candidates: [] };

  const exactKey = productKeyOf({ tradeName: name, strength, form, packSize: pack });
  const exact = unique(index.byKey.get(exactKey) || []);
  if (exact.length === 1) return { product: exact[0], how: 'key', candidates: exact };

  const sameName = unique(index.byName.get(normalizeAliasValue(name)) || []);
  if (!sameName.length) return { product: null, how: 'none', candidates: [] };
  if (sameName.length === 1) return { product: sameName[0], how: 'name', candidates: sameName };

  const byStrength = strength ? sameName.filter((product) => strengthCompatible(product.strength, strength) && canonicalStrength(strength).nums.length > 0) : [];
  if (byStrength.length === 1) return { product: byStrength[0], how: 'name+strength', candidates: sameName };
  const pool = byStrength.length ? byStrength : sameName;
  const wantedForm = canonicalFormCode(form);
  const byForm = wantedForm ? pool.filter((product) => formCompatible(product.form, form) && canonicalFormCode(product.form) === wantedForm) : [];
  if (byForm.length === 1) return { product: byForm[0], how: 'name+form', candidates: sameName };
  return { product: null, how: 'ambiguous', candidates: pool };
}

export type QuickLinkState = 'ready' | 'review' | 'unlinked' | 'linked' | 'conflict';

export interface QuickLinkAliasLookup {
  /** معرّفات الأسماء البديلة الموجودة للمورد → صنفها. */
  existing: Map<string, string>;
}

export const quickLinkStateLabels: Record<QuickLinkState, string> = {
  ready: 'جاهز للربط',
  review: 'يحتاج مراجعة',
  unlinked: 'غير مربوط',
  linked: 'مربوط مسبقاً',
  conflict: 'تعارض مع ربط سابق',
};

export function classifyQuickLinkRow(
  row: Pick<QuickLinkRow, 'fileStatus'>,
  resolution: { product: Product | null; how: string },
  existingProductId: string | undefined,
): QuickLinkState {
  const product = resolution.product;
  if (!product) return 'unlinked';
  if (existingProductId) return existingProductId === product.id ? 'linked' : 'conflict';
  if (row.fileStatus === 'review') return 'review';
  if (row.fileStatus === 'new') return 'review';
  if (resolution.how === 'name+form' || resolution.how === 'name+strength') return row.fileStatus === 'confirmed' ? 'ready' : 'review';
  return 'ready';
}
