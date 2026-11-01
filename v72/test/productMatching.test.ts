import assert from 'node:assert/strict';
import { ProductMatcher } from '../src/utils/fuzzyMatch';
import {
  buildMatchKey,
  canonicalStrength,
  normalizeForMatch,
  parseProductIdentity,
  planProductIdentityMigration,
  shouldShowComposition,
  strengthCompatible,
} from '../src/utils/productIdentity';
import { globalProductAliasDocumentId, productAliasDocumentId, normalizeAliasValue } from '../src/utils/productAliases';
import type { Product, ProductAlias } from '../src/types';
import { calculateEffectiveUnitPrice } from '../src/utils/formatPrice';

const product = (id: string, tradeName: string, extra: Partial<Product> = {}): Product => ({
  id, tradeName, normalizedName: tradeName.toLowerCase(), form: '', strength: '', manufacturer: '', category: 'عام', activeIngredientId: '', ...extra,
});

// ---- تفكيك الاسم المركب -------------------------------------------------
let p = parseProductIdentity('Adwaflam 75ml amp');
assert.deepEqual([p.baseName, p.strength, p.formCode, p.packSize], ['adwaflam', '75ml', 'amp', '']);
p = parseProductIdentity('اديفلام 75 مل حقن');
assert.deepEqual([p.baseName, p.strength, p.formCode], ['اديفلام', '75ml', 'amp']);
p = parseProductIdentity('ADWAFLAM  75 ML  AMP.');
assert.deepEqual([p.baseName, p.strength, p.formCode], ['adwaflam', '75ml', 'amp']);
p = parseProductIdentity('Amoxil syrup 125mg/5ml 100ml');
assert.deepEqual([p.baseName, p.strength, p.formCode, p.packSize], ['amoxil', '125mg/5ml', 'syrup', '100ml']);
p = parseProductIdentity('Augmentin 1g tab x14');
assert.deepEqual([p.baseName, p.strength, p.formCode, p.packSize], ['augmentin', '1g', 'tab', '14']);
p = parseProductIdentity('بنادول ٥٠٠ ملغ اقراص');
assert.deepEqual([p.baseName, p.strength, p.formCode], ['بنادول', '500mg', 'tab']);
p = parseProductIdentity('Voltaren 0.5% gel');
assert.deepEqual([p.baseName, p.strength, p.formCode], ['voltaren', '0.5%', 'gel']);
p = parseProductIdentity('Nurofen 400');
assert.equal(p.baseName, 'nurofen 400');
assert.equal(p.baseNoNumber, 'nurofen');
assert.equal(buildMatchKey({ tradeName: 'Adwaflam', strength: '75 ml', form: 'حقن' }), 'adwaflam|75ml|amp|');
assert.equal(normalizeForMatch('75 مل'), '75ml');

// ---- مقارنة التركيز -----------------------------------------------------
assert.equal(strengthCompatible('1g', '1000mg'), true);
assert.equal(strengthCompatible('75ml', '75mg'), false);
assert.equal(strengthCompatible('500', '500mg'), true);
assert.equal(strengthCompatible('250mg', '500mg'), false);
assert.deepEqual(canonicalStrength('125 mg / 5 ml').nums, ['125', '5']);

// ---- المطابقة -----------------------------------------------------------
const catalog = [
  product('amp', 'Adwaflam', { strength: '75ml', form: 'حقن' }),
  product('tab', 'Adwaflam', { strength: '50mg', form: 'أقراص' }),
  product('pan', 'Panadol', { strength: '500mg', form: 'أقراص' }),
  product('nur4', 'Nurofen 400'),
  product('nur6', 'Nurofen 600'),
  product('arabic', 'اديفلام بلس', { strength: '10mg', form: 'كبسولات' }),
];
const matcher = new ProductMatcher(catalog);
const run = (name: string, extra: Record<string, string | undefined> = {}) => matcher.match(name, undefined, { tradeName: name, ...extra });

let r = run('Adwaflam 75ml amp');
assert.equal(r.status, 'exact');
assert.equal(r.matchedProduct?.id, 'amp', 'اسم مركب يطابق صنف الحقن لا الأقراص');
assert.equal(run('ADWAFLAM 75 ML AMP').matchedProduct?.id, 'amp');
assert.equal(run('Adwaflam 50 mg tablets').matchedProduct?.id, 'tab');
assert.equal(run('Panadol 500mg 24 tab').matchedProduct?.id, 'pan');
assert.equal(run('بنادول').matchedProduct, null, 'اسم عربي غير موجود بالكتالوج لا يُربط بصنف آخر');
assert.equal(run('اديفلام بلس 10 ملغ كبسولات').matchedProduct?.id, 'arabic');
assert.equal(run('Nurofen 400 tab').matchedProduct?.id, 'nur4', 'الرقم جزء من الاسم التجاري');

