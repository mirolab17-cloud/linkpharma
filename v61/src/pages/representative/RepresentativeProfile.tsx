import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarDays, FileSpreadsheet, UserRound, Unlink } from 'lucide-react';
import { getSuppliers } from '../../services/dataStorage';
import { detachRepresentativeFromSupplier } from '../../services/representatives';
import { Supplier } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { PWAInstallCard } from '../../components/PWAInstallCard';
import { getSystemSettings } from '../../services/dataStorage';
import { getLocationCatalog } from '../../utils/gaza';
import { LocationGovernorate } from '../../types';

export const RepresentativeProfile: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const navigate = useNavigate();
  const { success, error } = useToastStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [catalog, setCatalog] = useState<LocationGovernorate[]>([]);
  const [governorateId, setGovernorateId] = useState(user?.governorateId || '');
  const [cityId, setCityId] = useState(user?.cityId || '');
  const [subareaId, setSubareaId] = useState(user?.subareaId || '');
  const [saving, setSaving] = useState(false);
  const [detaching, setDetaching] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setGovernorateId(user?.governorateId || '');
    setCityId(user?.cityId || '');
    setSubareaId(user?.subareaId || '');
    if (user?.supplierId) getSuppliers().then((items) => setSupplier(items.find((item) => item.id === user.supplierId) || null)).catch(() => setSupplier(null));
    getSystemSettings().then((settings) => {
      const next = getLocationCatalog(settings.locationCatalog, settings.gazaLocations);
      setCatalog(next);
      const region = next.find((item) => item.id === (user?.governorateId || '') || item.name === user?.governorate);
      const city = region?.cities.find((item) => item.id === (user?.cityId || '') || item.name === user?.city);
      setGovernorateId(region?.id || '');
      setCityId(city?.id || '');
      setSubareaId(city?.subareas?.find((item) => item.id === user?.subareaId || item.name === user?.subarea)?.id || '');
    }).catch(() => setCatalog([]));
  }, [user?.supplierId, user?.name, user?.phone]);

  if (!user || user.role !== 'representative') return null;
  const permissions = user.representativePermissions;
  const save = async () => {
    if (!name.trim()) { error('أدخل اسم المندوب.'); return; }
    const region = catalog.find((item) => item.id === governorateId);
    const city = region?.cities.find((item) => item.id === cityId);
    const area = city?.subareas?.find((item) => item.id === subareaId);
    setSaving(true);
    const ok = await updateUserProfile({ name: name.trim(), phone: phone.trim(), governorateId: region?.id || '', governorate: region?.name || '', cityId: city?.id || '', city: city?.name || '', subareaId: area?.id || '', subarea: area?.name || '' });
    setSaving(false);
    if (ok) success('تم تحديث بيانات المندوب.');
  };
  const selectedGovernorate = catalog.find((item) => item.id === governorateId);
  const selectedCity = selectedGovernorate?.cities.find((item) => item.id === cityId);
  const subareas = selectedCity?.subareas || [];
  const chooseGovernorate = (id: string) => { setGovernorateId(id); setCityId(''); setSubareaId(''); };
  const chooseCity = (id: string) => { setCityId(id); setSubareaId(''); };
  const detach = async () => {
    if (!window.confirm('سيتم فك ربطك بالمستودع وتحويل حسابك إلى حساب صيدلية. هل تريد المتابعة؟')) return;
    setDetaching(true);
    try {
      await detachRepresentativeFromSupplier();
      success('تم فك الربط. سيتم فتح مساحة الصيدلية الآن.');
      window.location.hash = '#/app/home';
      window.location.reload();
    } catch (e: any) { error(e.message || 'تعذر فك الارتباط.'); setDetaching(false); }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28 sm:p-8" dir="rtl">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-800 to-teal-700 p-6 text-white shadow-sm sm:p-8"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><UserRound className="h-6 w-6" /></div><div><h1 className="text-xl font-black">ملف المندوب</h1><p className="mt-1 text-xs text-emerald-50">عدّل بيانات التواصل، وراجع ارتباطك وصلاحياتك.</p></div></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">بيانات قابلة للتعديل</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">الاسم<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-xl border p-3 font-normal" /></label><label className="text-xs font-bold text-slate-700">الهاتف<input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="mt-1.5 w-full rounded-xl border p-3 font-normal" /></label><label className="text-xs font-bold">المحافظة<select value={governorateId} onChange={(e) => chooseGovernorate(e.target.value)} className="mt-1.5 w-full rounded-xl border p-3 font-normal"><option value="">اختر المحافظة</option>{catalog.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label><label className="text-xs font-bold">المدينة<select value={cityId} disabled={!selectedGovernorate} onChange={(e) => chooseCity(e.target.value)} className="mt-1.5 w-full rounded-xl border p-3 font-normal"><option value="">اختر المدينة</option>{selectedGovernorate?.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>{subareas.length > 0 && <label className="text-xs font-bold sm:col-span-2">المنطقة <span className="font-normal text-slate-400">(اختياري)</span><select value={subareaId} onChange={(e) => setSubareaId(e.target.value)} className="mt-1.5 w-full rounded-xl border p-3 font-normal"><option value="">بدون منطقة فرعية</option>{subareas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>}<label className="text-xs font-bold text-slate-500 sm:col-span-2">البريد الإلكتروني<input value={user.email} disabled dir="ltr" className="mt-1.5 w-full rounded-xl border bg-slate-50 p-3 font-normal" /></label></div><button onClick={() => void save()} disabled={saving} className="mt-4 rounded-xl bg-[#0f9d7a] px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? 'جاري الحفظ...' : 'حفظ البيانات'}</button></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Building2 className="h-4 w-4 text-[#0f9d7a]" />الارتباط الحالي</h2><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-800">{supplier?.name || 'لا يوجد مستودع مرتبط'}</p><div className="mt-4 flex flex-wrap gap-2">{permissions?.managePrices && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-800"><FileSpreadsheet className="ml-1 inline h-3.5 w-3.5" />رفع الأسعار</span>}{permissions?.managePromotions && <span className="rounded-full bg-sky-100 px-3 py-1.5 text-[11px] font-bold text-sky-800">إدارة العروض</span>}{permissions?.manageDeliverySchedule && <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-800"><CalendarDays className="ml-1 inline h-3.5 w-3.5" />جدول التوصيل</span>}</div><button onClick={() => void detach()} disabled={detaching} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 disabled:opacity-50"><Unlink className="h-4 w-4" />{detaching ? 'جاري فك الربط...' : 'فك الارتباط بالمستودع'}</button><p className="mt-2 text-[11px] text-slate-500">فك الربط يلغي صلاحيات المستودع ويعيد الحساب إلى مساحة الصيدلية، ولا يحذف الحساب.</p></section>
      <PWAInstallCard />
      <button onClick={() => navigate('/app/representative')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">فتح مساحة العمل</button>
    </div>
  );
};
