// src/pages/pharmacy/Prices.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { usePharmacyFeatures } from '../../hooks/usePharmacyFeatures';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import {
  getProducts,
  getCatalogProductsSnapshot,
  getPrices,
  getPricesForProductIds,
  invalidateCache,
  getActiveIngredients,
  getSuppliers,
  getSystemSettings,
  toggleProductFavorite,
  setProductPriceAlert
} from '../../services/dataStorage';
import { Product, ActiveIngredient, Supplier, PriceRecord, PriceHistory } from '../../types';
import { formatCurrency, calculateEffectiveUnitPrice } from '../../utils/formatPrice';
import { formatGregorianDate } from '../../utils/formatDate';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { getProductActiveIngredientIds } from '../../utils/catalogImport';
import { shouldShowComposition } from '../../utils/productIdentity';
import {
  Search,
  RotateCcw,
  ShoppingCart,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  Pill,
  Check,
  ChevronDown,
  Building,
  Star,
  BellRing,
  TrendingDown,
  TrendingUp,
  Tag,
  ArrowDownRight,
  Split,
  Percent,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Layers,
  History
} from 'lucide-react';

import { CardSkeleton } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { triggerHaptic } from '../../utils/profile';
import { PharmacyGlobalSearch, SearchScope } from '../../components/PharmacyGlobalSearch';
import { productDisplayName, productCardTitle, normalizeProductCardConfig, DEFAULT_PRODUCT_CARD_CONFIG } from '../../utils/productCatalog';
import { getDeliveryAreaKeys } from '../../utils/gaza';
import { deliveryRuleForSupplier } from '../../services/v18Features';

// عدد البطاقات التي تُضاف في كل دفعة عرض أثناء التمرير.
const PAGE_SIZE = 24;
// عدد الأصناف في كل طلب أسعار (الأسعار تُجلب فقط للأصناف الظاهرة).
const PRICE_FETCH_CHUNK = 12;
const EMPTY_PRICE_MAP = new Map<string, PriceRecord[]>();
const dailyPriceSeed = new Date().toISOString().slice(0, 10);
const stablePriceRank = (value: string) => { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; };
const nameCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

const priceKey = (price: PriceRecord) =>
  price.id || [price.productId, price.supplierId, price.price, price.bonus || '', price.updatedAt || ''].join('|');

// دمج الأسعار الجديدة بالقديمة دون تكرار (آمن لو وصلت نفس الدفعة مرتين).
const mergePrices = (current: PriceRecord[], incoming: PriceRecord[]): PriceRecord[] => {
  if (!incoming.length) return current;
  const merged = new Map<string, PriceRecord>();
  current.forEach((price) => merged.set(priceKey(price), price));
  incoming.forEach((price) => merged.set(priceKey(price), price));
  return Array.from(merged.values());
};

