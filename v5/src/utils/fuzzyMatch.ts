// src/utils/fuzzyMatch.ts
import Fuse from 'fuse.js';
import { normalizeArabic } from './arabicNormalize';
import { Product } from '../types';

export interface MatchResult {
  status: 'exact' | 'fuzzy' | 'none';
  matchedProduct: Product | null;
  suggestions: { product: Product; score: number }[];
  normalizedInput: string;
}

export class ProductMatcher {
  private products: Product[];
  private exactMap: Map<string, Product>;
  private fuse: Fuse<Product>;

  constructor(products: Product[]) {
    this.products = products;
    this.exactMap = new Map();

    products.forEach((p) => {
      const norm = p.normalizedName || normalizeArabic(p.tradeName);
      this.exactMap.set(norm, p);
    });

    this.fuse = new Fuse(products, {
      keys: [
        { name: 'normalizedName', weight: 0.7 },
        { name: 'tradeName', weight: 0.5 },
        { name: 'manufacturer', weight: 0.2 },
      ],
      threshold: 0.4, // حد التشابه المطلوب
      includeScore: true,
      minMatchCharLength: 2,
    });
  }

  public match(rawName: string): MatchResult {
    const norm = normalizeArabic(rawName);

    // 1) فحص التطابق التام بعد التطبيع
    if (this.exactMap.has(norm)) {
      return {
        status: 'exact',
        matchedProduct: this.exactMap.get(norm)!,
        suggestions: [],
        normalizedInput: norm,
      };
    }

    // فحص تطابق تام جزئي إذا كان اسم الصنف يتطابق مع بداية أو جزء رئيسي
    for (const [key, p] of this.exactMap.entries()) {
      if (key === norm || (norm.length > 4 && key.includes(norm)) || (key.length > 4 && norm.includes(key))) {
        // إذا كان الفارق طفيفاً جداً
        if (Math.abs(key.length - norm.length) <= 3) {
          return {
            status: 'exact',
            matchedProduct: p,
            suggestions: [],
            normalizedInput: norm,
          };
        }
      }
    }

    // 2) فحص التطابق التقريبي عبر Fuse.js
    const results = this.fuse.search(norm);

    if (results.length > 0) {
      const topMatch = results[0];
      const suggestions = results.slice(0, 3).map((r) => ({
        product: r.item,
        score: r.score ?? 1,
      }));

      // إذا كانت درجة التطابق قوية جداً (أقل من 0.2 في Fuse تعني تشابه مرتفع جداً)
      if (topMatch.score !== undefined && topMatch.score <= 0.15) {
        return {
          status: 'exact',
          matchedProduct: topMatch.item,
          suggestions,
          normalizedInput: norm,
        };
      }

      // إذا كانت درجة التطابق مقبولة للاقتراح (أقل من 0.4)
      if (topMatch.score !== undefined && topMatch.score <= 0.45) {
        return {
          status: 'fuzzy',
          matchedProduct: topMatch.item,
          suggestions,
          normalizedInput: norm,
        };
      }
    }

    // 3) لا يوجد تطابق
    return {
      status: 'none',
      matchedProduct: null,
      suggestions: results.slice(0, 3).map((r) => ({
        product: r.item,
        score: r.score ?? 1,
      })),
      normalizedInput: norm,
    };
  }
}
