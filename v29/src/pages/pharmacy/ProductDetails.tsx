import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Building2, Clock3, Package, Pill, TrendingDown, TrendingUp } from 'lucide-react';
import { getActiveIngredients, getPriceHistory, getPricesForProductIds, getProducts, getSuppliers, getSystemSettings } from '../../services/dataStorage';
import { ActiveIngredient, PriceHistory, PriceRecord, Product, Supplier } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';
import { formatCurrency, calculateEffectiveUnitPrice } from '../../utils/formatPrice';
import { formatGregorianDate } from '../../utils/formatDate';
import { productDisplayName } from '../../utils/productCatalog';
import { sortPriceOffers } from '../../utils/priceOfferSorting';

export const ProductDetails: React.FC = () => {
  const { productId = '' } = useParams();
  const user = useAuthStore((state) => state.user);
  const [product, setProduct] = useState<Product | null>(null);
  const [ingredient, setIngredient] = useState<ActiveIngredient | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [allProducts, allIngredients, allSuppliers, settings] = await Promise.all([getProducts(), getActiveIngredients(), getSuppliers(), getSystemSettings()]);
        const currentProduct = allProducts.find((item) => item.id === productId) || null;
        if (!currentProduct) { if (alive) { setProduct(null); setFailed(true); } return; }
        const allowed = user?.allowedSuppliers?.length ? new Set(user.allowedSuppliers) : null;
        const visibleSuppliers = allSuppliers.filter((supplier) => supplier.status === 'active' && (!allowed || allowed.has(supplier.id)));
        const supplierIds = visibleSuppliers.map((supplier) => supplier.id);
        const safeSupplierIds = supplierIds.length ? supplierIds : ['__no_visible_supplier__'];
        const [productPrices, productHistory] = await Promise.all([
          getPricesForProductIds([productId], safeSupplierIds),
          getPriceHistory(productId, safeSupplierIds),
        ]);
        if (!alive) return;
        setProduct(currentProduct);
        setIngredient(allIngredients.find((item) => item.id === currentProduct.activeIngredientId) || null);
        setSuppliers(visibleSuppliers);
        setPrices(sortPriceOffers(productPrices.filter((price) => supplierIds.includes(price.supplierId)), visibleSuppliers, settings.priceOfferSortMode || 'cheapest'));
        setHistory(productHistory.filter((record) => supplierIds.includes(record.supplierId)).sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 100));
      } catch {
        if (alive) setFailed(true);
      } finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [productId, user?.uid, user?.allowedSuppliers?.join('|')]);

  if (loading) return <div className="max-w-5xl mx-auto p-8 text-center text-sm text-slate-500" dir="rtl">جاري تحميل تفاصيل الصنف وسجل الأسعار...</div>;
  if (failed || !product) return <div className="max-w-4xl mx-auto p-6" dir="rtl"><Link to="/app/prices" className="inline-flex items-center gap-2 text-sm text-[#0f9d7a] font-bold"><ArrowRight className="w-4 h-4" />العودة إلى الأسعار</Link><div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">تعذر تحميل تفاصيل الصنف. قد يكون غير موجود أو تعذر الاتصال.</div></div>;

  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const historyBySupplier = new Map<string, PriceHistory[]>();
  history.forEach((record) => historyBySupplier.set(record.supplierId, [...(historyBySupplier.get(record.supplierId) || []), record]));

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-5" dir="rtl">
      <Link to="/app/prices" className="inline-flex items-center gap-2 text-xs font-bold text-[#0f9d7a]"><ArrowRight className="w-4 h-4" />العودة إلى مقارنة الأسعار</Link>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
        <div className="flex items-start gap-3"><div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#0f9d7a]">{product.productType === 'medical_supply' ? <Package className="w-6 h-6" /> : <Pill className="w-6 h-6" />}</div><div className="min-w-0"><h1 className="text-xl sm:text-2xl font-black text-slate-900">{productDisplayName(product)}</h1><p className="mt-1 text-sm text-[#0f9d7a] font-bold">{ingredient?.name || (product.productType === 'medical_supply' ? 'مستلزم طبي' : 'تفاصيل المنتج')}</p></div></div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">{[['الشكل', product.form], ['التركيز', product.strength], ['حجم العبوة', product.packSize], ['الشركة', product.manufacturer], ['التصنيف', product.category], ['الباركود', product.barcode]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-800">{value || '—'}</dd></div>)}</dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-[#0f9d7a]" />الأسعار الحالية من الموردين المسموحين ({prices.length})</h2>
        {prices.length === 0 ? <p className="mt-4 text-xs text-slate-500">لا توجد أسعار ظاهرة لهذا الصنف لدى الموردين المتاحين لحسابك.</p> : <div className="mt-4 grid md:grid-cols-2 gap-3">{prices.map((price) => { const supplier = supplierById.get(price.supplierId); const effective = calculateEffectiveUnitPrice(price.price, price.bonus).effectivePrice; return <article key={price.id || `${price.supplierId}_${price.productId}`} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-black text-sm text-slate-900">{supplier?.name || 'مورد'}</h3><p className="mt-1 text-xs text-slate-500">{price.available ? 'متوفر' : 'غير متوفر'}{price.expiry ? ` · الانتهاء ${price.expiry}` : ''}</p></div><span className="text-xs text-slate-500 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{formatGregorianDate(price.updatedAt, { includeTime: true })}</span></div><div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2"><div><div className="text-[10px] text-slate-500">سعر الشراء</div><b className="text-lg text-slate-900">{formatCurrency(price.price)}</b></div>{price.publicPrice !== undefined && <div><div className="text-[10px] text-slate-500">سعر العموم</div><b className="text-sm text-slate-700">{formatCurrency(price.publicPrice)}</b></div>}{price.bonus && <div><div className="text-[10px] text-slate-500">البونص</div><b className="text-sm text-emerald-700">{price.bonus}</b><div className="text-[10px] text-slate-500">سعر الوحدة بعد البونص: {formatCurrency(effective)}</div></div>}</div></article>; })}</div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2"><Clock3 className="w-5 h-5 text-[#0f9d7a]" />آخر التغييرات حسب المورد</h2>
        <p className="mt-1 text-xs text-slate-500">يعرض السجل التغيير السابق والجديد واسم الحساب الذي نفذه عند توفر البيانات.</p>
        {history.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">لا يوجد سجل تاريخي محفوظ لهذا الصنف بعد. سيبدأ السجل مع تغييرات الأسعار المسجلة في v25.</p> : <div className="mt-4 space-y-4">{[...historyBySupplier.entries()].map(([supplierId, records]) => <div key={supplierId} className="rounded-2xl border border-slate-200 overflow-hidden"><div className="bg-slate-50 px-4 py-3 font-black text-sm text-slate-800">{supplierById.get(supplierId)?.name || 'مورد'}</div><div className="divide-y divide-slate-100">{records.map((record) => { const oldValue = record.previous?.price ?? record.price; const newValue = record.next?.price; const wentDown = typeof newValue === 'number' && newValue < oldValue; return <div key={record.id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div className="text-xs"><div className="font-bold text-slate-800">{record.changeType === 'created' ? 'إضافة سعر' : 'تغيير سعر'}{record.actorName ? ` بواسطة ${record.actorName}` : ''}</div><div className="mt-1 text-slate-500">{record.previous ? `${formatCurrency(record.previous.price)} ← ` : 'لا يوجد سعر سابق · '}{record.next ? formatCurrency(record.next.price) : formatCurrency(record.price)}{record.next?.bonus ? ` · بونص ${record.next.bonus}` : ''}</div></div><div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${wentDown ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{wentDown ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}{formatGregorianDate(record.importedAt, { includeTime: true })}</div></div>; })}</div></div>)}</div>}
      </section>
    </div>
  );
};