export const PharmacyPrices: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const features = usePharmacyFeatures();
  const defaultBranch = user?.branches?.find((branch) => branch.id === user.defaultBranchId) || user?.branches?.[0];
  const { addItem } = useCartStore();
  const { success, error: toastError, info } = useToastStore();
  const toastErrorRef = useRef(toastError);
  toastErrorRef.current = toastError;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // الكتالوج الكامل: البحث والفلترة والفرز كلها تعمل عليه وليس على الأصناف المعروضة فقط.
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [priceHistory] = useState<PriceHistory[]>([]);

  // حالة جلب الأسعار
  const [readyPriceIds, setReadyPriceIds] = useState<Set<string>>(new Set());
  const [allPricesState, setAllPricesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [priceLoadFailed, setPriceLoadFailed] = useState(false);
  const [priceRetryTick, setPriceRetryTick] = useState(0);
  const requestedPriceIdsRef = useRef<Set<string>>(new Set());
  const priceEpochRef = useRef(0);

  // Search & Filter State
  const [cardConfig, setCardConfig] = useState(DEFAULT_PRODUCT_CARD_CONFIG);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>(searchParams.get('supplier') || 'all');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('all');
  const [hideProductsWithoutOffers, setHideProductsWithoutOffers] = useState(true);

  // Quick Filter Chips
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [cheapestFirst, setCheapestFirst] = useState<boolean>(false);
  useEffect(() => { if (!features.cheapest && cheapestFirst) setCheapestFirst(false); }, [features.cheapest, cheapestFirst]);
  const [bonusOnly, setBonusOnly] = useState<boolean>(false);
  const [recentlyUpdatedOnly, setRecentlyUpdatedOnly] = useState<boolean>(false);
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [sortByEffective, setSortByEffective] = useState<boolean>(false);

  // Active Ingredient Alternative Modal
  const [selectedAltIngredient, setSelectedAltIngredient] = useState<{
    ingredient: ActiveIngredient;
    baseProduct: Product;
  } | null>(null);

  // Price Alert Modal
  const [alertModalProduct, setAlertModalProduct] = useState<Product | null>(null);
  const [targetPriceInput, setTargetPriceInput] = useState<string>('');

  // Local Favorites State
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [userPriceAlerts, setUserPriceAlerts] = useState<Record<string, number>>({});

  // Selected quantities per (productId_supplierId)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Feedback state for recently added buttons
  const [addedItemKey, setAddedItemKey] = useState<string | null>(null);
  const [expandedSupplierProducts, setExpandedSupplierProducts] = useState<Set<string>>(new Set());
  const [showDeliveryDays, setShowDeliveryDays] = useState(true);
  const [warehousePriceSortMode, setWarehousePriceSortMode] = useState<'cheapest' | 'latest' | 'random'>('cheapest');

  // Sync favorites & alerts from user profile
  useEffect(() => {
    if (user) {
      setUserFavorites(user.favorites || []);
      setUserPriceAlerts(user.priceAlerts || {});
    }
  }, [user?.uid, user?.favorites?.length, JSON.stringify(user?.priceAlerts || {})]);

  useEffect(() => {
    const supParam = searchParams.get('supplier');
    if (supParam) {
      setSelectedSupplier(supParam);
    }
  }, [searchParams]);

  const allowedSupplierIdsString = (user?.allowedSuppliers || []).join(',');
  const scopedSupplierIds = useMemo(
    () => (allowedSupplierIdsString ? allowedSupplierIdsString.split(',') : undefined),
    [allowedSupplierIdsString]
  );

  // تصفير حالة الأسعار (عند تغيّر الموردين المسموحين أو عند التحديث اليدوي).
  const resetPriceState = useCallback(() => {
    priceEpochRef.current += 1;
    requestedPriceIdsRef.current = new Set();
    setPrices([]);
    setReadyPriceIds(new Set());
    setAllPricesState('idle');
    setPriceLoadFailed(false);
  }, []);

  useEffect(() => {
    resetPriceState();
  }, [allowedSupplierIdsString, resetPriceState]);

  // ===== تحميل الكتالوج الكامل مرة واحدة (مخزّن مؤقتاً 5 دقائق في dataStorage) =====
  // لا نُظهر هيكل التحميل (skeleton) إلا في التحميل الأول؛ التحديث اليدوي يُبقي البطاقات ظاهرة.
  const hasLoadedRef = useRef(false);
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async (force = false) => {
    const requestId = ++loadRequestRef.current;
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const timer = window.setTimeout(() => {
      if (requestId !== loadRequestRef.current || hasLoadedRef.current) return;
      setLoadError('استغرقت استجابة قاعدة البيانات وقتاً أطول من المتوقع. تحقق من الإنترنت وحاول مرة أخرى.');
      setLoading(false);
    }, 20000);

    try {
      if (force) invalidateCache(['products', 'suppliers', 'activeIngredients', 'prices']);
      const [catalog, ingsData, supsData] = await Promise.all([
        getCatalogProductsSnapshot().then((snapshot) => snapshot || getProducts()),
        getActiveIngredients(),
        getSuppliers(),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setProducts(catalog);
      setIngredients(ingsData);
      setSuppliers(supsData);
      if (force) resetPriceState();
      hasLoadedRef.current = true;
      setLoadError(null);
    } catch (e) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Failed to load prices data', e);
      if (!hasLoadedRef.current) {
        setLoadError('تعذر تحميل بيانات الأسعار. تأكد من اتصال الشبكة وحاول مرة أخرى.');
      } else {
        toastErrorRef.current('تعذر تحديث البيانات. تم الإبقاء على آخر نسخة محمّلة.');
      }
    } finally {
      window.clearTimeout(timer);
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resetPriceState]);

  useEffect(() => {
    void loadData();
    getSystemSettings().then((settings) => { setShowDeliveryDays(settings.showDeliveryDays !== false); setWarehousePriceSortMode(settings.warehousePriceSortMode || 'cheapest'); setHideProductsWithoutOffers(settings.hideProductsWithoutOffers !== false); setCardConfig(normalizeProductCardConfig(settings.productCardConfig)); }).catch(() => {});
  }, [loadData]);
  useEffect(() => { if (!features.activeIngredientFilter && selectedIngredient !== 'all') setSelectedIngredient('all'); }, [features.activeIngredientFilter, selectedIngredient]);

  // الموردون المسموحون لهذه الصيدلية (لا نعتمد على كائن user كاملاً)
  const allowedSuppliers = useMemo(() => {
    const activeSuppliers = suppliers.filter((s) => s.status === 'active');
    const allowed = user?.allowedSuppliers;
    if (!allowed || allowed.length === 0) {
      return activeSuppliers;
    }
    const allowedSet = new Set(allowed);
    return activeSuppliers.filter((s) => allowedSet.has(s.id));
  }, [suppliers, allowedSupplierIdsString]);

  const allowedSupplierIds = useMemo(() => {
    return new Set(allowedSuppliers.map((s) => s.id));
  }, [allowedSuppliers]);

  // قاموس المواد الفعالة بالمعرف
  const ingredientsMap = useMemo(() => {
    const map = new Map<string, ActiveIngredient>();
    ingredients.forEach((i) => map.set(i.id, i));
    return map;
  }, [ingredients]);

  // قاموس الموردين بالمعرف
  const suppliersMap = useMemo(() => {
    const map = new Map<string, Supplier>();
    suppliers.forEach((s) => map.set(s.id, s));
    return map;
  }, [suppliers]);

  // ترتيب ثابت للكتالوج (الاسم التجاري ثم المعرّف) كي لا يتغيّر ترتيب البطاقات بين الرسمات.
  const catalogSorted = useMemo(
    () =>
      [...products].sort((a, b) => {
        const byName = nameCollator.compare(a.tradeName || '', b.tradeName || '');
        if (byName !== 0) return byName;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }),
    [products]
  );

  // دمج الأصناف المكررة (نفس الاسم/الشركة/التركيز/الشكل بمعرّفات مختلفة بسبب الاستيراد) في بطاقة واحدة.
  // يُحسب على الكتالوج كاملاً فيبقى الصنف الأساسي ثابتاً مهما تقدّم التمرير.
  const { productAlias, aliasGroups } = useMemo(() => {
    const canonicalByKey = new Map<string, string>();
    const alias = new Map<string, string>();
    const groups = new Map<string, string[]>();
    catalogSorted.forEach((prod) => {
      const key = [prod.tradeName, prod.manufacturer, prod.strength, prod.form, prod.packSize]
        .map((v) => normalizeArabic(String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')))
        .join('|');
      const canonical = canonicalByKey.get(key);
      if (canonical) {
        alias.set(prod.id, canonical);
        groups.get(canonical)!.push(prod.id);
      } else {
        canonicalByKey.set(key, prod.id);
        groups.set(prod.id, [prod.id]);
      }
    });
    return { productAlias: alias, aliasGroups: groups };
  }, [catalogSorted]);

  // ربط الأسعار بالأصناف فقط للموردين المسموحين مع احتساب البونص والسعر الفعلي
  const productPricesMap = useMemo(() => {
    const map = new Map<string, PriceRecord[]>();
    prices.forEach((rawPr) => {
      const pr = productAlias.has(rawPr.productId) ? { ...rawPr, productId: productAlias.get(rawPr.productId)! } : rawPr;
      if (allowedSupplierIds.has(pr.supplierId)) {
        if (!map.has(pr.productId)) {
          map.set(pr.productId, []);
        }
        // لا نكرر نفس المورد داخل البطاقة الواحدة
        if (map.get(pr.productId)!.some((x) => x.supplierId === pr.supplierId && x.price === pr.price)) return;
        // احتساب السعر الفعلي بالبونص
        const { effectivePrice } = calculateEffectiveUnitPrice(pr.price, pr.bonus);
        const enrichedRecord: PriceRecord = {
          ...pr,
          effectivePrice: pr.effectivePrice || effectivePrice
        };
        map.get(pr.productId)!.push(enrichedRecord);
      }
    });

    // ترتيب عروض الموردين حسب اختيار المدير، من دون أي استعلام إضافي.
    map.forEach((records) => {
      records.sort((a, b) => {
        if (warehousePriceSortMode === 'latest') {
          const timeDiff = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
          return timeDiff || a.supplierId.localeCompare(b.supplierId);
        }
        if (warehousePriceSortMode === 'random') {
          const rankA = stablePriceRank(`${dailyPriceSeed}|${a.productId}|${a.supplierId}`);
          const rankB = stablePriceRank(`${dailyPriceSeed}|${b.productId}|${b.supplierId}`);
          return rankA - rankB || a.supplierId.localeCompare(b.supplierId);
        }
        const priceA = a.effectivePrice || a.price;
        const priceB = b.effectivePrice || b.price;
        return priceA - priceB || a.supplierId.localeCompare(b.supplierId);
      });
    });

    return map;
  }, [prices, allowedSupplierIds, productAlias, warehousePriceSortMode]);

  // قاموس تاريخ الأسعار لحساب اتجاه السعر (Sparkline / Trend)
  const productPriceTrends = useMemo(() => {
    const trends = new Map<string, { trend: 'down' | 'up' | 'same'; diff: number; percent: number }>();
    if (!priceHistory || priceHistory.length === 0) return trends;

    // تجميع السجلات حسب الصنف
    const histByProduct = new Map<string, PriceHistory[]>();
    priceHistory.forEach((h) => {
      if (!histByProduct.has(h.productId)) histByProduct.set(h.productId, []);
      histByProduct.get(h.productId)!.push(h);
    });

    histByProduct.forEach((records, prodId) => {
      records.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
      if (records.length >= 2) {
        const latest = records[0].price;
        const previous = records[1].price;
        const diff = latest - previous;
        if (diff < -0.01) {
          trends.set(prodId, {
            trend: 'down',
            diff: Math.abs(diff),
            percent: Math.round((Math.abs(diff) / previous) * 100)
          });
        } else if (diff > 0.01) {
          trends.set(prodId, {
            trend: 'up',
            diff,
            percent: Math.round((diff / previous) * 100)
          });
        } else {
          trends.set(prodId, { trend: 'same', diff: 0, percent: 0 });
        }
      }
    });

    return trends;
  }, [priceHistory]);

  // استخراج قائمة التصنيفات الفريدة (من الكتالوج كاملاً)
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);
  const ingredientOptions = useMemo(() => [...ingredients].sort((a, b) => nameCollator.compare(a.name, b.name)), [ingredients]);

  // فحص هل السعر أقدم من 7 أيام
  const isOlderThan7Days = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return date < sevenDaysAgo;
  };

  // ===== فهرس بحث محسوب مرة واحدة لكامل الكتالوج (بدل تطبيع النصوص عند كل ضغطة مفتاح) =====
  const baseProducts = useMemo(
    () => catalogSorted.filter((p) => !productAlias.has(p.id)),
    [catalogSorted, productAlias]
  );
  const searchIndex = useMemo(
    () =>
      baseProducts.map((product) => ({
        product,
        name: normalizeArabic(productDisplayName(product)),
        trade: normalizeArabic(product.tradeName || ''),
        mfg: normalizeArabic(product.manufacturer || ''),
        ingredients: getProductActiveIngredientIds(product).map((id) => normalizeArabic(ingredientsMap.get(id)?.name || '')).join(' '),
      })),
    [baseProducts, ingredientsMap]
  );

  // الفلاتر المعتمدة على الأسعار تحتاج أسعار كل الأصناف، فنجلبها (مرة واحدة ومخزّنة) عند تفعيلها فقط.
  const needsAllPrices =
    selectedSupplier !== 'all' || availableOnly || bonusOnly || recentlyUpdatedOnly || cheapestFirst || sortByEffective || hideProductsWithoutOffers;
  const pricesPending = needsAllPrices && allPricesState !== 'ready' && allPricesState !== 'error';
  const allPricesReady = allPricesState === 'ready';
  const isPriceReady = (productId: string) => allPricesReady || readyPriceIds.has(productId);

  useEffect(() => {
    if (!needsAllPrices || loading || allPricesState !== 'idle') return;
    const epoch = priceEpochRef.current;
    setAllPricesState('loading');
    getPrices(scopedSupplierIds)
      .then((rows) => {
        if (epoch !== priceEpochRef.current) return;
        setPrices((current) => mergePrices(current, rows));
        setAllPricesState('ready');
      })
      .catch((e) => {
        if (epoch !== priceEpochRef.current) return;
        console.error('Failed to load all prices', e);
        setAllPricesState('error');
        toastErrorRef.current('تعذر تحميل أسعار كل الأصناف لتطبيق الفلاتر. حاول مرة أخرى.');
      });
  }, [needsAllPrices, loading, allPricesState, scopedSupplierIds]);

  // مفتاح الفلاتر: عند تغيّره يعود العرض لأول دفعة تلقائياً (بدون effect ولا وميض).
  const filterKey = JSON.stringify([
    searchTerm,
    searchScope,
    selectedCategory,
    selectedSupplier,
    selectedIngredient,
    hideProductsWithoutOffers,
    availableOnly,
    cheapestFirst,
    bonusOnly,
    recentlyUpdatedOnly,
    favoritesOnly,
    sortByEffective,
  ]);
  const filterPriceMap = needsAllPrices ? productPricesMap : EMPTY_PRICE_MAP;

  // البحث والفلترة والفرز على كامل الكتالوج.
  const sortedProducts = useMemo(() => {
    const normSearch = normalizeArabic(searchTerm.trim());
    const tokens = normSearch ? normSearch.split(' ').filter(Boolean) : [];
    const entries: { product: Product; rank: number; sortValue: number }[] = [];

    for (const entry of searchIndex) {
      const prod = entry.product;
      let rank = 1;

      // 1) البحث: كل كلمات الاستعلام يجب أن تتطابق (بالاسم أو الشركة حسب النطاق)
      if (tokens.length) {
        let matches: boolean;
        if (searchScope === 'tradeName') {
          matches = tokens.every((t) => entry.name.includes(t));
        } else if (searchScope === 'manufacturer') {
          matches = tokens.every((t) => entry.mfg.includes(t));
        } else if (searchScope === 'activeIngredient') {
          matches = tokens.every((t) => entry.ingredients.includes(t));
        } else {
          matches = tokens.every((t) => entry.name.includes(t) || entry.mfg.includes(t) || entry.ingredients.includes(t));
        }
        if (!matches) continue;
        // الأصناف التي يبدأ اسمها بالكلمة المكتوبة تظهر أولاً
        if (entry.trade.startsWith(tokens[0])) rank = 0;
      }

      // 2) فلتر التصنيف
      if (selectedCategory !== 'all' && prod.category !== selectedCategory) continue;
      if (prod.visibleToPharmacies === false) continue;
      if (features.activeIngredientFilter && selectedIngredient !== 'all' && !getProductActiveIngredientIds(prod).includes(selectedIngredient)) continue;

      // 3) فلاتر الأسعار (تعمل على أسعار كل الأصناف بعد اكتمال تحميلها)
      const prodPrices = filterPriceMap.get(prod.id) || [];
      if (hideProductsWithoutOffers && (!allPricesReady || !prodPrices.some((pr) => pr.available))) continue;
      if (selectedSupplier !== 'all' && !prodPrices.some((pr) => pr.supplierId === selectedSupplier)) continue;
      if (availableOnly && !prodPrices.some((pr) => pr.available)) continue;
      if (bonusOnly && !prodPrices.some((pr) => pr.bonus && pr.bonus.trim().length > 0)) continue;
      if (recentlyUpdatedOnly && !prodPrices.some((pr) => !isOlderThan7Days(pr.updatedAt))) continue;

      // 4) فلتر المفضلة فقط
      if (favoritesOnly && !userFavorites.includes(prod.id)) continue;

      let sortValue = 0;
      if (sortByEffective || (features.cheapest && cheapestFirst)) {
        const availablePrices = prodPrices.filter((p) => p.available);
        sortValue = availablePrices.length
          ? Math.min(...availablePrices.map((p) => (sortByEffective ? p.effectivePrice || p.price : p.price)))
          : Infinity;
      }
      entries.push({ product: prod, rank, sortValue });
    }

    if (sortByEffective || (features.cheapest && cheapestFirst)) {
      entries.sort((a, b) => (a.sortValue === b.sortValue ? 0 : a.sortValue < b.sortValue ? -1 : 1));
    } else if (tokens.length) {
      entries.sort((a, b) => a.rank - b.rank);
    }

    return entries.map((e) => e.product);
  }, [
    searchIndex,
    searchTerm,
    searchScope,
    selectedCategory,
    selectedSupplier,
    selectedIngredient,
    features.activeIngredientFilter,
    hideProductsWithoutOffers,
    allPricesReady,
    availableOnly,
    bonusOnly,
    recentlyUpdatedOnly,
    favoritesOnly,
    userFavorites,
    filterPriceMap,
    cheapestFirst,
    sortByEffective,
  ]);

  // ===== العرض التدريجي أثناء التمرير =====
  // لا توجد أي طلبات شبكة هنا: القائمة كاملة في الذاكرة، ونكشف 24 بطاقة إضافية كلما اقترب المستخدم من النهاية.
  // العدد مرتبط بمفتاح الفلاتر فيعود تلقائياً لـ 24 عند تغيير البحث/الفلاتر فقط، ولا يُصفَّر عند أي إعادة رسم.
  const [visible, setVisible] = useState<{ key: string; count: number }>({ key: '', count: PAGE_SIZE });
  const visibleCount = visible.key === filterKey ? visible.count : PAGE_SIZE;
  const loadMoreVisible = useCallback(() => {
    setVisible((v) => ({ key: filterKey, count: (v.key === filterKey ? v.count : PAGE_SIZE) + PAGE_SIZE }));
  }, [filterKey]);

  const paginatedProducts = useMemo(() => sortedProducts.slice(0, visibleCount), [sortedProducts, visibleCount]);
  const hasMoreProducts = visibleCount < sortedProducts.length;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // مراقب واحد لعنصر في أسفل القائمة؛ يُعاد إنشاؤه بعد كل دفعة فيُطلق فحصاً فورياً
  // (فإن بقي العنصر ظاهراً في الشاشات الطويلة تُضاف دفعة أخرى حتى يخرج من نطاق الرؤية).
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMoreProducts || loading || pricesPending) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreVisible();
      },
      { root: null, rootMargin: '600px 0px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreProducts, visibleCount, loadMoreVisible, loading, pricesPending]);

  // ===== جلب الأسعار للأصناف الظاهرة فقط =====
  useEffect(() => {
    if (loading || allPricesState === 'ready' || allPricesState === 'loading') return;
    const pending = paginatedProducts.filter((p) => !requestedPriceIdsRef.current.has(p.id));
    if (!pending.length) return;

    const epoch = priceEpochRef.current;
    pending.forEach((p) => requestedPriceIdsRef.current.add(p.id));
    for (let i = 0; i < pending.length; i += PRICE_FETCH_CHUNK) {
      const chunk = pending.slice(i, i + PRICE_FETCH_CHUNK);
      const ids = Array.from(new Set(chunk.flatMap((p) => aliasGroups.get(p.id) ?? [p.id])));
      getPricesForProductIds(ids, scopedSupplierIds)
        .then((rows) => {
          if (epoch !== priceEpochRef.current) return;
          setPrices((current) => mergePrices(current, rows));
          setReadyPriceIds((current) => {
            const next = new Set(current);
            chunk.forEach((p) => next.add(p.id));
            return next;
          });
        })
        .catch((e) => {
          if (epoch !== priceEpochRef.current) return;
          console.warn('تعذر تحميل أسعار دفعة من الأصناف:', e);
          chunk.forEach((p) => requestedPriceIdsRef.current.delete(p.id));
          setPriceLoadFailed(true);
        });
    }
  }, [paginatedProducts, loading, allPricesState, aliasGroups, scopedSupplierIds, priceRetryTick]);

  const retryPriceLoading = () => {
    setPriceLoadFailed(false);
    if (allPricesState === 'error') setAllPricesState('idle');
    setPriceRetryTick((tick) => tick + 1);
  };

  // دالة ثابتة الهوية لمكوّن البحث، ولا تحدّث الحالة إلا إذا تغيّر النص أو النطاق فعلاً.
  const lastFilterRef = useRef<{ query: string; scope: SearchScope }>({ query: '', scope: 'all' });
  const handleSearchFilterChange = useCallback((query: string, newScope: SearchScope) => {
    const prev = lastFilterRef.current;
    if (prev.query === query && prev.scope === newScope) return;
    lastFilterRef.current = { query, scope: newScope };
    setSearchTerm(query);
    setSearchScope(newScope);
  }, []);

  // إعادة ضبط الفلاتر
  const handleResetFilters = () => {
    lastFilterRef.current = { query: '', scope: 'all' };
    setSearchTerm('');
    setSearchScope('all');
    setSelectedCategory('all');
    setSelectedSupplier('all');
    setSelectedIngredient('all');
    setAvailableOnly(false);
    setCheapestFirst(false);
    setBonusOnly(false);
    setRecentlyUpdatedOnly(false);
    setFavoritesOnly(false);
    setSortByEffective(false);
  };

  // معالجة الكمية
  const getQty = (key: string) => quantities[key] || 1;
  const setQty = (key: string, val: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(1, val) }));
  };

  // إضافة للسلة مع ميكرو-أنيميشن
  const handleAddToCart = (product: Product, priceRec: PriceRecord, supplier: Supplier) => {
    const key = `${product.id}_${supplier.id}`;
    const qty = getQty(key);

    addItem(
      {
        productId: product.id,
        tradeName: product.tradeName,
        form: product.form,
        strength: product.strength,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierWhatsapp: supplier.whatsapp,
        price: priceRec.price,
        publicPrice: priceRec.publicPrice,
        bonus: priceRec.bonus,
      },
      qty
    );

    triggerHaptic(12);
    // وميض تأكيد الإضافة
    setAddedItemKey(key);
    setTimeout(() => setAddedItemKey(null), 1400);

    success(`تمت إضافة (${productDisplayName(product)} × ${qty}) من ${supplier.name} للسلة`);
  };

  // تبديل المفضلة
  const handleToggleFavorite = async (productId: string) => {
    if (!user) return;
    const updated = await toggleProductFavorite(user.uid, productId);
    setUserFavorites(updated);
    if (updated.includes(productId)) {
      success('تمت إضافة الصنف إلى قائمتك المفضلة ⭐');
    } else {
      info('تمت إزالة الصنف من المفضلة');
    }
  };

  // حفظ تنبيه السعر
  const handleSavePriceAlert = async () => {
    if (!user || !alertModalProduct) return;
    const num = parseFloat(targetPriceInput);
    if (isNaN(num) || num <= 0) {
      await setProductPriceAlert(user.uid, alertModalProduct.id, null);
      const updated = { ...userPriceAlerts };
      delete updated[alertModalProduct.id];
      setUserPriceAlerts(updated);
      info('تم إلغاء تنبيه السعر لهذا الصنف.');
    } else {
      await setProductPriceAlert(user.uid, alertModalProduct.id, num);
      setUserPriceAlerts((prev) => ({ ...prev, [alertModalProduct.id]: num }));
      success(`تم تفعيل التنبيه! سنشعرك فور توفر الدواء بسعر ${formatCurrency(num)} أو أقل.`);
    }
    setAlertModalProduct(null);
    setTargetPriceInput('');
  };

  // بدائل بنفس المادة الفعالة
  const alternativesForActive = useMemo(() => {
    if (!selectedAltIngredient) return [];
    const base = selectedAltIngredient.baseProduct;
    const ingId = selectedAltIngredient.ingredient.id;

    // الأصناف التي لها نفس المادة الفعالة
    const candidates = products.filter(
      (p) => p.id !== base.id && p.visibleToPharmacies !== false && getProductActiveIngredientIds(p).includes(ingId)
    );

    // حساب أرخص سعر لكل بديل
    const results = candidates.map((altProd) => {
      const altPrices = (productPricesMap.get(altProd.id) || []).filter((p) => p.available);
      const minPrice = altPrices.length > 0 ? Math.min(...altPrices.map((p) => p.price)) : null;
      return {
        product: altProd,
        minPrice,
        prices: altPrices,
      };
    });

    results.sort((a, b) => (a.minPrice || Infinity) - (b.minPrice || Infinity));
    return results;
  }, [selectedAltIngredient, products, productPricesMap]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 text-slate-900 dark:text-slate-100 transition-colors duration-200" dir="rtl">
      {/* الرأس والعنوان */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>فارما لينك بين المستودعات</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            قارن عروض الموردين المعتمدين بالأسعار والبونص، اختر الأنسب، وأرسل طلباتك مباشرة لواتساب
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center gap-2">
            <Building className="w-4 h-4 text-[#0f9d7a]" />
            <span>
              الموردون المتاحون: <strong className="text-slate-900 dark:text-white">{allowedSuppliers.length}</strong> مستودع
            </span>
          </div>

          <button
            onClick={() => loadData(true)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0f9d7a] hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            title="تحديث الأسعار الآن"
          >
            <RefreshCw className={`w-4 h-4 ${loading || refreshing ? 'animate-spin text-[#0f9d7a]' : ''}`} />
          </button>
        </div>
      </div>

      {/* شريط البحث المتقدم والفلاتر السريعة */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs mb-6 space-y-4">
        {/* مكون البحث الشامل مع الفلترة المهدأة بالاسم والمادة والشركة */}
        <PharmacyGlobalSearch
          products={products.filter((product) => product.visibleToPharmacies !== false)}
          ingredientsMap={ingredientsMap}
          productPricesMap={productPricesMap}
          initialQuery={searchTerm}
          initialScope={searchScope}
          totalFilteredCount={sortedProducts.length}
          onFilterChange={handleSearchFilterChange}
          onClearAll={handleResetFilters}
        />

        {/* فلاتر التصنيف والمستودع */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* فلتر التصنيف */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">التصنيف الدوائي</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل التصنيفات ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر المورد */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">المستودع / المورد</label>
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل المستودعات المتاحة</option>
              {allowedSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {features.activeIngredientFilter && <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">المادة الفعالة</label>
            <select
              value={selectedIngredient}
              onChange={(event) => setSelectedIngredient(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل المواد الفعالة</option>
              {ingredientOptions.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
            </select>
          </div>}

          {/* زر إعادة ضبط سريع */}
          <div className="flex items-end">
            {(searchTerm ||
              selectedCategory !== 'all' ||
              selectedSupplier !== 'all' ||
              selectedIngredient !== 'all' ||
              availableOnly ||
              cheapestFirst ||
              bonusOnly ||
              recentlyUpdatedOnly ||
              favoritesOnly ||
              sortByEffective) ? (
              <button
                onClick={handleResetFilters}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط الفلاتر</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* شريط الفلاتر السريعة (Chips) الثابت */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 ml-1">فلاتر سريعة:</span>

          <button
            onClick={() => { setAvailableOnly(!availableOnly); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              availableOnly
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>متوفر فقط</span>
          </button>

          {features.cheapest && <button
            onClick={() => { setCheapestFirst(!cheapestFirst); setSortByEffective(false); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              cheapestFirst
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>الأرخص أولاً</span>
          </button>}

          <button
            onClick={() => { setSortByEffective(!sortByEffective); setCheapestFirst(false); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              sortByEffective
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title="ترتيب العروض بناء على السعر الصافي للقطعة بعد البونص"
          >
            <Percent className="w-3.5 h-3.5" />
            <span>السعر بعد البونص</span>
          </button>

          <button
            onClick={() => { setBonusOnly(!bonusOnly); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              bonusOnly
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>عروض بونص فقط</span>
          </button>

          <button
            onClick={() => { setRecentlyUpdatedOnly(!recentlyUpdatedOnly); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              recentlyUpdatedOnly
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>محدث حديثاً (&lt; 7 أيام)</span>
          </button>

          <button
            onClick={() => { setFavoritesOnly(!favoritesOnly); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              favoritesOnly
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>المفضلة ({userFavorites.length})</span>
          </button>
        </div>
      </div>

      {/* خطأ التحميل مع زر إعادة المحاولة */}
      {loadError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-right">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">{loadError}</h3>
            </div>
            <button
              onClick={() => loadData(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {pricesPending && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" role="status">جاري تحميل أسعار كل الأصناف لتطبيق الفلاتر على الكتالوج كاملاً...</div>}

      {(priceLoadFailed || allPricesState === 'error') && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
          <span>تعذر تحميل بعض الأسعار.</span>
          <button type="button" onClick={retryPriceLoading} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700">إعادة المحاولة</button>
        </div>
      )}

      {/* النتائج وعرض بطاقات المقارنة المدمجة */}
      {loading || pricesPending ? (
        <CardSkeleton count={6} />
      ) : paginatedProducts.length === 0 ? (
        <EmptyState
          title="لم يتم العثور على أدوية مطابقة"
          description="جرب البحث بكلمات أخرى أو قم بإلغاء بعض الفلاتر لعرض نتائج أوسع."
          actionText="إعادة ضبط كل الفلاتر"
          onAction={handleResetFilters}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedProducts.map((product) => {
              const ingredientNames = getProductActiveIngredientIds(product)
                .map((id) => ingredientsMap.get(id)?.name)
                .filter(Boolean);
              const prodPrices = productPricesMap.get(product.id) || [];
              const isFav = userFavorites.includes(product.id);
              const hasAlert = userPriceAlerts[product.id] !== undefined;
              const trend = productPriceTrends.get(product.id);

              // العثور على أرخص وأفضل الأسعار
              const availablePrices = prodPrices.filter((p) => p.available);
              const minPrice =
                availablePrices.length > 0
                  ? Math.min(...availablePrices.map((p) => p.price))
                  : null;

              // السعر الثاني للمقارنة
              const sortedAvailable = [...availablePrices].sort((a, b) => a.price - b.price);
              const secondPrice = sortedAvailable.length > 1 ? sortedAvailable[1].price : null;
              const maxSavingsDiff = minPrice !== null && secondPrice !== null ? secondPrice - minPrice : 0;
              const maxSavingsPercent = minPrice !== null && secondPrice !== null && secondPrice > 0
                ? Math.round((maxSavingsDiff / secondPrice) * 100)
                : 0;

              return (
                <div
                  key={product.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                >
                  {/* رأس بطاقة الدواء — يُبنى حسب إعدادات الإدارة (صفحة تخصيص الكرت) */}
                  <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="flex-1 font-extrabold text-base text-slate-900 dark:text-white leading-snug">
                        {productCardTitle(product, cardConfig) || productDisplayName(product)}
                      </h3>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {cardConfig.showViewButton && (
                          <Link
                            to={`/app/prices/${product.id}`}
                            title="عرض الصنف وآخر التغييرات"
                            aria-label="عرض الصنف وآخر التغييرات"
                            className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[#0f9d7a] hover:bg-emerald-100 transition"
                          >
                            <History className="w-4 h-4" />
                          </Link>
                        )}
                        {cardConfig.showFavorite && (
                          <button
                            onClick={() => handleToggleFavorite(product.id)}
                            className={`p-1.5 rounded-lg transition ${
                              isFav ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                            }`}
                            title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                        )}
                        {cardConfig.showAlert && (
                          <button
                            onClick={() => {
                              setAlertModalProduct(product);
                              setTargetPriceInput(userPriceAlerts[product.id]?.toString() || '');
                            }}
                            className={`p-1.5 rounded-lg transition ${
                              hasAlert ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600 hover:text-emerald-600'
                            }`}
                            title={hasAlert ? `مفعل تنبيه السعر: ${formatCurrency(userPriceAlerts[product.id])}` : 'تحديد سعر مستهدف للتنبيه'}
                          >
                            <BellRing className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {cardConfig.details.filter((item) => item.visible).map((item) => {
                        if (item.key === 'activeIngredient') {
                          if (product.productType === 'medical_supply') return <span key={item.key} className="text-xs text-slate-500 font-bold">مستلزم طبي</span>;
                          return ingredientNames.length > 0 && shouldShowComposition(product, ingredientNames.length) ? <span key={item.key} className="text-xs text-[#0f9d7a] font-bold">{ingredientNames.join(' + ')}</span> : null;
                        }
                        if (item.key === 'manufacturer') return <span key={item.key} className="bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900">الشركة: <strong className="text-slate-700 dark:text-slate-200">{product.manufacturer || 'غير محددة'}</strong></span>;
                        if (item.key === 'packSize') return product.packSize ? <span key={item.key} className="bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">العبوة: <strong className="text-slate-700 dark:text-slate-200">{product.packSize}</strong></span> : null;
                        if (item.key === 'category') return product.category ? <span key={item.key} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg">{product.category}</span> : null;
                        if (item.key === 'trend' && trend && trend.trend === 'down') return (
                          <span key={item.key} className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[9px] font-black rounded-md flex items-center gap-0.5">
                            <TrendingDown className="w-2.5 h-2.5" />
                            <span>انخفض -{trend.percent}%</span>
                          </span>
                        );
                        if (item.key === 'trend' && trend && trend.trend === 'up') return (
                          <span key={item.key} className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[9px] font-black rounded-md flex items-center gap-0.5">
                            <TrendingUp className="w-2.5 h-2.5" />
                            <span>ارتفع +{trend.percent}%</span>
                          </span>
                        );
                        return null;
                      })}
                    </div>

                    {/* شارة التوفير بين عروض الصنف الواحد */}
                    {features.cheapest && cardConfig.showSavings && maxSavingsDiff > 0 && (
                      <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-[10px] text-emerald-800 dark:text-emerald-300 font-bold">
                        <span>فارق توفير بين المستودعات:</span>
                        <span>وفّر {formatCurrency(maxSavingsDiff)} ({maxSavingsPercent}%)</span>
                      </div>
                    )}
                  </div>

                  {/* جدول مقارنة عروض المستودعات المدمج */}
                  <div className="p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-900/50 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 px-1 flex items-center justify-between">
                        <span>عروض المستودعات المقارنة ({prodPrices.length}):</span>
                        {sortByEffective && <span className="text-[#0f9d7a]">الكتالوج مرتب بالسعر بعد البونص</span>}
                      </div>

                      {prodPrices.length === 0 && !isPriceReady(product.id) ? (
                        <div className="p-3 text-center text-xs text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900" role="status">
                          جاري تحميل أسعار هذا الصنف...
                        </div>
                      ) : prodPrices.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                          لا توجد أسعار مدخلة من مورديك الحاليين
                        </div>
                      ) : (
                        (expandedSupplierProducts.has(product.id) ? prodPrices : prodPrices.slice(0, 3)).map((priceRec) => {
                          const sup = suppliersMap.get(priceRec.supplierId);
                          if (!sup) return null;
                          const deliveryRule = deliveryRuleForSupplier(sup, defaultBranch ? getDeliveryAreaKeys(defaultBranch) : [user?.city, user?.governorate]);

                          const isCheapest =
                            features.cheapest &&
                            priceRec.available &&
                            minPrice !== null &&
                            priceRec.price === minPrice &&
                            availablePrices.length > 1;

                          const isOld = isOlderThan7Days(priceRec.updatedAt);
                          const itemKey = `${product.id}_${sup.id}`;
                          const qty = getQty(itemKey);
                          const isJustAdded = addedItemKey === itemKey;

                          const bonusCalc = calculateEffectiveUnitPrice(priceRec.price, priceRec.bonus);

                          return (
                            <div
                              key={`${priceRec.id || ''}_${priceRec.supplierId}_${priceRec.price}`}
                              className={`p-3 rounded-xl border transition-all ${
                                isCheapest
                                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 shadow-2xs'
                                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {sup.name}
                                  </span>
                                  {showDeliveryDays && <span className="text-[9px] text-slate-400 whitespace-nowrap">توصيل{defaultBranch?.city || user?.city || user?.governorate ? ` ${defaultBranch?.city || user?.city || user?.governorate}:` : ':'} {deliveryRule.days.join('، ') || 'غير محدد لهذه المنطقة'}{deliveryRule.cutoffTime ? ` · إغلاق ${deliveryRule.cutoffTime}` : ''}{deliveryRule.minimumOrderAmount ? ` · حد ${formatCurrency(deliveryRule.minimumOrderAmount)}` : ''}</span>}
                                  {isCheapest && (
                                    <span className="px-1.5 py-0.5 bg-[#0f9d7a] text-white text-[9px] font-black rounded-md flex items-center gap-0.5 shrink-0">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      <span>الأرخص</span>
                                    </span>
                                  )}
                                  {priceRec.bonus && (
                                    <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9px] font-bold rounded-md shrink-0">
                                      {priceRec.bonus}
                                    </span>
                                  )}
                                </div>

                                <div className="text-left shrink-0">
                                  <span className="text-sm font-black text-slate-900 dark:text-white block leading-tight font-mono">
                                    {formatCurrency(priceRec.price)}
                                  </span>
                                  {bonusCalc.hasBonus && (
                                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold block font-mono" title="السعر الفعلي للقطعة بعد احتساب البونص">
                                      صافي {formatCurrency(bonusCalc.effectivePrice)}
                                    </span>
                                  )}
                                  {features.publicPrice && priceRec.publicPrice && !bonusCalc.hasBonus && (
                                    <span className="text-[10px] text-slate-400 line-through block font-mono">
                                      {formatCurrency(priceRec.publicPrice)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* التوفر وتاريخ السعر */}
                              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-2.5">
                                <div className="flex items-center gap-1">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      priceRec.available ? 'bg-emerald-500' : 'bg-rose-400'
                                    }`}
                                  />
                                  <span>{priceRec.available ? 'متوفر بالمستودع' : 'غير متوفر'}</span>
                                </div>

                                <div
                                  className={`flex items-center gap-1 ${
                                    isOld ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                  title={
                                    isOld
                                      ? 'تنبيه: تم تحديث هذا السعر منذ أكثر من 7 أيام'
                                      : 'تاريخ تحديث السعر'
                                  }
                                >
                                  {isOld && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {formatGregorianDate(priceRec.updatedAt, { includeTime: false })}
                                  </span>
                                </div>
                              </div>

                              {/* التحكم بالكمية وزر الإضافة للسلة */}
                              {priceRec.available ? (
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                                  <div className="flex items-center border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/50 overflow-hidden shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setQty(itemKey, qty - 1)}
                                      className="px-2 py-1 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min={1}
                                      value={qty}
                                      onChange={(e) => setQty(itemKey, parseInt(e.target.value) || 1)}
                                      className="w-10 text-center text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent focus:outline-hidden font-mono"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setQty(itemKey, qty + 1)}
                                      className="px-2 py-1 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold"
                                    >
                                      +
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleAddToCart(product, priceRec, sup)}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                                      isJustAdded
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-[#0f9d7a] hover:bg-[#0c8567] text-white shadow-xs'
                                    }`}
                                  >
                                    {isJustAdded ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>تمت الإضافة!</span>
                                      </>
                                    ) : (
                                      <>
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                        <span>أضف للسلة</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 text-center">
                                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                    غير متاح للطلب حالياً
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {prodPrices.length > 3 && <button type="button" onClick={() => setExpandedSupplierProducts((previous) => { const next = new Set(previous); next.has(product.id) ? next.delete(product.id) : next.add(product.id); return next; })} className="mt-2 w-full rounded-xl border border-emerald-200 bg-white py-2 text-xs font-bold text-[#0f9d7a]">{expandedSupplierProducts.has(product.id) ? 'إخفاء بقية المستودعات' : `عرض كل المستودعات (${prodPrices.length})`}</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMoreProducts && (
            <div ref={sentinelRef} className="flex flex-col items-center justify-center gap-2 py-6 text-xs font-bold text-slate-400" aria-live="polite">
              <button type="button" onClick={loadMoreVisible} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 font-bold text-[#0f9d7a]">
                عرض المزيد من الأصناف
              </button>
              <span>المعروض {paginatedProducts.length} من {sortedProducts.length} صنف · يكتمل العرض تلقائياً عند التمرير</span>
            </div>
          )}
          {!hasMoreProducts && sortedProducts.length > PAGE_SIZE && <p className="text-center text-xs text-slate-400 py-5">تم عرض جميع الأصناف المطابقة ({sortedProducts.length})</p>}
        </>
      )}

      {/* نافذة بدائل المادة الفعالة مع حساب التوفير */}
      {selectedAltIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Split className="w-5 h-5 text-[#0f9d7a]" />
                  <span>بدائل تجارية بنفس المادة الفعالة</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  المادة: <strong className="text-emerald-700 dark:text-emerald-400">{selectedAltIngredient.ingredient.name}</strong> • الدواء المختار: <strong className="text-slate-800 dark:text-slate-200">{selectedAltIngredient.baseProduct.tradeName}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedAltIngredient(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {alternativesForActive.length === 0 ? (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                  لا توجد بدائل تجارية مسجلة أخرى لنفس المادة الفعالة حالياً.
                </div>
              ) : (
                alternativesForActive.map(({ product: altProd, minPrice }) => {
                  return (
                    <div
                      key={altProd.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-emerald-300 transition"
                    >
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {altProd.tradeName}
                        </h4>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                          <span>{altProd.form}</span>
                          <span>•</span>
                          <span>{altProd.strength}</span>
                          <span>•</span>
                          <span>{altProd.manufacturer}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-left font-mono">
                          {minPrice !== null ? (
                            <span className="text-sm font-black text-[#0f9d7a]">
                              {formatCurrency(minPrice)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">غير متوفر</span>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            setSearchTerm(altProd.tradeName);
                            setSearchScope('tradeName');
                            setSelectedAltIngredient(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-white transition"
                        >
                          عرض العروض
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedAltIngredient(null)}
                className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تنبيه السعر المستهدف */}
      {alertModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BellRing className="w-4 h-4 text-[#0f9d7a]" />
                <span>مراقبة سعر الدواء</span>
              </h3>
              <button
                onClick={() => setAlertModalProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              حدد السعر المستهدف لصنف <strong className="text-slate-900 dark:text-white">({alertModalProduct.tradeName})</strong> وسيتم إشعارك فور قيام أي مستودع بتوريده بهذا السعر أو أقل.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                السعر المستهدف (₪):
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={targetPriceInput}
                onChange={(e) => setTargetPriceInput(e.target.value)}
                placeholder="مثال: 14.50"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold focus:outline-hidden focus:border-[#0f9d7a] font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSavePriceAlert}
                className="flex-1 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0c8567] text-white text-xs font-bold shadow-xs transition"
              >
                حفظ التنبيه
              </button>
              <button
                onClick={() => setAlertModalProduct(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
