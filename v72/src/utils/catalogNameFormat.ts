import type { Product } from '../types';
import { canonicalFormCode, normalizeForMatch, FormCode } from './productIdentity';
import { normalizeAliasValue } from './productAliases';

/** الاختصارات الموحدة لنوع الصنف في الصيغة: الاسم + التركيز + العبوة+النوع. */
export const FORM_ABBREVIATIONS: Record<FormCode, string> = {
  tab: 'tab', cap: 'cap', amp: 'amp', vial: 'vial', inj: 'inj', syrup: 'syr', susp: 'susp', solution: 'sol',
  cream: 'cream', oint: 'oint', gel: 'gel', lotion: 'lotion', drops: 'drop', eye: 'eye', supp: 'supp',
  spray: 'spray', sachet: 'sach', patch: 'patch', powder: 'pwd', eff: 'eff',
};

export const FORM_ABBREVIATION_HELP = 'tab أقراص · cap كبسولات · amp أمبولات · vial فيال · inj حقن · syr شراب · susp معلق · sol محلول · cream كريم · oint مرهم · gel جل · lotion لوشن · drop قطرات · eye قطرات عين · supp تحاميل · spray بخاخ · sach أكياس · patch لصقات · pwd بودرة · eff فوار';

const compactStrength = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text || /^standard$/i.test(text)) return '';
  return text.replace(/\s+/g, '').toLowerCase();
};

/** يحوّل العبوة إلى عدد+نوع: "30 Tablets" → 30tab، "30tab 6amp" تبقى كما هي، "20" + شكل الصنف → 20tab. */
export function packWithType(packSize: unknown, form: unknown): string {
  const pack = normalizeForMatch(packSize);
  const formCode = canonicalFormCode(form);
  const parts: string[] = [];
  const re = /(\d+(?:\.\d+)?)\s*((?:[a-z؀-ۿ.]+\s*)*)/g;
  let match: RegExpExecArray | null;
  let tokens = 0;
  while ((match = re.exec(pack))) {
    tokens += 1;
    const count = match[1];
    const rest = match[2].trim();
    const code = rest ? canonicalFormCode(rest) : '';
    if (code) parts.push(`${count}${FORM_ABBREVIATIONS[code]}`);
    else if (rest && rest.replace(/[^a-z]/g, '').length <= 4 && /^(?:ml|g|mg|l|gm)$/.test(rest)) parts.push(`${count}${rest}`);
    else parts.push(count);
  }
  if (tokens === 1 && /^\d+(?:\.\d+)?$/.test(parts[0]) && formCode) parts[0] = `${parts[0]}${FORM_ABBREVIATIONS[formCode]}`;
  if (!parts.length && formCode) return FORM_ABBREVIATIONS[formCode];
  return parts.join(' ');
}

/** الصيغة الموحدة لتصدير الكتالوج: Adeaflam 75ml 6amp */
export function formatCatalogName(product: Pick<Product, 'tradeName' | 'strength' | 'form' | 'packSize'>): string {
  return [String(product.tradeName ?? '').trim(), compactStrength(product.strength), packWithType(product.packSize, product.form)]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export const catalogNameKey = (product: Pick<Product, 'tradeName' | 'strength' | 'form' | 'packSize'>) => normalizeAliasValue(formatCatalogName(product));
