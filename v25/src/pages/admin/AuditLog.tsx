import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, ScrollText } from 'lucide-react';
import { getPriceHistory } from '../../services/dataStorage';
import { getPlatformActivity } from '../../services/v18Features';
import { PlatformActivity, PriceHistory } from '../../types';
import { formatGregorianDateTime } from '../../utils/formatDate';
import { useToastStore } from '../../store/useToastStore';
import { Spinner } from '../../components/Loader';

type AuditRow = { id: string; at: string; actor: string; role: string; type: string; message: string; details: Record<string, any> };
const roleName: Record<string, string> = { admin: 'مدير', pharmacy: 'صيدلية', representative: 'مندوب', system: 'النظام' };
const actionName: Record<string, string> = {
  price_imported: 'استيراد أسعار', price_import_failed: 'فشل استيراد', user_access_changed: 'تغيير صلاحيات', pharmacy_imported: 'استيراد صيدليات',
  order_created: 'إنشاء طلب', order_edited: 'تعديل طلب', order_status_changed: 'تغيير حالة طلب', price_visibility_changed: 'إظهار/إخفاء سعر',
  delivery_schedule_updated: 'تعديل جدول توصيل', supplier_template_updated: 'تعديل قالب استيراد', representative_link_approved: 'اعتماد ربط مندوب',
  representative_link_rejected: 'رفض ربط مندوب', representative_link_revoked: 'إلغاء ربط مندوب', change_approval_requested: 'طلب اعتماد ثانٍ',
  change_approval_approved: 'اعتماد تغيير حساس', change_approval_rejected: 'رفض تغيير حساس', change_approval_failed: 'فشل تطبيق تغيير حساس', backup_created: 'إنشاء نسخة احتياطية', backup_restored: 'استعادة نسخة احتياطية',
};
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const AuditLog: React.FC = () => {
  const { error } = useToastStore();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actorFilter, setActorFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activities, histories] = await Promise.all([getPlatformActivity(), getPriceHistory()]);
      const activityRows: AuditRow[] = activities.map((item: PlatformActivity) => ({
        id: item.id, at: item.createdAt, actor: item.actorName || item.actorId || '—', role: item.actorRole || '—',
        type: item.type, message: item.message || '', details: item.metadata || {},
      }));
      const historyRows: AuditRow[] = histories.map((item: PriceHistory) => ({
        id: item.id, at: item.importedAt, actor: item.actorName || 'غير مسجل', role: '—', type: 'price_history',
        message: `تغيير سعر الصنف ${item.productId} لدى المورد ${item.supplierId}`,
        details: { supplierId: item.supplierId, productId: item.productId, changeType: item.changeType, previous: item.previous || { price: item.price }, next: item.next || {}, actorUid: item.actorUid },
      }));
      const merged = [...activityRows, ...historyRows].sort((a, b) => b.at.localeCompare(a.at));
      setRows(merged);
    } catch (e: any) { error('تعذر تحميل سجل التدقيق: ' + (e?.message || '')); }
    finally { setLoading(false); }
  }, [error]);
  useEffect(() => { void load(); }, [load]);

  const actors = useMemo(() => Array.from(new Set(rows.map((row) => row.actor))).sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => row.type))).sort(), [rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (actorFilter !== 'all' && row.actor !== actorFilter) return false;
      if (actionFilter !== 'all' && row.type !== actionFilter) return false;
      if (fromDate && row.at.slice(0, 10) < fromDate) return false;
      if (toDate && row.at.slice(0, 10) > toDate) return false;
      if (q && !`${row.actor} ${row.type} ${row.message} ${JSON.stringify(row.details)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, actorFilter, actionFilter, fromDate, toDate]);

  const exportCsv = () => {
    const header = ['التوقيت', 'المنفذ', 'الدور', 'العملية', 'الوصف', 'التفاصيل JSON'];
    const lines = filtered.map((row) => [row.at, row.actor, roleName[row.role] || row.role, actionName[row.type] || row.type, row.message, JSON.stringify(row.details)].map(csvCell).join(','));
    const blob = new Blob(['\ufeff', [header.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `linkpharma-v25-audit-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (loading) return <div className="py-20 flex justify-center"><Spinner text="تحميل سجل التدقيق..." /></div>;
  return <div className="space-y-5 pb-12" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><ScrollText className="h-6 w-6 text-teal-700"/>سجل التدقيق</h1><p className="mt-1 text-xs text-slate-500">ابحث في أنشطة الإدارة والأسعار وطلبات المندوبين، وصدّر النتائج المعروضة.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4"/>تحديث</button><button onClick={exportCsv} disabled={!filtered.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="h-4 w-4"/>تصدير CSV ({filtered.length})</button></div></header>
    <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-5">
      <div className="relative md:col-span-2"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالمنفذ أو الوصف أو القيم السابقة/الجديدة" className="w-full rounded-xl border py-2.5 pr-9 pl-3 text-xs"/></div>
      <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} className="rounded-xl border px-3 py-2 text-xs"><option value="all">كل المنفذين</option>{actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}</select>
      <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="rounded-xl border px-3 py-2 text-xs"><option value="all">كل العمليات</option>{actions.map((action) => <option key={action} value={action}>{actionName[action] || action}</option>)}</select>
      <div className="flex gap-2"><input aria-label="من تاريخ" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="min-w-0 flex-1 rounded-xl border px-2 text-xs"/><input aria-label="إلى تاريخ" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="min-w-0 flex-1 rounded-xl border px-2 text-xs"/></div>
    </section>
    <p className="text-xs text-slate-500">المعروض {filtered.length} من {rows.length} سجلًا. البيانات التفصيلية للسعر تتوفر منذ بدء v25؛ الأحداث الأقدم قد لا تتضمن لقطة قبل/بعد.</p>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[850px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">الوقت</th><th>المنفذ</th><th>العملية</th><th>الوصف والتفاصيل</th></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.type}_${row.id}`} className="border-t align-top"><td className="whitespace-nowrap p-3 text-slate-500">{formatGregorianDateTime(row.at)}</td><td className="p-3 font-bold text-slate-800">{row.actor}<span className="mt-1 block font-normal text-slate-500">{roleName[row.role] || row.role}</span></td><td className="p-3"><span className="rounded-lg bg-teal-50 px-2 py-1 font-bold text-teal-800">{actionName[row.type] || row.type}</span></td><td className="p-3"><p className="font-semibold text-slate-800">{row.message || '—'}</p><details className="mt-2"><summary className="cursor-pointer text-teal-700">عرض القيم والسياق</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-[10px] leading-5" dir="ltr">{JSON.stringify(row.details, null, 2)}</pre></details></td></tr>)}</tbody></table></div>
  </div>;
};
