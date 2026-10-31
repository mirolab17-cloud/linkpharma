import assert from 'node:assert/strict';
import type { Product, ProductAlias } from '../src/types';
import {
  compareAliasNames,
  createAliasSimilarityIndex,
  createProductSuggestionIndex,
  findExactDuplicateAliasGroups,
  findSimilarAliasPairs,
  suggestProductsForAlias,
} from '../src/utils/aliasSuggestions';
import { normalizeAliasValue } from '../src/utils/productAliases';

const product = (id: string, tradeName: string, strength: string): Product => ({
  id, tradeName, normalizedName: tradeName.toLowerCase(), strength, form: 'أقراص', packSize: '20', manufacturer: 'Test Pharma', category: 'عام', activeIngredientId: '',
});
const alias = (id: string, rawName: string, productId: string): ProductAlias => ({
  id, supplierId: '*', scope: 'global', productId, rawName, normalizedName: normalizeAliasValue(rawName),
  identityKey: normalizeAliasValue(rawName), createdAt: '2026-01-01T00:00:00.000Z', createdByUid: 'admin',
});

const products = [product('amoxil-500', 'Amoxil', '500mg'), product('amoxil-250', 'Amoxil', '250mg'), product('panadol', 'Panadol Extra', '500mg')];
const productIndex = createProductSuggestionIndex(products);
const misplacedAlias = alias('alias-1', 'Amoxil 500mg 20tab', 'deleted-product');
const suggestions = suggestProductsForAlias(misplacedAlias, productIndex);
assert.equal(suggestions[0]?.product.id, 'amoxil-500', 'the matching strength should rank above a similar brand with another strength');
assert.ok(suggestions[0].score > suggestions[1].score, 'scores should be ordered from strongest to weakest');

const strengthConflict = compareAliasNames('Amoxil 500mg tab', 'Amoxil 250mg tab');
const typoMatch = compareAliasNames('Panadol Extra 500mg tab', 'Panadol Exra 500mg tab');
const missingDetails = compareAliasNames('Amoxil 500mg tablet', 'Amoxil');
assert.ok(strengthConflict.warnings.some((warning) => warning.includes('التركيز')));
assert.ok(missingDetails.warnings.some((warning) => warning.includes('غير ظاهر')));
assert.ok(typoMatch.score > 0.82, 'a one-character spelling variation should be recognized as a review candidate');

const aliases = [
  alias('duplicate-a', 'Panadol 500 mg tablets', 'panadol'),
  alias('duplicate-b', 'PANADOL 500mg tab', 'another-product'),
  alias('near-a', 'Panadol Extra 500mg tab', 'panadol'),
  alias('near-b', 'Panadol Exra 500mg tab', 'panadol'),
];
const exactGroups = findExactDuplicateAliasGroups(aliases);
assert.equal(exactGroups.length, 1, 'normalized duplicate names should be grouped');
assert.equal(exactGroups[0].aliases.length, 2);
const nearPairs = findSimilarAliasPairs(aliases, createAliasSimilarityIndex(aliases));
assert.ok(nearPairs.some((pair) => pair.left.id === 'near-a' && pair.right.id === 'near-b'), 'near-duplicate spellings should be surfaced for review');

console.log('Alias suggestion and duplicate review tests passed.');
