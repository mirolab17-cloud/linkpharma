import Fuse from 'fuse.js';
import { Product, ProductAlias } from '../types';
import { normalizeArabic } from './arabicNormalize';
import { aliasFieldCompatible, findProductAliasMatch, normalizeAliasValue } from './productAliases';

export interface MatchResult {
  status: 'exact' | 'fuzzy' | 'none';
  matchedProduct: Product | null;
  suggestions: { product: Product; score: number }[];
  normalizedInput: string;
}

export interface MatchIdentityDetails {
  tradeName?: string;
  manufacturer?: string;
  strength?: string;
  form?: string;
  packSize?: string;
  barcode?: string;
}

function inferStrengthFromName(name: string): string | undefined {
  const normalized = normalizeAliasValue(name);
  const measurement = normalized.match(/\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|%)?)/i);
  if (measurement) return measurement[0].replace(/\s+/g, '');
  const ratio = normalized.match(/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/);
  return ratio?.[0].replace(/\s+/g, '');
}

export class ProductMatcher {
  private products: Product[];
  private fuse: Fuse<Product>;
  private aliases: ProductAlias[];
  private supplierId: string;

  constructor(products: Product[], aliases: ProductAlias[] = [], supplierId = '') {
    this.products = products;
    this.aliases = aliases;
    this.supplierId = supplierId;
    this.fuse = new Fuse(products, {
      keys: [
        // استخدم الاسم التجاري الحالي فقط؛ normalizedName قد يكون قيمة مفهرسة قديمة بعد تحرير الصنف.
        { name: 'tradeName', weight: 0.65 },
        { name: 'strength', weight: 0.25 },
        { name: 'form', weight: 0.2 },
        { name: 'packSize', weight: 0.2 },
        { name: 'manufacturer', weight: 0.15 },
        { name: 'barcode', weight: 0.4 },
      ],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 2,
    });
  }

  public match(rawName: string, manufacturer?: string, details: MatchIdentityDetails = {}): MatchResult {
    const name = String(rawName || '').trim();
    const norm = normalizeArabic(name);
    if (!name) return { status: 'none', matchedProduct: null, suggestions: [], normalizedInput: norm };

    // عند وجود اسم تجاري منفصل (كما في صف الاستيراد) لا نعامل القوة/العبوة الملحقة بالاسم كجزء من الاسم التجاري.
    const tradeName = String(details.tradeName || name).trim();
    const row = {
      ...details,
      rawName: name,
      manufacturer: details.manufacturer || manufacturer,
      strength: details.strength || (details.tradeName ? undefined : inferStrengthFromName(name)),
    };
    const aliasMatch = this.supplierId
      ? findProductAliasMatch(this.aliases, this.products, this.supplierId, row)
      : null;
    if (aliasMatch) return { status: 'exact', matchedProduct: aliasMatch, suggestions: [], normalizedInput: norm };

    const normalizedName = normalizeAliasValue(tradeName);
    const nameCandidates = this.products.filter((product) => {
      const trade = normalizeAliasValue(product.tradeName);
      const nameFits = normalizedName === trade;
      if (!nameFits) return false;
      return this.isCompatible(product, row);
    });
    const uniqueCandidates = [...new Map(nameCandidates.map((product) => [product.id, product])).values()];
    if (uniqueCandidates.length === 1) {
      return { status: 'exact', matchedProduct: uniqueCandidates[0], suggestions: [], normalizedInput: norm };
    }

    const queryText = [tradeName, name !== tradeName ? name : undefined, row.manufacturer, row.strength, row.form, row.packSize, row.barcode]
      .filter(Boolean).join(' ');
    const suggestions = this.fuse.search(queryText)
      .filter((result) => this.isCompatible(result.item, row))
      .slice(0, 3)
      .map((result) => ({ product: result.item, score: result.score ?? 1 }));

    // التشابه التقريبي اقتراح فقط؛ لا يعتمد صنفاً حتى يختاره المستخدم.
    return {
      status: uniqueCandidates.length || suggestions.length ? 'fuzzy' : 'none',
      matchedProduct: null,
      suggestions: uniqueCandidates.length
        ? uniqueCandidates.slice(0, 3).map((product) => ({ product, score: 0 }))
        : suggestions,
      normalizedInput: norm,
    };
  }

  private isCompatible(product: Product, row: MatchIdentityDetails): boolean {
    return aliasFieldCompatible('barcode', row.barcode, product.barcode) &&
      aliasFieldCompatible('manufacturer', row.manufacturer, product.manufacturer) &&
      aliasFieldCompatible('strength', row.strength, product.strength) &&
      aliasFieldCompatible('form', row.form, product.form) &&
      aliasFieldCompatible('packSize', row.packSize, product.packSize);
  }
}
