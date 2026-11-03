import { convertArabicNumerals } from './arabicNormalize';

/**
 * هوية الصنف: الاسم الأساسي + التركيز + الشكل + العبوة.
 * تُستخرج من اسم مركّب مثل "Adwaflam 75ml amp" أو "اديفلام 75 مل حقن"،
 * وتُستخدم للمطابقة فقط. لا تغيّر مفاتيح الأسماء البديلة المحفوظة (productAliases).
 */

export type FormCode =
  | 'tab' | 'cap' | 'amp' | 'vial' | 'inj' | 'syrup' | 'susp' | 'solution' | 'cream' | 'oint' | 'gel'
  | 'lotion' | 'drops' | 'eye' | 'supp' | 'spray' | 'sachet' | 'patch' | 'powder' | 'eff';

export interface ParsedIdentity {
  baseName: string;
  /** الاسم بعد حذف رقم أخير منفرد (Nurofen 400 -> nurofen)؛ يُجرَّب كاحتمال ثانٍ لأن الرقم قد يكون جزءاً من الاسم التجاري أو عبوة. */
  baseNoNumber: string;
  trailingNumber: string;
  strength: string;
  formCode: FormCode | '';
  packSize: string;
  normalized: string;
}

interface FormRule { code: FormCode; label: string; family: string; pattern: string }

// الترتيب مهم: العبارات الأطول والأخص أولاً.
const FORM_RULES: FormRule[] = [
  { code: 'eye', label: 'قطرات عين', family: 'eye', pattern: 'eye drops?|ophthalmic|قطره عين|قطرات عين|نقط عين' },
  { code: 'eff', label: 'فوار', family: 'eff', pattern: 'effervescent|eff|فوار' },
  { code: 'susp', label: 'شراب معلق', family: 'liq', pattern: 'susp(?:ension)?|معلق' },
  { code: 'syrup', label: 'شراب', family: 'liq', pattern: 'syrup|syr|elixir|شراب' },
  { code: 'drops', label: 'قطرات فموية', family: 'drops', pattern: 'drops?|gtt|قطره|قطرات|نقط' },
  { code: 'solution', label: '', family: 'liq', pattern: 'solution|sol|محلول' },
  { code: 'tab', label: 'أقراص', family: 'tab', pattern: 'tablets?|tabs?|tb|اقراص|قرص|حبوب|حبه' },
  { code: 'cap', label: 'كبسولات', family: 'cap', pattern: 'capsules?|caps?|cp|كبسولات|كبسوله|كبسول' },
  { code: 'amp', label: 'حقن', family: 'inj', pattern: 'ampoules?|amps?|امبولات|امبوله|امبول|حقنه|حقن' },
  { code: 'vial', label: 'حقن', family: 'inj', pattern: 'vials?|فيال|قارورات|قارورة' },
  { code: 'inj', label: 'حقن', family: 'inj', pattern: 'injections?|inj' },
  { code: 'cream', label: 'كريم', family: 'cream', pattern: 'cream|cr|كريم' },
  { code: 'oint', label: 'مرهم', family: 'oint', pattern: 'ointment|oint|مرهم' },
  { code: 'gel', label: 'جل', family: 'gel', pattern: 'gel|جل' },
  { code: 'lotion', label: '', family: 'lotion', pattern: 'lotion|لوشن|غسول' },
  { code: 'supp', label: 'تحاميل', family: 'supp', pattern: 'suppositor(?:y|ies)|supp|تحاميل|تحميله|لبوس' },
  { code: 'spray', label: 'بخاخ', family: 'spray', pattern: 'spray|inhaler|بخاخ' },
  { code: 'sachet', label: '', family: 'sachet', pattern: 'sachets?|اكياس|كيس' },
  { code: 'patch', label: '', family: 'patch', pattern: 'patch(?:es)?|لصقه|لصقات' },
  { code: 'powder', label: '', family: 'powder', pattern: 'powder|بودره' },
];

const NOT_WORD = '(?<![\\u0600-\\u06FFa-z0-9])';
const NOT_WORD_AFTER = '(?![\\u0600-\\u06FFa-z0-9])';
const wordRe = (pattern: string, flags = 'g') => new RegExp(`${NOT_WORD}(?:${pattern})${NOT_WORD_AFTER}`, flags);

const FORM_REGEXES = FORM_RULES.map((rule) => ({ rule, re: wordRe(rule.pattern) }));

