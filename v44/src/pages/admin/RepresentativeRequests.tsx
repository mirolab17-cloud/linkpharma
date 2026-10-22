import React, { useEffect, useState } from 'react';
import { BadgeCheck, Check, Clock3, RefreshCw, Shield, ShieldCheck, UserRound, X } from 'lucide-react';
import { getSuppliers } from '../../services/dataStorage';
import { decideWarehouseLinkRequest, getWarehouseLinkRequests, updateRepresentativePermissions } from '../../services/representatives';
import { RepresentativePermissions, Supplier, WarehouseLinkRequest } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { formatGregorianDateTime } from '../../utils/formatDate';

const emptyPermissions: RepresentativePermissions = { managePrices: false, managePromotions: false, manageDeliverySchedule: false };

export const RepresentativeRequests: React.FC = () => {
  const [requests, setRequests] = useState<WarehouseLinkRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [permissions, setPermissions] = useState<Record<string, RepresentativePermissions>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { success, error } = useToastStore();

  const load = async () => {
    setLoading(true);
    try {
      const [allRequests, allSuppliers] = await Promise.all([getWarehouseLinkRequests(), getSuppliers()]);
      setRequests(allRequests);
      setSuppliers(allSuppliers);
      setPermissions(Object.fromEntries(allRequests.map((request) => [request.id, request.permissions || { ...emptyPermissions }])));
    } catch (e: any) {
      error(e.message || 'تعذر تحميل طلبات المندوبين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const supplierName = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name || id;
  const patchPermissions = (id: string, key: keyof RepresentativePermissions, value: boolean) => {
    setPermissions((current) => ({ ...current, [id]: { ...(current[id] || emptyPermissions), [key]: value } }));
  };

  const decide = async (request: WarehouseLinkRequest, decision: 'approved' | 'rejected' | 'revoked') => {
    if (decision === 'revoked' && !window.confirm(`إلغاء ربط ${request.userName} وإزالة صلاحياته؟`)) return;
    setBusyId(request.id);
    try {
      const supplier = suppliers.find((item) => item.id === request.supplierId);
      await decideWarehouseLinkRequest({
        request,
        decision,
        supplier,
        permissions: permissions[request.id] || { ...emptyPermissions },
        reviewNote: notes[request.id] || '',
      });
      success(decision === 'approved' ? 'تم قبول الطلب وربط الحساب بالصلاحيات المحددة.' : decision === 'rejected' ? 'تم رفض الطلب.' : 'تم إلغاء الربط وإزالة صلاحيات المندوب.');
      await load();
    } catch (e: any) {
      error(e.message || 'تعذر حفظ القرار.');
    } finally {
      setBusyId(null);
    }
  };

  const savePermissions = async (request: WarehouseLinkRequest) => {
    setBusyId(request.id);
    try {
      await updateRepresentativePermissions({ request, permissions: permissions[request.id] || { ...emptyPermissions }, reviewNote: notes[request.id] || '' });
      success('تم تحديث صلاحيات المندوب فوراً وتسجيل المدير المنفذ.');
      await load();
    } catch (e: any) { error(e.message || 'تعذر تحديث الصلاحيات.'); }
    finally { setBusyId(null); }
  };

  const pending = requests.filter((request) => request.status === 'pending');
  const history = requests.filter((request) => request.status !== 'pending');

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-[#0f9d7a]" />طلبات ربط مندوبي المستودعات</h1>
          <p className="text-sm text-slate-500 mt-1">اختر الصلاحيات على حدة. يقتصر كل مندوب على مستودع واحد، وتظل إدارة الكتالوج والحسابات للمشرف.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />تحديث</button>
      </header>

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">جاري تحميل الطلبات...</div> : pending.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">لا توجد طلبات قيد المراجعة حاليًا.</div> : (
        <div className="space-y-4">
          {pending.map((request) => {
            const selected = permissions[request.id] || emptyPermissions;
            const canApprove = true;
            return (
              <article key={request.id} className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-900 font-black"><UserRound className="w-4 h-4 text-[#0f9d7a]" />{request.userName}</div>
                    <p className="text-xs text-slate-600 mt-1" dir="ltr">{request.userEmail}</p>
                    <p className="text-xs text-slate-600 mt-1">هاتف: {request.phone || '—'} · المستودع المطلوب: <b>{supplierName(request.supplierId)}</b></p>
                    <p className="text-[11px] text-slate-400 mt-1">تاريخ الطلب: {formatGregorianDateTime(request.createdAt)}</p>
                    {request.note && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">ملاحظة المستخدم: {request.note}</p>}
                  </div>
                  <span className="rounded-full px-3 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />قيد المراجعة</span>
                </div>
                <div className="p-5 grid md:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <h2 className="text-sm font-black text-slate-800">الصلاحيات المطلوب منحها</h2>
                    <label className="flex gap-3 items-start text-xs text-slate-700"><input type="checkbox" checked={selected.managePrices} onChange={(e) => patchPermissions(request.id, 'managePrices', e.target.checked)} className="mt-0.5 accent-emerald-600" /><span><b>رفع أسعار Excel</b><small className="block mt-0.5 text-slate-500">للمستودع المرتبط فقط، دون إنشاء أصناف جديدة أو تراجع عن دفعات الإدارة.</small></span></label>
                    <label className="flex gap-3 items-start text-xs text-slate-700"><input type="checkbox" checked={selected.managePromotions} onChange={(e) => patchPermissions(request.id, 'managePromotions', e.target.checked)} className="mt-0.5 accent-emerald-600" /><span><b>إدارة صفحة العروض والبونص</b><small className="block mt-0.5 text-slate-500">تتيح صفحة العروض المستقلة لهذا المستودع فقط، دون منح صلاحية رفع الأسعار.</small></span></label>
                    <label className="flex gap-3 items-start text-xs text-slate-700"><input type="checkbox" checked={selected.manageDeliverySchedule} onChange={(e) => patchPermissions(request.id, 'manageDeliverySchedule', e.target.checked)} className="mt-0.5 accent-emerald-600" /><span><b>تعديل جدول التوصيل حسب المنطقة</b><small className="block mt-0.5 text-slate-500">لا تسمح بتعديل رقم المستودع أو بياناته أو جدول مستودع آخر.</small></span></label>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700">ملاحظة مراجعة (اختياري)<textarea rows={3} maxLength={500} value={notes[request.id] || ''} onChange={(e) => setNotes((current) => ({ ...current, [request.id]: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busyId === request.id || !canApprove} onClick={() => void decide(request, 'approved')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f9d7a] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><Check className="w-4 h-4" />{busyId === request.id ? 'جاري الحفظ...' : 'موافقة وربط'}</button>
                      <button disabled={busyId === request.id} onClick={() => void decide(request, 'rejected')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 disabled:opacity-50"><X className="w-4 h-4" />رفض الطلب</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-slate-500" /><h2 className="text-sm font-black text-slate-800">سجل الطلبات السابقة والروابط النشطة ({history.length})</h2></div>
        {history.length === 0 ? <p className="p-5 text-xs text-slate-500">لا توجد سجلات بعد.</p> : <div className="divide-y divide-slate-100">{history.map((request) => <div key={request.id} className="p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-xs"><b className="text-slate-800">{request.userName}</b><span className="text-slate-500"> · {supplierName(request.supplierId)} · {formatGregorianDateTime(request.reviewedAt || request.createdAt)}</span><span className={`mr-2 rounded-full px-2 py-1 text-[10px] font-bold ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'revoked' ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-700'}`}>{request.status === 'approved' ? 'مرتبط' : request.status === 'revoked' ? 'ملغى' : 'مرفوض'}</span><div className="mt-1 text-[10px] text-slate-500">آخر مدير: {request.reviewedByName || '—'} · الصلاحيات الحالية: {[request.permissions?.managePrices && 'الأسعار', request.permissions?.managePromotions && 'العروض', request.permissions?.manageDeliverySchedule && 'التوصيل'].filter(Boolean).join('، ') || '—'}</div></div>{request.status === 'approved' && <button disabled={busyId === request.id} onClick={() => void decide(request, 'revoked')} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700 disabled:opacity-50"><Shield className="h-3.5 w-3.5" />فك الربط</button>}</div>{request.status === 'approved' && <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"><p className="mb-2 text-[11px] font-black text-emerald-900">تعديل الصلاحيات بعد القبول</p><div className="flex flex-wrap gap-3 text-[11px] text-slate-700"><label><input type="checkbox" checked={permissions[request.id]?.managePrices || false} onChange={(e) => patchPermissions(request.id, 'managePrices', e.target.checked)} className="ml-1 accent-emerald-600" />الأسعار</label><label><input type="checkbox" checked={permissions[request.id]?.managePromotions || false} onChange={(e) => patchPermissions(request.id, 'managePromotions', e.target.checked)} className="ml-1 accent-emerald-600" />العروض</label><label><input type="checkbox" checked={permissions[request.id]?.manageDeliverySchedule || false} onChange={(e) => patchPermissions(request.id, 'manageDeliverySchedule', e.target.checked)} className="ml-1 accent-emerald-600" />التوصيل</label></div><button disabled={busyId === request.id} onClick={() => void savePermissions(request)} className="mt-3 rounded-lg bg-[#0f9d7a] px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">{busyId === request.id ? 'جاري الحفظ...' : 'حفظ الصلاحيات الجديدة'}</button></div>}</div>)}</div>}
      </section>
    </div>
  );
};
