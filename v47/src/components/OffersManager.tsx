import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgePercent, CalendarClock, Package, PauseCircle, PlayCircle, Plus, RefreshCw, Save, Tag, Trash2, Truck } from 'lucide-react';
import { getSuppliers } from '../services/dataStorage';
import { deleteSupplierOffer, listSupplierOffers, saveSupplierOffer, SupplierOffer } from '../services/offers';
import { Supplier } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { useToastStore } from '../store/useToastStore';
import { Spinner } from './Loader';

const dateTimeInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const toInputDate = (value: string) => dateTimeInput(new Date(value));
const initialStart = dateTimeInput(new Date());
const initialEnd = dateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

export const OffersManager: React.FC<{ lockedSupplierId?: string }> = ({ lockedSupplierId }) => {
  const actor = useAuthStore((state) => state.user);
  const { success, error } = useToastStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [supplierFilter, setSupplierFilter] = useState(lockedSupplierId || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SupplierOffer | null>(null);
  const [title, setTitle] = useState('');
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [quantityLimit, setQuantityLimit] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'paused'>('active');

  const isAdmin = actor?.role === 'admin';
  const isRepresentative = actor?.role === 'representative';
  const allowed = isAdmin || (isRepresentative && !!actor?.representativePermissions?.managePromotions);
  const effectiveSupplierId = lockedSupplierId || (isRepresentative ? actor?.supplierId || '' : supplierFilter);
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [supplierRows, offerRows] = await Promise.all([
        getSuppliers(),
        listSupplierOffers(effectiveSupplierId || undefined),
      ]);
      setSuppliers(supplierRows);
      setOffers(offerRows);
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'تعذر تحميل العروض.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSupplierId, error]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setProductName('');
    setDescription('');
    setStartsAt(dateTimeInput(new Date()));
    setEndsAt(dateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    setQuantityLimit('');
    setFormStatus('active');
  };

  const beginEdit = (offer: SupplierOffer) => {
    setEditing(offer);
    setSupplierFilter(offer.supplierId);
    setTitle(offer.title);
    setProductName(offer.productName);
    setDescription(offer.description || '');
    setStartsAt(toInputDate(offer.startsAt));
    setEndsAt(toInputDate(offer.endsAt));
    setQuantityLimit(offer.quantityLimit ? String(offer.quantityLimit) : '');
    setFormStatus(offer.status);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const supplierId = lockedSupplierId || (isRepresentative ? actor?.supplierId : supplierFilter);
    if (!supplierId) { error('اختر المستودع أولًا.'); return; }
    const quantity = quantityLimit.trim() ? Number(quantityLimit) : undefined;
    setSaving(true);
    try {
      await saveSupplierOffer({
        ...(editing ? { id: editing.id } : {}),
        supplierId,
        title,
        productName,
        description,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ...(quantity === undefined ? {} : { quantityLimit: quantity }),
        status: formStatus,
        ...(editing ? { createdAt: editing.createdAt, createdByUid: editing.createdByUid, createdByName: editing.createdByName } : {}),
      });
      success(editing ? 'تم تحديث العرض.' : 'تم حفظ العرض.');
      resetForm();
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'تعذر حفظ العرض.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (offer: SupplierOffer) => {
    try {
      await saveSupplierOffer({ ...offer, status: offer.status === 'active' ? 'paused' : 'active' });
      success(offer.status === 'active' ? 'تم إيقاف العرض مؤقتًا.' : 'تم تفعيل العرض.');
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'تعذر تغيير حالة العرض.');
    }
  };

  const remove = async (offer: SupplierOffer) => {
    if (!window.confirm(`حذف العرض «${offer.title}»؟`)) return;
    try {
      await deleteSupplierOffer(offer.id, offer.supplierId);
      success('تم حذف العرض.');
      if (editing?.id === offer.id) resetForm();
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'تعذر حذف العرض.');
    }
  };

  const offerState = (offer: SupplierOffer) => {
    const now = Date.now();
    if (offer.status === 'paused') return { label: 'متوقف مؤقتًا', style: 'bg-slate-100 text-slate-600' };
    if (new Date(offer.startsAt).getTime() > now) return { label: 'مجدول', style: 'bg-sky-100 text-sky-700' };
    if (new Date(offer.endsAt).getTime() < now) return { label: 'منتهٍ', style: 'bg-rose-100 text-rose-700' };
    return { label: 'نشط', style: 'bg-emerald-100 text-emerald-700' };
  };

  if (!allowed) return <div className={`${card} text-sm text-amber-900 bg-amber-50`}>صلاحية إدارة العروض غير ممنوحة لهذا الحساب. اطلب من المدير تفعيلها من إدارة طلبات المندوبين.</div>;
  if (loading && suppliers.length === 0) return <div className="py-16 flex justify-center"><Spinner text="تحميل العروض..." /></div>;

  return <div className="space-y-5" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-br from-emerald-800 to-teal-700 p-5 sm:p-7 text-white shadow-sm">
      <div><p className="flex items-center gap-2 text-xs font-bold text-emerald-100"><BadgePercent className="h-4 w-4" />عروض المستودعات</p><h1 className="mt-2 text-2xl font-black">إدارة العروض</h1><p className="mt-2 text-xs leading-6 text-emerald-50">سجّل عرضًا مستقلًا بمدة صلاحية وكمية اختيارية. يستطيع المندوب إدارة مستودعه فقط إذا منحه المدير صلاحية العروض.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/20 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />تحديث</button>
    </header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={(event) => void submit(event)} className={`${card} space-y-4`}>
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">{editing ? 'تعديل العرض' : 'إضافة عرض'}</h2><p className="mt-1 text-xs text-slate-500">الحقول المطلوبة: المستودع، العنوان، الصنف، والتاريخان.</p></div>{editing && <button type="button" onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-900">إلغاء التعديل</button>}</div>
        {isAdmin && !lockedSupplierId && <label className="block text-xs font-bold text-slate-700">المستودع<select required value={supplierFilter} onChange={(event) => { setSupplierFilter(event.target.value); if (editing && editing.supplierId !== event.target.value) resetForm(); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">اختر المستودع</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>}
        {lockedSupplierId && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900"><Truck className="ml-1 inline h-4 w-4" />{supplierMap.get(lockedSupplierId)?.name || 'المستودع المرتبط'} — لا يمكن تغيير نطاق المستودع.</div>}
        <label className="block text-xs font-bold text-slate-700">عنوان العرض<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: خصم خاص لنهاية الأسبوع" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium" /></label>
        <label className="block text-xs font-bold text-slate-700">اسم الصنف أو المجموعة<input required maxLength={120} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="مثال: أدوية الحساسية — مجموعة مختارة" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium" /></label>
        <label className="block text-xs font-bold text-slate-700">تفاصيل العرض<textarea maxLength={600} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="اكتب نسبة الخصم أو البونص وشروط الاستفادة." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium leading-6" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">يبدأ في<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-xs" /></label><label className="text-xs font-bold text-slate-700">ينتهي في<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-xs" /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">حد الكمية (اختياري)<input type="number" min="1" step="1" value={quantityLimit} onChange={(event) => setQuantityLimit(event.target.value)} placeholder="غير محدود" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-700">حالة العرض<select value={formStatus} onChange={(event) => setFormStatus(event.target.value as 'active' | 'paused')} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="active">مفعّل</option><option value="paused">متوقف مؤقتًا</option></select></label></div>
        <button type="submit" disabled={saving || (isAdmin && !lockedSupplierId && !supplierFilter)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0f9d7a] px-4 py-3 text-sm font-black text-white hover:bg-[#0b7a5e] disabled:cursor-not-allowed disabled:opacity-50">{editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة العرض'}</button>
      </form>

      <section className={`${card} min-h-72`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black text-slate-900">العروض المحفوظة <span className="text-xs text-slate-400">({offers.length})</span></h2><p className="mt-1 text-xs text-slate-500">يعرض النظام أحدث 200 عرض لتقليل القراءة من قاعدة البيانات.</p></div>{isAdmin && !lockedSupplierId && <select value={supplierFilter} onChange={(event) => { setSupplierFilter(event.target.value); resetForm(); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">كل المستودعات</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>}</div>
        {loading ? <div className="py-12 flex justify-center"><Spinner text="تحديث القائمة..." /></div> : offers.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500"><Tag className="mx-auto mb-2 h-6 w-6 text-slate-400" />لا توجد عروض مسجلة لهذا النطاق.</div> : <div className="space-y-3">{offers.map((offer) => { const state = offerState(offer); return <article key={offer.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{offer.title}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${state.style}`}>{state.label}</span></div><p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><Package className="h-3.5 w-3.5" />{offer.productName} · {supplierMap.get(offer.supplierId)?.name || offer.supplierId}</p>{offer.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{offer.description}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void toggleStatus(offer)} title={offer.status === 'active' ? 'إيقاف مؤقت' : 'تفعيل'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{offer.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}</button><button type="button" onClick={() => beginEdit(offer)} title="تعديل" className="rounded-lg px-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">تعديل</button><button type="button" onClick={() => void remove(offer)} title="حذف" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{new Date(offer.startsAt).toLocaleString('ar')} – {new Date(offer.endsAt).toLocaleString('ar')}</span><span>{offer.quantityLimit ? `الكمية القصوى: ${offer.quantityLimit}` : 'الكمية: غير محدودة'}</span><span>آخر تحديث: {offer.updatedByName}</span></div>
        </article>; })}</div>}
      </section>
    </div>
  </div>;
};
