import assert from 'node:assert/strict';
import { ProductMatcher } from '../src/utils/fuzzyMatch';
import { brandKey } from '../src/utils/brandKey';
import { productAliasDocumentId } from '../src/utils/productAliases';
import { buildQuickLinkIndex, classifyQuickLinkRow, findQuickLinkHeaders, parseQuickLinkRows, productKeyOf, resolveQuickLinkProduct } from '../src/utils/quickLink';
import type { Product, ProductAlias } from '../src/types';

const product = (id: string, tradeName: string, strength = '', form = '', packSize = ''): Product => ({
  id, tradeName, normalizedName: tradeName.toLowerCase(), form, strength, packSize, manufacturer: '', category: 'عام', activeIngredientId: '',
});

// ---- مفتاح الاسم التجاري (أمثلة من كشف الأصناف الفعلي) ---------------------
assert.equal(brandKey('ALKAPRESS PLUS F C', true), 'alkapress plus');
assert.equal(brandKey('ALKAPRESS PLUS 10/160MG 20 F.C TABS'), 'alkapress plus');
assert.equal(brandKey('ACRETIN GM', true), 'acretin');
assert.equal(brandKey('ACRETIN 0.025% CREAM 30 GM'), 'acretin');
assert.equal(brandKey('Allerban s.r. 2 mg 20 tabs'), 'allerban s r');
assert.equal(brandKey('Allerban s r', true), 'allerban s r');
assert.equal(brandKey('CO TAREG', true), 'co tareg');
assert.equal(brandKey('CO-TAREG 160/12.5MG 14 F.C.TABS.'), 'co tareg');

// ---- قراءة رؤوس الملف المجهّز --------------------------------------------
const headers = findQuickLinkHeaders(['الرقم', 'اسم الصنف في الملف', 'العبوة ', 'السعر', 'حالة الربط', 'الصنف في النظام', 'التركيز', 'مفتاح الربط']);
assert.equal(headers.rawName, 'اسم الصنف في الملف');
assert.equal(headers.sysName, 'الصنف في النظام');
assert.equal(headers.key, 'مفتاح الربط');

const parsed = parseQuickLinkRows([
  { 'الرقم': 1, 'اسم الصنف في الملف': ' ABIMOL 500 MG 20 TAB ', 'العبوة': 'Box', 'السعر': 6, 'حالة الربط': 'مؤكد', 'الصنف في النظام': 'ABIMOL', 'التركيز': '500MG', 'الشكل': 'Tablet', 'عبوة النظام': '20 Tablets', 'مفتاح الربط': 'ABIMOL|500MG|Tablet|20 Tablets' },
  { 'الرقم': 2, 'اسم الصنف في الملف': '', 'السعر': 3 },
  { 'الرقم': 3, 'اسم الصنف في الملف': 'SYMBICORT', 'السعر': '١٢٫٥', 'حالة الربط': 'غير موجود' },
]);
assert.equal(parsed.rows.length, 2);
assert.equal(parsed.rows[0].rawName, 'ABIMOL 500 MG 20 TAB');
assert.equal(parsed.rows[0].fileStatus, 'confirmed');
assert.equal(parsed.rows[1].fileStatus, 'new');
assert.equal(parsed.hasSystemColumn, true);

