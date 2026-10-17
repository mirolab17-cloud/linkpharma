import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Users, EyeOff, Eye, MessageSquare, RefreshCw, MapPinned, ShieldCheck } from 'lucide-react';
import { getOrders, getProducts, getPrices, getSuppliers, getUsers, saveSupplier } from '../../services/dataStorage';
import { getPlatformActivity, getPresence, getSuggestions, setPriceVisibility, updateSuggestionStatus } from '../../services/v18Features';
import { PlatformActivity, PharmacySuggestion, PresenceRecord, Product, PriceRecord, Supplier, UserProfile } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { formatGregorianDate } from '../../utils/formatDate';

const statusLabels: Record<string, string> = { new: 'جديد', reviewed: 'قيد المراجعة', resolved: 'تمت المعالجة', dismissed: 'مغلق' };

export const V18Operations: React.FC = () => {
  const { success, error } = useToastStore();
  const [tab, setTab] = useState<'overview' | 'suggestions' | 'visibility' | 'delivery'>('overview');
  const [activity, setActivity] = useState<PlatformActivity[]>([]);
  const [presence, setPresence] = useState<PresenceRecord[]>([]);
  const [suggestions, setSuggestions] = useState<PharmacySuggestion[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [deliveryArea, setDeliveryArea] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, p, s, sups, prods, prs, us] = await Promise.all([getPlatformActivity(), getPresence(), getSuggestions(), getSuppliers(), getProducts(), getPrices(undefined, true), getUsers()]);
      setActivity(a); setPresence(p); setSuggestions(s); setSuppliers(sups); setProducts(prods); setPrices(prs); setUsers(us);
      if (!selectedSupplier && sups[0]) setSelectedSupplier(sups[0].id);
    } catch (e) { error('تعذر تحميل بيانات مركز التشغيل.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const activeCount = useMemo(() => presence.filter((p) => Date.now() - new Date(p.lastSeenAt).getTime() < 5 * 60 * 1000).length, [presence]);
  const selectedSupplierObject = suppliers.find((s) => s.id === selectedSupplier);
  const supplierPrices = prices.filter((p) => p.supplierId === selectedSupplier);

  const togglePriceVisibility = async (hidden: boolean) => {
    if (!selectedSupplier || selectedProductIds.length === 0) return error('اختر المورد وصنفاً واحداً على الأقل.');
    try { await setPriceVisibility(selectedSupplier, selectedProductIds, hidden); setPrices((old) => old.map((p) => p.supplierId === selectedSupplier && selectedProductIds.includes(p.productId) ? { ...p, hidden } : p)); success(hidden ? 'تم إخفاء العروض المختارة.' : 'تمت إعادة إظهار العروض المختارة.'); }
    catch { error('تعذر تحديث ظهور العروض.'); }
  };

  const saveDelivery = async () => {
    if (!selectedSupplierObject || !deliveryArea.trim() || !deliveryDays.trim()) return error('اكتب المنطقة وأيام التوصيل.');
    try { await saveSupplier({ ...selectedSupplierObject, deliveryDaysByArea: { ...(selectedSupplierObject.deliveryDaysByArea || {}), [deliveryArea.trim()]: deliveryDays.split(',').map((d) => d.trim()).filter(Boolean) } }); success('تم حفظ جدول التوصيل حسب المنطقة.'); setDeliveryArea(''); setDeliveryDays(''); await load(); }
    catch { error('تعذر حفظ جدول التوصيل.'); }
  };

  const updateSuggestion = async (item: PharmacySuggestion, status: PharmacySuggestion['status']) => { await updateSuggestionStatus(item.id, status); setSuggestions((old) => old.map((s) => s.id === item.id ? { ...s, status } : s)); success('تم تحديث حالة الاقتراح.'); };

  return <div className="max-w-7xl mx-auto space-y-5 pb-20" dir="rtl">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-[#0f9d7a]" />مركز التشغيل v18</h1><p className="text-xs text-slate-500 mt-1">متابعة النشاط، الاقتراحات، ظهور العروض، وأيام التوصيل من شاشة واحدة.</p></div><button onClick={load} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold flex items-center gap-2"><RefreshCw className="w-4 h-4" />تحديث</button></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric icon={<Activity />} label="أحداث مسجلة" value={activity.length} /><Metric icon={<Users />} label="حسابات ظاهرة الآن" value={activeCount} tone="emerald" /><Metric icon={<MessageSquare />} label="اقتراحات جديدة" value={suggestions.filter((s) => s.status === 'new').length} tone="amber" /><Metric icon={<EyeOff />} label="عروض مخفية" value={prices.filter((p) => p.hidden).length} tone="rose" /></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{[['overview','النشاط والحضور'],['suggestions','اقتراحات الصيدليات'],['visibility','ظهور عروض الأسعار'],['delivery','أيام التوصيل']].map(([key,label]) => <button key={key} onClick={() => setTab(key as any)} className={`px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap ${tab === key ? 'bg-[#0f9d7a] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>)}</div>
    {loading ? <div className="bg-white rounded-2xl p-12 text-center text-sm text-slate-500">جاري تحميل مركز التشغيل...</div> : tab === 'overview' ? <div className="grid lg:grid-cols-2 gap-5"><Panel title="آخر الأحداث"><div className="space-y-2">{activity.slice(0, 12).map((item) => <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-800">{item.message}</div><div className="text-[10px] text-slate-400 mt-1">{formatGregorianDate(item.createdAt, { includeTime: true })}</div></div>)}</div></Panel><Panel title="الحسابات النشطة وغير النشطة"><div className="space-y-2">{presence.sort((a,b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 15).map((item) => { const live = Date.now() - new Date(item.lastSeenAt).getTime() < 5 * 60 * 1000; return <div key={item.uid} className="flex items-center justify-between p-3 rounded-xl border border-slate-100"><span className="text-xs font-bold">{item.displayName}</span><span className={`text-[10px] font-bold ${live ? 'text-emerald-700' : 'text-slate-400'}`}>{live ? 'متصل الآن' : `آخر ظهور ${formatGregorianDate(item.lastSeenAt, { includeTime: true })}`}</span></div> })}</div><div className="text-[10px] text-slate-400 mt-3">إجمالي ملفات المستخدمين: {users.length}</div></Panel></div> : tab === 'suggestions' ? <Panel title="اقتراحات الصيدليات"><div className="space-y-3">{suggestions.length === 0 ? <Empty text="لا توجد اقتراحات بعد." /> : suggestions.map((item) => <div key={item.id} className="border border-slate-200 rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-sm">{item.subject}</h3><p className="text-[10px] text-slate-400 mt-1">{item.pharmacyName} · {formatGregorianDate(item.createdAt, { includeTime: true })}</p></div><span className="text-[10px] rounded-lg bg-slate-100 px-2 py-1 font-bold">{statusLabels[item.status]}</span></div><p className="text-xs text-slate-600 leading-6 mt-3 whitespace-pre-wrap">{item.message}</p><div className="flex gap-2 mt-3">{(['reviewed','resolved','dismissed'] as const).map((status) => <button key={status} onClick={() => updateSuggestion(item, status)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-[10px] font-bold">{statusLabels[status]}</button>)}</div></div>)}</div></Panel> : tab === 'visibility' ? <Panel title="إخفاء وإظهار عروض الموردين"><div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-600">المورد<select value={selectedSupplier} onChange={(e) => { setSelectedSupplier(e.target.value); setSelectedProductIds([]); }} className="mt-1 w-full rounded-xl border border-slate-200 p-3"><option value="">اختر المورد</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><div className="flex items-end gap-2"><button onClick={() => togglePriceVisibility(true)} className="flex-1 rounded-xl bg-rose-600 text-white p-3 text-xs font-black flex justify-center gap-2"><EyeOff className="w-4 h-4" />إخفاء المحدد</button><button onClick={() => togglePriceVisibility(false)} className="flex-1 rounded-xl bg-emerald-600 text-white p-3 text-xs font-black flex justify-center gap-2"><Eye className="w-4 h-4" />إظهار المحدد</button></div></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedProductIds(supplierPrices.filter((price) => !price.hidden).map((price) => price.productId))} className="min-h-11 rounded-xl border px-3 text-xs font-bold">تحديد كل الأسعار الظاهرة ({supplierPrices.filter((price) => !price.hidden).length})</button><button type="button" onClick={() => setSelectedProductIds(supplierPrices.filter((price) => price.hidden).map((price) => price.productId))} className="min-h-11 rounded-xl border px-3 text-xs font-bold">تحديد كل الأسعار المخفية ({supplierPrices.filter((price) => price.hidden).length})</button><button type="button" onClick={() => setSelectedProductIds([])} className="min-h-11 rounded-xl border px-3 text-xs font-bold">إلغاء التحديد</button></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4 max-h-[460px] overflow-y-auto">{supplierPrices.map((price) => { const product = products.find((p) => p.id === price.productId); return <label key={price.productId} className={`p-3 rounded-xl border flex gap-2 items-start cursor-pointer ${selectedProductIds.includes(price.productId) ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}><input type="checkbox" checked={selectedProductIds.includes(price.productId)} onChange={() => setSelectedProductIds((old) => old.includes(price.productId) ? old.filter((id) => id !== price.productId) : [...old, price.productId])} /><span className="text-xs font-bold flex-1">{product?.tradeName || price.productId}<small className={`block mt-1 ${price.hidden ? 'text-rose-600' : 'text-emerald-700'}`}>{price.hidden ? 'مخفي' : 'ظاهر'} · {price.price} ₪</small></span></label> })}</div></Panel> : <Panel title="جدول أيام التوصيل حسب المنطقة"><div className="grid sm:grid-cols-3 gap-3"><select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-xs"><option value="">اختر المورد</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value)} placeholder="المنطقة / المدينة" className="rounded-xl border border-slate-200 p-3 text-xs" /><input value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} placeholder="الأحد، الثلاثاء، الخميس" className="rounded-xl border border-slate-200 p-3 text-xs" /></div><button onClick={saveDelivery} className="mt-3 rounded-xl bg-[#0f9d7a] text-white px-4 py-3 text-xs font-black flex items-center gap-2"><MapPinned className="w-4 h-4" />حفظ قاعدة التوصيل</button>{selectedSupplierObject && <div className="mt-5 grid sm:grid-cols-2 gap-2">{Object.entries(selectedSupplierObject.deliveryDaysByArea || {}).map(([area, days]) => <div key={area} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"><b>{area}</b><span className="block text-slate-500 mt-1">{days.join('، ')}</span></div>)}</div>}</Panel>}
  </div>;
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs"><h2 className="font-black text-slate-900 mb-4">{title}</h2>{children}</section>;
const Empty: React.FC<{ text: string }> = ({ text }) => <div className="p-8 text-center text-sm text-slate-400">{text}</div>;
const Metric: React.FC<{ icon: React.ReactNode; label: string; value: number; tone?: string }> = ({ icon, label, value, tone = 'slate' }) => <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className={`w-9 h-9 rounded-xl bg-${tone === 'emerald' ? 'emerald' : tone === 'amber' ? 'amber' : tone === 'rose' ? 'rose' : 'slate'}-50 text-${tone === 'emerald' ? 'emerald' : tone === 'amber' ? 'amber' : tone === 'rose' ? 'rose' : 'slate'}-600 flex items-center justify-center mb-3`}>{icon}</div><div className="text-2xl font-black text-slate-900">{value}</div><div className="text-[11px] font-bold text-slate-500 mt-1">{label}</div></div>;
