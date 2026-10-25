import { Product } from '../types';
import { normalizeAliasValue } from './productAliases';
import { canonicalFormCode, canonicalStrength, formCompatible, packSizeCompatible, strengthCompatible } from './productIdentity';
import { normalizeArabic, convertArabicNumerals } from './arabicNormalize';
import { catalogNameKey } from './catalogNameFormat';

/**
 * v57 — الربط السريع.
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
  rawName: ['اسم الصنف في الملف', 'اسم الصنف في ملف الأسعار', 'اسم الصنف لدى المورد', 'اسم الصنف عند المورد', 'اسم المورد للصنف', 'اسم المورد في ملف الأسعار', 'اسم المورد المختلف', 'الاسم المختلف', 'الأسماء المختلفة', 'الأسماء المختلفة لدى المورد', 'الصنف في كشف المورد', 'اسم صنف المورد', 'الاسم البديل', 'الاسم في كشف المورد', 'اسم الصنف', 'الاسم', 'name', 'rawname'],
  pack: ['العبوة', 'pack'],
  price: ['السعر', 'price'],
  status: ['حالة الربط', 'الحالة', 'status'],
  confidence: ['نسبة الثقة', 'confidence'],
  sysName: ['الصنف في النظام', 'اسم الصنف في قاعدة البيانات', 'اسم الصنف بقاعدة البيانات', 'اسم الصنف في قاعدة البيانات المنظفة', 'اسم الصنف في الكتالوج', 'الأصناف الموجودة في قاعدة البيانات', 'الأصناف في قاعدة البيانات', 'الصنف الموجود في قاعدة البيانات', 'الصنف الموجود بقاعدة البيانات', 'الصنف من قاعدة البيانات', 'الاسم المعتمد بالنظام', 'الصنف المقابل', 'صنف النظام', 'system item', 'database product', 'catalog product', 'trade name', 'tradename'],
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
  const used = new Set<string>();
  const fields = Object.entries(HEADER_ALIASES);
  const priority = [...fields].sort(([a], [b]) => (a === 'sysName' ? -1 : b === 'sysName' ? 1 : 0));
  // Reserve exact system-name headers first so a long database heading containing
  // «اسم الصنف» cannot be mistaken for the supplier alias column.
  for (const [field, aliases] of priority) {
    const wanted = aliases.map(clean);
    const hit = normalized.find((item) => !used.has(item.header) && wanted.includes(item.norm));
    if (hit) { found[field] = hit.header; used.add(hit.header); }
  }
  for (const [field, aliases] of priority) {
    if (found[field]) continue;
    const wanted = aliases.map(clean);
    const hit = normalized.find((item) => !used.has(item.header) && wanted.some((alias) => alias.length > 3 && item.norm.includes(alias)));
    if (hit) { found[field] = hit.header; used.add(hit.header); }
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

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

/** «عالية/متوسطة/منخفضة» أو رقم (0-1 أو 0-100) → 0..100؛ 0 تعني غير محدد. */
export function confidenceFromText(value: string): number {
  const numeric = convertArabicNumerals(value).replace('%', '').replace('٫', '.').trim();
  if (/^\d+(?:\.\d+)?$/.test(numeric)) {
    const n = Number(numeric);
    return n <= 0 ? 0 : n <= 1 ? Math.round(n * 100) : Math.min(100, Math.round(n));
  }
  const t = clean(value);
  if (!t) return 0;
  if (/(^|\s)(عالي|مرتفع|high)/.test(t)) return 90;
  if (/(^|\s)(متوسط|medium|mid)/.test(t)) return 60;
  if (/(^|\s)(منخفض|ضعيف|قليل|low)/.test(t)) return 30;
  return 0;
}

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (!confidence) return 'none';
  return confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
}

export const confidenceLabels: Record<ConfidenceLevel, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة', none: '—' };

const text = (row: Record<string, unknown>, header?: string) => (header ? String(row[header] ?? '').replace(/\s+/g, ' ').trim() : '');

