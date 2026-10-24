import React, { useEffect, useState } from 'react';
import { Building2, Clock3, Send, ShieldCheck } from 'lucide-react';
import { getSuppliers } from '../services/dataStorage';
import { getMyWarehouseLinkRequest, submitWarehouseLinkRequest } from '../services/representatives';
import { Supplier, WarehouseLinkRequest } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { useToastStore } from '../store/useToastStore';

export const RepresentativeRequestCard: React.FC = () => {
  const { user } = useAuthStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [request, setRequest] = useState<WarehouseLinkRequest | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'pharmacy') return;
    Promise.all([getSuppliers(), getMyWarehouseLinkRequest(user.uid)])
      .then(([allSuppliers, currentRequest]) => {
        const active = allSuppliers.filter((supplier) => supplier.status === 'active');
        setSuppliers(active);
        setRequest(currentRequest);
        setSupplierId(currentRequest?.supplierId || active[0]?.id || '');
        setPhone(user.phone || currentRequest?.phone || '');
        setNote(currentRequest?.status === 'rejected' ? currentRequest.note || '' : '');
      })
      .catch((error: any) => useToastStore.getState().error(error.message || 'تعذر تحميل طلب الربط.'))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || user.role !== 'pharmacy') return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supplierId || !phone.trim()) {
      useToastStore.getState().error('اختر المستودع وأدخل رقم التواصل.');
      return;
    }
    setSaving(true);
    try {
      const submitted = await submitWarehouseLinkRequest({ supplierId, phone, note });
      setRequest(submitted);
      useToastStore.getState().success('تم إرسال طلب الربط. ستظهر الصلاحيات بعد مراجعة الإدارة والموافقة.');
    } catch (error: any) {
      useToastStore.getState().error(error.message || 'تعذر إرسال طلب الربط.');
    } finally {
      setSaving(false);
    }
  };

  const supplierName = suppliers.find((supplier) => supplier.id === request?.supplierId)?.name || request?.supplierId;

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7" dir="rtl">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
        <div>
          <h2 className="text-base font-black text-slate-900">طلب ربط حساب مندوب بمستودع</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">تحدد الإدارة المستودع والصلاحيات بعد التحقق. إرسال الطلب لا يمنح صلاحية رفع الأسعار أو تعديل العروض أو التوصيل.</p>
        </div>
      </div>

      {loading ? <div className="text-xs text-slate-500 py-3">جاري تحميل حالة الطلب...</div> : null}
      {request && (
        <div className={`mb-4 rounded-2xl border p-4 ${request.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-900' : request.status === 'rejected' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
          <div className="flex items-center gap-2 text-sm font-black"><Clock3 className="w-4 h-4" />{request.status === 'pending' ? 'طلبك قيد المراجعة' : request.status === 'rejected' ? 'تم رفض الطلب السابق' : request.status === 'approved' ? 'تمت الموافقة على الطلب' : 'تم إلغاء الربط'}</div>
          <p className="text-xs mt-1">المستودع: {supplierName || '—'} · تاريخ الطلب: {new Date(request.createdAt).toLocaleDateString('ar')}</p>
          {request.reviewNote && <p className="text-xs mt-1">ملاحظة الإدارة: {request.reviewNote}</p>}
          {request.status === 'approved' && request.permissions && <p className="text-xs mt-2 flex items-center gap-1"><ShieldCheck className="w-4 h-4" />الصلاحيات: {[request.permissions.managePrices && 'رفع الأسعار', request.permissions.managePromotions && 'إدارة العروض', request.permissions.manageDeliverySchedule && 'جدول التوصيل'].filter(Boolean).join('، ')}</p>}
        </div>
      )}

      {request?.status !== 'pending' && request?.status !== 'approved' && (
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">المستودع الذي تمثله
            <select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white">
              <option value="">اختر مستودعًا</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">رقم الجوال أو واتساب
            <input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="رقم التواصل" className="w-full px-3 py-2.5 rounded-xl border border-slate-300" dir="ltr" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">معلومات تساعد الإدارة على التحقق (اختياري)
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="اسم الشركة أو الفرع أو أي توضيح" className="w-full px-3 py-2.5 rounded-xl border border-slate-300 resize-y" />
          </label>
          <button disabled={saving || loading || suppliers.length === 0} className="justify-self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0f9d7a] text-white text-xs font-black hover:bg-[#0b7a5e] disabled:opacity-50"><Send className="w-4 h-4" />{saving ? 'جاري إرسال الطلب...' : 'إرسال طلب الربط'}</button>
        </form>
      )}
    </section>
  );
};
