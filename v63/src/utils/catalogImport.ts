export const normalizeColumnName = (value: string): string => String(value || '').toLowerCase().replace(/[\s_-]/g, '');

/** Prefer exact header matches so `name` never accidentally selects `tradeName`. */
export function findCatalogHeader(headers: string[], aliases: string[]): string {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeColumnName(header) }));
  const normalizedAliases = aliases.map(normalizeColumnName).filter(Boolean);
  for (const alias of normalizedAliases) {
    const exact = normalizedHeaders.find((item) => item.normalized === alias);
    if (exact) return exact.header;
  }
  const partialAliases = normalizedAliases.filter((alias) => alias.length > 3).sort((a, b) => b.length - a.length);
  for (const alias of partialAliases) {
    const partial = normalizedHeaders.find((item) => item.normalized.includes(alias));
    if (partial) return partial.header;
  }
  return '';
}

/**
 * Splits combination strings such as "Lidocaine + Prilocaine". If a whole
 * combination is wrapped in parentheses after a descriptive blend name, keep
 * the individual parenthesized ingredients (e.g. "Omega 3 (EPA + DHA" -> EPA, DHA).
 */
export function splitActiveIngredientNames(value: unknown): string[] {
  const source = String(value ?? '').trim();
  if (!source) return [];
  let fragments = source.split(/\s*\+\s*/).map((part) => part.trim()).filter(Boolean);
  if (fragments.length > 1 && fragments[0].includes('(') && fragments[fragments.length - 1].includes(')')) {
    const first = fragments[0];
    const openAt = first.lastIndexOf('(');
    const prefix = first.slice(0, openAt).trim();
    if (prefix) {
      fragments[0] = first.slice(openAt + 1).trim();
      fragments[fragments.length - 1] = fragments[fragments.length - 1].replace(/\)+\s*$/, '').trim();
    }
  }
  const cleaned = fragments.map((part) => part.replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim()).filter(Boolean);
  const seen = new Set<string>();
  return cleaned.filter((name) => {
    const key = normalizeColumnName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getProductActiveIngredientIds(product: { activeIngredientId?: string; activeIngredientIds?: string[] }): string[] {
  return Array.from(new Set([...(product.activeIngredientIds || []), product.activeIngredientId || ''].filter(Boolean)));
}