const UNIT_REPLACEMENTS: Array<[RegExp, string]> = [
  [wordRe('ملغ|ملجم|ملغم|مجم|مغ|milligrams?|mgs?'), 'mg'],
  [wordRe('ميكروغرام|مايكروغرام|ميكروجرام|mcgs?|micrograms?|ug'), 'mcg'],
  [wordRe('غرام|جرام|غم|جم|grams?|gms?|gm|gr'), 'g'],
  [wordRe('مليلتر|ملل|مل|milliliters?|millilitres?|mls?'), 'ml'],
  [wordRe('وحده دوليه|وحدات دوليه|وحده|iu|i\\.u'), 'iu'],
];

const NUMBER_UNIT = '(?:mg|mcg|g|iu|%|ml)';

/** تطبيع خاص بالمطابقة: يحافظ على / و . و % حتى يمكن قراءة 125mg/5ml و0.5%. */
export function normalizeForMatch(value: unknown): string {
  let s = convertArabicNumerals(String(value ?? ''))
    .replace(/[ً-ٰٟۖ-ۭ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[٫،]/g, '.')
    .replace(/[×*]/g, ' x ')
    .replace(/[^؀-ۿa-z0-9\s./%+-]/g, ' ');
  s = s.replace(/\+/g, ' ').replace(/-/g, ' ');
  // افصل الأرقام عن الحروف ثم أعد وصل الرقم بوحدته: 75مل -> 75 مل -> 75ml
  s = s.replace(/(\d)([a-z؀-ۿ%])/g, '$1 $2').replace(/([a-z؀-ۿ])(\d)/g, '$1 $2');
  for (const [re, unit] of UNIT_REPLACEMENTS) s = s.replace(re, unit);
  s = s.replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${NUMBER_UNIT})${NOT_WORD_AFTER}`, 'g'), '$1$2');
  s = s.replace(/\s*\/\s*/g, '/').replace(/(?<![\d])\.(?!\d)/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function canonicalFormCode(value: unknown): FormCode | '' {
  const n = normalizeForMatch(value);
  if (!n) return '';
  for (const { rule, re } of FORM_REGEXES) {
    re.lastIndex = 0;
    if (re.test(n)) return rule.code;
  }
  return '';
}

export function formLabelFromCode(code: FormCode | ''): string {
  return FORM_RULES.find((rule) => rule.code === code)?.label || '';
}

function formFamily(code: FormCode | ''): string {
  return FORM_RULES.find((rule) => rule.code === code)?.family || '';
}

const COMPOUND_STRENGTH = new RegExp(`${NOT_WORD}(\\d+(?:\\.\\d+)?${NUMBER_UNIT}?)/(\\d+(?:\\.\\d+)?${NUMBER_UNIT}?)${NOT_WORD_AFTER}`);
const MEASURE = new RegExp(`${NOT_WORD}(\\d+(?:\\.\\d+)?)(mg|mcg|g|iu|%|ml)${NOT_WORD_AFTER}`, 'g');

/** يفك اسماً مركباً إلى اسم أساسي وتركيز وشكل وعبوة. */
export function parseProductIdentity(raw: unknown): ParsedIdentity {
  const normalized = normalizeForMatch(raw);
  let rest = normalized;
  let strength = '';
  let packSize = '';

  const compound = rest.match(COMPOUND_STRENGTH);
  if (compound && /[a-z%]/.test(compound[0])) {
    strength = compound[0];
    rest = rest.replace(compound[0], ' ');
  }

  const measures = [...rest.matchAll(MEASURE)];
  if (!strength) {
    const primary = measures.find((m) => m[2] !== 'ml') || measures[0];
    if (primary) { strength = primary[0]; rest = rest.replace(primary[0], ' '); }
  }
  // قياس ml ثانٍ بعد وجود تركيز = حجم عبوة (شراب 125mg/5ml 100ml).
  const volume = [...rest.matchAll(MEASURE)].find((m) => m[2] === 'ml');
  if (strength && volume) { packSize = volume[0]; rest = rest.replace(volume[0], ' '); }

  let formCode: FormCode | '' = '';
  for (const { rule, re } of FORM_REGEXES) {
    re.lastIndex = 0;
    if (re.test(rest)) {
      if (!formCode) formCode = rule.code;
      re.lastIndex = 0;
      rest = rest.replace(re, ' ');
    }
  }

  if (!packSize) {
    const times = rest.match(new RegExp(`${NOT_WORD}x\\s*(\\d+)${NOT_WORD_AFTER}`));
    if (times) { packSize = times[1]; rest = rest.replace(times[0], ' '); }
  }
  const baseName = rest.replace(/\s+/g, ' ').trim() || normalized;
  const trailing = baseName.match(/^(.+?)\s+(\d{1,4})$/);
  return {
    baseName,
    baseNoNumber: trailing ? trailing[1] : baseName,
    trailingNumber: trailing ? trailing[2] : '',
    strength, formCode, packSize, normalized,
  };
}

/** يحوّل التركيز إلى صيغة قابلة للمقارنة (g -> mg). */
export function canonicalStrength(value: unknown): { nums: string[]; units: string[]; text: string } {
  const n = normalizeForMatch(value);
  const parts = [...n.matchAll(/(\d+(?:\.\d+)?)(mg|mcg|g|iu|%|ml)?/g)];
  const nums: string[] = [];
  const units: string[] = [];
  for (const part of parts) {
    let num = Number(part[1]);
    let unit = part[2] || '';
    if (unit === 'g') { num *= 1000; unit = 'mg'; }
    nums.push(String(Number(num.toFixed(4))));
    units.push(unit);
  }
  return { nums, units, text: nums.map((x, i) => `${x}${units[i]}`).join('/') };
}

export function strengthCompatible(a: unknown, b: unknown): boolean {
  const left = canonicalStrength(a);
  const right = canonicalStrength(b);
  if (!left.nums.length || !right.nums.length) return true;
  if (left.nums.join('/') !== right.nums.join('/')) return false;
  const leftUnits = left.units.join('/');
  const rightUnits = right.units.join('/');
  const leftHasUnit = left.units.some(Boolean);
  const rightHasUnit = right.units.some(Boolean);
  return leftUnits === rightUnits || !leftHasUnit || !rightHasUnit;
}

export function formCompatible(a: unknown, b: unknown): boolean {
  const left = canonicalFormCode(a);
  const right = canonicalFormCode(b);
  if (!left || !right || left === right) return true;
  return formFamily(left) === formFamily(right);
}

export function packSizeCompatible(a: unknown, b: unknown): boolean {
  const left = (normalizeForMatch(a).match(/\d+(?:\.\d+)?/g) || []).join('/');
  const right = (normalizeForMatch(b).match(/\d+(?:\.\d+)?/g) || []).join('/');
  return !left || !right || left === right;
}

export interface IdentityFields {
  tradeName?: string;
  strength?: string;
  form?: string;
  packSize?: string;
}

export interface ResolvedIdentity {
  baseName: string;
  baseNoNumber: string;
  trailingNumber: string;
  strength: string;
  formCode: FormCode | '';
  packSize: string;
}

/** دمج الحقول الصريحة مع ما استُخرج من الاسم؛ الحقل الصريح يغلب. */
export function resolveIdentity(fields: IdentityFields): ResolvedIdentity {
  const parsed = parseProductIdentity(fields.tradeName);
  return {
    baseName: parsed.baseName,
    baseNoNumber: parsed.baseNoNumber,
    trailingNumber: parsed.trailingNumber,
    strength: String(fields.strength ?? '').trim() || parsed.strength,
    formCode: canonicalFormCode(fields.form) || parsed.formCode,
    packSize: String(fields.packSize ?? '').trim() || parsed.packSize,
  };
}

export function identitiesCompatible(a: ResolvedIdentity, b: ResolvedIdentity): boolean {
  return strengthCompatible(a.strength, b.strength)
    && formCompatible(a.formCode, b.formCode)
    && packSizeCompatible(a.packSize, b.packSize);
}

/** كم حقل (تركيز/شكل/عبوة) موجود في الطرفين ومتطابق صراحةً؟ */
export function identityAgreement(a: ResolvedIdentity, b: ResolvedIdentity): number {
  let score = 0;
  if (a.strength && b.strength && strengthCompatible(a.strength, b.strength)) score += 1;
  if (a.formCode && b.formCode && formCompatible(a.formCode, b.formCode)) score += 1;
  if (a.packSize && b.packSize && packSizeCompatible(a.packSize, b.packSize)) score += 1;
  return score;
}

/** مفتاح مقروء للمطابقة، مثال: adwaflam|75ml|amp */
export function buildMatchKey(fields: IdentityFields): string {
  const id = resolveIdentity(fields);
  return [id.baseName, canonicalStrength(id.strength).text, id.formCode, (normalizeForMatch(id.packSize).match(/\d+/g) || []).join('/')].join('|');
}

// ---------------------------------------------------------------------------
// إظهار التركيب (المواد الفعالة)
// ---------------------------------------------------------------------------

export type CompositionDisplay = 'auto' | 'show' | 'hide';
export const MAX_AUTO_COMPOSITION_INGREDIENTS = 3;

/** قرار الإدارة (show/hide) يغلب القاعدة التلقائية: auto يخفي التركيب إذا زادت المواد عن 3. */
export function shouldShowComposition(
  product: { compositionDisplay?: CompositionDisplay | string } | null | undefined,
  ingredientCount: number,
): boolean {
  if (ingredientCount <= 0) return false;
  const mode = product?.compositionDisplay;
  if (mode === 'hide') return false;
  if (mode === 'show') return true;
  return ingredientCount <= MAX_AUTO_COMPOSITION_INGREDIENTS;
}

// ---------------------------------------------------------------------------
// ترحيل الأصناف القديمة
// ---------------------------------------------------------------------------

export interface MigrationProduct {
  id: string;
  tradeName: string;
  strength?: string;
  form?: string;
  packSize?: string;
}

export interface MigrationChange {
  id: string;
  before: { tradeName: string; strength: string; form: string; packSize: string };
  after: { tradeName: string; strength: string; form: string; packSize: string };
  changedFields: Array<'tradeName' | 'strength' | 'form' | 'packSize'>;
}

/**
 * يقترح ملء التركيز والشكل والعبوة الفارغة من الاسم التجاري، ويحذف الجزء المستخرج من الاسم.
 * لا يستبدل أبداً قيمة موجودة. القيمة الفارغة فقط تُملأ.
 */
export function planProductIdentityMigration(products: MigrationProduct[], options: { stripFromName?: boolean } = {}): MigrationChange[] {
  const strip = options.stripFromName !== false;
  const changes: MigrationChange[] = [];
  for (const product of products) {
    const name = String(product.tradeName || '').trim();
    if (!name) continue;
    const parsed = parseProductIdentity(name);
    const current = {
      tradeName: name,
      strength: String(product.strength ?? '').trim(),
      form: String(product.form ?? '').trim(),
      packSize: String(product.packSize ?? '').trim(),
    };
    const after = { ...current };
    const changedFields: MigrationChange['changedFields'] = [];
    if (!current.strength && parsed.strength) { after.strength = parsed.strength; changedFields.push('strength'); }
    const formLabel = formLabelFromCode(parsed.formCode);
    if (!current.form && formLabel) { after.form = formLabel; changedFields.push('form'); }
    if (!current.packSize && parsed.packSize) { after.packSize = parsed.packSize; changedFields.push('packSize'); }
    if (strip && changedFields.length && parsed.baseName && parsed.baseName !== parsed.normalized) {
      // نحافظ على كتابة الاسم الأصلية قدر الإمكان: نحذف أجزاء التركيز والشكل من النص الأصلي لا من النص المطبّع.
      const stripped = stripIdentityTokens(name, parsed);
      if (stripped && stripped !== name) { after.tradeName = stripped; changedFields.push('tradeName'); }
    }
    if (changedFields.length) changes.push({ id: product.id, before: current, after, changedFields });
  }
  return changes;
}

function stripIdentityTokens(original: string, parsed: ParsedIdentity): string {
  let text = convertArabicNumerals(original);
  // أزل قياسات الوحدات بأي كتابة (75 ml / 75مل / 75 Mg).
  text = text.replace(/\d+(?:[.٫]\d+)?\s*(?:mg|mcg|ml|iu|g|%|ملغ|ملجم|مل|غرام|جرام|جم|وحدة)(?:\s*\/\s*\d+(?:[.٫]\d+)?\s*(?:mg|mcg|ml|iu|g|%|ملغ|ملجم|مل|غرام|جرام|جم)?)?/gi, ' ');
  for (const { rule } of FORM_REGEXES) {
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${rule.pattern})(?![\\p{L}\\p{N}])`, 'giu'), ' ');
  }
  text = text.replace(/(?<![\p{L}\p{N}])[x×]\s*\d+(?![\p{L}\p{N}])/giu, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  // إن بقي اسم قصير جداً أو فارغ فلا نغيّر شيئاً.
  const baseWords = parsed.baseName.split(' ').filter(Boolean);
  return text.length >= 2 && baseWords.length ? text : original;
}
