import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, RefreshCw, XCircle } from 'lucide-react';
import { AdminChangeApproval } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { getAdminChangeApprovals, reviewAdminChangeApproval } from '../../services/changeApprovals';
import { formatGregorianDateTime } from '../../utils/formatDate';
import { Spinner } from '../../components/Loader';

const statusLabel: Record<AdminChangeApproval['status'], string> = {
  pending: 'بانتظار المراجعة', processing: 'قيد التطبيق', approved: 'معتمد', rejected: 'مرفوض', failed: 'فشل التطبيق',
};

export const ChangeApprovals: React.FC = () => {
  const { user } = useAuthStore();
  const { success, error } = useToastStore();
  const [requests, setRequests] = useState<AdminChangeApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AdminChangeApproval['status']>('pending');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await getAdminChangeApprovals()); }
    catch (e: any) { error('تعذر تحميل طلبات الاعتماد: ' + (e?.message || '')); }
    finally { setLoading(false); }
  }, [error]);
  useEffect(() => { void load(); }, [load]);

  const review = async (item: AdminChangeApproval, decision: 'approved' | 'rejected') => {
    if (!user || item.requestedByUid === user.uid) return;
    const action = decision === 'approved' ? 'تطبيق التغيير الآن' : 'رفض الطلب';
    const detail = item.type === 'price_import' ? `${item.summary}\nسيتم حفظ الأسعار وتسجيل سجلها عند الموافقة.` : item.summary;
    if (!window.confirm(`هل تريد ${action}؟\n\n${detail}\n\nمقدم الطلب: ${item.requestedByName}`)) return;
    setWorkingId(item.id);
    try {
      await reviewAdminChangeApproval(item.id, decision, note.trim());
      success(decision === 'approved' ? 'تمت الموافقة وتطبيق التغيير.' : 'تم رفض الطلب.');
      setNote('');
      await load();
    } catch (e: any) { error('تعذر إتمام المراجعة: ' + (e?.message || '')); }
    finally { setWorkingId(null); }
  };

  const shown = requests.filter((item) => filter === 'all' || item.status === filter);
  const pendingCount = requests.filter((item) => item.status === 'pending').length;
  if (loading) return <div className="py-20 flex justify-center"><Spinner text="تحميل طلبات الاعتماد..." /></div>;

  return <div className="space-y-6 pb-12" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black text-slate-900">اعتماد التغييرات الحساسة</h1><p className="mt-1 text-xs text-slate-500">الدفعات الكبيرة لا تُطبق إلا بعد مراجعة مدير مختلف عن مقدم الطلب.</p></div>
      <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4"/>تحديث</button>
    </header>

    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
      <AlertTriangle className="ml-2 inline h-4 w-4"/>الدفعة السعرية التي تحتوي 50 صفًا صالحًا أو أكثر تتحول إلى طلب انتظار؛ لا تتغير الأسعار قبل موافقة مدير ثانٍ. لا يمكن لمقدم الطلب اعتماد طلبه بنفسه.
      <strong className="mr-2">طلبات معلقة: {pendingCount}</strong>
    </div>

    <div className="flex gap-2 overflow-x-auto">{(['pending', 'approved', 'rejected', 'failed', 'all'] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${filter === value ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600'}`}>{value === 'all' ? 'الكل' : statusLabel[value]} ({value === 'all' ? requests.length : requests.filter((item) => item.status === value).length})</button>)}</div>

    {shown.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">لا توجد طلبات في هذا المرشح.</div> : <div className="space-y-4">{shown.map((item) => {
      const payload = item.payload || {};
      const rows = Array.isArray(payload.priceRecords) ? payload.priceRecords : [];
      const canDecide = item.status === 'pending' && item.requestedByUid !== user?.uid;
      return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-teal-700"/><h2 className="font-black text-slate-900">{item.summary}</h2></div><p className="mt-2 text-xs text-slate-600">طلبه {item.requestedByName} · {formatGregorianDateTime(item.requestedAt)}</p>{item.reviewedByName && <p className="mt-1 text-xs text-slate-500">راجعه {item.reviewedByName} · {item.reviewedAt ? formatGregorianDateTime(item.reviewedAt) : ''}</p>}</div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${item.status === 'pending' ? 'bg-amber-100 text-amber-800' : item.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : item.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{statusLabel[item.status]}</span>
        </div>
        {item.type === 'price_import' && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs"><p>المستودع: <strong>{payload.supplierName || payload.supplierId}</strong> · الملف: {payload.fileName || '—'} · الصفوف: {rows.length}</p><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-right"><thead className="sticky top-0 bg-slate-100 text-slate-500"><tr><th className="py-2">معرف الصنف</th><th>سعر الشراء</th><th>سعر العموم</th><th>العرض</th></tr></thead><tbody>{rows.map((row: any, index: number) => <tr key={`${row.productId}-${index}`} className="border-b last:border-0"><td className="py-2 font-mono">{row.productId}</td><td>{row.price}</td><td>{row.publicPrice ?? '—'}</td><td>{row.bonus || '—'}</td></tr>)}</tbody></table></div></div>}
        {item.type === 'suspend_pharmacies' && <div className="mt-4 rounded-xl bg-rose-50 p-4 text-xs"><p className="font-bold text-rose-900">سيتم تعليق هذه الحسابات دفعة واحدة بعد إعادة التحقق من حالتها الحالية:</p><ul className="mt-2 grid gap-1 sm:grid-cols-2">{(Array.isArray(payload.users) ? payload.users : []).map((target: any) => <li key={target.uid} className="rounded-lg bg-white/80 px-3 py-2">{target.name || target.uid}<span className="block text-slate-500" dir="ltr">{target.email}</span></li>)}</ul></div>}
        {item.reviewNote && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">ملاحظة المراجعة: {item.reviewNote}</p>}
        {canDecide && <div className="mt-4 flex flex-col sm:flex-row gap-2"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظة للمراجعة (اختياري)" className="min-h-10 flex-1 rounded-xl border px-3 text-xs"/><button disabled={workingId === item.id} onClick={() => void review(item, 'approved')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{workingId === item.id ? 'جاري التطبيق...' : 'موافقة وتطبيق'}</button><button disabled={workingId === item.id} onClick={() => void review(item, 'rejected')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4"/>رفض</button></div>}
        {item.status === 'pending' && item.requestedByUid === user?.uid && <p className="mt-4 text-xs font-bold text-amber-700"><Clock3 className="ml-1 inline h-4 w-4"/>بانتظار مدير آخر؛ لا يمكن اعتماد طلبك بنفسك.</p>}
        {item.status === 'failed' && <p className="mt-3 text-xs text-rose-700">لم يكتمل التطبيق. تحقق من سجل النشاط وقاعدة البيانات قبل إعادة رفع الدفعة.</p>}
      </article>;
    })}</div>}
  </div>;
};
