/**
 * v56 — مفتاح الاسم التجاري: يقتطع من اسم الصنف ما قبل أول رقم أو كلمة شكل/عبوة (F C، GM، EYE، SYRUP...).
 * يستعمل للاقتراح فقط (لا للاعتماد التلقائي) لأن أسماء الكتالوج قد تحمل لواحق زائدة مثل «ALKAPRESS PLUS F C».
 */
const CUT_WORDS = new Set([
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'caplets', 'syrup', 'syr', 'susp', 'suspension', 'cream', 'gel', 'amp', 'amps',
  'ampoule', 'ampoules', 'vial', 'vials', 'inhaler', 'drops', 'drop', 'eye', 'oint', 'ointment', 'sachet', 'sachets', 'spray', 'spry', 'supp', 'suppositories',
  'lotion', 'shampoo', 'soap', 'powder', 'pd', 'sol', 'solution', 'inj', 'injection', 'film', 'oral', 'topical', 'prolonged', 'effervescent', 'eff', 'chewable',
  'dispersible', 'granules', 'patch', 'paste', 'mouthwash', 'foam', 'serum', 'prefilled', 'syringes', 'syringe', 'nasal', 'vag', 'vaginal', 'top', 'rectal', 'miu',
  'iu', 'scored', 'lozenges', 'gastro', 'enteric', 'sublingual', 'disp', 'orodispersible', 'aerosol', 'inh', 'depot', 'dela', 'rel', 'gummies', 'drugs', 'viscous',
  'herbal', 'sugar', 'soft', 'gelatin', 'mr', 'er', 'ec', 'id', 'strips', 'strip', 'piece', 'pieces', 'coated',
  'gm', 'gms', 'gram', 'grams', 'mg', 'ml',
  'قرص', 'اقراص', 'كبسولات', 'كبسولة', 'شراب', 'كريم', 'مرهم', 'جل', 'قطرة', 'قطرات', 'حقن', 'امبولات', 'تحاميل', 'بخاخ',
]);
const PAIRS = new Set(['f c', 'e c', 'm r', 'e r', 'i m', 'i u', 'i v', 's c']);

function tokens(value: unknown): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff./% ]/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

export function brandKey(name: unknown, isCatalogName = false): string {
  const list = tokens(name);
  const out: string[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const word = list[index];
    if (index > 0 && /\d/.test(word)) break;
    if (index === 0 && !isCatalogName && /\d/.test(word)) break;
    if (index > 0 && CUT_WORDS.has(word)) break;
    if (index > 0 && index + 1 < list.length && PAIRS.has(`${word} ${list[index + 1]}`)) break;
    out.push(word);
  }
  return out.join(' ') || list[0] || '';
}