export function parseQuickLinkRows(rows: Array<Record<string, unknown>>): { rows: QuickLinkRow[]; headers: Record<string, string>; hasSystemColumn: boolean } {
  if (!rows.length) return { rows: [], headers: {}, hasSystemColumn: false };
  const headers = findQuickLinkHeaders(Object.keys(rows[0]));
  const out: QuickLinkRow[] = [];
  rows.forEach((row, index) => {
    const rawCell = text(row, headers.rawName);
    if (!rawCell) return;
    // أكثر من اسم بديل في خلية واحدة: يفصلها | أو ; أو ؛ أو سطر جديد، ويصبح كل اسم صفاً مستقلاً.
    const names = String(row[headers.rawName] ?? '').split(/[|;؛\n\r]+/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const rawName of names.length ? names : [rawCell]) {
    const priceText = text(row, headers.price);
    const price = priceText === '' ? null : Number(convertArabicNumerals(priceText).replace(/[^\d.]/g, ''));
    out.push({
      rowNumber: out.length + 2,
      rawName,
      pack: text(row, headers.pack),
      price: price !== null && Number.isFinite(price) ? price : null,
      fileStatus: statusFromText(text(row, headers.status)),
      confidence: confidenceFromText(text(row, headers.confidence)),
      sysName: text(row, headers.sysName),
      sysStrength: text(row, headers.sysStrength),
      sysForm: text(row, headers.sysForm),
      sysPack: text(row, headers.sysPack),
      key: text(row, headers.key),
      note: text(row, headers.note),
    });
    }
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
  /** الصيغة الموحدة: الاسم + التركيز + العبوة+النوع (للأصناف التي تختلف صيغتها عن اسمها فقط). */
  byFormatted?: Map<string, Product[]>;
}

export function buildQuickLinkIndex(products: Product[]): QuickLinkProductIndex {
  const byKey = new Map<string, Product[]>();
  const byName = new Map<string, Product[]>();
  const byId = new Map<string, Product>();
  const byFormatted = new Map<string, Product[]>();
  const push = (map: Map<string, Product[]>, key: string, product: Product) => {
    const list = map.get(key);
    if (list) list.push(product); else map.set(key, [product]);
  };
  for (const product of products) {
    byId.set(product.id, product);
    push(byKey, productKeyOf(product), product);
    push(byName, normalizeAliasValue(product.tradeName), product);
    const formatted = catalogNameKey(product);
    if (formatted && formatted !== normalizeAliasValue(product.tradeName)) push(byFormatted, formatted, product);
  }
  return { byKey, byName, byId, byFormatted };
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

  // الصيغة الموحدة (اسم + تركيز + عبوة+نوع) كما صُدّرت من الصفحة: مطابقة حرفية كاملة.
  const formattedHits = unique(index.byFormatted?.get(normalizeAliasValue(name)) || []);
  if (formattedHits.length === 1) return { product: formattedHits[0], how: 'key', candidates: formattedHits };
  if (formattedHits.length > 1) return { product: null, how: 'ambiguous', candidates: formattedHits };

  const exactKey = productKeyOf({ tradeName: name, strength, form, packSize: pack });
  const exact = unique(index.byKey.get(exactKey) || []);
  if (exact.length === 1) return { product: exact[0], how: 'key', candidates: exact };

  const sameName = unique(index.byName.get(normalizeAliasValue(name)) || []);
  if (!sameName.length) return { product: null, how: 'none', candidates: [] };
  const dimensionsAgree = (product: Product) =>
    (!strength || !product.strength || strengthCompatible(product.strength, strength)) &&
    (!form || !product.form || formCompatible(product.form, form)) &&
    (!pack || !product.packSize || packSizeCompatible(product.packSize, pack));
  const compatibleByDetails = sameName.filter(dimensionsAgree);
  if (sameName.length === 1) {
    if (compatibleByDetails.length === 1) return { product: sameName[0], how: 'name', candidates: sameName };
    return { product: null, how: 'ambiguous', candidates: sameName };
  }

  const byStrength = strength ? compatibleByDetails.filter((product) => strengthCompatible(product.strength, strength) && canonicalStrength(strength).nums.length > 0) : [];
  if (strength && canonicalStrength(strength).nums.length > 0 && !byStrength.length) return { product: null, how: 'ambiguous', candidates: sameName };
  if (byStrength.length === 1) return { product: byStrength[0], how: 'name+strength', candidates: sameName };
  const pool = byStrength.length ? byStrength : compatibleByDetails;
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
  row: Pick<QuickLinkRow, 'fileStatus'> & { confidence?: number },
  resolution: { product: Product | null; how: string },
  existingProductId: string | undefined,
): QuickLinkState {
  const product = resolution.product;
  if (!product) return 'unlinked';
  if (existingProductId) return existingProductId === product.id ? 'linked' : 'conflict';
  if (row.fileStatus === 'review') return 'review';
  // ثقة متوسطة/منخفضة من الذكاء الاصطناعي: مراجعة يدوية فقط لهذه الصفوف.
  if (row.confidence && row.confidence < 80) return 'review';
  if (row.fileStatus === 'new') return 'review';
  if (resolution.how === 'name+form' || resolution.how === 'name+strength') return row.fileStatus === 'confirmed' ? 'ready' : 'review';
  return 'ready';
}
