import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { Building, CheckCircle, Lightbulb, MapPin, Phone, ShieldAlert, Trash2, Plus } from 'lucide-react';
import { normalizeSaudiLocalPhone, isValidSaudiLocalPhone } from '../../utils/profile';
import { useToastStore } from '../../store/useToastStore';
import { getLocationCatalog, formatBranchAddress, createLocationId } from '../../utils/gaza';
import { getSystemSettings } from '../../services/dataStorage';
import { LocationGovernorate, PharmacyBranch } from '../../types';

const emptyBranch = (): PharmacyBranch => ({ id: createLocationId('branch'), name: 'فرع جديد', governorateId: '', governorate: '', cityId: '', city: '', streetId: '', street: '', addressDetail: '' });

export const PharmacyProfileEdit: React.FC = () => {
  const { user, updateUserProfile } = useAuthStore();
  const navigate = useNavigate();
  const [pharmacyName, setPharmacyName] = useState(user?.pharmacyName || '');
  const [ownerName, setOwnerName] = useState(user?.ownerName || user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [catalog, setCatalog] = useState<LocationGovernorate[]>([]);
  const [branches, setBranches] = useState<PharmacyBranch[]>(() => user?.branches?.length ? user.branches : [{ ...emptyBranch(), name: 'الفرع الرئيسي', governorate: user?.governorate || '', city: user?.city || '', street: user?.street || '', streetId: user?.streetId || '', addressDetail: user?.addressDetail || user?.address || '' }]);
  const [defaultBranchId, setDefaultBranchId] = useState(user?.defaultBranchId || branches[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const isFirstTime = !user?.profileComplete;

  useEffect(() => {
    let active = true;
    void getSystemSettings().then((settings) => {
      if (!active) return;
      const nextCatalog = getLocationCatalog(settings.locationCatalog, settings.gazaLocations);
      setCatalog(nextCatalog);
      setBranches((old) => old.map((branch) => syncBranch(branch, nextCatalog)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const syncBranch = (branch: PharmacyBranch, source: LocationGovernorate[]): PharmacyBranch => {
    const governorate = source.find((item) => item.id === branch.governorateId || item.name === branch.governorate);
    const city = governorate?.cities.find((item) => item.id === branch.cityId || item.name === branch.city);
    const street = city?.streets.find((item) => item.id === branch.streetId || item.name === branch.street);
    // لا نمسح القيم القديمة إذا لم يعد الموقع موجوداً في الكتالوج؛ يظل المستخدم
    // قادراً على مراجعتها وإعادة اختيارها، ولا نفقد عنواناً قديماً أثناء التحميل.
    return {
      ...branch,
      governorateId: governorate?.id || branch.governorateId || '',
      governorate: governorate?.name || branch.governorate || '',
      cityId: city?.id || branch.cityId || '',
      city: city?.name || branch.city || '',
      streetId: street?.id || branch.streetId || '',
      street: street?.name || branch.street || '',
    };
  };

  const updateBranch = (branchId: string, patch: Partial<PharmacyBranch>) => setBranches((old) => old.map((branch) => branch.id === branchId ? { ...branch, ...patch } : branch));
  const addBranch = () => setBranches((old) => {
    if (old.length >= 10) {
      useToastStore.getState().warning('الحد الأقصى 10 فروع للصيدلية.');
      return old;
    }
    return [...old, emptyBranch()];
  });
  const removeBranch = (branchId: string) => setBranches((old) => {
    if (old.length <= 1) return old;
    const next = old.filter((branch) => branch.id !== branchId);
    if (defaultBranchId === branchId) setDefaultBranchId(next[0]?.id || '');
    return next;
  });
  const chooseGovernorate = (branch: PharmacyBranch, governorateId: string) => {
    const region = catalog.find((item) => item.id === governorateId);
    updateBranch(branch.id, { governorateId, governorate: region?.name || '', cityId: '', city: '', streetId: '', street: '' });
  };
  const chooseCity = (branch: PharmacyBranch, cityId: string) => {
    const region = catalog.find((item) => item.id === branch.governorateId);
    const city = region?.cities.find((item) => item.id === cityId);
    updateBranch(branch.id, { cityId, city: city?.name || '', streetId: '', street: '' });
  };
  const chooseStreet = (branch: PharmacyBranch, streetId: string) => {
    const region = catalog.find((item) => item.id === branch.governorateId);
    const city = region?.cities.find((item) => item.id === branch.cityId);
    const street = city?.streets.find((item) => item.id === streetId);
    updateBranch(branch.id, { streetId, street: street?.name || '' });
  };


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pharmacyName.trim() || !ownerName.trim() || !phone.trim() || branches.length === 0) return useToastStore.getState().error('يرجى تعبئة بيانات الصيدلية وإضافة فرع واحد على الأقل.');
    if (!isValidSaudiLocalPhone(phone)) return useToastStore.getState().error('رقم الجوال غير صالح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.');
    const normalizedBranches = branches.map((branch) => ({ ...branch, name: branch.name.trim(), addressDetail: branch.addressDetail.trim() }));
    if (normalizedBranches.some((branch) => !branch.name || !branch.governorateId || !branch.cityId || !branch.streetId || !branch.addressDetail)) return useToastStore.getState().error('اختر المحافظة والمدينة والشارع وأدخل العنوان التفصيلي لكل فرع.');
    const selectedDefault = normalizedBranches.find((branch) => branch.id === defaultBranchId) || normalizedBranches[0];
    if (!selectedDefault) return useToastStore.getState().error('اختر فرعاً افتراضياً.');
    const cleanedPhone = normalizeSaudiLocalPhone(phone);
    const savedBranches = normalizedBranches.map((branch) => ({ ...branch, phone: cleanedPhone }));
    setSaving(true);
    const success = await updateUserProfile({
      pharmacyName: pharmacyName.trim(), ownerName: ownerName.trim(), branches: savedBranches, defaultBranchId: selectedDefault.id,
      governorate: selectedDefault.governorate, city: selectedDefault.city, streetId: selectedDefault.streetId, street: selectedDefault.street,
      addressDetail: selectedDefault.addressDetail, address: formatBranchAddress(selectedDefault), phone: cleanedPhone, profileComplete: true,
    });
    setSaving(false);
    if (success && isFirstTime) navigate(user?.role === 'representative' ? '/app/representative' : '/app/home');
    else if (success) navigate('/app/profile');
  };

  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-24" dir="rtl">
    <button type="button" onClick={() => navigate('/app/profile')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm">العودة إلى الملف الشخصي</button>
    <header className="rounded-3xl bg-gradient-to-br from-[#0f9d7a] to-[#073b4c] p-5 text-white shadow-lg"><p className="text-xs font-bold text-emerald-100">تعديل البيانات والفروع</p><h1 className="mt-1 text-xl font-black">{user?.pharmacyName || 'بيانات الصيدلية'}</h1><p className="mt-1 text-xs text-white/80">المالك: {user?.ownerName || user?.name || '—'}</p></header>
    {isFirstTime && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><strong className="block text-sm font-bold">خطوة إلزامية لإكمال الحساب:</strong>أكمل بيانات الصيدلية والعنوان والفروع ورقم الجوال لإرسال الطلبيات.</div></div>}
    <button type="button" onClick={() => navigate('/app/suggestions')} className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0f9d7a]"><Lightbulb className="h-5 w-5" /></span><span><strong className="block text-sm text-emerald-900">الاقتراحات والملاحظات</strong><small className="text-xs text-emerald-700">ساعدنا على تحسين فارما لينك</small></span></span><span className="text-xs font-bold text-emerald-700">فتح الصفحة ←</span></button>
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-5"><Building className="h-6 w-6 text-[#0f9d7a]" /><div><h2 className="text-xl font-black text-slate-800">بيانات الصيدلية</h2><p className="text-xs text-slate-500">يمكنك إدارة عدة فروع واختيار الفرع الافتراضي للطلبات.</p></div></div>
      <label className="block text-xs font-bold text-slate-700">اسم الصيدلية أو الصيدلي <span className="text-rose-500">*</span><input required value={pharmacyName} onChange={(event) => setPharmacyName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label>
      <label className="block text-xs font-bold text-slate-700">اسم المالك <span className="text-rose-500">*</span><input required value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label>
      <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black text-slate-900">فروع الصيدلية</h3><p className="text-[11px] text-slate-500">المحافظة والمدينة والشارع والعنوان التفصيلي حقول إلزامية.</p></div><button type="button" onClick={addBranch} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Plus className="ml-1 inline h-4 w-4" />إضافة فرع</button></div>
        {catalog.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">تعذر تحميل قاموس المواقع؛ لا يمكن إكمال اختيار الفروع الآن.</p>}
        {branches.map((branch, index) => { const region = catalog.find((item) => item.id === branch.governorateId); const city = region?.cities.find((item) => item.id === branch.cityId); return <article key={branch.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><label className="flex-1 text-xs font-bold">اسم الفرع <span className="text-rose-500">*</span><input required value={branch.name} onChange={(event) => updateBranch(branch.id, { name: event.target.value })} className="mt-1 w-full rounded-xl border bg-white p-2.5 text-sm" /></label>{branches.length > 1 && <button type="button" onClick={() => removeBranch(branch.id)} className="mt-5 rounded-xl border border-rose-200 p-2 text-rose-600" title="حذف الفرع"><Trash2 className="h-4 w-4" /></button>}</div><label className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-bold text-emerald-900"><input type="radio" name="defaultBranch" checked={defaultBranchId === branch.id} onChange={() => setDefaultBranchId(branch.id)} />الفرع الافتراضي للطلبات</label><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold">المحافظة <span className="text-rose-500">*</span><select required value={branch.governorateId} onChange={(event) => chooseGovernorate(branch, event.target.value)} className="mt-1 w-full rounded-xl border bg-white p-2.5 text-xs"><option value="">اختر المحافظة</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-bold">المدينة <span className="text-rose-500">*</span><select required disabled={!region} value={branch.cityId} onChange={(event) => chooseCity(branch, event.target.value)} className="mt-1 w-full rounded-xl border bg-white p-2.5 text-xs"><option value="">اختر المدينة</option>{region?.cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-bold">الشارع <span className="text-rose-500">*</span><select required disabled={!city || city.streets.length === 0} value={branch.streetId} onChange={(event) => chooseStreet(branch, event.target.value)} className="mt-1 w-full rounded-xl border bg-white p-2.5 text-xs"><option value="">اختر الشارع</option>{city?.streets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{city && city.streets.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800">لم تضف الإدارة شوارع لهذا الموقع بعد. اطلب من الإدارة إضافة الشوارع قبل حفظ الفرع.</p>}<label className="block text-xs font-bold">العنوان التفصيلي <span className="text-rose-500">*</span><div className="relative mt-1"><MapPin className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input required value={branch.addressDetail} onChange={(event) => updateBranch(branch.id, { addressDetail: event.target.value })} placeholder="رقم المبنى، الحي، معلم قريب" className="w-full rounded-xl border bg-white py-2.5 pr-10 pl-3 text-sm" /></div></label>{index === 0 && <p className="text-[10px] text-slate-500">سيتم استخدام عنوان الفرع الافتراضي في بيانات الحساب والطلبات.</p>}</article>; })}
      </div>
      <label className="block text-xs font-bold text-slate-700">رقم الجوال / الواتساب <span className="text-rose-500">*</span><div className="relative mt-1"><Phone className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05XXXXXXXX" className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-10 text-sm" dir="ltr" /></div><small className="mt-1 block text-[11px] font-normal text-slate-400">أدخل رقماً محلياً يبدأ بـ 05 ويتكون من 10 أرقام.</small></label>
      <div className="flex items-center justify-end gap-3 pt-3"><button type="button" onClick={() => navigate('/app/home')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">إلغاء</button><button type="submit" disabled={saving || catalog.length === 0} className="flex items-center gap-2 rounded-xl bg-[#0f9d7a] px-6 py-2.5 text-xs font-bold text-white shadow-sm disabled:opacity-50"><CheckCircle className="h-4 w-4" />{saving ? 'جاري الحفظ...' : isFirstTime ? 'حفظ ومتابعة للمنصة' : 'حفظ التعديلات'}</button></div>
    </form>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-sm font-bold text-slate-900">المصادقة بواسطة حساب Google المعتمد</h3><p className="mt-2 text-xs leading-6 text-slate-500">تم تسجيل الدخول عبر خدمة Google بأمان (<span dir="ltr">{user?.email}</span>). لا يتطلب حسابك كلمة مرور خاصة بالتطبيق.</p></section>
  </div>;
};
