import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, Building2, CheckCircle2, ClipboardList, Database, FileSpreadsheet, Package, RefreshCw, ShieldCheck, Truck, Users, Wrench } from 'lucide-react';
import { getActiveIngredients, getImportBatches, getOrders, getPrices, getProducts, getSuppliers, getSystemSettings, getUsers, getPriceHistory, restoreDataBackup } from '../../services/dataStorage';
import { getPlatformActivity } from '../../services/v18Features';
import { findDuplicateNames, downloadTextFile } from '../../services/importQuality';
import { useAuthStore } from '../../store/useAuthStore';
import { ActiveIngredient, ImportBatch, Order, PriceHistory, PriceRecord, Product, Supplier, UserProfile } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';

type HealthItem = { label: string; count: number; detail: string; tone: 'good' | 'warn' | 'bad'; to: string };
const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const toCsv = (headers: string[], rows: unknown[][]) => '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
const stamp = () => new Date().toISOString().slice(0, 10);

export const AdminInsights: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [activityCount, setActivityCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p, i, s, pr, u, o, b, h, a] = await Promise.all([
        getProducts(), getActiveIngredients(), getSuppliers(), getPrices(), getUsers(),
        getOrders(), getImportBatches(), getPriceHistory(), getPlatformActivity()
      ]);
      setProducts(p); setIngredients(i); setSuppliers(s); setPrices(pr); setUsers(u);
      setOrders(o); setBatches(b); setHistory(h); setActivityCount(a.length);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل البيانات. تحقق من الاتصال والصلاحيات.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const duplicateGroups = useMemo(() => [...findDuplicateNames(products)].map(([name, items]) => ({ name, items })), [products]);
  const productIds = useMemo(() => new Set(products.map(p => p.id)), [products]);
  const supplierIds = useMemo(() => new Set(suppliers.map(s => s.id)), [suppliers]);
  const pricesWithoutProduct = prices.filter(p => !productIds.has(p.productId));
  const pricesWithoutSupplier = prices.filter(p => !supplierIds.has(p.supplierId));
  const invalidPrices = prices.filter(p => !Number.isFinite(Number(p.price)) || Number(p.price) <= 0);
  const productsWithoutPrices = products.filter(p => !prices.some(pr => pr.productId === p.id && !pr.hidden));
  const inactiveSuppliers = suppliers.filter(s => s.status !== 'active');
  const incompletePharmacies = users.filter(u => u.role === 'pharmacy' && (!u.phone || !(u.pharmacyName || u.name) || !u.city));
  const pendingOrders = orders.filter(o => ['sent', 'confirmed', 'processing'].includes(o.status));
  const healthItems: HealthItem[] = [
    { label: 'أسماء أصناف مكررة', count: duplicateGroups.length, detail: 'مجموعات أسماء تحتاج مراجعة؛ لا يتم دمجها تلقائيًا.', tone: duplicateGroups.length ? 'warn' : 'good', to: '/admin/products' },
    { label: 'أسعار دون صنف مرتبط', count: pricesWithoutProduct.length, detail: 'سجلات أسعار تشير إلى صنف غير موجود.', tone: pricesWithoutProduct.length ? 'bad' : 'good', to: '/admin/import' },
    { label: 'أسعار دون مستودع مرتبط', count: pricesWithoutSupplier.length, detail: 'سجلات أسعار تشير إلى مستودع غير موجود.', tone: pricesWithoutSupplier.length ? 'bad' : 'good', to: '/admin/suppliers' },
    { label: 'أسعار غير صالحة', count: invalidPrices.length, detail: 'سعر صفر أو سالب أو قيمة غير رقمية.', tone: invalidPrices.length ? 'bad' : 'good', to: '/admin/import' },
    { label: 'أصناف بلا عروض أسعار', count: productsWithoutPrices.length, detail: 'أصناف لا يظهر لها عرض سعر حالي.', tone: productsWithoutPrices.length ? 'warn' : 'good', to: '/admin/products' },
    { label: 'مستودعات متوقفة', count: inactiveSuppliers.length, detail: 'مستودعات متوقفة أو غير نشطة.', tone: inactiveSuppliers.length ? 'warn' : 'good', to: '/admin/suppliers' },
    { label: 'ملفات صيدليات ناقصة', count: incompletePharmacies.length, detail: 'حسابات ينقصها الهاتف أو المدينة أو الاسم.', tone: incompletePharmacies.length ? 'warn' : 'good', to: '/admin/pharmacies' },
  ];

  const exportReport = (kind: 'products' | 'prices' | 'suppliers' | 'pharmacies' | 'orders' | 'quality') => {
    const filename = `linkpharma-v33-${kind}-${stamp()}.csv`;
    let headers: string[] = [];
    let rows: unknown[][] = [];
    if (kind === 'products') {
      headers = ['المعرف', 'اسم الصنف', 'الشكل', 'التركيز', 'الشركة', 'التصنيف', 'الباركود', 'نوع الصنف'];
      rows = products.map(p => [p.id, p.tradeName, p.form, p.strength, p.manufacturer, p.category, p.barcode, p.productType]);
    } else if (kind === 'prices') {
      headers = ['الصنف', 'المستودع', 'السعر', 'السعر العام', 'متوفر', 'تاريخ التحديث', 'مخفي'];
      rows = prices.map(p => [products.find(x => x.id === p.productId)?.tradeName || p.productId, suppliers.find(x => x.id === p.supplierId)?.name || p.supplierId, p.price, p.publicPrice, p.available ? 'نعم' : 'لا', p.updatedAt, p.hidden ? 'نعم' : 'لا']);
    } else if (kind === 'suppliers') {
      headers = ['المعرف', 'المستودع', 'واتساب', 'العنوان', 'الحالة', 'آخر تحديث أسعار'];
      rows = suppliers.map(s => [s.id, s.name, s.whatsapp, s.address, s.status, s.lastPriceUpdate]);
    } else if (kind === 'pharmacies') {
      headers = ['UID', 'الاسم', 'اسم الصيدلية', 'البريد', 'الهاتف', 'المحافظة', 'المدينة', 'الحالة', 'الاشتراك'];
      rows = users.filter(u => u.role === 'pharmacy').map(u => [u.uid, u.name, u.pharmacyName, u.email, u.phone, u.governorate, u.city, u.status, u.subscriptionStatus]);
    } else if (kind === 'orders') {
      headers = ['المعرف', 'الصيدلية', 'المستودع', 'الإجمالي', 'الحالة', 'التاريخ', 'عدد البنود'];
      rows = orders.map(o => [o.id, o.pharmacyName, o.supplierName, o.total, o.status, o.createdAt, o.items?.length || 0]);
    } else {
      headers = ['نوع المراجعة', 'المعرف', 'التفاصيل'];
      rows = [
        ...duplicateGroups.flatMap(g => g.items.map(p => ['اسم مكرر', p.id, p.tradeName])),
        ...pricesWithoutProduct.map(p => ['سعر دون صنف', p.id, `productId=${p.productId}`]),
        ...pricesWithoutSupplier.map(p => ['سعر دون مستودع', p.id, `supplierId=${p.supplierId}`]),
        ...invalidPrices.map(p => ['سعر غير صالح', p.id, String(p.price)]),
        ...productsWithoutPrices.map(p => ['صنف دون عرض', p.id, p.tradeName]),
        ...incompletePharmacies.map(u => ['ملف صيدلية ناقص', u.uid, u.pharmacyName || u.name]),
      ];
    }
    downloadTextFile(filename, toCsv(headers, rows), 'text/csv;charset=utf-8');
  };

  const createBackup = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const [settings, activity] = await Promise.all([getSystemSettings(), getPlatformActivity()]);
      const payload = { format: 'linkpharma-backup', formatVersion: 33, createdAt: new Date().toISOString(), createdBy: user?.email || user?.name || 'admin', settings, activeIngredients: ingredients, products, suppliers, prices, priceHistory: history, importBatches: batches, orders, users, activity };
      downloadTextFile(`linkpharma-v33-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      setMessage('تم تجهيز النسخة وتنزيلها. يحتوي الملف على بيانات حسابات وطلبات؛ احفظه في مكان آمن.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إنشاء النسخة الاحتياطية.'); }
    finally { setBusy(false); }
  };

  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setMessage(''); setError('');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('حجم الملف أكبر من 50 ميغابايت.');
      const parsed = JSON.parse(await file.text()) as Record<string, any>;
      if (parsed.format !== 'linkpharma-backup' || ![25, 27, 32, 33].includes(Number(parsed.formatVersion))) throw new Error('صيغة النسخة غير معروفة؛ المقبول حاليًا v25/v27/v32/v33.');
      for (const key of ['products', 'suppliers', 'prices', 'users', 'orders']) if (!Array.isArray(parsed[key])) throw new Error(`النسخة غير مكتملة: ${key}`);
      if (!window.confirm('ستُدمج البيانات مع الموجودة، وقد تُستبدل السجلات ذات المعرف نفسه. نزّل نسخة حديثة أولًا. هل تريد المتابعة؟')) return;
      const result = await restoreDataBackup(parsed);
      setMessage('اكتملت الاستعادة: ' + Object.entries(result).map(([key, value]) => `${key} +${value.added} / استبدال ${value.replaced}`).join('، '));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذرت قراءة النسخة أو استعادتها.'); }
    finally { setBusy(false); }
  };

  const totalOrderValue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const recentBatches = [...batches].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 6);
  const cards = [
    { label: 'الأصناف', value: products.length, icon: Package },
    { label: 'عروض الأسعار', value: prices.length, icon: FileSpreadsheet },
    { label: 'المستودعات', value: suppliers.length, icon: Truck },
    { label: 'الصيدليات', value: users.filter(u => u.role === 'pharmacy').length, icon: Building2 },
    { label: 'الطلبيات', value: orders.length, icon: ClipboardList },
    { label: 'طلبيات قيد المتابعة', value: pendingOrders.length, icon: Activity },
    { label: 'دفعات الاستيراد', value: batches.length, icon: Database },
    { label: 'قيمة الطلبيات المسجلة', value: formatCurrency(totalOrderValue), icon: Users },
  ];

  return <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-10 md:p-6" dir="rtl">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800"><ShieldCheck className="h-4 w-4" /> أدوات المدير · v33</div><h1 className="text-2xl font-black text-slate-900 md:text-3xl">التقارير وجودة البيانات</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">مؤشرات تشغيل، كشف مشاكل الربط والأسعار، تصدير التقارير، وإدارة النسخ الاحتياطية.</p></div>
      <button onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث المؤشرات</button>
    </div>
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900">{message}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-900">{error}</div>}
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">جارٍ جمع المؤشرات…</div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(card => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500"><span>{card.label}</span><Icon className="h-4 w-4 text-emerald-700" /></div><div className="mt-3 break-words text-2xl font-black text-slate-900">{card.value}</div></div>; })}</div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">فحص جودة البيانات</h2><p className="mt-1 text-xs text-slate-500">فحوصات قراءة فقط؛ لا يتم حذف أو دمج أي سجلات تلقائيًا.</p></div><button onClick={() => exportReport('quality')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white"><ArrowDownToLine className="h-4 w-4" /> تصدير تقرير الجودة</button></div>
        <div className="grid gap-3 md:grid-cols-2">{healthItems.map(item => <div key={item.label} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"><div className={`mt-0.5 rounded-lg p-2 ${item.tone === 'good' ? 'bg-emerald-50 text-emerald-700' : item.tone === 'bad' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{item.tone === 'good' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-800">{item.label}</h3><span className={`rounded-full px-2 py-1 text-xs font-black tabular-nums ${item.tone === 'good' ? 'bg-emerald-50 text-emerald-800' : item.tone === 'bad' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>{item.count}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p><Link to={item.to} className="mt-2 inline-block text-xs font-black text-emerald-700 hover:underline">فتح القسم ←</Link></div></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500"><span>مواد فعالة: {ingredients.length}</span><span>·</span><span>سجل تغييرات الأسعار: {history.length}</span><span>·</span><span>أحداث تشغيل مسجلة: {activityCount}</span><span>·</span><span>آخر تحديث: {lastUpdated ? new Date(lastUpdated).toLocaleString('ar') : '—'}</span></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><h2 className="mb-1 text-lg font-black text-slate-900">تصدير التقارير</h2><p className="mb-4 text-xs leading-5 text-slate-500">تنزيل ملفات CSV قابلة للفتح في Excel على جهازك.</p><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[
        ['products', 'تقرير الأصناف'], ['prices', 'تقرير الأسعار'], ['suppliers', 'تقرير المستودعات'], ['pharmacies', 'تقرير الصيدليات'], ['orders', 'تقرير الطلبيات'], ['quality', 'تقرير جودة البيانات']
      ].map(([kind, label]) => <button key={kind} onClick={() => exportReport(kind as 'products' | 'prices' | 'suppliers' | 'pharmacies' | 'orders' | 'quality')} className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-right text-xs font-black text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />{label}</button>)}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="mb-3 flex items-center gap-2"><Archive className="h-5 w-5 text-emerald-700" /><h2 className="text-lg font-black text-slate-900">النسخ الاحتياطي والاستعادة</h2></div><p className="mb-4 text-sm leading-6 text-slate-600">أنشئ نسخة JSON أو استعد نسخة متوافقة. الملف يتضمن بيانات حسابات وطلبات؛ احفظه في مكان آمن.</p><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4"><h3 className="font-black text-emerald-950">إنشاء نسخة احتياطية</h3><p className="my-2 text-xs leading-5 text-emerald-900/80">الأصناف والأسعار والمستودعات والصيدليات والطلبيات والإعدادات وسجلات التشغيل.</p><button disabled={busy} onClick={() => void createBackup()} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> تنزيل النسخة</button></div><div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><h3 className="font-black text-amber-950">استعادة نسخة احتياطية</h3><p className="my-2 text-xs leading-5 text-amber-900/80">يتم فحص الملف ويُطلب تأكيد قبل الكتابة. الاستعادة تدمج البيانات ولا تحذف السجلات الأخرى.</p><input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={restoreBackup} /><button disabled={busy} onClick={() => fileRef.current?.click()} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-900 disabled:opacity-50"><ArrowUpFromLine className="h-4 w-4" /> اختيار ملف للاستعادة</button></div></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="mb-3 flex items-center gap-2"><Wrench className="h-5 w-5 text-emerald-700" /><h2 className="text-lg font-black text-slate-900">اختصارات الإدارة</h2></div><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[
        ['/admin/products', 'إدارة الكتالوج'], ['/admin/import', 'استيراد الأسعار'], ['/admin/catalog-import', 'استيراد أصناف'], ['/admin/suppliers', 'المستودعات'], ['/admin/pharmacies', 'حسابات الصيدليات'], ['/admin/orders', 'الطلبيات'], ['/admin/approvals', 'اعتمادات التغييرات'], ['/admin/audit-log', 'سجل التدقيق'], ['/admin/operations', 'مركز التشغيل'], ['/admin/control-center', 'مركز القيادة']
      ].map(([to, label]) => <Link key={to} to={to} className="rounded-lg border border-slate-200 p-3 text-xs font-black text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">{label} ←</Link>)}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><h2 className="mb-3 text-lg font-black text-slate-900">آخر دفعات الاستيراد</h2>{recentBatches.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">المستودع</th><th className="p-3">الملف</th><th className="p-3">عدد الصفوف</th><th className="p-3">التاريخ</th></tr></thead><tbody>{recentBatches.map(b => <tr key={b.id} className="border-t border-slate-100"><td className="p-3 font-bold">{b.supplierName || suppliers.find(s => s.id === b.supplierId)?.name || '—'}</td><td className="max-w-[240px] truncate p-3">{b.fileName}</td><td className="p-3 tabular-nums">{b.rowsCount}</td><td className="p-3">{b.createdAt ? new Date(b.createdAt).toLocaleString('ar') : '—'}</td></tr>)}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">لا توجد دفعات استيراد مسجلة.</p>}</section>
    </>}
  </div>;
};
