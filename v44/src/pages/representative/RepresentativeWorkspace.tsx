import React, { useEffect, useMemo, useState } from 'react';
import { BadgePercent, CalendarDays, FileSpreadsheet, ShieldCheck, Truck } from 'lucide-react';
import { getSuppliers } from '../../services/dataStorage';
import { updateRepresentativeDeliverySchedule } from '../../services/representatives';
import { Supplier } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { ImportPrices } from '../admin/ImportPrices';
import { OffersManager } from '../../components/OffersManager';
import { SupplierOrdersMap } from './SupplierOrdersMap';
import { SupplierCatalog } from './SupplierCatalog';
import { PriceBatchHistory } from './PriceBatchHistory';

export const RepresentativeWorkspace: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleMap, setScheduleMap] = useState<Record<string, string[]>>({});
  const [newArea, setNewArea] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'prices' | 'offers' | 'delivery' | 'orders' | 'catalog' | 'history'>(() => user?.representativePermissions?.managePrices ? 'prices' : 'delivery');
  const { success, error } = useToastStore();

  useEffect(() => {
    if (!user?.supplierId) { setLoading(false); return; }
    getSuppliers().then((suppliers) => {
      const linked = suppliers.find((item) => item.id === user.supplierId) || null;
      setSupplier(linked);
      setScheduleMap(linked?.deliveryDaysByArea || {});
      setScheduleText(Object.entries(linked?.deliveryDaysByArea || {}).map(([area, days]) => `${area} | ${days.join(', ')} | ${linked?.deliveryCutoffByArea?.[area] || ''} | ${linked?.minimumOrderByArea?.[area] ?? ''}`).join('\n'));
    }).catch((e: any) => error(e.message || 'تعذر تحميل بيانات المستودع.')).finally(() => setLoading(false));
  }, [user?.supplierId]);

  const permissions = user?.representativePermissions;
  const parsedSchedule = useMemo(() => {
    const result: Record<string, string[]> = {};
    scheduleText.split('\n').forEach((line) => {
      const [areaRaw, daysRaw] = line.split('|');
      const area = areaRaw?.trim();
      const days = daysRaw?.split(/[,،]/).map((day) => day.trim()).filter(Boolean) || [];
      if (area && days.length) result[area] = days;
    });
    return result;
  }, [scheduleText]);

  const parsedScheduleDetails = useMemo(() => {
    const cutoffs: Record<string, string> = {};
    const minimums: Record<string, number> = {};
    scheduleText.split('\n').forEach((line) => {
      const [areaRaw, , cutoffRaw, minimumRaw] = line.split('|');
      const area = areaRaw?.trim();
      const cutoff = cutoffRaw?.trim() || '';
      const minimum = Number(minimumRaw?.trim());
      if (area && /^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) cutoffs[area] = cutoff;
      if (area && minimumRaw?.trim() && Number.isFinite(minimum) && minimum >= 0) minimums[area] = minimum;
    });
    return { cutoffs, minimums };
  }, [scheduleText]);

  const saveSchedule = async () => {
    if (!supplier || !Object.keys(scheduleMap).some((area) => scheduleMap[area].length)) { error('اختر يوماً واحداً على الأقل لمنطقة واحدة.'); return; }
    setSaving(true);
    try {
      await updateRepresentativeDeliverySchedule(supplier, scheduleMap, parsedScheduleDetails.cutoffs, parsedScheduleDetails.minimums);
      setSupplier({ ...supplier, deliveryDaysByArea: scheduleMap, deliveryCutoffByArea: parsedScheduleDetails.cutoffs, minimumOrderByArea: parsedScheduleDetails.minimums });
      success(`تم حفظ جدول ${supplier.name} مع تسجيل اسم المنفذ والتوقيت.`);
    } catch (e: any) {
      error(e.message || 'تعذر حفظ جدول التوصيل.');
    } finally { setSaving(false); }
  };

  if (!user || user.role !== 'representative') return null;
  if (loading) return <div className="max-w-5xl mx-auto p-8 text-center text-sm text-slate-500">جاري تحميل مساحة عمل المندوب...</div>;
  if (!supplier) return <div className="max-w-3xl mx-auto m-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">لا يوجد مستودع نشط مرتبط بهذا الحساب. تواصل مع الإدارة لمراجعة الربط.</div>;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-5" dir="rtl">
      <header className="rounded-3xl bg-gradient-to-br from-emerald-800 to-teal-700 text-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold"><ShieldCheck className="w-4 h-4" />مساحة مندوب المستودع</div>
        <h1 className="text-2xl font-black mt-2">{supplier.name}</h1>
        <p className="text-xs sm:text-sm text-emerald-50 mt-2">مرحبًا {user.name}. تظهر هنا أدوات المستودع المرتبط فقط؛ وكل تغيير مسجل باسم الحساب.</p>
        <div className="mt-4 flex flex-wrap gap-2">{permissions?.managePrices && <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px]">رفع الأسعار Excel</span>}{permissions?.managePromotions && <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px]">العروض والبونص</span>}{permissions?.manageDeliverySchedule && <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px]">جدول التوصيل</span>}</div>
      </header>

      <div className="flex flex-wrap gap-2">
        {permissions?.managePrices && <button onClick={() => setTab('prices')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'prices' ? 'bg-[#0f9d7a] text-white' : 'bg-white text-slate-700 border border-slate-200'}`}><FileSpreadsheet className="w-4 h-4" />رفع الأسعار والعروض</button>}
        {permissions?.managePromotions && <button onClick={() => setTab('offers')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'offers' ? 'bg-[#0f9d7a] text-white' : 'bg-white text-slate-700 border border-slate-200'}`}><BadgePercent className="w-4 h-4" />إدارة العروض</button>}
        {permissions?.manageDeliverySchedule && <button onClick={() => setTab('delivery')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'delivery' ? 'bg-[#0f9d7a] text-white' : 'bg-white text-slate-700 border border-slate-200'}`}><CalendarDays className="w-4 h-4" />أيام التوصيل حسب المنطقة</button>}
        <button onClick={() => setTab('orders')} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'orders' ? 'bg-[#0f9d7a] text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>خريطة الطلبات</button>
        <button onClick={() => setTab('catalog')} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'catalog' ? 'bg-[#0f9d7a] text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>أصناف المستودع</button>
        <button onClick={() => setTab('history')} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'history' ? 'bg-[#0f9d7a] text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>سجل الحركات</button>
      </div>

      {tab === 'prices' && permissions?.managePrices && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5 overflow-hidden">
          {permissions.managePromotions ? <p className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-900">يمكن أن يتضمن ملف Excel عمود البونص/العرض. سيُسجل كل تعديل سعر أو عرض باسمك وتوقيته في سجل الأسعار.</p> : <p className="mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">صلاحية العروض غير ممنوحة؛ ستبقى قيم البونص الحالية كما هي.</p>}
          <ImportPrices />
        </section>
      )}

      {tab === 'offers' && permissions?.managePromotions && <OffersManager lockedSupplierId={supplier.id} />}

      {tab === 'orders' && <SupplierOrdersMap />}
      {tab === 'catalog' && <SupplierCatalog />}
      {tab === 'history' && <PriceBatchHistory />}

      {tab === 'delivery' && permissions?.manageDeliverySchedule && (
        <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-[#0f9d7a]"><Truck className="w-5 h-5" /></div><div><h2 className="font-black text-slate-900">جدول التوصيل حسب المنطقة</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">حدد أيام التوصيل بمربعات اختيار؛ لا حاجة لكتابة الأيام. يمكن إبقاء وقت الإغلاق والحد الأدنى في السطر القديم إن كان محفوظاً.</p></div></div>
          <div className="flex gap-2"><input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="أضف محافظة أو مدينة" className="flex-1 rounded-xl border p-3 text-xs" /><button onClick={() => { const area = newArea.trim(); if (area) { setScheduleMap((old) => ({ ...old, [area]: old[area] || [] })); setNewArea(''); } }} className="rounded-xl bg-slate-900 px-4 text-xs font-black text-white">إضافة</button></div>
          <div className="space-y-3">{Object.keys(scheduleMap).map((area) => <div key={area} className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><b className="text-sm">{area}</b><button onClick={() => setScheduleMap((old) => { const next = { ...old }; delete next[area]; return next; })} className="text-[11px] font-bold text-rose-600">حذف المنطقة</button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map((day) => <label key={day} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs"><input type="checkbox" checked={(scheduleMap[area] || []).includes(day)} onChange={() => setScheduleMap((old) => ({ ...old, [area]: (old[area] || []).includes(day) ? old[area].filter((item) => item !== day) : [...(old[area] || []), day] }))} />{day}</label>)}</div></div>)}{!Object.keys(scheduleMap).length && <p className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">أضف منطقة ثم اختر أيامها.</p>}</div>
          <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-slate-500">المناطق المعرفة: {Object.keys(scheduleMap).length}</span><button onClick={() => void saveSchedule()} disabled={saving || !Object.keys(scheduleMap).some((area) => scheduleMap[area].length)} className="rounded-xl bg-[#0f9d7a] px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? 'جاري الحفظ...' : 'حفظ جدول التوصيل'}</button></div>
        </section>
      )}

      {!permissions?.managePrices && !permissions?.managePromotions && !permissions?.manageDeliverySchedule && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">لم يمنح هذا الحساب أدوات تشغيل بعد. تواصل مع الإدارة لإسناد صلاحيات مناسبة للمستودع.</div>}
    </div>
  );
};
