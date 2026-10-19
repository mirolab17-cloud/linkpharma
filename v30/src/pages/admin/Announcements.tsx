import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Clock3, MapPin, Megaphone, RefreshCw, Send, Truck, Users } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getSuppliers, getUsers } from '../../services/dataStorage';
import { AnnouncementAudience, AnnouncementCampaign, AnnouncementPriority, getAnnouncementCampaigns, sendAnnouncementCampaign } from '../../services/announcements';
import { Supplier, UserProfile } from '../../types';
import { formatGregorianDateTime } from '../../utils/formatDate';
import { Spinner } from '../../components/Loader';

 type AudienceKind = AnnouncementAudience['kind'];
const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
const priorityLabels: Record<AnnouncementPriority, string> = { normal: 'عادي', high: 'هام', urgent: 'عاجل' };

export const Announcements: React.FC = () => {
  const actor = useAuthStore((state) => state.user);
  const { success, error } = useToastStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [campaigns, setCampaigns] = useState<AnnouncementCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('all_pharmacies');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [lastResult, setLastResult] = useState<AnnouncementCampaign | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRows, supplierRows, campaignRows] = await Promise.all([
        getUsers(), getSuppliers(), getAnnouncementCampaigns(),
      ]);
      setUsers(userRows);
      setSuppliers(supplierRows);
      setCampaigns(campaignRows);
    } catch (cause) {
      error('تعذر تحميل مركز الإعلانات: ' + (cause instanceof Error ? cause.message : ''));
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => { void loadData(); }, [loadData]);

  const activePharmacies = useMemo(
    () => users.filter((user) => user.role === 'pharmacy' && user.status === 'active'),
    [users],
  );
  const activeRepresentatives = useMemo(
    () => users.filter((user) => user.role === 'representative' && user.status === 'active' && !!user.supplierId),
    [users],
  );
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.status === 'active'), [suppliers]);
  const governorates = useMemo(() => [...new Set(activePharmacies.map((user) => user.governorate?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, 'ar')), [activePharmacies]);
  const cities = useMemo(() => [...new Set(activePharmacies.filter((user) => user.governorate?.trim() === governorate).map((user) => user.city?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, 'ar')), [activePharmacies, governorate]);

  useEffect(() => {
    if (audienceKind === 'pharmacy_area' && !governorate && governorates.length) setGovernorate(governorates[0]);
  }, [audienceKind, governorate, governorates]);
  useEffect(() => {
    if (supplierId && !activeSuppliers.some((supplier) => supplier.id === supplierId)) setSupplierId('');
  }, [activeSuppliers, supplierId]);

  const selectedSupplier = activeSuppliers.find((supplier) => supplier.id === supplierId);
  const recipients = useMemo(() => {
    if (audienceKind === 'all_pharmacies') return activePharmacies;
    if (audienceKind === 'pharmacy_area') {
      return activePharmacies.filter((user) => user.governorate?.trim() === governorate && (!city || user.city?.trim() === city));
    }
    return activeRepresentatives.filter((user) => user.supplierId === supplierId);
  }, [activePharmacies, activeRepresentatives, audienceKind, city, governorate, supplierId]);

  const audience: AnnouncementAudience = useMemo(() => {
    if (audienceKind === 'all_pharmacies') return { kind: 'all_pharmacies', label: 'جميع الصيدليات النشطة' };
    if (audienceKind === 'pharmacy_area') {
      const label = `صيدليات ${governorate || 'المنطقة غير المحددة'}${city ? ` · ${city}` : ''}`;
      return { kind: 'pharmacy_area', label, governorate: governorate || '', ...(city ? { city } : {}) };
    }
    const supplierName = selectedSupplier?.name || 'المستودع غير المحدد';
    return { kind: 'warehouse_representatives', label: `مندوبي ${supplierName}`, supplierId, supplierName };
  }, [audienceKind, city, governorate, selectedSupplier, supplierId]);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      error('أدخل عنوان الإشعار ونصه قبل الإرسال.');
      return;
    }
    if (recipients.length === 0) {
      error('لا توجد حسابات نشطة ضمن الجمهور المحدد.');
      return;
    }
    if (!actor?.uid) {
      error('تعذر تحديد حساب المدير الحالي.');
      return;
    }
    const actorName = actor.name || actor.email || 'مدير';
    const confirmed = window.confirm(`سيتم إرسال «${title.trim()}» إلى ${recipients.length} حسابًا (${audience.label}). ستسجل اللوحة عدد الإشعارات التي حُفظت بنجاح. هل تتابع؟`);
    if (!confirmed) return;

    setSending(true);
    setLastResult(null);
    try {
      const result = await sendAnnouncementCampaign({
        title: title.trim(), message: message.trim(), priority, audience,
        recipientUids: recipients.map((user) => user.uid),
        actorUid: actor.uid, actorName,
      });
      setLastResult(result);
      setTitle('');
      setMessage('');
      success(`وصل الإشعار إلى ${result.deliveredCount} حسابًا من أصل ${result.targetCount}.`);
      await loadData();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'تعذر إرسال الحملة.');
      await loadData();
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><Spinner text="تحميل مركز الإعلانات..." /></div>;

  return <div className="space-y-6 pb-12" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-br from-[#0f9d7a] to-[#073b4c] p-6 text-white shadow-xl">
      <div>
        <p className="text-xs font-bold text-emerald-100">التواصل الإداري · v25</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-black"><Megaphone className="h-6 w-6"/>مركز الإعلانات</h1>
        <p className="mt-2 text-sm text-white/80">وجّه الإشعارات حسب المنطقة أو مستودع محدد، وراجع عدد الحسابات التي وصلها كل إعلان.</p>
      </div>
      <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold hover:bg-white/20"><RefreshCw className="h-4 w-4"/>تحديث الحملات</button>
    </header>

    {lastResult && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/><div><b>اكتمل الإرسال.</b> حُفظت إشعارات لـ {lastResult.deliveredCount} حسابًا من أصل {lastResult.targetCount}.<span className="block text-xs mt-1">هذا الرقم يؤكد وصول الإشعار إلى صندوق الحساب داخل المنصة، ولا يعني أن المستخدم فتحه.</span></div>
    </div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <section className={`${card} space-y-5`}>
        <div><h2 className="text-lg font-black text-slate-900">إنشاء حملة جديدة</h2><p className="mt-1 text-xs text-slate-500">تُرسل نسخة شخصية لكل مستلم؛ لا يتحول الإشعار المستهدف إلى تعميم عام.</p></div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700">الجمهور المستهدف</label>
          <select value={audienceKind} onChange={(event) => setAudienceKind(event.target.value as AudienceKind)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold">
            <option value="all_pharmacies">جميع الصيدليات النشطة</option>
            <option value="pharmacy_area">صيدليات منطقة محددة</option>
            <option value="warehouse_representatives">مندوبي مستودع محدد</option>
          </select>
        </div>

        {audienceKind === 'pharmacy_area' && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">المحافظة<select value={governorate} onChange={(event) => { setGovernorate(event.target.value); setCity(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium"><option value="">اختر المحافظة</option>{governorates.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-700">المدينة (اختياري)<select value={city} onChange={(event) => setCity(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium"><option value="">كل مدن المحافظة</option>{cities.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>}

        {audienceKind === 'warehouse_representatives' && <label className="block text-xs font-bold text-slate-700">المستودع<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium"><option value="">اختر المستودع</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-500">سيصل الإشعار إلى حسابات المندوبين النشطة المرتبطة بهذا المستودع.</span></label>}

        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          {audienceKind === 'pharmacy_area' ? <MapPin className="h-5 w-5 text-emerald-700"/> : audienceKind === 'warehouse_representatives' ? <Truck className="h-5 w-5 text-emerald-700"/> : <Users className="h-5 w-5 text-emerald-700"/>}
          <div><b className="text-sm text-emerald-900">{recipients.length} حسابًا نشطًا</b><span className="block text-xs text-emerald-800">{audience.label}</span></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="text-xs font-bold text-slate-700">عنوان الإشعار<input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: تغيير موعد توصيل المنطقة" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium"/></label>
          <label className="text-xs font-bold text-slate-700">الأهمية<select value={priority} onChange={(event) => setPriority(event.target.value as AnnouncementPriority)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="normal">عادي</option><option value="high">هام</option><option value="urgent">عاجل</option></select></label>
        </div>
        <label className="block text-xs font-bold text-slate-700">نص الإشعار<textarea maxLength={1000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب الرسالة التي ستظهر في جرس الإشعارات..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium leading-6"/><span className="mt-1 block text-left text-[10px] font-normal text-slate-400">{message.length}/1000</span></label>

        <button onClick={() => void handleSend()} disabled={sending || !title.trim() || !message.trim() || recipients.length === 0 || (audienceKind === 'pharmacy_area' && !governorate) || (audienceKind === 'warehouse_representatives' && !supplierId)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0f9d7a] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0b7a5e] disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4"/>{sending ? `جارٍ الإرسال إلى ${recipients.length} حسابًا...` : `إرسال إلى ${recipients.length} حسابًا`}</button>
      </section>

      <aside className="space-y-4">
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><Building2 className="h-4 w-4 text-[#0f9d7a]"/>معاينة قبل الإرسال</h2>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-2"><div><span className="text-[10px] font-bold text-[#0f9d7a]">إدارة المنصة</span><h3 className="mt-1 text-sm font-black text-slate-900">{title.trim() || 'عنوان الإشعار سيظهر هنا'}</h3></div><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${priority === 'urgent' ? 'bg-rose-100 text-rose-700' : priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{priorityLabels[priority]}</span></div>
            <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{message.trim() || 'اكتب نص الرسالة لمعاينته بالشكل الذي سيظهر للمستلم.'}</p>
            <p className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-400">الآن · {audience.label}</p>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-[11px] leading-5 text-sky-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>العداد يسجل الإشعارات التي كُتبت بنجاح في Firestore. لا يُعدّ ذلك قياسًا لفتح الإشعار أو قراءته.</span></div>
        </section>
        <section className={`${card} flex items-center justify-between gap-3`}><div><p className="text-xs text-slate-500">الحملات المحفوظة</p><b className="text-2xl text-slate-900">{campaigns.length}</b></div><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Megaphone className="h-5 w-5"/></div></section>
      </aside>
    </div>

    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black text-slate-900">سجل الحملات</h2><p className="mt-1 text-xs text-slate-500">آخر 30 حملة، مع عدد الحسابات المستهدفة والإشعارات المحفوظة لكل حملة.</p></div><button onClick={() => void loadData()} className="rounded-xl border px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw className="ml-1 inline h-3.5 w-3.5"/>تحديث</button></div>
      {campaigns.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">لا توجد حملات إعلانية بعد.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">الحملة</th><th>الجمهور</th><th>المستهدف</th><th>وصل بنجاح</th><th>الحالة</th><th>المنشئ والوقت</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id} className="border-t align-top"><td className="p-3 font-bold text-slate-900">{campaign.title}<span className="mt-1 block max-w-sm truncate font-normal text-slate-500">{campaign.message}</span></td><td className="p-3">{campaign.audience?.label || '—'}</td><td className="p-3">{campaign.targetCount}</td><td className="p-3 font-black text-emerald-700">{campaign.deliveredCount}</td><td className="p-3">{campaign.status === 'sent' ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>مكتملة</span> : campaign.status === 'sending' ? <span className="inline-flex items-center gap-1 text-amber-700"><Clock3 className="h-3.5 w-3.5"/>جارٍ الإرسال</span> : <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle className="h-3.5 w-3.5"/>{campaign.status === 'partial' ? 'جزئية' : 'فشلت'}</span>}</td><td className="p-3">{campaign.createdByName}<span className="mt-1 block text-slate-500">{formatGregorianDateTime(campaign.createdAt)}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
};
