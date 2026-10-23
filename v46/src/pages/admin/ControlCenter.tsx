import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, Clock, Download, FileText, MapPin, PauseCircle, Pill, RefreshCw, Search, Truck, Upload, Trash2 } from 'lucide-react';
import { getActiveIngredients, getImportBatches, getOrders, getPriceHistory, getPrices, getProducts, getSuppliers, getSystemSettings, getUsers, importPharmacyProfiles, restoreDataBackup, updateSystemSettings, updateUserStatusAndSuppliers } from '../../services/dataStorage';
import { getPlatformActivity } from '../../services/v18Features';
import { LocationGovernorate, PharmacyFeatureKey, Product, Supplier, SystemSettings, UserProfile } from '../../types';
import { DEFAULT_FEATURES, PHARMACY_FEATURES } from '../../utils/pharmacyFeatures';
import { createLocationId, getLocationCatalog, toLegacyLocations } from '../../utils/gaza';
import { useToastStore } from '../../store/useToastStore';
import { parseSpreadsheetFile } from '../../services/import';
import { normalizeArabic } from '../../utils/arabicNormalize';

type Tab = 'overview' | 'pharmacies' | 'products' | 'suppliers' | 'settings';
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'pharmacies', label: 'الصيدليات' }, { id: 'products', label: 'الأصناف' },
  { id: 'suppliers', label: 'الموردون' }, { id: 'settings', label: 'الإعدادات والنسخ' },
];
const box = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

