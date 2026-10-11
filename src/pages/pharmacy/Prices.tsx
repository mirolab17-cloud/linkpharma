// src/pages/pharmacy/Prices.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import { 
  getProducts, 
  getActiveIngredients, 
  getSuppliers, 
  getPrices 
} from '../../services/dataStorage';
import { Product, ActiveIngredient, Supplier, PriceRecord } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { 
  Search, 
  Filter, 
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
  Building
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { CardSkeleton, Spinner } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { PharmacyGlobalSearch, SearchScope } from '../../components/PharmacyGlobalSearch';

export const PharmacyPrices: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const { success } = useToastStore();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>(searchParams.get('supplier') || 'all');
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [cheapestFirst, setCheapestFirst] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 12;

  // Selected quantities per (productId_supplierId)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Feedback state for recently added buttons
  const [addedItemKey, setAddedItemKey] = useState<string | null>(null);

  useEffect(() => {
    const supParam = searchParams.get('supplier');
    if (supParam) {
      setSelectedSupplier(supParam);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodsData, ingsData, supsData, pricesData] = await Promise.all([
        getProducts(),
        getActiveIngredients(),
        getSuppliers(),
        getPrices(),
      ]);
      setProducts(prodsData);
      setIngredients(ingsData);
      setSuppliers(supsData);
      setPrices(pricesData);
    } catch (e) {
      console.error('Failed to load prices data', e);
    } finally {
      setLoading(false);
    }
  };

  // الموردون المسموحون لهذه الصيدلية
  const allowedSuppliers = useMemo(() => {
    const activeSuppliers = suppliers.filter((s) => s.status === 'active');
    if (!user?.allowedSuppliers || user.allowedSuppliers.length === 0) {
      return activeSuppliers;
    }
    return activeSuppliers.filter((s) => user.allowedSuppliers?.includes(s.id));
  }, [suppliers, user]);

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

  // ربط الأسعار بالأصناف فقط للموردين المسموحين
  const productPricesMap = useMemo(() => {
    const map = new Map<string, PriceRecord[]>();
    prices.forEach((pr) => {
      if (allowedSupplierIds.has(pr.supplierId)) {
        if (!map.has(pr.productId)) {
          map.set(pr.productId, []);
        }
        map.get(pr.productId)!.push(pr);
      }
    });
    return map;
  }, [prices, allowedSupplierIds]);

  // استخراج قائمة التصنيفات الفريدة
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // اقتراحات البحث الحية أثناء الكتابة
  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return [];
    const norm = normalizeArabic(searchTerm);
    return products
      .filter((p) => {
        const ing = ingredientsMap.get(p.activeIngredientId);
        const prodNorm = p.normalizedName || normalizeArabic(p.tradeName);
        const ingNorm = ing ? normalizeArabic(ing.name) : '';
        const mfgNorm = normalizeArabic(p.manufacturer);
        return prodNorm.includes(norm) || ingNorm.includes(norm) || mfgNorm.includes(norm);
      })
      .slice(0, 5);
  }, [searchTerm, products, ingredientsMap]);

  // فلترة الأصناف والأسعار
  const filteredProducts = useMemo(() => {
    const normSearch = normalizeArabic(searchTerm.trim());

    return products.filter((prod) => {
      // 1) البحث العام بنطاقاته المحددة
      if (normSearch) {
        const ing = ingredientsMap.get(prod.activeIngredientId);
        const prodNorm = prod.normalizedName || normalizeArabic(prod.tradeName);
        const ingNorm = ing ? (ing.normalizedName || normalizeArabic(ing.name)) : '';
        const mfgNorm = normalizeArabic(prod.manufacturer);

        let matches = false;
        if (searchScope === 'all') {
          matches =
            prodNorm.includes(normSearch) ||
            ingNorm.includes(normSearch) ||
            mfgNorm.includes(normSearch);
        } else if (searchScope === 'tradeName') {
          matches = prodNorm.includes(normSearch);
        } else if (searchScope === 'ingredient') {
          matches = ingNorm.includes(normSearch);
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

      return true;
    });
  }, [
    products,
    searchTerm,
    searchScope,
    selectedCategory,
    selectedSupplier,
    availableOnly,
    ingredientsMap,
    productPricesMap,
  ]);

  // فرز الأصناف (الأرخص أولاً إذا تم اختياره)
  const sortedProducts = useMemo(() => {
    if (!cheapestFirst) return filteredProducts;

    return [...filteredProducts].sort((a, b) => {
      const pricesA = (productPricesMap.get(a.id) || []).filter((p) => p.available);
      const pricesB = (productPricesMap.get(b.id) || []).filter((p) => p.available);

      const minA = pricesA.length > 0 ? Math.min(...pricesA.map((p) => p.price)) : Infinity;
      const minB = pricesB.length > 0 ? Math.min(...pricesB.map((p) => p.price)) : Infinity;

      return minA - minB;
    });
  }, [filteredProducts, cheapestFirst, productPricesMap]);

  // ترقيم الصفحات
  const totalPages = Math.ceil(sortedProducts.length / PAGE_SIZE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedProducts.slice(start, start + PAGE_SIZE);
  }, [sortedProducts, currentPage]);

  // إعادة ضبط الفلاتر
  const handleResetFilters = () => {
    setSearchTerm('');
    setSearchScope('all');
    setSelectedCategory('all');
    setSelectedSupplier('all');
    setAvailableOnly(false);
    setCheapestFirst(false);
    setCurrentPage(1);
  };

  // معالجة الكمية
  const getQty = (key: string) => quantities[key] || 1;
  const setQty = (key: string, val: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(1, val) }));
  };

  // إضافة للسلة
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
      },
      qty
    );

    // وميض تأكيد الإضافة
    setAddedItemKey(key);
    setTimeout(() => setAddedItemKey(null), 1500);

    success(`تمت إضافة (${product.tradeName} × ${qty}) من ${supplier.name} للسلة`);
  };

  // فحص هل السعر أقدم من 7 أيام
  const isOlderThan7Days = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return date < sevenDaysAgo;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      {/* الرأس والعنوان */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>مقارنة أسعار الأدوية بين المستودعات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            قارن عروض الموردين المعتمدين، اختر الأنسب، وأرسل طلباتك مباشرة لواتساب
          </p>
        </div>

        <div className="text-xs text-slate-500 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-2">
          <Building className="w-4 h-4 text-[#0f9d7a]" />
          <span>
            الموردون المتاحون لك: <strong className="text-slate-800">{allowedSuppliers.length}</strong> مستودع
          </span>
        </div>
      </div>

      {/* شريط البحث المتقدم والفلاتر */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs mb-6 space-y-4">
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
            setCurrentPage(1);
          }}
          onClearAll={handleResetFilters}
        />

        {/* فلاتر التصنيف، المورد، المتوفر، الأرخص */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* فلتر التصنيف */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">التصنيف</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
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
            <label className="block text-[11px] font-bold text-slate-500 mb-1">المورد / المستودع</label>
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل الموردين المتاحين</option>
              {allowedSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* خيارات الفرز والتوفر */}
          <div className="flex items-center gap-4 sm:col-span-2 pt-5">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => {
                  setAvailableOnly(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 rounded text-[#0f9d7a] focus:ring-[#0f9d7a] border-slate-300 accent-[#0f9d7a]"
              />
              <span>المتوفر فقط</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={cheapestFirst}
                onChange={(e) => {
                  setCheapestFirst(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 rounded text-[#0f9d7a] focus:ring-[#0f9d7a] border-slate-300 accent-[#0f9d7a]"
              />
              <span>ترتيب بالأرخص أولاً</span>
            </label>

            {(searchTerm ||
              selectedCategory !== 'all' ||
              selectedSupplier !== 'all' ||
              availableOnly ||
              cheapestFirst) && (
              <button
                onClick={handleResetFilters}
                className="mr-auto flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مسح الفلاتر</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* النتائج وعرض البطاقات */}
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
            {paginatedProducts.map((product) => {
              const ing = ingredientsMap.get(product.activeIngredientId);
              const prodPrices = productPricesMap.get(product.id) || [];

              // العثور على أرخص سعر بين الأسعار المتوفرة
              const availablePrices = prodPrices.filter((p) => p.available);
              const minPrice =
                availablePrices.length > 0
                  ? Math.min(...availablePrices.map((p) => p.price))
                  : null;

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                >
                  {/* رأس بطاقة الدواء */}
                  <div className="p-4 sm:p-5 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-base text-slate-900 leading-snug">
                          {product.tradeName}
                        </h3>
                        <p className="text-xs text-[#0f9d7a] font-bold mt-0.5">
                          {ing?.name || 'مادة فعالة غير محددة'}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg shrink-0">
                        {product.category}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                        الشكل: <strong className="text-slate-700">{product.form}</strong>
                      </span>
                      <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                        التركيز: <strong className="text-slate-700">{product.strength}</strong>
                      </span>
                      <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                        الشركة: <strong className="text-slate-700">{product.manufacturer}</strong>
                      </span>
                    </div>
                  </div>

                  {/* جدول عروض الموردين للصنف */}
                  <div className="p-3 sm:p-4 bg-slate-50/50 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold text-slate-400 px-1">
                        عروض المستودعات المتاحة:
                      </div>

                      {prodPrices.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                          لا توجد أسعار مدخلة من مورديك الحاليين
                        </div>
                      ) : (
                        prodPrices.map((priceRec) => {
                          const sup = suppliersMap.get(priceRec.supplierId);
                          if (!sup) return null;

                          const isCheapest =
                            priceRec.available &&
                            minPrice !== null &&
                            priceRec.price === minPrice &&
                            availablePrices.length > 1;

                          const isOld = isOlderThan7Days(priceRec.updatedAt);
                          const itemKey = `${product.id}_${sup.id}`;
                          const qty = getQty(itemKey);
                          const isJustAdded = addedItemKey === itemKey;

                          return (
                            <div
                              key={priceRec.supplierId}
                              className={`p-3 rounded-xl border transition-all ${
                                isCheapest
                                  ? 'bg-emerald-50/60 border-emerald-300 shadow-2xs'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    {sup.name}
                                  </span>
                                  {isCheapest && (
                                    <span className="px-1.5 py-0.5 bg-[#0f9d7a] text-white text-[9px] font-black rounded-md flex items-center gap-0.5 shrink-0">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      <span>الأرخص</span>
                                    </span>
                                  )}
                                </div>

                                <div className="text-left shrink-0">
                                  <span className="text-sm font-black text-slate-900 block leading-tight">
                                    {formatCurrency(priceRec.price)}
                                  </span>
                                  {priceRec.publicPrice && (
                                    <span className="text-[10px] text-slate-400 line-through">
                                      {formatCurrency(priceRec.publicPrice)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* التوفر وتاريخ السعر */}
                              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2.5">
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
                                    isOld ? 'text-amber-600 font-bold' : 'text-slate-400'
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
                                    {new Date(priceRec.updatedAt).toLocaleDateString('ar-SA')}
                                  </span>
                                </div>
                              </div>

                              {/* اختيار الكمية وزر الإضافة للسلة */}
                              {priceRec.available ? (
                                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => setQty(itemKey, qty - 1)}
                                      className="px-2 py-1 text-slate-600 hover:bg-slate-200 text-xs font-bold"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      value={qty}
                                      onChange={(e) =>
                                        setQty(itemKey, parseInt(e.target.value) || 1)
                                      }
                                      className="w-10 text-center text-xs font-bold bg-white border-x border-slate-200 py-1 focus:outline-hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setQty(itemKey, qty + 1)}
                                      className="px-2 py-1 text-slate-600 hover:bg-slate-200 text-xs font-bold"
                                    >
                                      +
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleAddToCart(product, priceRec, sup)}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                                      isJustAdded
                                        ? 'bg-emerald-600 text-white'
                                        : isCheapest
                                        ? 'bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white shadow-2xs'
                                        : 'bg-white border border-slate-300 hover:border-slate-400 text-slate-800'
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
                                <div className="text-center py-1 text-[11px] text-slate-400 bg-slate-100 rounded-lg">
                                  غير متوفر للطلب حالياً
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ترقيم الصفحات */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedProducts.length}
            pageSize={PAGE_SIZE}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}
    </div>
  );
};