r = run('Adwaflam 75mg amp');
assert.equal(r.matchedProduct, null, 'وحدة مختلفة (mg بدل ml) لا تُربط تلقائياً');
r = run('Adwaflam');
assert.equal(r.status, 'fuzzy', 'اسم بلا تركيز وفيه صنفان: مراجعة يدوية');
assert.equal(r.matchedProduct, null);
assert.ok(r.suggestions.length >= 2);
r = run('Panadol 1000mg');
assert.equal(r.matchedProduct, null, 'تركيز مختلف لا يُربط');

// الأعمدة المنفصلة (تركيز وشكل في أعمدتها) تعمل كما كانت
r = matcher.match('Adwaflam 75ml amp', undefined, { tradeName: 'Adwaflam', strength: '75ml', form: 'amp' });
assert.equal(r.matchedProduct?.id, 'amp');

// ---- الأسماء البديلة المحفوظة تبقى بنفس المعرّف ------------------------------
assert.equal(normalizeAliasValue('Adwaflam 75 ML Amp'), 'adwaflam 75ml amp');
const aliasInput = { supplierId: 's1', rawName: 'ADW 75 amp' };
const aliasId = productAliasDocumentId(aliasInput);
assert.match(aliasId, /^alias_/);
const alias: ProductAlias = {
  id: aliasId, supplierId: 's1', productId: 'tab', rawName: 'ADW 75 amp', normalizedName: normalizeAliasValue('ADW 75 amp'),
  identityKey: '', createdAt: '', createdByUid: 'u',
};
const withAlias = new ProductMatcher(catalog, [alias], 's1');
r = withAlias.match('ADW 75 amp', undefined, { tradeName: 'ADW 75 amp' });
assert.equal(r.matchedProduct?.id, 'tab');
assert.equal(r.matchedBy, 'alias');
const globalAlias: ProductAlias = {
  id: globalProductAliasDocumentId('GLOBAL ADWAF 50MG'), supplierId: '*', scope: 'global', productId: 'tab',
  rawName: 'GLOBAL ADWAF 50MG', normalizedName: normalizeAliasValue('GLOBAL ADWAF 50MG'), identityKey: '',
  createdAt: '', createdByUid: 'admin',
};
const globalMatcher = new ProductMatcher(catalog, [globalAlias], 'a-different-supplier');
r = globalMatcher.match('GLOBAL ADWAF 50MG', undefined, { tradeName: 'GLOBAL ADWAF 50MG' });
assert.equal(r.matchedProduct?.id, 'tab', 'القاموس العام يطبق دون معرفة المورد');
assert.equal(r.matchedBy, 'alias');

// ---- إظهار التركيب ------------------------------------------------------
assert.equal(shouldShowComposition({}, 0), false);
assert.equal(shouldShowComposition({}, 3), true);
assert.equal(shouldShowComposition({}, 4), false, 'auto يخفي إذا زادت المواد عن 3');
assert.equal(shouldShowComposition({ compositionDisplay: 'auto' }, 5), false);
assert.equal(shouldShowComposition({ compositionDisplay: 'show' }, 6), true, 'قرار الإدارة يغلب');
assert.equal(shouldShowComposition({ compositionDisplay: 'hide' }, 1), false);

// ---- ترحيل الأصناف القديمة ----------------------------------------------
const plan = planProductIdentityMigration([
  { id: '1', tradeName: 'Adwaflam 75ml amp' },
  { id: '2', tradeName: 'Panadol', strength: '500mg', form: 'أقراص' },
  { id: '3', tradeName: 'Augmentin 1g tab', strength: '625mg' },
  { id: '4', tradeName: 'Nurofen 400' },
]);
assert.equal(plan.length, 2);
assert.equal(plan[0].id, '1');
assert.deepEqual([plan[0].after.tradeName, plan[0].after.strength, plan[0].after.form], ['Adwaflam', '75ml', 'حقن']);
assert.equal(plan[1].id, '3');
assert.equal(plan[1].after.strength, '625mg', 'لا تُستبدل قيمة موجودة أبداً');
assert.equal(plan[1].after.form, 'أقراص');
assert.equal(plan[1].after.tradeName, 'Augmentin');

// ---- صيغ البونص الواردة من ملفات الموردين -------------------------------
assert.deepEqual(calculateEffectiveUnitPrice(100, '10+1'), { effectivePrice: 90.91, hasBonus: true, bonusDetails: '10+1', discountPercent: 9 });
assert.deepEqual(calculateEffectiveUnitPrice(100, '10*1'), { effectivePrice: 90.91, hasBonus: true, bonusDetails: '10+1', discountPercent: 9 });
assert.deepEqual(calculateEffectiveUnitPrice(100, '1×10'), { effectivePrice: 9.09, hasBonus: true, bonusDetails: '1+10', discountPercent: 91 });
assert.equal(calculateEffectiveUnitPrice(100, '١٠ x ١').bonusDetails, '10+1', 'Arabic digits and x separator are accepted');

console.log('Product matching tests passed.');
