import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, ShieldCheck, HardDriveDownload, Activity, AlertTriangle } from 'lucide-react';
import { getCatalogSnapshotMeta, getStaleCatalogSuppliers, rebuildCatalogSnapshots, rebuildSupplierSnapshot } from '../../services/dataStorage';

export const CatalogSnapshots: React.FC = () => {
  const [meta, setMeta] = useState<any>(null);
  const [staleSuppliers, setStaleSuppliers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const load = async (autoRepair = false) => {
    const [nextMeta, stale] = await Promise.all([getCatalogSnapshotMeta(), getStaleCatalogSuppliers()]);
    setMeta(nextMeta); setStaleSuppliers(stale);
    if (autoRepair && stale.length) {
      for (const supplier of stale) {
        try { await rebuildSupplierSnapshot(supplier.id); } catch (error) { console.warn('Automatic supplier snapshot rebuild deferred:', error); }
      }
      const [repairedMeta, remaining] = await Promise.all([getCatalogSnapshotMeta(), getStaleCatalogSuppliers()]);
      setMeta(repairedMeta); setStaleSuppliers(remaining);
    }
  };
  useEffect(() => { void load(true); }, []);
  const rebuild = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await rebuildCatalogSnapshots();
      setMessage(`تم نشر النسخة ${result.version}: ${result.products} صنفاً و${result.prices} سعراً في ${result.chunks} أجزاء.`);
      await load(false);
    } catch (error: any) { setMessage(error?.message || 'تعذر إعادة بناء نسخة الكتالوج.'); }
    finally { setBusy(false); }
  };
  const rebuildStale = async () => {
    setBusy(true); setMessage('');
    try {
      for (const supplier of staleSuppliers) await rebuildSupplierSnapshot(supplier.id);
      setMessage(`تم تحديث Snapshot لـ ${staleSuppliers.length} مستودعاً.`);
      await load(false);
    } catch (error: any) { setMessage(error?.message || 'تعذر تحديث الموردين المتقادمَين.'); }
    finally { setBusy(false); }
  };
  const priceChunks = meta?.priceChunkIdsBySupplier ? Object.values(meta.priceChunkIdsBySupplier as Record<string, string[]>).reduce((sum, ids) => sum + ids.length, 0) : 0;
  return (
    <div dir="rtl" className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-[#0f9d7a] p-6 text-white shadow-xl">
          <div className="flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Link Pharma · v43</p><h1 className="text-2xl font-black sm:text-3xl">مركز كفاءة الكتالوج</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/80">نسخة مجمعة من المنتجات والأسعار لتقليل قراءات Firestore. الأسعار المخفية لا تدخل Snapshot، والأسعار المتقادمة تُقرأ حياً.</p></div><Database className="hidden h-12 w-12 text-emerald-200 sm:block" /></div>
        </header>
        {staleSuppliers.length > 0 && <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-5 w-5 shrink-0" /><p className="text-sm font-bold leading-6">هناك {staleSuppliers.length} مستودعاً تغيرت أسعاره بعد آخر Snapshot: {staleSuppliers.map((supplier) => supplier.name).join('، ')}.</p></div><button onClick={() => void rebuildStale()} disabled={busy} className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-black text-white disabled:opacity-50">تحديث الموردين</button></section>}
        <section className="grid gap-3 sm:grid-cols-3">{[['آخر نسخة', meta?.version || 'لم تُبنَ بعد', Activity], ['الأصناف', meta?.productCount ?? '—', HardDriveDownload], ['أجزاء الأسعار', priceChunks || '—', ShieldCheck]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="mb-3 h-5 w-5 text-emerald-600" /><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-black text-slate-900">{value}</p></div>)}</section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-900">إعادة بناء النسخة المجمعة</h2><p className="mt-1 text-sm leading-6 text-slate-500">تستخدمها بعد استيراد كبير أو عند ترحيل البيانات القديمة. الاستيراد الجديد يعيد البناء تلقائياً.</p></div><button onClick={() => void rebuild()} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#0f9d7a] px-5 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{busy ? 'جاري البناء...' : 'إعادة البناء الآن'}</button></div>{message && <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold leading-7 text-emerald-800">{message}</div>}<div className="mt-6 grid gap-3 text-xs leading-6 text-slate-500 sm:grid-cols-2"><p className="rounded-2xl bg-slate-50 p-4"><strong className="text-slate-800">المستخدمون:</strong> يقرؤون مستندات مجمعة مع كاش محلي بدلاً من قراءة كل سعر منفرداً.</p><p className="rounded-2xl bg-slate-50 p-4"><strong className="text-slate-800">الأمان:</strong> الأسعار النهائية عند الطلب تُعاد قراءتها من Firebase للصنف المحدد قبل إرسال واتساب.</p></div></section>
      </div>
    </div>
  );
};