// ---- إيجاد صنف النظام ----------------------------------------------------
const catalog = [
  product('p1', 'ABIMOL', '500MG', 'Tablet', '20 Tablets'),
  product('p2', 'AMARYL', '2MG', 'Tablet', '30 Tablets'),
  product('p3', 'AMARYL', '3MG', 'Tablet', '30 Tablets'),
  product('p4', 'ATACAND', '8MG', 'Tablet', '14 Tablets'),
  product('p5', 'ATACAND', '16MG', 'Tablet', '14 Tablets'),
  product('p6', 'ALKAPRESS PLUS F C', '160MG', 'Tablet', '20 Tablets'),
];
const index = buildQuickLinkIndex(catalog);
assert.equal(productKeyOf({ tradeName: 'ABIMOL', strength: '500MG', form: 'Tablet', packSize: '20 Tablets' }), productKeyOf(catalog[0]));
assert.equal(resolveQuickLinkProduct(parsed.rows[0], index).product?.id, 'p1');
assert.equal(resolveQuickLinkProduct({ sysName: 'AMARYL', sysStrength: '3MG', sysForm: '', sysPack: '', key: '' }, index).product?.id, 'p3');
assert.equal(resolveQuickLinkProduct({ sysName: 'amaryl', sysStrength: '4mg', sysForm: '', sysPack: '', key: '' }, index).product, null);
assert.equal(resolveQuickLinkProduct({ sysName: 'ATACAND', sysStrength: '', sysForm: '', sysPack: '', key: 'ATACAND|16MG|Tablet|14 Tablets' }, index).product?.id, 'p5');
assert.equal(resolveQuickLinkProduct({ sysName: 'ALKAPRESS PLUS F C', sysStrength: '', sysForm: '', sysPack: '', key: '' }, index).how, 'name');
assert.equal(resolveQuickLinkProduct({ sysName: '', sysStrength: '', sysForm: '', sysPack: '', key: '' }, index).how, 'none');
assert.equal(resolveQuickLinkProduct({ sysName: 'NOT HERE', sysStrength: '', sysForm: '', sysPack: '', key: '' }, index).how, 'none');

// ---- التصنيف --------------------------------------------------------------
const hit = { product: catalog[0], how: 'key' };
assert.equal(classifyQuickLinkRow({ fileStatus: 'confirmed' }, hit, undefined), 'ready');
assert.equal(classifyQuickLinkRow({ fileStatus: 'review' }, hit, undefined), 'review');
assert.equal(classifyQuickLinkRow({ fileStatus: 'confirmed' }, hit, 'p1'), 'linked');
assert.equal(classifyQuickLinkRow({ fileStatus: 'confirmed' }, hit, 'p2'), 'conflict');
assert.equal(classifyQuickLinkRow({ fileStatus: 'new' }, { product: null, how: 'none' }, undefined), 'unlinked');

// ---- الاسم البديل المحفوظ يطابق فوراً في رفع الأسعار ---------------------------
const supplierId = 'sup1';
const aliasFor = (rawName: string, productId: string): ProductAlias => ({
  id: productAliasDocumentId({ supplierId, rawName }), supplierId, productId, rawName, normalizedName: rawName.toLowerCase().replace(/\s+/g, ' ').trim(),
  identityKey: '', createdAt: '', createdByUid: 'u',
});
// normalizedName يجب أن يطابق normalizeAliasValue؛ نستخدم المصدر الحقيقي عبر المطابق نفسه.
import { normalizeAliasValue, createAliasIdentityKey } from '../src/utils/productAliases';
const savedAlias = (rawName: string, productId: string): ProductAlias => ({
  id: productAliasDocumentId({ supplierId, rawName }), supplierId, productId, rawName, normalizedName: normalizeAliasValue(rawName),
  identityKey: createAliasIdentityKey({ rawName }), createdAt: '', createdByUid: 'u',
});
void aliasFor;
const matcher = new ProductMatcher(catalog, [savedAlias('ALKAPRESS PLUS 10/160MG 20 F.C TABS', 'p6')], supplierId);
const viaAlias = matcher.match('ALKAPRESS PLUS 10/160MG 20 F.C TABS');
assert.equal(viaAlias.status, 'exact');
assert.equal(viaAlias.matchedBy, 'alias');
assert.equal(viaAlias.matchedProduct?.id, 'p6');
// مورد آخر لا يتأثر بأسماء مورد غير مربوط.
assert.notEqual(new ProductMatcher(catalog, [savedAlias('ALKAPRESS PLUS 10/160MG 20 F.C TABS', 'p6')], 'other').match('ALKAPRESS PLUS 10/160MG 20 F.C TABS').matchedBy, 'alias');
// بلا ربط: الاسم التجاري المختصر يظهر كاقتراح للمراجعة وليس اعتماداً تلقائياً.
const noAlias = new ProductMatcher(catalog, [], supplierId).match('ALKAPRESS PLUS 10/160MG 20 F.C TABS');
assert.equal(noAlias.matchedProduct, null);
assert.equal(noAlias.suggestions[0]?.product.id, 'p6');

console.log('quickLink tests passed');
