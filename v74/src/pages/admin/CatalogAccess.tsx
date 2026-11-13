import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Eye, EyeOff, Package, RefreshCw, Search, Shield, Truck } from 'lucide-react';
import { getPrices, getProducts, getSuppliers, getSystemSettings, getUsers, saveProduct, updatePharmacyCatalogPermissions, updateSystemSettings } from '../../services/dataStorage';
import { PharmacyCatalogPermissions, Product, Supplier, UserProfile } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { normalizeArabic } from '../../utils/arabicNormalize';

const EMPTY_PERMISSIONS: PharmacyCatalogPermissions = { managePrices: false, createProducts: false, createActiveIngredients: false, priceSupplierIds: [] };
type Tab = 'visibility' | 'pharmacies';

export const CatalogAccess: React.FC = () => {
  const [tab, setTab] = useState<Tab>('visibility');
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [offerCounts, setOfferCounts] = useState<Record<string, number>>({});
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<PharmacyCatalogPermissions>(EMPTY_PERMISSIONS);
  const [search, setSearch] = useState('');
  const [onlyPriced, setOnlyPriced] = useState(true);
  const [hideProductsWithoutOffers, setHideProductsWithoutOffers] = useState(true);
  const [savingVisibilitySetting, setSavingVisibilitySetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToastStore();

  const load = async () => {
    setLoading(true);
    try {
      const [productRows, userRows, supplierRows, priceRows, systemSettings] = await Promise.all([getProducts(), getUsers(), getSuppliers(), getPrices(undefined, true), getSystemSettings()]);
      setHideProductsWithoutOffers(systemSettings.hideProductsWithoutOffers !== false);
      const activeSupplierIds = new Set(supplierRows.filter((supplier) => supplier.status === 'active').map((supplier) => supplier.id));
      const counts: Record<string, number> = {};
      priceRows.forEach((price) => { if (activeSupplierIds.has(price.supplierId) && price.available !== false && !price.hidden && price.price > 0) counts[price.productId] = (counts[price.productId] || 0) + 1; });
      setProducts(productRows);
      setUsers(userRows.filter((user) => user.role === 'pharmacy'));
      setSuppliers(supplierRows);
      setOfferCounts(counts);
    } catch (cause) { error(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات الصلاحيات.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filteredProducts = useMemo(() => {
    const query = normalizeArabic(search.trim());
    return products.filter((product) => (!onlyPriced || (offerCounts[product.id] || 0) > 0) && (!query || normalizeArabic(`${product.tradeName} ${product.manufacturer} ${product.strength}`).includes(query)));
  }, [products, offerCounts, search, onlyPriced]);
  const filteredUsers = useMemo(() => {
    const query = normalizeArabic(search.trim());
    return users.filter((user) => !query || normalizeArabic(`${user.pharmacyName || ''} ${user.name} ${user.email} ${user.phone || ''}`).includes(query));
  }, [users, search]);

  const setProductVisibility = async (rows: Product[], visible: boolean) => {
    if (!rows.length) return;
    setSaving(true);
    try {
      for (const product of rows) await saveProduct({ ...product, visibleToPharmacies: visible });
      const ids = new Set(rows.map((row) => row.id));
      setProducts((old) => old.map((row) => ids.has(row.id) ? { ...row, visibleToPharmacies: visible } : row));
      setSelectedProducts([]);
      success(visible ? `أُظهرت ${rows.length} أصناف للصيدليات.` : `أُخفيت ${rows.length} أصناف عن الصيدليات.`);
    } catch (cause) { error(cause instanceof Error ? cause.message : 'تعذر تحديث ظهور الأصناف.'); }
    finally { setSaving(false); }
  };

  const updateOfferVisibility = async (enabled: boolean) => {
    setSavingVisibilitySetting(true);
    try { await updateSystemSettings({ hideProductsWithoutOffers: enabled }); setHideProductsWithoutOffers(enabled); success(enabled ? 'تم تفعيل إخفاء الأصناف التي لا تملك عروضاً متاحة.' : 'سيظهر للصيدليات أيضاً الصنف غير المسعّر (ما لم تخفه يدوياً).'); }
    catch (cause) { error(cause instanceof Error ? cause.message : 'تعذر حفظ إعداد إظهار الأصناف.'); }
    finally { setSavingVisibilitySetting(false); }
  };

  const applyPermissions = async () => {
    if (!selectedUsers.length) return error('اختر صيدلية واحدة على الأقل.');
    if (permissions.managePrices && permissions.priceSupplierIds.length === 0) return error('حدد مورداً واحداً على الأقل للسماح برفع الأسعار وتحديثها.');
    setSaving(true);
    try {
      for (const uid of selectedUsers) await updatePharmacyCatalogPermissions(uid, permissions);
      setUsers((old) => old.map((user) => selectedUsers.includes(user.uid) ? { ...user, pharmacyCatalogPermissions: { ...permissions } } : user));
      success(`تم تحديث الصلاحيات لـ ${selectedUsers.length} صيدلية.`);
    } catch (cause) { error(cause instanceof Error ? cause.message : 'تعذر حفظ الصلاحيات.'); }
    finally { setSaving(false); }
  };

  const toggleSupplier = (id: string) => setPermissions((old) => ({ ...old, priceSupplierIds: old.priceSupplierIds.includes(id) ? old.priceSupplierIds.filter((item) => item !== id) : [...old.priceSupplierIds, id] }));
  const toggleUser = (user: UserProfile) => {
    const selected = selectedUsers.includes(user.uid);
    if (selected) {
      setSelectedUsers((old) => old.filter((uid) => uid !== user.uid));
      if (selectedUsers.length === 1) setPermissions(EMPTY_PERMISSIONS);
      return;
    }
    if (selectedUsers.length === 0) {
      const saved = user.pharmacyCatalogPermissions || EMPTY_PERMISSIONS;
      setPermissions({ ...saved, priceSupplierIds: [...(saved.priceSupplierIds || [])] });
    }
    setSelectedUsers((old) => [...old, user.uid]);
  };
  const allProductsSelected = filteredProducts.length > 0 && filteredProducts.every((product) => selectedProducts.includes(product.id));
  const allUsersSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedUsers.includes(user.uid));

  return <div className="mx-auto max-w-7xl space-y-5 pb-20" dir="rtl">
    <header className="rounded-3xl bg-gradient-to-l from-[#073b4c] to-[#0f9d7a] p-5 text-white shadow-lg sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-black sm:text-2xl"><Shield className="h-6 w-6"/>صلاحيات الكتالوج والأسعار</h1><p className="mt-2 max-w-3xl text-xs leading-6 text-white/85">تحكم بظهور الصنف للصيدليات، وامنح صيدلية واحدة أو مجموعة صيدليات أدوات رفع الأسعار وإنشاء الأصناف والمواد الفعالة.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>تحديث</button></div>
    </header>
    <nav className="flex gap-2 overflow-x-auto"><button onClick={() => { setTab('visibility'); setSearch(''); }} className={`rounded-xl px-4 py-3 text-xs font-black ${tab === 'visibility' ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600'}`}><Eye className="ml-1 inline h-4 w-4"/>ظهور الأصناف</button><button onClick={() => { setTab('pharmacies'); setSearch(''); }} className={`rounded-xl px-4 py-3 text-xs font-black ${tab === 'pharmacies' ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600'}`}><Building2 className="ml-1 inline h-4 w-4"/>صلاحيات الصيدليات</button></nav>
    {tab === 'visibility' ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><label className="flex items-start gap-3 text-xs"><input className="mt-0.5" type="checkbox" checked={hideProductsWithoutOffers} disabled={savingVisibilitySetting} onChange={(event) => void updateOfferVisibility(event.target.checked)}/><span><b className="block">عدم إظهار الصنف للصيدليات إلا بعد توفر عرض سعر متاح من مورد</b><small className="mt-1 block leading-5 text-slate-600">عند تفعيل هذا الخيار، الأصناف التي لا تملك أي عرض متاح لن تظهر في صفحات الصيدليات حتى يُرفع لها سعر متاح. ويمكنك كذلك إخفاء صنف بعينه من الجدول أدناه.</small></span>{savingVisibilitySetting && <span>حفظ…</span>}</label></div><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-black"><Package className="h-5 w-5 text-emerald-700"/>الأصناف التجارية</h2><p className="mt-1 text-xs text-slate-500">تظهر العروض المتاحة وغير المخفية لكل صنف. بعد اعتماد سعر متاح من أي مورد يصبح الصنف قابلاً للظهور، إلا إذا أخفته الإدارة أو عطلت إظهاره بعدم توفر الأسعار.</p></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={onlyPriced} onChange={(event) => setOnlyPriced(event.target.checked)}/>تصفية الجدول لإظهار الأصناف المسعّرة فقط</label></div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><label className="relative min-w-56 flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الصنف أو الشركة" className="w-full rounded-xl border py-2.5 pr-9 pl-3 text-xs"/></label><button onClick={() => setSelectedProducts(allProductsSelected ? [] : filteredProducts.map((row) => row.id))} className="rounded-xl border px-3 py-2.5 text-xs font-bold">{allProductsSelected ? 'إلغاء تحديد النتائج' : `تحديد النتائج (${filteredProducts.length})`}</button><button disabled={saving || !selectedProducts.length} onClick={() => void setProductVisibility(products.filter((row) => selectedProducts.includes(row.id)), true)} className="rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Eye className="ml-1 inline h-4 w-4"/>إظهار المحدد</button><button disabled={saving || !selectedProducts.length} onClick={() => void setProductVisibility(products.filter((row) => selectedProducts.includes(row.id)), false)} className="rounded-xl bg-rose-700 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"><EyeOff className="ml-1 inline h-4 w-4"/>إخفاء المحدد</button></div>
      {loading ? <p className="p-10 text-center text-sm text-slate-500">تحميل الأصناف والأسعار...</p> : <div className="mt-4 max-h-[65vh] overflow-auto rounded-xl border"><table className="w-full min-w-[620px] text-right text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3"><input type="checkbox" aria-label="تحديد كل الأصناف" checked={allProductsSelected} onChange={() => setSelectedProducts(allProductsSelected ? [] : filteredProducts.map((row) => row.id))}/></th><th>الصنف</th><th>الشركة / التركيز</th><th>العروض المتاحة</th><th>الظهور</th><th>إجراء</th></tr></thead><tbody>{filteredProducts.map((product) => { const visible = product.visibleToPharmacies !== false; return <tr key={product.id} className="border-t hover:bg-slate-50"><td className="p-3"><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => setSelectedProducts((old) => old.includes(product.id) ? old.filter((id) => id !== product.id) : [...old, product.id])}/></td><td className="font-bold">{product.tradeName}</td><td>{[product.manufacturer, product.strength, product.form].filter(Boolean).join(' · ') || '—'}</td><td>{offerCounts[product.id] || 0}</td><td><span className={`rounded-lg px-2 py-1 font-bold ${visible ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{visible ? 'ظاهر' : 'مخفي'}</span></td><td><button disabled={saving} onClick={() => void setProductVisibility([product], !visible)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50">{visible ? 'إخفاء' : 'إظهار'}</button></td></tr>; })}</tbody></table>{!filteredProducts.length && <p className="p-8 text-center text-xs text-slate-500">لا توجد أصناف مطابقة.</p>}</div>}
    </section> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(330px,0.9fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-black">اختر الصيدليات</h2><p className="mt-1 text-xs text-slate-500">يمكن اختيار حساب واحد أو تحديد عدة حسابات لتطبيق الإعداد نفسه دفعة واحدة.</p></div><button onClick={() => setSelectedUsers(allUsersSelected ? [] : filteredUsers.map((row) => row.uid))} className="rounded-xl border px-3 py-2 text-xs font-bold">{allUsersSelected ? 'إلغاء التحديد' : 'تحديد نتائج البحث'}</button></div><label className="relative mt-3 block"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الصيدلية أو البريد" className="w-full rounded-xl border py-2.5 pr-9 pl-3 text-xs"/></label>{loading ? <p className="p-8 text-center text-sm text-slate-500">تحميل الصيدليات...</p> : <div className="mt-3 max-h-[65vh] space-y-2 overflow-auto">{filteredUsers.map((user) => <label key={user.uid} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedUsers.includes(user.uid) ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'}`}><input className="mt-1" type="checkbox" checked={selectedUsers.includes(user.uid)} onChange={() => toggleUser(user)}/><span className="min-w-0 flex-1"><b className="block truncate text-xs">{user.pharmacyName || user.name}</b><small className="mt-1 block truncate text-slate-500">{user.email} · {user.status === 'active' ? 'نشطة' : 'غير نشطة'}</small><small className="mt-1 block text-[10px] text-slate-500">أسعار: {user.pharmacyCatalogPermissions?.managePrices ? `${user.pharmacyCatalogPermissions.priceSupplierIds?.length || 0} مورد` : 'لا'} · إنشاء أصناف: {user.pharmacyCatalogPermissions?.createProducts ? 'نعم' : 'لا'} · إنشاء مواد: {user.pharmacyCatalogPermissions?.createActiveIngredients ? 'نعم' : 'لا'}</small></span></label>)}</div>}</section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><h2 className="text-base font-black">الصلاحيات المراد تطبيقها</h2><p className="mt-1 text-xs leading-5 text-slate-500">سيؤدي الحفظ إلى استبدال هذه الصلاحيات للصيدليات المحددة فقط. لا تتغير صلاحيات المستخدمين الآخرين.</p></div><label className="flex items-start gap-3 rounded-xl border p-3 text-xs"><input type="checkbox" checked={permissions.managePrices} onChange={(event) => setPermissions((old) => ({ ...old, managePrices: event.target.checked }))}/><span><b className="block">رفع وتحديث الأسعار</b><small className="text-slate-500">الرفع متاح للموردين المختارين أدناه فقط.</small></span></label>{permissions.managePrices && <div className="rounded-xl bg-slate-50 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-black"><Truck className="h-4 w-4 text-emerald-700"/>الموردون المسموح بتحديث أسعارهم</div><div className="max-h-40 space-y-1 overflow-auto">{suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => <label key={supplier.id} className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs"><input type="checkbox" checked={permissions.priceSupplierIds.includes(supplier.id)} onChange={() => toggleSupplier(supplier.id)}/>{supplier.name}</label>)}</div><p className="mt-2 text-[10px] text-slate-500">يستطيع الحساب تعديل أسعار المورد المحدد هنا فقط؛ لا يمكنه حذف دفعات الأسعار أو إخفاء العروض.</p></div>}<label className="flex items-center gap-3 rounded-xl border p-3 text-xs"><input type="checkbox" checked={permissions.createProducts} onChange={(event) => setPermissions((old) => ({ ...old, createProducts: event.target.checked }))}/><span><b className="block">إنشاء أصناف جديدة</b><small className="text-slate-500">إنشاء فقط؛ لا يسمح بتعديل أو حذف الأصناف الموجودة.</small></span></label><label className="flex items-center gap-3 rounded-xl border p-3 text-xs"><input type="checkbox" checked={permissions.createActiveIngredients} onChange={(event) => setPermissions((old) => ({ ...old, createActiveIngredients: event.target.checked }))}/><span><b className="block">إنشاء مواد فعالة جديدة</b><small className="text-slate-500">إضافة فقط؛ لا يسمح بتعديل أو حذف المواد الموجودة.</small></span></label><button disabled={saving || !selectedUsers.length} onClick={() => void applyPermissions()} className="min-h-11 w-full rounded-xl bg-[#0f9d7a] px-4 py-3 text-xs font-black text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : <><Check className="ml-1 inline h-4 w-4"/>تطبيق الصلاحيات على {selectedUsers.length} صيدلية</>}</button></section>
    </div>}
  </div>;
};
