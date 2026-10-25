import Fuse from 'fuse.js';
import { Product, ProductAlias } from '../types';
import { normalizeArabic } from './arabicNormalize';
import { brandKey } from './brandKey';
import { aliasFieldCompatible, findProductAliasMatch, normalizeAliasValue } from './productAliases';
import {
  ResolvedIdentity,
  identitiesCompatible,
  identityAgreement,
  packSizeCompatible,
  resolveIdentity,
  strengthCompatible,
} from './productIdentity';

export interface MatchResult {
  status: 'exact' | 'fuzzy' | 'none';
  matchedProduct: Product | null;
  suggestions: { product: Product; score: number }[];
  normalizedInput: string;
  /** alias = اسم بديل محفوظ، name = اسم تجاري مطابق، identity = اسم + تركيز/شكل/عبوة مستخرجة من الاسم */
  matchedBy?: 'alias' | 'name' | 'identity';
}

interface IdentityEntry { product: Product; identity: ResolvedIdentity; viaNumber: boolean }

/** هل الرقم الأخير في الاسم (24 في Panadol 24 tab) يمكن أن يكون عبوة أو تركيز الطرف الآخر دون تناقض؟ */
function trailingNumberFits(trailing: string, other: ResolvedIdentity): boolean {
  if (!trailing) return false;
  const strengthNumber = (other.strength.match(/\d+(?:\.\d+)?/) || [''])[0];
  if (strengthNumber && strengthNumber === trailing) return true;
  if (other.packSize) return packSizeCompatible(trailing, other.packSize);
  if (!other.strength) return true;
  // لا عبوة معروفة: الرقم الصغير يُقرأ كعبوة، والكبير الذي لا يطابق التركيز يُرفض.
  return Number(trailing) <= 200;
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
  private identityIndex = new Map<string, IdentityEntry[]>();
  // v56: فهارس جاهزة لتسريع المطابقة (بدل المرور على كل الأصناف والأسماء البديلة لكل صف).
  private aliasIndex = new Map<string, ProductAlias[]>();
  private tradeIndex = new Map<string, Product[]>();
  private brandIndex = new Map<string, Product[]>();

  constructor(products: Product[], aliases: ProductAlias[] = [], supplierId = '') {
    this.products = products;
    this.aliases = aliases;
    this.supplierId = supplierId;
    for (const alias of aliases) {
      if (alias.supplierId !== supplierId) continue;
      const bucket = this.aliasIndex.get(alias.normalizedName);
      if (bucket) bucket.push(alias); else this.aliasIndex.set(alias.normalizedName, [alias]);
    }
    for (const product of products) {
      const tradeKey = normalizeAliasValue(product.tradeName);
      const tradeBucket = this.tradeIndex.get(tradeKey);
      if (tradeBucket) tradeBucket.push(product); else this.tradeIndex.set(tradeKey, [product]);
      const brand = brandKey(product.tradeName, true);
      if (brand) {
        const brandBucket = this.brandIndex.get(brand);
        if (brandBucket) brandBucket.push(product); else this.brandIndex.set(brand, [product]);
      }
      const identity = resolveIdentity({ tradeName: product.tradeName, strength: product.strength, form: product.form, packSize: product.packSize });
      if (!identity.baseName) continue;
      const push = (key: string, viaNumber: boolean) => {
        if (!key) return;
        const list = this.identityIndex.get(key) || [];
        list.push({ product, identity, viaNumber });
        this.identityIndex.set(key, list);
      };
      push(identity.baseName, false);
      if (identity.trailingNumber) push(identity.baseNoNumber, true);
    }
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
      ? findProductAliasMatch(this.aliasIndex.get(normalizeAliasValue(row.rawName)) || [], this.products, this.supplierId, row)
      : null;
    if (aliasMatch) return { status: 'exact', matchedProduct: aliasMatch, suggestions: [], normalizedInput: norm, matchedBy: 'alias' };

    const normalizedName = normalizeAliasValue(tradeName);
    const nameCandidates = (this.tradeIndex.get(normalizedName) || []).filter((product) => this.isCompatible(product, row));
    const uniqueCandidates = [...new Map(nameCandidates.map((product) => [product.id, product])).values()];
    if (uniqueCandidates.length === 1) {
      return { status: 'exact', matchedProduct: uniqueCandidates[0], suggestions: [], normalizedInput: norm, matchedBy: 'name' };
    }

    // الاسم القادم من الملف قد يحمل التركيز والشكل والعبوة (Adwaflam 75ml amp): نفكّه ونطابق الاسم الأساسي ثم نتحقق من بقية الهوية.
    const rowIdentity = resolveIdentity({ tradeName, strength: details.strength, form: details.form, packSize: details.packSize });
    const identityCandidates = this.findByIdentity(rowIdentity, row);
    const picked = this.pickBest(identityCandidates, rowIdentity);
    if (picked) {
      return { status: 'exact', matchedProduct: picked, suggestions: [], normalizedInput: norm, matchedBy: 'identity' };
    }

    const queryText = [tradeName, name !== tradeName ? name : undefined, row.manufacturer, row.strength, row.form, row.packSize, row.barcode]
      .filter(Boolean).join(' ');
    const fuseHits = new Map<string, { item: Product; score: number }>();
    for (const query of [queryText, rowIdentity.baseName]) {
      if (!query) continue;
      for (const hit of this.fuse.search(query)) {
        const score = hit.score ?? 1;
        const previous = fuseHits.get(hit.item.id);
        if (!previous || score < previous.score) fuseHits.set(hit.item.id, { item: hit.item, score });
      }
    }
    const suggestions = [...fuseHits.values()]
      .sort((a, b) => a.score - b.score)
      .filter((result) => this.isCompatible(result.item, row) && this.identityOk(result.item, rowIdentity))
      .slice(0, 3)
      .map((result) => ({ product: result.item, score: result.score }));
    // مرشحون متعددون بنفس الاسم الأساسي: اعرضهم أولاً للمراجعة اليدوية.
    const ambiguous = [...new Map(identityCandidates.map((entry) => [entry.product.id, entry.product])).values()];

    // v56: اقتراح بالاسم التجاري فقط عندما لا يجد التشابه شيئاً (أسماء الكتالوج قد تحمل لواحق مثل F C وGM).
    const brandSuggestions = !uniqueCandidates.length && !ambiguous.length && !suggestions.length
      ? (this.brandIndex.get(brandKey(tradeName)) || [])
          .map((product) => ({ product, score: 0.3, agreement: identityAgreement(rowIdentity, resolveIdentity({ tradeName: product.tradeName, strength: product.strength, form: product.form, packSize: product.packSize })) }))
          .sort((a, b) => b.agreement - a.agreement)
          .slice(0, 3)
          .map(({ product, score }) => ({ product, score }))
      : [];

    // التشابه التقريبي اقتراح فقط؛ لا يعتمد صنفاً حتى يختاره المستخدم.
    return {
      status: uniqueCandidates.length || ambiguous.length || suggestions.length || brandSuggestions.length ? 'fuzzy' : 'none',
      matchedProduct: null,
      suggestions: uniqueCandidates.length
        ? uniqueCandidates.slice(0, 3).map((product) => ({ product, score: 0 }))
        : ambiguous.length ? ambiguous.slice(0, 3).map((product) => ({ product, score: 0 })) : suggestions.length ? suggestions : brandSuggestions,
      normalizedInput: norm,
    };
  }

  private identityOk(product: Product, rowIdentity: ResolvedIdentity): boolean {
    return identitiesCompatible(
      rowIdentity,
      resolveIdentity({ tradeName: product.tradeName, strength: product.strength, form: product.form, packSize: product.packSize }),
    );
  }

  private findByIdentity(rowIdentity: ResolvedIdentity, row: MatchIdentityDetails): IdentityEntry[] {
    const collected = new Map<string, IdentityEntry & { direct: boolean }>();
    const consider = (entries: IdentityEntry[] | undefined, direct: boolean, accept: (entry: IdentityEntry) => boolean) => {
      for (const entry of entries || []) {
        if (collected.has(entry.product.id)) continue;
        if (!this.isCompatible(entry.product, row) || !accept(entry)) continue;
        collected.set(entry.product.id, { ...entry, direct });
      }
    };
    // 1) الاسم الأساسي مطابق مباشرة (يشمل منتجاً اسمه التجاري يحمل رقماً مثل Nurofen 400).
    consider(this.identityIndex.get(rowIdentity.baseName), true, (entry) => !entry.viaNumber && identitiesCompatible(rowIdentity, entry.identity));
    // 2) الصف فيه رقم أخير (Panadol 24) والمنتج اسمه بدون رقم.
    if (rowIdentity.trailingNumber) {
      consider(this.identityIndex.get(rowIdentity.baseNoNumber), false, (entry) =>
        !entry.viaNumber && trailingNumberFits(rowIdentity.trailingNumber, entry.identity) && identitiesCompatible({ ...rowIdentity, packSize: rowIdentity.packSize }, entry.identity));
    }
    // 3) المنتج اسمه فيه رقم أخير والصف بدونه.
    consider(this.identityIndex.get(rowIdentity.baseName), false, (entry) =>
      entry.viaNumber && trailingNumberFits(entry.identity.trailingNumber, rowIdentity) && identitiesCompatible(rowIdentity, entry.identity));
    const all = [...collected.values()];
    const direct = all.filter((entry) => entry.direct);
    return direct.length ? direct : all;
  }

  /** مرشح وحيد، أو الأوفق صراحةً في التركيز/الشكل/العبوة إذا تعدد المرشحون. */
  private pickBest(candidates: IdentityEntry[], rowIdentity: ResolvedIdentity): Product | null {
    const unique = [...new Map(candidates.map((entry) => [entry.product.id, entry])).values()];
    if (unique.length === 0) return null;
    if (unique.length === 1) return unique[0].product;
    const scored = unique.map((entry) => ({ entry, score: identityAgreement(rowIdentity, entry.identity) })).sort((a, b) => b.score - a.score);
    return scored[0].score > 0 && scored[0].score > scored[1].score ? scored[0].entry.product : null;
  }

  private isCompatible(product: Product, row: MatchIdentityDetails): boolean {
    return aliasFieldCompatible('barcode', row.barcode, product.barcode) &&
      aliasFieldCompatible('manufacturer', row.manufacturer, product.manufacturer) &&
      aliasFieldCompatible('strength', row.strength, product.strength) &&
      aliasFieldCompatible('form', row.form, product.form) &&
      aliasFieldCompatible('packSize', row.packSize, product.packSize);
  }
}
