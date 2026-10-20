import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Eye, EyeOff, MapPinned, RefreshCw, ShieldCheck } from 'lucide-react';
import { getPrices, getProducts, getSuppliers, saveSupplier } from '../../services/dataStorage';
import { getSuggestions, setPriceVisibility, updateSuggestionStatus } from '../../services/v18Features';
import { PharmacySuggestion, PriceRecord, Product, Supplier } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { formatGregorianDate } from '../../utils/formatDate';

const statusLabels: Record<string, string> = { new: 'جديد', reviewed: 'قيد المراجعة', resolved: 'تمت المعالجة', dismissed: 'مغلق' };
type Tab = 'overview' | 'suggestions' | 'visibility' | 'delivery';
const tabs: Array<{ id: Exclude<Tab, 'overview'>; label: string }> = [
  { id: 'suggestions', label: 'الاقتراحات' },
  { id: 'visibility', label: 'ظهور الأسعار' }, { id: 'delivery', label: 'أيام التوصيل' },
];

export const V18Operations: React.FC = () => {
  const { success, error } = useToastStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const loadedTabs = useRef(new Set<Tab>());
  const [suggestions, setSuggestions] = useState<PharmacySuggestion[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [deliveryArea, setDeliveryArea] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');

  const loadTab = useCallback(async (target: Tab, force = false) => {
    if (target === 'overview' || (!force && loadedTabs.current.has(target))) return;
    setLoading(true);
    try {
      if (target === 'suggestions') setSuggestions(await getSuggestions(undefined, 50));
      if (target === 'visibility' || target === 'delivery') {
        const rows = await getSuppliers();
        setSuppliers(rows);
        if (target === 'visibility') setProducts(await getProducts());
      }
      loadedTabs.current.add(target);
    } catch {
      error('تعذر تحميل بيانات القسم. حاول تحديثه يدوياً.');
    } finally { setLoading(false); }
  }, [error, selectedSupplier]);

  useEffect(() => { if (tab !== 'overview') void loadTab(tab); }, [tab, loadTab]);
  useEffect(() => {
    if (tab !== 'visibility' || !selectedSupplier) return;
    let active = true;
    setLoading(true);
    void getPrices([selectedSupplier], true).then((rows) => { if (active) setPrices(rows); })
      .catch(() => error('تعذر تحميل أسعار هذا المستودع.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, selectedSupplier, error]);

  const selectedSupplierObject = suppliers.find((supplier) => supplier.id === selectedSupplier);
  const supplierPrices = useMemo(() => prices.filter((price) => price.supplierId === selectedSupplier), [prices, selectedSupplier]);

  const togglePriceVisibility = async (hidden: boolean) => {
    if (!selectedSupplier || selectedProductIds.length === 0) return error('اختر المورد وصنفاً واحداً على الأقل.');
    try {
      await setPriceVisibility(selectedSupplier, selectedProductIds, hidden);
      setPrices((old) => old.map((price) => price.supplierId === selectedSupplier && selectedProductIds.includes(price.productId) ? { ...price, hidden } : price));
      success(hidden ? 'تم إخفاء العروض المختارة.' : 'تمت إعادة إظهار العروض المختارة.');
      setSelectedProductIds([]);
    } catch { error('تعذر تحديث ظهور العروض.'); }
  };

  const saveDelivery = async () => {
    if (!selectedSupplierObject || !deliveryArea.trim() || !deliveryDays.trim()) return error('اكتب المنطقة وأيام التوصيل.');
    const days = deliveryDays.split(',').map((day) => day.trim()).filter(Boolean);
    try {
      await saveSupplier({ ...selectedSupplierObject, deliveryDaysByArea: { ...(selectedSupplierObject.deliveryDaysByArea || {}), [deliveryArea.trim()]: days } });
      setSuppliers((old) => old.map((item) => item.id === selectedSupplier ? { ...item, deliveryDaysByArea: { ...(item.deliveryDaysByArea || {}), [deliveryArea.trim()]: days } } : item));
      setDeliveryArea(''); setDeliveryDays(''); success('تم حفظ جدول التوصيل حسب المنطقة.');
    } catch { error('تعذر حفظ جدول التوصيل.'); }
  };

  const updateSuggestion = async (item: PharmacySuggestion, status: PharmacySuggestion['status']) => {
    try { await updateSuggestionStatus(item.id, status); setSuggestions((old) => old.map((row) => row.id === item.id ? { ...row, status } : row)); success('تم تحديث حالة الاقتراح.'); }
    catch { error('تعذر تحديث حالة الاقتراح.'); }
  };

  return <div className="mx-auto max-w-7xl space-y-5 pb-20" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-l from-[#073b4c] to-[#0f9d7a] p-5 text-white shadow-lg sm:p-6">
      <div><h1 className="flex items-center gap-2 text-xl font-black sm:text-2xl"><ShieldCheck className="h-6 w-6" />مركز التشغيل</h1><p className="mt-1 text-xs text-white/80">كل قسم يحمّل بياناته عند فتحه فقط لتقليل قراءات قاعدة البيانات.</p></div>
      {tab !== 'overview' && <button onClick={() => void loadTab(tab, true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />تحديث القسم</button>}
    </header>
    <nav className="flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black transition ${tab === item.id ? 'bg-[#0f9d7a] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-300'}`}>{item.label}</button>)}</nav>

    {tab === 'overview' && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Activity className="h-6 w-6" /></div><div><h2 className="text-base font-black text-slate-900">اختر المهمة عند الحاجة</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">لا تُحمّل لوحة البداية قائمة المستخدمين أو الأسعار أو الاقتراحات. تُستدعى بيانات القسم فقط عند فتحه، ولا يظهر سجل أحداث روتيني تلقائياً.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right transition hover:border-emerald-300 hover:bg-emerald-50"><span className="block text-sm font-black text-slate-900">{item.label}</span><span className="mt-1 block text-[11px] text-slate-500">فتح القسم وتحميل بياناته فقط</span></button>)}</div>
    </section>}

    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">جاري تحميل بيانات هذا القسم فقط...</div>}

    {!loading && tab === 'suggestions' && <Panel title="اقتراحات الصيدليات" note="تُحمّل أحدث 50 اقتراحاً عند فتح القسم.">
      {suggestions.length === 0 ? <Empty text="لا توجد اقتراحات بعد." /> : <div className="space-y-3">{suggestions.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-black text-slate-900">{item.subject}</h3><p className="mt-1 text-[10px] text-slate-400">{item.pharmacyName} · {formatGregorianDate(item.createdAt, { includeTime: true })}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{statusLabels[item.status]}</span></div><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-600">{item.message}</p><div className="mt-3 flex flex-wrap gap-2">{(['reviewed', 'resolved', 'dismissed'] as const).map((status) => <button key={status} onClick={() => void updateSuggestion(item, status)} className="min-h-10 rounded-lg bg-slate-100 px-3 text-[10px] font-bold hover:bg-emerald-50">{statusLabels[status]}</button>)}</div></article>)}</div>}
    </Panel>}

    {!loading && (tab === 'visibility' || tab === 'delivery') && <Panel title={tab === 'visibility' ? 'إدارة ظهور عروض الأسعار' : 'جدول أيام التوصيل'} note="اختر المستودع أولاً؛ لا تُقرأ أسعار بقية المستودعات.">
      <label className="block max-w-xl text-xs font-bold text-slate-600">المستودع<select value={selectedSupplier} onChange={(event) => { setSelectedSupplier(event.target.value); setSelectedProductIds([]); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs"><option value="">اختر مستودعاً</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      {tab === 'visibility' && selectedSupplier && <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2"><button onClick={() => setSelectedProductIds(supplierPrices.filter((price) => !price.hidden).map((price) => price.productId))} className="min-h-10 rounded-xl border px-3 text-xs font-bold">تحديد الظاهر ({supplierPrices.filter((price) => !price.hidden).length})</button><button onClick={() => setSelectedProductIds(supplierPrices.filter((price) => price.hidden).map((price) => price.productId))} className="min-h-10 rounded-xl border px-3 text-xs font-bold">تحديد المخفي ({supplierPrices.filter((price) => price.hidden).length})</button><button onClick={() => setSelectedProductIds([])} className="min-h-10 rounded-xl border px-3 text-xs font-bold">إلغاء التحديد</button><button onClick={() => void togglePriceVisibility(true)} className="min-h-10 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white"><EyeOff className="ml-1 inline h-4 w-4" />إخفاء</button><button onClick={() => void togglePriceVisibility(false)} className="min-h-10 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white"><Eye className="ml-1 inline h-4 w-4" />إظهار</button></div><div className="grid max-h-[460px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{supplierPrices.map((price) => { const product = products.find((row) => row.id === price.productId); return <label key={price.id || price.productId} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${selectedProductIds.includes(price.productId) ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}><input type="checkbox" checked={selectedProductIds.includes(price.productId)} onChange={() => setSelectedProductIds((old) => old.includes(price.productId) ? old.filter((id) => id !== price.productId) : [...old, price.productId])} /><span className="flex-1 text-xs font-bold">{product?.tradeName || price.productId}<small className={`mt-1 block ${price.hidden ? 'text-rose-600' : 'text-emerald-700'}`}>{price.hidden ? 'مخفي' : 'ظاهر'} · {price.price}</small></span></label>; })}</div></div>}
      {tab === 'delivery' && selectedSupplierObject && <div className="mt-4"><div className="grid gap-3 sm:grid-cols-3"><input value={deliveryArea} onChange={(event) => setDeliveryArea(event.target.value)} placeholder="المنطقة / المدينة" className="rounded-xl border p-3 text-xs" /><input value={deliveryDays} onChange={(event) => setDeliveryDays(event.target.value)} placeholder="الأحد، الثلاثاء" className="rounded-xl border p-3 text-xs" /><button onClick={() => void saveDelivery()} className="min-h-11 rounded-xl bg-[#0f9d7a] px-4 text-xs font-black text-white"><MapPinned className="ml-1 inline h-4 w-4" />حفظ الجدول</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(selectedSupplierObject.deliveryDaysByArea || {}).map(([area, days]) => <div key={area} className="rounded-xl border bg-slate-50 p-3 text-xs"><b>{area}</b><span className="mt-1 block text-slate-500">{days.join('، ')}</span></div>)}</div></div>}
      {tab === 'visibility' && !selectedSupplier && <Empty text="اختر مستودعاً لتحميل أسعاره فقط." />}
    </Panel>}
  </div>;
};

const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="font-black text-slate-900">{title}</h2>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}<div className="mt-4">{children}</div></section>;
const Empty: React.FC<{ text: string }> = ({ text }) => <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">{text}</div>;
