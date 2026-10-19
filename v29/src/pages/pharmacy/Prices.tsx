// src/pages/pharmacy/Prices.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import {
  getProductsPage,
  getPricesForProductIds,
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
  Layers
} from 'lucide-react';

import { CardSkeleton } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { triggerHaptic } from '../../utils/profile';
import { PharmacyGlobalSearch, SearchScope } from '../../components/PharmacyGlobalSearch';
import { productDisplayName } from '../../utils/productCatalog';
import { deliveryRuleForSupplier } from '../../services/v18Features';
import { PriceOfferSortMode, sortPriceOffers } from '../../utils/priceOfferSorting';

export const PharmacyPrices: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const { success, error: toastError, info } = useToastStore();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [productCursor, setProductCursor] = useState<any | null>(null);
  const [hasMoreServer, setHasMoreServer] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>(searchParams.get('supplier') || 'all');

  // Quick Filter Chips
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [cheapestFirst, setCheapestFirst] = useState<boolean>(false);
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

  // Pagination
  const [visibleCount, setVisibleCount] = useState(24);

  // Selected quantities per (productId_supplierId)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Feedback state for recently added buttons
  const [addedItemKey, setAddedItemKey] = useState<string | null>(null);
  const [expandedSupplierProducts, setExpandedSupplierProducts] = useState<Set<string>>(new Set());
  const [showDeliveryDays, setShowDeliveryDays] = useState(true);
  const [offerSortMode, setOfferSortMode] = useState<PriceOfferSortMode>('cheapest');

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

  // تحميل أول دفعة فقط؛ الأسعار وسجلها لا يُجلبان لكل الكتالوج.
  const allowedSupplierIdsString = (user?.allowedSuppliers || []).join(',');
  const SERVER_PAGE_SIZE = 24;

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    let isTimedOut = false;
    const timer = setTimeout(() => {
      isTimedOut = true;
      setLoadError('استغرقت استجابة قاعدة البيانات وقتاً أطول من المتوقع. تحقق من الإنترنت وحاول مرة أخرى.');
      setLoading(false);
    }, 20000);

    try {
      const allowedIds = user?.allowedSuppliers && user.allowedSuppliers.length > 0 ? user.allowedSuppliers : undefined;
      const [productsPage, ingsData, supsData] = await Promise.all([
        getProductsPage(SERVER_PAGE_SIZE),
        getActiveIngredients(),
        getSuppliers(),
      ]);
      const pagePrices = await getPricesForProductIds(productsPage.items.map((p) => p.id), allowedIds);
      if (!isTimedOut) {
        clearTimeout(timer);
        setProducts(productsPage.items);
        setIngredients(ingsData);
        setSuppliers(supsData);
        setPrices(pagePrices);
        setPriceHistory([]);
        setProductCursor(productsPage.cursor);
        setHasMoreServer(productsPage.hasMore);
        setVisibleCount(PAGE_SIZE);
        loadedProductIdsRef.current = new Set(productsPage.items.map((product) => product.id));
        loadedPriceKeysRef.current = new Set(pagePrices.map(priceRecordKey));
        setLoadError(null);
      }
    } catch (e: any) {
      if (!isTimedOut) {
        clearTimeout(timer);
        console.error('Failed to load prices data', e);
        setLoadError('تعذر تحميل بيانات الأسعار. تأكد من اتصال الشبكة وحاول مرة أخرى.');
      }
    } finally {
      if (!isTimedOut) setLoading(false);
    }
  }, [allowedSupplierIdsString]);

  useEffect(() => {
    loadData();
    getSystemSettings().then((settings) => {
      setShowDeliveryDays(settings.showDeliveryDays !== false);
      setOfferSortMode(settings.priceOfferSortMode || 'cheapest');
    }).catch(() => {});
  }, [loadData]);

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

  // دمج الأصناف المكررة (نفس الاسم/الشركة/التركيز/الشكل بمعرّفات مختلفة بسبب الاستيراد) في بطاقة واحدة.
  const productAlias = useMemo(() => {
    const canonicalByKey = new Map<string, string>();
    const alias = new Map<string, string>();
    products.forEach((prod) => {
      const key = [prod.tradeName, prod.manufacturer, prod.strength, prod.form, prod.packSize]
        .map((v) => normalizeArabic(String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')))
        .join('|');
      const canonical = canonicalByKey.get(key);
      if (canonical) alias.set(prod.id, canonical);
      else canonicalByKey.set(key, prod.id);
    });
    return alias;
  }, [products]);

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

    // ترتيب عروض كل صنف وفق سياسة المدير مع إبقاء المتاح قبل غير المتاح.
    map.forEach((records, productId) => {
      map.set(productId, sortPriceOffers(records, suppliers, offerSortMode));
    });

    return map;
  }, [prices, allowedSupplierIds, productAlias, suppliers, offerSortMode]);

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

  // استخراج قائمة التصنيفات الفريدة
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // فحص هل السعر أقدم من 7 أيام
  const isOlderThan7Days = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return date < sevenDaysAgo;
  };

  // فلترة الأصناف والأسعار
  const filteredProducts = useMemo(() => {
    const normSearch = normalizeArabic(searchTerm.trim());

    return products.filter((prod) => {
      // 1) البحث العام بنطاقاته المحددة
      if (normSearch) {
        const prodNorm = normalizeArabic(productDisplayName(prod));
        const mfgNorm = normalizeArabic(prod.manufacturer);

        let matches = false;
        if (searchScope === 'all') {
          matches =
            prodNorm.includes(normSearch) ||
            mfgNorm.includes(normSearch);
        } else if (searchScope === 'tradeName') {
          matches = prodNorm.includes(normSearch);
        } else if (searchScope === 'manufacturer') {
          matches = mfgNorm.includes(normSearch);
        }

        if (!matches) return false;
      }

      // 2) فلتر التصنيف
      if (selectedCategory !== 'all' && prod.category !== selectedCategory) {
        return false;
      }

      // أسعار الصنف للموردين المسموحين
      const prodPrices = productPricesMap.get(prod.id) || [];

      // 3) فلتر المورد المحدد
      if (selectedSupplier !== 'all') {
        const hasSupplier = prodPrices.some((pr) => pr.supplierId === selectedSupplier);
        if (!hasSupplier) return false;
      }

      // 4) فلتر المتوفر فقط
      if (availableOnly) {
        const hasAvailable = prodPrices.some((pr) => pr.available);
        if (!hasAvailable) return false;
      }

      // 5) فلتر عروض البونص فقط
      if (bonusOnly) {
        const hasBonus = prodPrices.some((pr) => pr.bonus && pr.bonus.trim().length > 0);
        if (!hasBonus) return false;
      }

      // 6) فلتر محدث حديثاً (< 7 أيام)
      if (recentlyUpdatedOnly) {
        const hasRecent = prodPrices.some((pr) => !isOlderThan7Days(pr.updatedAt));
        if (!hasRecent) return false;
      }

      // 7) فلتر المفضلة فقط
      if (favoritesOnly) {
        if (!userFavorites.includes(prod.id)) return false;
      }

      return true;
    });
  }, [
    products,
    searchTerm,
    searchScope,
    selectedCategory,
    selectedSupplier,
    availableOnly,
    bonusOnly,
    recentlyUpdatedOnly,
    favoritesOnly,
    userFavorites,
    ingredientsMap,
    productPricesMap,
  ]);

  // فرز الأصناف مع إزالة أي تكرار محتمل من بيانات الاستيراد أو Firestore.
  const sortedProducts = useMemo(() => {
    let list = Array.from(new Map(filteredProducts.filter((product) => !productAlias.has(product.id)).map((product) => [product.id, product])).values());

    if (sortByEffective) {
      list.sort((a, b) => {
        const pricesA = (productPricesMap.get(a.id) || []).filter((p) => p.available);
        const pricesB = (productPricesMap.get(b.id) || []).filter((p) => p.available);
        const effA = pricesA.length > 0 ? Math.min(...pricesA.map((p) => p.effectivePrice || p.price)) : Infinity;
        const effB = pricesB.length > 0 ? Math.min(...pricesB.map((p) => p.effectivePrice || p.price)) : Infinity;
        return effA - effB;
      });
    } else if (cheapestFirst) {
      list.sort((a, b) => {
        const pricesA = (productPricesMap.get(a.id) || []).filter((p) => p.available);
        const pricesB = (productPricesMap.get(b.id) || []).filter((p) => p.available);
        const minA = pricesA.length > 0 ? Math.min(...pricesA.map((p) => p.price)) : Infinity;
        const minB = pricesB.length > 0 ? Math.min(...pricesB.map((p) => p.price)) : Infinity;
        return minA - minB;
      });
    }

    return list;
  }, [filteredProducts, cheapestFirst, sortByEffective, productPricesMap, productAlias]);

  // ترقيم عرضي داخل الدفعة + تحميل دفعة Firestore جديدة عند الحاجة.
  const PAGE_SIZE = 24;
  const paginatedProducts = useMemo(() => sortedProducts.slice(0, visibleCount), [sortedProducts, visibleCount]);
  const hasMoreProducts = visibleCount < sortedProducts.length || hasMoreServer;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  // مرجع مستقل عن React state لمنع إعادة إدخال نفس الصفحة أثناء تغيّر المؤشر.
  const loadedProductIdsRef = useRef<Set<string>>(new Set());
  const loadedPriceKeysRef = useRef<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const priceRecordKey = (price: PriceRecord) => [
    price.productId,
    price.supplierId,
    price.price,
    price.bonus || '',
    price.updatedAt || '',
  ].join('|');

  const loadMoreProducts = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreProducts) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      // نعرض المزيد من الدفعة الحالية أولاً دون أي طلب شبكة.
      if (visibleCount < sortedProducts.length) {
        setVisibleCount((count) => Math.min(count + 10, sortedProducts.length));
        return;
      }
      if (!hasMoreServer) return;
      const allowedIds = user?.allowedSuppliers && user.allowedSuppliers.length > 0 ? user.allowedSuppliers : undefined;
      // قد يعيد مصدر البيانات دفعة متداخلة عند الانتقال من Firestore إلى
      // fallback المحلي أو عند وجود قيم tradeName متساوية. نتقدم بالمؤشر
      // ونحاول دفعة أخرى بدلاً من عرض العناصر القديمة أو إعادة الحلقة نفسها.
      let cursor = productCursor;
      let pageHasMore: boolean = hasMoreServer;
      let newProducts: Product[] = [];
      let newPrices: PriceRecord[] = [];
      let attempts = 0;

      while (pageHasMore && attempts < 5 && newProducts.length === 0) {
        const nextPage = await getProductsPage(SERVER_PAGE_SIZE, cursor);
        const unseenProducts = nextPage.items.filter((product) => !loadedProductIdsRef.current.has(product.id));
        const unseenIds = unseenProducts.map((product) => product.id);
        const nextPrices = unseenIds.length ? await getPricesForProductIds(unseenIds, allowedIds) : [];

        unseenProducts.forEach((product) => loadedProductIdsRef.current.add(product.id));
        const uniquePrices = nextPrices.filter((price) => {
          const key = priceRecordKey(price);
          if (loadedPriceKeysRef.current.has(key)) return false;
          loadedPriceKeysRef.current.add(key);
          return true;
        });

        newProducts = unseenProducts;
        newPrices = uniquePrices;
        cursor = nextPage.cursor;
        pageHasMore = nextPage.hasMore;
        attempts += 1;

        // إذا أعاد المؤشر نفس المكان، نوقف الحلقة بدلاً من تكرار الطلبات.
        if (JSON.stringify(cursor) === JSON.stringify(productCursor) && unseenProducts.length === 0) {
          pageHasMore = false;
          break;
        }
      }

      setProducts((current) => [...current, ...newProducts]);
      setPrices((current) => [...current, ...newPrices]);
      setProductCursor(cursor);
      setHasMoreServer(pageHasMore && newProducts.length > 0);
      if (newProducts.length > 0) setVisibleCount((count) => count + 10);
    } catch (e) {
      console.warn('تعذر تحميل الدفعة التالية من الأسعار:', e);
      toastError('تعذر تحميل المزيد حالياً. حاول مرة أخرى.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMoreProducts, visibleCount, sortedProducts.length, hasMoreServer, productCursor, allowedSupplierIdsString, toastError]);

  useEffect(() => {
    const target = loadMoreRef.current;
      if (!target || !hasMoreProducts || loadingMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadMoreProducts();
    }, { root: null, rootMargin: '0px 0px 160px 0px', threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, sortedProducts.length, hasMoreProducts, loadingMore, loadMoreProducts]);

  // إعادة ضبط الفلاتر
  const handleResetFilters = () => {
    setSearchTerm('');
    setSearchScope('all');
    setSelectedCategory('all');
    setSelectedSupplier('all');
    setAvailableOnly(false);
    setCheapestFirst(false);
    setBonusOnly(false);
    setRecentlyUpdatedOnly(false);
    setFavoritesOnly(false);
    setSortByEffective(false);
    setVisibleCount(PAGE_SIZE);
    loadingMoreRef.current = false;
    setLoadingMore(false);
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
      (p) => p.id !== base.id && p.activeIngredientId === ingId
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
            onClick={() => loadData()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0f9d7a] hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            title="تحديث الأسعار الآن"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0f9d7a]' : ''}`} />
          </button>
        </div>
      </div>

      {/* شريط البحث المتقدم والفلاتر السريعة */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs mb-6 space-y-4">
        {/* مكون البحث الشامل مع الفلترة المهدأة بالاسم والمادة والشركة */}
        <PharmacyGlobalSearch
          products={products}
          ingredientsMap={ingredientsMap}
          productPricesMap={productPricesMap}
          initialQuery={searchTerm}
          initialScope={searchScope}
          totalFilteredCount={sortedProducts.length}
          onFilterChange={(query, newScope) => {
            setSearchTerm(query);
            setSearchScope(newScope);
            setVisibleCount(PAGE_SIZE);
          }}
          onClearAll={handleResetFilters}
        />

        {/* فلاتر التصنيف والمستودع */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {/* فلتر التصنيف */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">التصنيف الدوائي</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setVisibleCount(PAGE_SIZE);
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
                setVisibleCount(PAGE_SIZE);
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

          {/* زر إعادة ضبط سريع */}
          <div className="flex items-end">
            {(searchTerm ||
              selectedCategory !== 'all' ||
              selectedSupplier !== 'all' ||
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
            onClick={() => { setAvailableOnly(!availableOnly); setVisibleCount(PAGE_SIZE); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              availableOnly
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>متوفر فقط</span>
          </button>

          <button
            onClick={() => { setCheapestFirst(!cheapestFirst); setSortByEffective(false); setVisibleCount(PAGE_SIZE); }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              cheapestFirst
                ? 'bg-[#0f9d7a] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>الأرخص أولاً</span>
          </button>

          <button
            onClick={() => { setSortByEffective(!sortByEffective); setCheapestFirst(false); setVisibleCount(PAGE_SIZE); }}
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
            onClick={() => { setBonusOnly(!bonusOnly); setVisibleCount(PAGE_SIZE); }}
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
            onClick={() => { setRecentlyUpdatedOnly(!recentlyUpdatedOnly); setVisibleCount(PAGE_SIZE); }}
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
            onClick={() => { setFavoritesOnly(!favoritesOnly); setVisibleCount(PAGE_SIZE); }}
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
              onClick={() => loadData()}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {/* النتائج وعرض بطاقات المقارنة المدمجة */}
      {loading ? (
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
            {paginatedProducts.map((product, index) => {
              const ing = ingredientsMap.get(product.activeIngredientId);
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
                  {/* رأس بطاقة الدواء */}
                  <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-snug">
                            {productDisplayName(product)}
                          </h3>
                          {/* زر المفضلة */}
                          <button
                            onClick={() => handleToggleFavorite(product.id)}
                            className={`p-1 rounded-lg transition ${
                              isFav ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                            }`}
                            title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          {/* زر تنبيه السعر */}
                          <button
                            onClick={() => {
                              setAlertModalProduct(product);
                              setTargetPriceInput(userPriceAlerts[product.id]?.toString() || '');
                            }}
                            className={`p-1 rounded-lg transition ${
                              hasAlert ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600 hover:text-emerald-600'
                            }`}
                            title={hasAlert ? `مفعل تنبيه السعر: ${formatCurrency(userPriceAlerts[product.id])}` : 'تحديد سعر مستهدف للتنبيه'}
                          >
                            <BellRing className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-1 flex items-center gap-2">
                          {product.productType === 'medical_supply' && <span className="text-xs text-slate-500 font-bold">مستلزم طبي</span>}
                          {product.productType !== 'medical_supply' && ing && <span className="text-xs text-[#0f9d7a] font-bold">{ing.name}</span>}
                        </div>
                        <Link to={`/app/prices/${product.id}`} className="mt-2 inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-[#0f9d7a] hover:bg-emerald-100">عرض الصنف وآخر التغييرات</Link>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg">
                          {product.category}
                        </span>
                        {/* مؤشر اتجاه السعر Sparkline/Trend */}
                        {trend && trend.trend === 'down' && (
                          <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[9px] font-black rounded-md flex items-center gap-0.5">
                            <TrendingDown className="w-2.5 h-2.5" />
                            <span>انخفض -{trend.percent}%</span>
                          </span>
                        )}
                        {trend && trend.trend === 'up' && (
                          <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[9px] font-black rounded-md flex items-center gap-0.5">
                            <TrendingUp className="w-2.5 h-2.5" />
                            <span>ارتفع +{trend.percent}%</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
                        الشكل: <strong className="text-slate-700 dark:text-slate-200">{product.form}</strong>
                      </span>
                      <span className="bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
                        التركيز: <strong className="text-slate-700 dark:text-slate-200">{product.strength}</strong>
                      </span>
                      {product.packSize && <span className="bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">العبوة: <strong className="text-slate-700 dark:text-slate-200">{product.packSize}</strong></span>}
                      <span className="bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
                        الشركة: <strong className="text-slate-700 dark:text-slate-200">{product.manufacturer}</strong>
                      </span>
                    </div>

                    {/* شارة التوفير بين عروض الصنف الواحد */}
                    {maxSavingsDiff > 0 && (
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
                        {sortByEffective && <span className="text-[#0f9d7a]">مرتب بالسعر بعد البونص</span>}
                      </div>

                      {prodPrices.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                          لا توجد أسعار مدخلة من مورديك الحاليين
                        </div>
                      ) : (
                        (expandedSupplierProducts.has(product.id) ? prodPrices : prodPrices.slice(0, 3)).map((priceRec) => {
                          const sup = suppliersMap.get(priceRec.supplierId);
                          if (!sup) return null;
                          const deliveryRule = deliveryRuleForSupplier(sup, [user?.city, user?.governorate]);

                          const isCheapest =
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
                              key={priceRec.supplierId}
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
                                  {showDeliveryDays && <span className="text-[9px] text-slate-400 whitespace-nowrap">توصيل{user?.city || user?.governorate ? ` ${user?.city || user?.governorate}:` : ':'} {deliveryRule.days.join('، ') || 'غير محدد لهذه المنطقة'}{deliveryRule.cutoffTime ? ` · إغلاق ${deliveryRule.cutoffTime}` : ''}{deliveryRule.minimumOrderAmount ? ` · حد ${formatCurrency(deliveryRule.minimumOrderAmount)}` : ''}</span>}
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
                                  {priceRec.publicPrice && !bonusCalc.hasBonus && (
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

          {/* التحميل التلقائي عند الوصول إلى آخر صنفين */}
          {hasMoreProducts && <div ref={loadMoreRef} className="flex flex-col items-center justify-center gap-2 py-4 text-xs font-bold text-slate-400" aria-live="polite">
            <button type="button" onClick={() => void loadMoreProducts()} disabled={loadingMore} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 font-bold text-[#0f9d7a] disabled:opacity-60">
              {loadingMore ? 'جاري تحميل صفحة جديدة...' : 'تحميل المزيد من الأصناف'}
            </button>
            <span>يتم تحميل دفعة جديدة من قاعدة البيانات عند نهاية القائمة</span>
          </div>}
          {!hasMoreProducts && sortedProducts.length > PAGE_SIZE && <p className="text-center text-xs text-slate-400 py-5">تم عرض جميع الأصناف المطابقة</p>}
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
