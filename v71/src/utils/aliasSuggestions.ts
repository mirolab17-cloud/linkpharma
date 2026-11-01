import type { Product, ProductAlias } from '../types';
import { formatCatalogName } from './catalogNameFormat';
import { normalizeAliasValue } from './productAliases';

export interface ProductAliasSuggestion {
  product: Product;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

export interface AliasDuplicateGroup {
  normalizedName: string;
  aliases: ProductAlias[];
}

export interface SimilarAliasPair {
  left: ProductAlias;
  right: ProductAlias;
  score: number;
}

interface IndexedName {
  id: string;
  text: string;
  tokens: string[];
  grams: string[];
}

export interface NameSimilarityIndex {
  entries: Map<string, IndexedName>;
  tokenPostings: Map<string, Set<string>>;
  gramPostings: Map<string, Set<string>>;
}

export interface ProductSuggestionIndex extends NameSimilarityIndex {
  products: Map<string, Product>;
}

const COMMON_TOKENS = new Set(['mg', 'mcg', 'g', 'gm', 'ml', 'iu', 'tab', 'cap', 'amp', 'vial', 'inj', 'syr', 'syrup', 'sol', 'susp', 'cream', 'gel', 'drop', 'drops', 'tablet', 'tablets', 'capsule', 'capsules']);
const MAX_POSTING_SIZE = 180;
const MAX_CANDIDATES = 240;

function tokensOf(value: string): string[] {
  return [...new Set(normalizeAliasValue(value).match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((token) => token.length > 1 && !COMMON_TOKENS.has(token));
}

function gramsOf(value: string): string[] {
  const chars = Array.from(normalizeAliasValue(value).replace(/\s+/g, ' '));
  if (chars.length < 3) return chars.length ? [chars.join('')] : [];
  const grams = new Set<string>();
  for (let i = 0; i <= chars.length - 3; i += 1) {
    const gram = chars.slice(i, i + 3).join('').trim();
    if (gram.length >= 2) grams.add(gram);
  }
  return [...grams];
}

function addPosting(index: Map<string, Set<string>>, key: string, id: string): void {
  let posting = index.get(key);
  if (!posting) { posting = new Set<string>(); index.set(key, posting); }
  posting.add(id);
}

export function createNameSimilarityIndex(items: Array<{ id: string; text: string }>): NameSimilarityIndex {
  const entries = new Map<string, IndexedName>();
  const tokenPostings = new Map<string, Set<string>>();
  const gramPostings = new Map<string, Set<string>>();
  for (const item of items) {
    const text = normalizeAliasValue(item.text);
    if (!text || !item.id) continue;
    const entry = { id: item.id, text, tokens: tokensOf(text), grams: gramsOf(text) };
    entries.set(item.id, entry);
    entry.tokens.forEach((token) => addPosting(tokenPostings, token, item.id));
    entry.grams.forEach((gram) => addPosting(gramPostings, gram, item.id));
  }
  return { entries, tokenPostings, gramPostings };
}

function candidateIds(text: string, index: NameSimilarityIndex): Set<string> {
  const ids = new Set<string>();
  const addPostings = (keys: string[], postings: Map<string, Set<string>>) => {
    for (const key of keys) {
      const matches = postings.get(key);
      if (!matches || matches.size > MAX_POSTING_SIZE) continue;
      for (const id of matches) {
        ids.add(id);
        if (ids.size >= MAX_CANDIDATES) return;
      }
    }
  };
  addPostings(tokensOf(text), index.tokenPostings);
  if (ids.size < MAX_CANDIDATES) addPostings(gramsOf(text), index.gramPostings);
  if (!ids.size && index.entries.size <= 250) index.entries.forEach((_, id) => ids.add(id));
  return ids;
}

function editSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length > 180 || b.length > 180) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function diceSimilarity(left: string[], right: string[]): number {
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const common = left.reduce((count, item) => count + Number(rightSet.has(item)), 0);
  return (2 * common) / (left.length + right.length);
}

function tokenSimilarity(left: string[], right: string[]): number {
  if (!left.length && !right.length) return 1;
  const rightSet = new Set(right);
  const common = left.filter((token) => rightSet.has(token)).length;
  return common / (new Set([...left, ...right]).size || 1);
}

function signatures(value: string, pattern: RegExp): string[] {
  return [...new Set(normalizeAliasValue(value).match(pattern) || [])];
}

export function compareAliasNames(leftValue: string, rightValue: string): { score: number; warnings: string[] } {
  const left = normalizeAliasValue(leftValue);
  const right = normalizeAliasValue(rightValue);
  if (!left || !right) return { score: 0, warnings: [] };
  if (left === right) return { score: 1, warnings: [] };

  const leftTokens = tokensOf(left);
  const rightTokens = tokensOf(right);
  const leftGrams = gramsOf(left);
  const rightGrams = gramsOf(right);
  let score = (0.42 * editSimilarity(left, right)) + (0.36 * diceSimilarity(leftGrams, rightGrams)) + (0.22 * tokenSimilarity(leftTokens, rightTokens));
  const warnings: string[] = [];
  const dosePattern = /\d+(?:\.\d+)?(?:mg|mcg|gm|g|ml|iu|%)/g;
  const leftDoses = signatures(left, dosePattern);
  const rightDoses = signatures(right, dosePattern);
  if (leftDoses.length && rightDoses.length && (leftDoses.length !== rightDoses.length || leftDoses.some((dose) => !rightDoses.includes(dose)))) {
    score -= 0.24;
    warnings.push('قد يختلف التركيز أو حجم العبوة؛ راجعه قبل اعتماد الربط.');
  } else if (leftDoses.length !== rightDoses.length) {
    score -= 0.10;
    warnings.push('التركيز غير ظاهر في الاسمين معاً؛ تحقّق منه يدوياً قبل اعتماد الربط.');
  }
  const formPattern = /\b(?:tab|cap|amp|vial|inj|syrup|syr|susp|sol|cream|gel|drop|ointment|oint|supp|spray)\b/g;
  const leftForms = signatures(left, formPattern);
  const rightForms = signatures(right, formPattern);
  if (leftForms.length && rightForms.length && !leftForms.some((form) => rightForms.includes(form))) {
    score -= 0.16;
    warnings.push('قد يختلف الشكل الدوائي؛ راجعه قبل اعتماد الربط.');
  } else if (leftForms.length !== rightForms.length) {
    score -= 0.08;
    warnings.push('الشكل الدوائي غير ظاهر في الاسمين معاً؛ تحقّق منه يدوياً قبل اعتماد الربط.');
  }
  return { score: Math.max(0, Math.min(1, score)), warnings };
}

export function createProductSuggestionIndex(products: Product[]): ProductSuggestionIndex {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const index = createNameSimilarityIndex(products.map((product) => ({ id: product.id, text: formatCatalogName(product) })));
  return { ...index, products: productsById };
}

export function suggestProductsForAlias(alias: ProductAlias, index: ProductSuggestionIndex, limit = 3): ProductAliasSuggestion[] {
  const candidateIdsForAlias = candidateIds(alias.rawName || alias.normalizedName, index);
  const suggestions: ProductAliasSuggestion[] = [];
  for (const id of candidateIdsForAlias) {
    if (id === alias.productId) continue;
    const product = index.products.get(id);
    const indexed = index.entries.get(id);
    if (!product || !indexed) continue;
    const comparison = compareAliasNames(alias.rawName || alias.normalizedName, indexed.text);
    if (comparison.score < 0.43) continue;
    suggestions.push({
      product,
      score: comparison.score,
      confidence: comparison.score >= 0.76 ? 'high' : comparison.score >= 0.60 ? 'medium' : 'low',
      warnings: comparison.warnings,
    });
  }
  return suggestions.sort((a, b) => b.score - a.score || formatCatalogName(a.product).localeCompare(formatCatalogName(b.product), 'ar')).slice(0, Math.max(1, limit));
}

export function findExactDuplicateAliasGroups(aliases: ProductAlias[]): AliasDuplicateGroup[] {
  const groups = new Map<string, ProductAlias[]>();
  for (const alias of aliases) {
    const normalizedName = normalizeAliasValue(alias.rawName || alias.normalizedName);
    if (!normalizedName) continue;
    const group = groups.get(normalizedName) || [];
    group.push(alias);
    groups.set(normalizedName, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedName, group]) => ({ normalizedName, aliases: group }))
    .sort((a, b) => b.aliases.length - a.aliases.length || a.normalizedName.localeCompare(b.normalizedName, 'ar'));
}

export function createAliasSimilarityIndex(aliases: ProductAlias[]): NameSimilarityIndex {
  return createNameSimilarityIndex(aliases.map((alias) => ({ id: alias.id, text: alias.rawName || alias.normalizedName })));
}

export function findSimilarAliasPairs(
  aliases: ProductAlias[],
  index: NameSimilarityIndex,
  limit = 1500,
  startIndex = 0,
  endIndex = aliases.length,
): SimilarAliasPair[] {
  const byId = new Map(aliases.map((alias) => [alias.id, alias]));
  const pairs = new Map<string, SimilarAliasPair>();
  for (const alias of aliases.slice(startIndex, endIndex)) {
    const leftName = alias.rawName || alias.normalizedName;
    for (const candidateId of candidateIds(leftName, index)) {
      if (candidateId <= alias.id) continue;
      const other = byId.get(candidateId);
      if (!other) continue;
      if (normalizeAliasValue(leftName) === normalizeAliasValue(other.rawName || other.normalizedName)) continue;
      const comparison = compareAliasNames(leftName, other.rawName || other.normalizedName);
      if (comparison.score < 0.82) continue;
      const key = `${alias.id}\u0000${other.id}`;
      pairs.set(key, { left: alias, right: other, score: comparison.score });
      if (pairs.size >= limit) break;
    }
    if (pairs.size >= limit) break;
  }
  return [...pairs.values()].sort((a, b) => b.score - a.score || a.left.rawName.localeCompare(b.left.rawName, 'ar'));
}