export const ControlCenter: React.FC = () => {
  const { success, error } = useToastStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const loadedTabs = useRef(new Set<Tab>());
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [locationCatalog, setLocationCatalog] = useState<LocationGovernorate[]>([]);
  const [loginWhatsApp, setLoginWhatsApp] = useState('');
  const [loginWhatsAppEnabled, setLoginWhatsAppEnabled] = useState(true);
  const [showDeliveryDays, setShowDeliveryDays] = useState(true);
  const [priceImportNotificationsEnabled, setPriceImportNotificationsEnabled] = useState(true);
  const [hideProductsWithoutOffers, setHideProductsWithoutOffers] = useState(true);
  const [featureDefaults, setFeatureDefaults] = useState<Record<PharmacyFeatureKey, boolean>>({ ...DEFAULT_FEATURES });
  const [backupPreview, setBackupPreview] = useState<Record<string, any> | null>(null);
  const [backupReport, setBackupReport] = useState<Record<string, { added: number; replaced: number }> | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [importPreview, setImportPreview] = useState<{ fileName: string; records: Array<Partial<UserProfile>>; skipped: number } | null>(null);
  const [importReport, setImportReport] = useState<{ added: number; updated: number } | null>(null);

  const loadTab = useCallback(async (target: Tab, force = false) => {
    if (target === 'overview' || (!force && loadedTabs.current.has(target))) return;
    setLoading(true);
    try {
      if (target === 'pharmacies') setUsers(await getUsers());
      if (target === 'products') setProducts(await getProducts());
      if (target === 'suppliers') setSuppliers(await getSuppliers());
      if (target === 'settings') {
        const row = await getSystemSettings();
        setSettings(row);
        setLocationCatalog(getLocationCatalog(row.locationCatalog, row.gazaLocations));
        setLoginWhatsApp(row.loginWhatsApp || row.supportWhatsApp || '970599999999');
        setLoginWhatsAppEnabled(row.loginWhatsAppEnabled !== false);
        setShowDeliveryDays(row.showDeliveryDays !== false);
        setPriceImportNotificationsEnabled(row.priceImportNotificationsEnabled !== false);
        setHideProductsWithoutOffers(row.hideProductsWithoutOffers !== false);
        setFeatureDefaults({ ...DEFAULT_FEATURES, ...(row.pharmacyFeatureDefaults || {}) } as Record<PharmacyFeatureKey, boolean>);
      }
      loadedTabs.current.add(target);
    } catch (cause) { error(`تعذر تحميل قسم ${target}.`); }
    finally { setLoading(false); }
  }, [error]);

  useEffect(() => { if (tab !== 'overview') void loadTab(tab); }, [tab, loadTab]);
  const pharmacies = useMemo(() => users.filter((user) => user.role === 'pharmacy'), [users]);
  const filtered = useMemo(() => pharmacies.filter((user) => {
    const matchesStatus = filter === 'all' || user.status === filter;
    const query = normalizeArabic(search.trim());
    const matchesText = !query || [user.name, user.email, user.phone, user.pharmacyName, user.ownerName, user.governorate, user.city].some((value) => normalizeArabic(value || '').includes(query));
    return matchesStatus && matchesText;
  }), [pharmacies, filter, search]);
  const counts = useMemo(() => ({
    total: pharmacies.length, active: pharmacies.filter((user) => user.status === 'active').length,
    pending: pharmacies.filter((user) => user.status === 'pending').length,
    suspended: pharmacies.filter((user) => user.status === 'suspended').length,
  }), [pharmacies]);

  const exportCsv = () => {
    const rows = [['الصيدلية', 'المالك', 'البريد', 'الجوال', 'المحافظة', 'المدينة', 'الحالة'], ...filtered.map((user) => [user.pharmacyName || '', user.ownerName || user.name, user.email, user.phone || '', user.governorate || '', user.city || '', user.status])];
    const blob = new Blob(['\ufeff' + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'linkpharma-pharmacies-v46.csv'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = await parseSpreadsheetFile(file); const headers = (parsed.allRows[0]?.cells || []).map(normalizeArabic);
      const find = (keys: string[]) => headers.findIndex((header) => keys.some((key) => header.includes(key)));
      const uidCol = find(['uid', 'معرف']); const emailCol = find(['email', 'بريد']);
      if (uidCol < 0 || emailCol < 0) throw new Error('يجب أن يتضمن الصف الأول عمودين بعنوان UID وEmail.');
      const indexes = { name: find(['name', 'اسم']), owner: find(['owner', 'مالك']), pharmacy: find(['pharmacy', 'صيدلي']), phone: find(['phone', 'جوال', 'هاتف']), governorate: find(['governorate', 'محافظ']), city: find(['city', 'مدينة']), address: find(['address', 'عنوان']) };
      const records = parsed.allRows.slice(1).map((row) => {
        const get = (index: number) => index < 0 ? '' : (row.cells[index] || '').trim();
        return { uid: get(uidCol), email: get(emailCol), name: get(indexes.name) || get(indexes.owner), ownerName: get(indexes.owner), pharmacyName: get(indexes.pharmacy), phone: get(indexes.phone), governorate: get(indexes.governorate), city: get(indexes.city), addressDetail: get(indexes.address) };
      }).filter((row) => row.uid && row.email);
      if (!records.length) throw new Error('لم يتم العثور على صفوف صحيحة تحتوي UID وبريداً إلكترونياً.');
      setImportPreview({ fileName: file.name, records, skipped: Math.max(0, parsed.allRows.length - 1 - records.length) }); setImportReport(null);
    } catch (cause) { error(`تعذرت معاينة الملف: ${cause instanceof Error ? cause.message : ''}`); }
    finally { event.target.value = ''; }
  };

  const confirmImport = async () => {
    if (!importPreview || !window.confirm(`سيتم استيراد ${importPreview.records.length} سجل مرتبط بمعرفات UID الموجودة. هل تتابع؟`)) return;
    try { const result = await importPharmacyProfiles(importPreview.records); setImportReport(result); setImportPreview(null); success(`أضيف ${result.added} حساباً وحُدّث ${result.updated} ملفاً.`); await loadTab('pharmacies', true); }
    catch (cause) { error(`فشل استيراد الصيدليات: ${cause instanceof Error ? cause.message : ''}`); }
  };

  const toggleStatus = async (user: UserProfile) => {
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateUserStatusAndSuppliers(user.uid, next, user.allowedSuppliers, next === 'suspended' ? 'تم التعليق من لوحة المدير' : 'تمت إعادة التفعيل');
      setUsers((old) => old.map((row) => row.uid === user.uid ? { ...row, status: next } : row));
      success(next === 'active' ? 'تمت إعادة التفعيل.' : 'تم تعليق الحساب.');
    } catch { error('تعذر تحديث حالة الحساب.'); }
  };

  const renameGovernorate = (index: number, name: string) => setLocationCatalog((old) => old.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item));
  const renameCity = (governorateIndex: number, cityIndex: number, name: string) => setLocationCatalog((old) => old.map((item, itemIndex) => itemIndex === governorateIndex ? { ...item, cities: item.cities.map((city, currentCityIndex) => currentCityIndex === cityIndex ? { ...city, name } : city) } : item));
  const renameSubarea = (governorateIndex: number, cityIndex: number, areaIndex: number, name: string) => setLocationCatalog((old) => old.map((region, ri) => ri !== governorateIndex ? region : { ...region, cities: region.cities.map((city, ci) => ci !== cityIndex ? city : { ...city, subareas: (city.subareas || []).map((area, ai) => ai === areaIndex ? { ...area, name } : area) }) }));
  const addGovernorate = () => setLocationCatalog((old) => [...old, { id: createLocationId('gov'), name: 'محافظة جديدة', cities: [] }]);
  const deleteGovernorate = (index: number) => setLocationCatalog((old) => old.filter((_, itemIndex) => itemIndex !== index));
  const addCity = (governorateIndex: number) => setLocationCatalog((old) => old.map((item, itemIndex) => itemIndex === governorateIndex ? { ...item, cities: [...item.cities, { id: createLocationId('city'), name: 'مدينة جديدة', streets: [], subareas: [] }] } : item));
  const deleteCity = (governorateIndex: number, cityIndex: number) => setLocationCatalog((old) => old.map((region, ri) => ri !== governorateIndex ? region : { ...region, cities: region.cities.filter((_, ci) => ci !== cityIndex) }));
  const addSubarea = (governorateIndex: number, cityIndex: number) => setLocationCatalog((old) => old.map((region, ri) => ri !== governorateIndex ? region : { ...region, cities: region.cities.map((city, ci) => ci !== cityIndex ? city : { ...city, subareas: [...(city.subareas || []), { id: createLocationId('area'), name: 'منطقة جديدة' }] }) }));
  const deleteSubarea = (governorateIndex: number, cityIndex: number, areaIndex: number) => setLocationCatalog((old) => old.map((region, ri) => ri !== governorateIndex ? region : { ...region, cities: region.cities.map((city, ci) => ci !== cityIndex ? city : { ...city, subareas: (city.subareas || []).filter((_, ai) => ai !== areaIndex) }) }));
  const saveLocations = async () => {
    // الحقول التي تُترك فارغة تُحذف تلقائياً عند الحفظ، مع تنظيف الأبناء الفارغين.
    const cleanCatalog = locationCatalog.map((region) => ({ ...region, name: region.name.trim(), cities: region.cities.map((city) => ({ id: city.id, name: city.name.trim(), streets: [], subareas: (city.subareas || []).map((area) => ({ id: area.id, name: area.name.trim() })).filter((area) => area.name) })).filter((city) => city.name) })).filter((region) => region.name);
    try { const next = await updateSystemSettings({ locationCatalog: cleanCatalog, gazaLocations: toLegacyLocations(cleanCatalog) }); setSettings(next); setLocationCatalog(getLocationCatalog(next.locationCatalog, next.gazaLocations)); success('تم حفظ قاموس المواقع وحذف البنود الفارغة.'); }
    catch { error('تعذر حفظ قاموس المواقع.'); }
  };
  const saveMessagingSettings = async () => {
    const clean = loginWhatsApp.replace(/\D/g, '');
    if (clean.length < 8) return error('أدخل رقم واتساب دولياً صحيحاً.');
    try { const next = await updateSystemSettings({ loginWhatsApp: clean, loginWhatsAppEnabled, showDeliveryDays, priceImportNotificationsEnabled, hideProductsWithoutOffers, pharmacyFeatureDefaults: featureDefaults }); setSettings(next); success('تم حفظ إعدادات الاتصال وظهور الأصناف والميزات.'); }
    catch { error('تعذر حفظ إعدادات الدخول.'); }
  };

  const createBackup = async () => {
    try {
      const [backupUsers, backupProducts, backupSuppliers, prices, orders, activeIngredients, priceHistory, importBatches, backupSettings, activity] = await Promise.all([
        getUsers(), getProducts(), getSuppliers(), getPrices(undefined, true), getOrders(), getActiveIngredients(), getPriceHistory(undefined, undefined, 5000), getImportBatches(), getSystemSettings(), getPlatformActivity(100),
      ]);
      const payload = { format: 'linkpharma-backup', version: 46, exportedAt: new Date().toISOString(), users: backupUsers, products: backupProducts, suppliers: backupSuppliers, prices, orders, activeIngredients, priceHistory, importBatches, settings: backupSettings, activity };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'linkpharma-v46-backup.json'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      success('تم إنشاء نسخة احتياطية كاملة عند الطلب.');
    } catch (cause) { error(`تعذر إنشاء النسخة الاحتياطية: ${cause instanceof Error ? cause.message : ''}`); }
  };
  const handleRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()); if (parsed?.format !== 'linkpharma-backup' || !parsed.version) throw new Error('الملف ليس نسخة LinkPharma احتياطية صالحة.'); setBackupPreview(parsed); setBackupReport(null); }
    catch (cause) { error(`تعذرت قراءة النسخة: ${cause instanceof Error ? cause.message : ''}`); }
    finally { event.target.value = ''; }
  };
  const executeRestore = async () => {
    if (!backupPreview) return;
    if (!restoreConfirmed) return error('أكمل تأكيد قائمة التحقق قبل الاستعادة.');
    if (!window.confirm('ستُدمج السجلات؛ ستُضاف المعرفات الجديدة وتُحدّث المطابقة دون حذف بيانات. هل تتابع؟')) return;
    try { const report = await restoreDataBackup(backupPreview); setBackupReport(report); setRestoreConfirmed(false); setBackupPreview(null); success('اكتملت الاستعادة بالدمج دون حذف البيانات.'); loadedTabs.current.clear(); }
    catch (cause) { error(`تعذرت الاستعادة: ${cause instanceof Error ? cause.message : ''}`); }
  };

  return <div dir="rtl" className="space-y-5 pb-16">
    <header className="rounded-3xl bg-gradient-to-br from-[#0f9d7a] to-[#073b4c] p-6 text-white shadow-xl"><p className="text-xs font-bold text-emerald-100">مركز القيادة · v46</p><h1 className="mt-2 text-2xl font-black">إدارة المنصة بوضوح</h1><p className="mt-2 text-xs leading-6 text-white/80">لا تُحمّل القوائم أو الأسعار عند فتح المركز؛ اختر القسم الذي تحتاجه فقط.</p></header>
    <nav className="flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black ${tab === item.id ? 'bg-[#0f9d7a] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.label}</button>)}</nav>
    {tab !== 'overview' && <div className="flex justify-end"><button onClick={() => void loadTab(tab, true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />تحديث القسم</button></div>}
    {loading && <div className="rounded-2xl border bg-white p-10 text-center text-sm font-bold text-slate-500">تحميل بيانات هذا القسم فقط...</div>}
    {tab === 'overview' && <section className={`${box} p-6`}><h2 className="text-base font-black">اختر القسم عند الحاجة</h2><p className="mt-2 text-xs leading-6 text-slate-500">فتح المركز لا يقرأ قاعدة المستخدمين أو الكتالوج أو الأسعار. تبدأ القراءة عند فتح قسم محدد، ويمكن تنزيل النسخة الاحتياطية من الإعدادات عند الطلب.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right hover:border-emerald-300 hover:bg-emerald-50"><b className="block text-sm">{item.label}</b><small className="mt-1 block text-slate-500">تحميل هذا القسم فقط</small></button>)}</div></section>}

    {!loading && tab === 'pharmacies' && <section className={box}>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو البريد أو الموقع" className="w-full rounded-xl border py-2.5 pr-9 pl-3 text-xs" /></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border px-3 text-xs"><option value="all">كل الحالات</option><option value="active">نشطة</option><option value="pending">معلقة</option><option value="suspended">موقوفة</option></select><button onClick={exportCsv} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"><Download className="ml-1 inline h-4 w-4" />CSV</button><label className="cursor-pointer rounded-xl border px-4 py-2 text-center text-xs font-bold"><Upload className="ml-1 inline h-4 w-4" />استيراد<input className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFile} /></label></div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['الإجمالي', counts.total, Building2], ['النشطة', counts.active, CheckCircle2], ['المعلقة', counts.pending, Clock], ['الموقوفة', counts.suspended, PauseCircle]].map(([label, value, Icon]) => <div key={label as string} className="rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-2 text-xs text-slate-500">{React.createElement(Icon as React.ElementType, { className: 'h-4 w-4 text-emerald-700' })}{label as string}</span><b className="mt-1 block text-lg">{value as number}</b></div>)}</div>
      {importPreview && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs"><b>معاينة: {importPreview.fileName}</b><p className="mt-1">{importPreview.records.length} سجل صالح · {importPreview.skipped} صف متجاوز؛ يجب أن يكون UID موجوداً في Firebase Authentication.</p><button onClick={() => void confirmImport()} className="mt-3 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">تأكيد الاستيراد</button><button onClick={() => setImportPreview(null)} className="mr-2 rounded-xl border px-4 py-2 font-bold">إلغاء</button></div>}
      {importReport && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">أضيف {importReport.added} حساباً وحُدّث {importReport.updated} ملفاً.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">الصيدلية / المالك</th><th>التواصل</th><th>الموقع</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.uid} className="border-t"><td className="p-3 font-bold">{user.pharmacyName || user.name}<small className="mt-1 block font-normal text-slate-500">{user.ownerName || user.name}</small></td><td className="p-3"><span dir="ltr">{user.phone || '—'}</span><small className="mt-1 block text-slate-500">{user.email}</small></td><td className="p-3">{[user.governorate, user.city].filter(Boolean).join(' · ') || '—'}</td><td className="p-3">{user.status === 'active' ? 'نشطة' : user.status === 'pending' ? 'معلقة' : 'موقوفة'}</td><td className="p-3"><button onClick={() => void toggleStatus(user)} className="rounded-lg border px-3 py-2 font-bold">{user.status === 'suspended' ? 'تفعيل' : 'إيقاف'}</button></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-8 text-center text-xs text-slate-400">لا توجد نتائج مطابقة.</p>}</div>
    </section>}

    {!loading && tab === 'products' && <section className={box}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-black"><Pill className="h-5 w-5 text-emerald-700" />الأصناف التجارية</h2><p className="mt-1 text-xs text-slate-500">تم تحميل بيانات الكتالوج فقط، من دون جلب أسعار المستودعات.</p></div><b className="rounded-xl bg-emerald-50 px-4 py-2 text-emerald-800">{products.length} صنف</b></div><div className="mt-4 max-h-[540px] overflow-auto rounded-xl border"><table className="w-full text-right text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">الصنف</th><th>الشكل والتركيز</th><th>الشركة</th></tr></thead><tbody>{products.slice(0, 100).map((product) => <tr key={product.id} className="border-t"><td className="p-3 font-bold">{product.tradeName}</td><td>{[product.form, product.strength].filter(Boolean).join(' · ')}</td><td>{product.manufacturer || '—'}</td></tr>)}</tbody></table>{products.length > 100 && <p className="p-3 text-center text-[10px] text-slate-500">عُرض أول 100 صنف؛ إدارة الكتالوج الكاملة من صفحة الأصناف.</p>}</div></section>}

    {!loading && tab === 'suppliers' && <section className={box}><h2 className="flex items-center gap-2 font-black"><Truck className="h-5 w-5 text-emerald-700" />الموردون والمستودعات</h2><p className="mt-1 text-xs text-slate-500">بيانات الموردين فقط؛ لا تُحمّل الأسعار هنا.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{suppliers.map((supplier) => <article key={supplier.id} className="rounded-xl border border-slate-200 p-4"><b className="block text-sm">{supplier.name}</b><p className="mt-1 text-xs text-slate-500">{supplier.address || 'الموقع غير محدد'}</p><p className="mt-2 text-xs" dir="ltr">{supplier.whatsapp || '—'}</p><span className={`mt-3 inline-block rounded-lg px-2 py-1 text-[10px] font-bold ${supplier.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{supplier.status === 'active' ? 'نشط' : 'متوقف'}</span></article>)}</div>{suppliers.length === 0 && <p className="p-8 text-center text-xs text-slate-400">لا توجد مستودعات مسجلة.</p>}</section>}

    {!loading && tab === 'settings' && <section className="space-y-4">
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-black"><MapPin className="h-5 w-5 text-emerald-700" />قاموس المواقع</h2><p className="mt-1 text-xs text-slate-500">أضف المحافظات والمدن والمناطق الفرعية الاختيارية. يمكنك حذف أي بند أو ترك اسمه فارغاً ليُحذف عند الحفظ.</p></div><button onClick={addGovernorate} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">+ إضافة محافظة</button></div>
        <div className="mt-4 space-y-3">{locationCatalog.map((region, regionIndex) => <div key={region.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2"><input value={region.name} onChange={(event) => renameGovernorate(regionIndex, event.target.value)} placeholder="اسم المحافظة" className="min-w-40 flex-1 rounded-lg border bg-white p-2 text-xs font-bold" aria-label="اسم المحافظة" /><button onClick={() => addCity(regionIndex)} className="rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-emerald-700 shadow-sm">+ مدينة</button><button type="button" onClick={() => deleteGovernorate(regionIndex)} className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600" title="حذف المحافظة"><Trash2 className="h-4 w-4" /></button></div>
          <div className="mt-3 space-y-2 pr-3">{region.cities.map((city, cityIndex) => <div key={city.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2"><input value={city.name} onChange={(event) => renameCity(regionIndex, cityIndex, event.target.value)} placeholder="اسم المدينة" className="min-w-0 flex-1 rounded-lg border p-2 text-xs font-bold" aria-label="اسم المدينة" /><button type="button" onClick={() => addSubarea(regionIndex, cityIndex)} className="whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800">+ منطقة</button><button type="button" onClick={() => deleteCity(regionIndex, cityIndex)} className="rounded-lg border border-rose-200 p-2 text-rose-600" title="حذف المدينة"><Trash2 className="h-4 w-4" /></button></div>
            {!!city.subareas?.length && <div className="mt-2 space-y-2 border-r-2 border-emerald-100 pr-3">{city.subareas.map((area, areaIndex) => <div key={area.id} className="flex items-center gap-2"><input value={area.name} onChange={(event) => renameSubarea(regionIndex, cityIndex, areaIndex, event.target.value)} placeholder="اسم المنطقة الفرعية" className="min-w-0 flex-1 rounded-lg border p-2 text-xs" aria-label="اسم المنطقة الفرعية" /><button type="button" onClick={() => deleteSubarea(regionIndex, cityIndex, areaIndex)} className="rounded-lg border border-rose-200 p-2 text-rose-600" title="حذف المنطقة"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
          </div>)}</div>
        </div>)}{locationCatalog.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">لا يوجد قاموس بعد؛ ابدأ بإضافة محافظة.</p>}</div>
        <button onClick={() => void saveLocations()} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white">حفظ قاموس المواقع</button>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">رقم واتساب الدخول<input value={loginWhatsApp} onChange={(event) => setLoginWhatsApp(event.target.value)} dir="ltr" className="mt-1 w-full rounded-xl border p-3 font-mono" /></label><div className="flex flex-col justify-end gap-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={loginWhatsAppEnabled} onChange={(event) => setLoginWhatsAppEnabled(event.target.checked)} />إظهار خيار واتساب في الدخول</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showDeliveryDays} onChange={(event) => setShowDeliveryDays(event.target.checked)} />إظهار أيام التوصيل للصيدليات</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={priceImportNotificationsEnabled} onChange={(event) => setPriceImportNotificationsEnabled(event.target.checked)} />إرسال إشعار بعد نشر الدفعة بعدد الأسعار المتغيرة</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={hideProductsWithoutOffers} onChange={(event) => setHideProductsWithoutOffers(event.target.checked)} />إخفاء الأصناف التي ليس لها أي عرض متاح من أي مورد</label></div></div>
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"><h3 className="text-sm font-black text-slate-900">إظهار ميزات الصيدلية (للجميع)</h3><p className="mt-1 text-[11px] text-slate-500">يطبق على كل الصيدليات، ويمكن استثناء صيدلية محددة من نافذة «إدارة» في صفحة الصيدليات.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{PHARMACY_FEATURES.map((feature) => <label key={feature.key} className="flex items-start gap-2 rounded-xl border bg-white p-3 text-xs"><input type="checkbox" className="mt-0.5" checked={featureDefaults[feature.key]} onChange={(event) => setFeatureDefaults((prev) => ({ ...prev, [feature.key]: event.target.checked }))} /><span><strong className="block text-slate-900">{feature.label}</strong><small className="text-slate-500">{feature.description}</small></span></label>)}</div></div><button onClick={() => void saveMessagingSettings()} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white">حفظ الإعدادات</button><small className="block pt-2 text-[10px] text-slate-400">آخر تحديث: {settings?.updatedAt || '—'}</small>
      </div>
      <div className={box}><h2 className="flex items-center gap-2 font-black"><FileText className="h-5 w-5 text-emerald-700" />النسخ الاحتياطي والاستعادة</h2><p className="mt-1 text-xs leading-5 text-slate-500">القراءة الشاملة لا تبدأ تلقائياً؛ تُنفذ فقط عند طلب تنزيل النسخة.</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void createBackup()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white"><Download className="ml-1 inline h-4 w-4" />تنزيل نسخة كاملة الآن</button><label className="cursor-pointer rounded-xl border px-4 py-2.5 text-xs font-bold"><Upload className="ml-1 inline h-4 w-4" />اختيار ملف للاستعادة<input className="hidden" type="file" accept="application/json,.json" onChange={handleRestoreFile} /></label></div>{backupPreview && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs"><b>نسخة إصدار {backupPreview.version} · {backupPreview.exportedAt || 'تاريخ غير محدد'}</b><p className="mt-2">تتم الاستعادة بالدمج ولا تحذف السجلات الحالية.</p><label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} />أؤكد أنني راجعت النسخة وأرغب بدمجها.</label><button onClick={() => void executeRestore()} className="mt-3 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">تنفيذ الاستعادة</button><button onClick={() => setBackupPreview(null)} className="mr-2 rounded-xl border px-4 py-2 font-bold">إلغاء</button></div>}{backupReport && <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 text-[10px]" dir="ltr">{JSON.stringify(backupReport, null, 2)}</pre>}</div>
    </section>}
  </div>;
};
