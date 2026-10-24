// src/pages/admin/ProductVisibility.tsx — v47: ما الذي تراه الصيدليات الآن؟ ظهور الأصناف المرفوعة بحسب العروض والإخفاء اليدوي
import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, PackageSearch, RefreshCw, Search, Store, UserRound } from 'lucide-react';
import { getPrices, getProducts, getSuppliers, getSystemSettings, rebuildCatalogSnapshots, setProductsVisibility, updateSystemSettings } from '../../services/dataStorage';
import { PriceRecord, Product, Supplier } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { formatGregorianDate } from '../../utils/formatDate';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ActionButton, MetricCard, SectionHeading, StatusPill } from '../../components/designSystem';

type VisState = 'visible' | 'hidden' | 'no_offers';
type Filter = 'all' | VisState | 'by_pharmacy';

interface Row {
  product: Product;
  state: VisState;
  offers: number;
  cheapest?: number;
  lastUpdate?: string;
}

const PAGE = 60;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'visible', label: 'ظاهر للصيدليات الآن' },
  { id: 'no_offers', label: 'يختفي لعدم وجود عرض' },
  { id: 'hidden', label: 'مخفي يدوياً' },
  { id: 'by_pharmacy', label: 'أضافته صيدلية' },
];

export const ProductVisibility: React.FC = () => {
  const { success, error } = useToastStore();
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [hideWithoutOffers, setHideWithoutOffers] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ visible: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, pr, sups, settings] = await Promise.all([getProducts(), getPrices(undefined, true), getSuppliers(), getSystemSettings()]);
      setProducts(prods); setPrices(pr); setSuppliers(sups);
      setHideWithoutOffers(settings.hideProductsWithoutOffers !== false);
      setSelected(new Set()); setLoaded(true);
    } catch (e: any) { error(e?.message || 'تعذر تحميل الأصناف والأسعار.'); }
    finally { setLoading(false); }
  };

  const rows = useMemo<Row[]>(() => {
    const activeSuppliers = new Set(suppliers.filter((s) => s.status === 'active').map((s) => s.id));
    const byProduct = new Map<string, PriceRecord[]>();
    prices.forEach((price) => { const list = byProduct.get(price.productId); if (list) list.push(price); else byProduct.set(price.productId, [price]); });
    return products.map((product) => {
      const list = byProduct.get(product.id) || [];
      const live = list.filter((price) => price.available && !price.hidden && activeSuppliers.has(price.supplierId));
      const lastUpdate = list.reduce<string | undefined>((max, price) => (!max || price.updatedAt > max ? price.updatedAt : max), undefined);
      const cheapest = live.length ? Math.min(...live.map((price) => price.price)) : undefined;
      const manualHidden = product.visibleToPharmacies === false;
      const state: VisState = manualHidden ? 'hidden' : (live.length === 0 && hideWithoutOffers ? 'no_offers' : 'visible');
      return { product, state, offers: live.length, cheapest, lastUpdate };
    });
  }, [products, prices, suppliers, hideWithoutOffers]);

  const counts = useMemo(() => ({
    all: rows.length,
    visible: rows.filter((r) => r.state === 'visible').length,
    no_offers: rows.filter((r) => r.state === 'no_offers').length,
    hidden: rows.filter((r) => r.state === 'hidden').length,
    by_pharmacy: rows.filter((r) => r.product.createdByUid).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = normalizeArabic(query.trim());
    return rows.filter((row) => {
      if (filter === 'by_pharmacy' ? !row.product.createdByUid : filter !== 'all' && row.state !== filter) return false;
      if (!q) return true;
      return normalizeArabic(`${row.product.tradeName} ${row.product.manufacturer || ''} ${row.product.barcode || ''}`).includes(q);
    });
  }, [rows, filter, query]);

  const shown = filtered.slice(0, limit);
  const allShownSelected = shown.length > 0 && shown.every((row) => selected.has(row.product.id));

  const toggleOne = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAllResults = () => setSelected(new Set(filtered.map((row) => row.product.id)));

  const apply = async (ids: string[], visible: boolean) => {
    setBusy(true);
    try {
      await setProductsVisibility(ids, visible, { publishNow: ids.length > 1 });
      setProducts((prev) => prev.map((product) => ids.includes(product.id) ? { ...product, visibleToPharmacies: visible } : product));
      setSelected(new Set());
      success(`${visible ? 'تم إظهار' : 'تم إخفاء'} ${ids.length} صنف${ids.length > 1 ? '، ونُشرت النسخة للصيدليات' : ' (تصل التغييرات للصيدليات خلال ثوانٍ، أبقِ الصفحة مفتوحة)'}.`);
    } catch (e: any) { error(e?.message || 'تعذر تعديل الظهور.'); }
    finally { setBusy(false); setConfirm(null); }
  };

  const publish = async () => {
    setBusy(true);
    try { const result = await rebuildCatalogSnapshots(); success(`نُشرت النسخة ${result.version}: ${result.products} صنفاً و${result.prices} سعراً.`); }
    catch (e: any) { error(e?.message || 'تعذر نشر النسخة.'); }
    finally { setBusy(false); }
  };

  const changeHideSetting = async (value: boolean) => {
    setHideWithoutOffers(value);
    try { await updateSystemSettings({ hideProductsWithoutOffers: value }); success(value ? 'ستُخفى الأصناف التي لا يوجد لها عرض متاح.' : 'ستظهر كل الأصناف حتى لو لم يكن لها عرض.'); }
    catch (e: any) { setHideWithoutOffers(!value); error(e?.message || 'تعذر حفظ الإعداد.'); }
  };

  const pill = (state: VisState) => state === 'visible'
    ? <StatusPill status="safe">ظاهر للصيدليات</StatusPill>
    : state === 'no_offers' ? <StatusPill status="review">مخفي: لا عرض متاح</StatusPill>
      : <StatusPill status="danger">مخفي يدوياً</StatusPill>;

  return (
    <div className="space-y-5 pb-16" dir="rtl">
      <SectionHeading
        eyebrow="الكتالوج"
        title="ظهور الأصناف للصيدليات"
        description="كل صنف رفعته يظهر للصيدليات تلقائياً بمجرد وجود سعر متاح له من أي مستودع نشط، ويختفي إذا أخفيته يدوياً."
        icon={<PackageSearch className="h-6 w-6 text-[#0f9d7a]" />}
        action={<div className="flex flex-wrap gap-2">
          <ActionButton tone="neutral" onClick={() => void publish()} disabled={busy}>نشر النسخة للصيدليات الآن</ActionButton>
          <ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-1.5 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loaded ? 'تحديث' : 'تحميل الأصناف والأسعار'}</ActionButton>
        </div>}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-7 text-slate-600">
        <b className="text-slate-900">متى يظهر الصنف عند الصيدلية؟</b>
        <ol className="mr-5 mt-1 list-decimal">
          <li>لم تخفِه يدوياً من هذه الصفحة أو من صفحة الأصناف.</li>
          <li>له سعر «متاح» وغير مخفي من مستودع نشط (عند تفعيل الخيار أدناه).</li>
        </ol>
        <p className="mt-1">عند رفع أو تحديث سعر الصنف من أي مورد يظهر تلقائياً بلا أي خطوة إضافية. تقرأ الصيدلية النسخة المخزنة، وتُنشر تلقائياً بعد كل تعديل هنا.</p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 font-black text-slate-800">
          <input type="checkbox" checked={hideWithoutOffers} onChange={(e) => void changeHideSetting(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          إخفاء الأصناف التي ليس لها أي عرض متاح من أي مورد
        </label>
      </section>

      {!loaded ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-center text-xs leading-7 text-blue-900">
          لا تُقرأ الأسعار عند فتح الصفحة لتوفير القراءات. اضغط «تحميل الأصناف والأسعار» عند الحاجة.
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricCard label="إجمالي الأصناف" value={counts.all} />
            <MetricCard label="ظاهرة للصيدليات الآن" value={counts.visible} tone="brand" />
            <MetricCard label="مخفية لعدم وجود عرض" value={counts.no_offers} tone="review" />
            <MetricCard label="مخفية يدوياً" value={counts.hidden} tone="danger" />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <button key={item.id} type="button" onClick={() => { setFilter(item.id); setLimit(PAGE); }}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-black transition ${filter === item.id ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {item.label} ({counts[item.id]})
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="ابحث باسم الصنف أو الشركة أو الباركود" className="w-full rounded-xl border border-slate-200 p-2.5 pr-9 text-xs" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex cursor-pointer items-center gap-2 font-bold text-slate-700">
                  <input type="checkbox" checked={allShownSelected} onChange={() => setSelected((prev) => { const next = new Set(prev); shown.forEach((row) => allShownSelected ? next.delete(row.product.id) : next.add(row.product.id)); return next; })} className="h-4 w-4 accent-emerald-600" />
                  تحديد المعروض
                </label>
                <button type="button" onClick={selectAllResults} className="font-black text-[#0f9d7a] hover:underline">تحديد كل النتائج ({filtered.length})</button>
                {selected.size > 0 && (
                  <>
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 font-black text-emerald-800">محدد: {selected.size}</span>
                    <ActionButton disabled={busy} onClick={() => setConfirm({ visible: true })}><Eye className="ml-1 inline h-4 w-4" />إظهار المحدد</ActionButton>
                    <ActionButton tone="danger" disabled={busy} onClick={() => setConfirm({ visible: false })}><EyeOff className="ml-1 inline h-4 w-4" />إخفاء المحدد</ActionButton>
                  </>
                )}
              </div>
            </div>

            <ul className="divide-y divide-slate-100">
              {shown.map((row) => {
                const { product } = row;
                return (
                  <li key={product.id} className="flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap">
                    <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleOne(product.id)} className="h-4 w-4 shrink-0 accent-emerald-600" aria-label={`تحديد ${product.tradeName}`} />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm text-slate-900">{product.tradeName}</b>
                      <span className="block truncate text-[11px] text-slate-500">{[product.strength, product.form, product.manufacturer].filter(Boolean).join(' · ') || '—'}</span>
                      {product.createdByUid && <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-black text-violet-700"><UserRound className="h-3 w-3" />أضافته: {product.createdByName || 'صيدلية'}</span>}
                    </div>
                    <div className="hidden w-40 shrink-0 text-[11px] text-slate-500 md:block">
                      <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{row.offers} عرض متاح{row.cheapest !== undefined ? ` · من ${row.cheapest}` : ''}</span>
                      <span className="block">آخر تحديث سعر: {row.lastUpdate ? formatGregorianDate(row.lastUpdate) : 'لا يوجد'}</span>
                    </div>
                    <div className="shrink-0">{pill(row.state)}</div>
                    <button type="button" disabled={busy} onClick={() => void apply([product.id], product.visibleToPharmacies === false)}
                      className={`shrink-0 rounded-lg p-2 transition ${product.visibleToPharmacies === false ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                      title={product.visibleToPharmacies === false ? 'إظهار الصنف' : 'إخفاء الصنف'}>
                      {product.visibleToPharmacies === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="p-10 text-center text-xs text-slate-500">لا توجد أصناف مطابقة.</li>}
            </ul>
            {filtered.length > shown.length && (
              <div className="border-t border-slate-100 p-3 text-center">
                <ActionButton tone="neutral" onClick={() => setLimit((value) => value + PAGE)}>عرض المزيد ({filtered.length - shown.length})</ActionButton>
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void apply([...selected], confirm.visible)}
        title={confirm?.visible ? 'إظهار الأصناف المحددة' : 'إخفاء الأصناف المحددة'}
        message={`${confirm?.visible ? 'سيُسمح بظهور' : 'ستُخفى'} ${selected.size} صنف ${confirm?.visible ? 'للصيدليات (يظهر منها ما له عرض متاح)' : 'عن الصيدليات'}، وتُنشر النسخة المخزنة فوراً. المتابعة؟`}
        confirmText={confirm?.visible ? 'نعم، إظهار' : 'نعم، إخفاء'}
        isDestructive={confirm ? !confirm.visible : false}
        loading={busy}
      />
    </div>
  );
};
