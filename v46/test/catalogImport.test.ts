import assert from 'node:assert/strict';
import { findCatalogHeader, getProductActiveIngredientIds, splitActiveIngredientNames } from '../src/utils/catalogImport';

assert.equal(
  findCatalogHeader(['tradeName', 'activeIngredientName', 'category'], ['activeIngredientName', 'ingredientName', 'ingredient', 'name']),
  'activeIngredientName',
  'the active ingredient mapping must not choose tradeName',
);
assert.equal(
  findCatalogHeader(['tradeName', 'name'], ['name']),
  'name',
  'exact header matches must win over substring matches',
);
assert.deepEqual(splitActiveIngredientNames('Lidocaine + Prilocaine'), ['Lidocaine', 'Prilocaine']);
assert.deepEqual(splitActiveIngredientNames('Diosmin + Hesperidin'), ['Diosmin', 'Hesperidin']);
assert.deepEqual(splitActiveIngredientNames('Omega 3 Fatty Acids (EPA + DHA)'), ['EPA', 'DHA']);
assert.deepEqual(splitActiveIngredientNames('Metoclopramide'), ['Metoclopramide']);
assert.deepEqual(getProductActiveIngredientIds({ activeIngredientId: 'ing_a', activeIngredientIds: ['ing_a', 'ing_b'] }), ['ing_a', 'ing_b']);
assert.deepEqual(getProductActiveIngredientIds({ activeIngredientId: 'legacy' }), ['legacy']);
console.log('Catalog import tests passed.');
