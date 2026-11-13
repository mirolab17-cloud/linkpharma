import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, CopyCheck, RefreshCw, Search } from 'lucide-react';
import { getProducts } from '../../services/dataStorage';
import { useLiveCollections } from '../../hooks/useLiveCollections';
import { Product } from '../../types';
import { detectProductDuplicates, DuplicateGroup } from '../../services/productQuality';
import { useToastStore } from '../../store/useToastStore';
import { ActionButton, MetricCard, SectionHeading, StatusPill } from '../../components/designSystem';

export const ProductQuality: React.FC = () => {
  const { error } = useToastStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const rows = await getProducts(); setProducts(rows); setGroups(detectProductDuplicates(rows)); } catch (e: any) { error(e.message || 'تعذر فحص الكتالوج.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useLiveCollections(['products'], () => { void getProducts().then((rows) => { setProducts(rows); setGroups(detectProductDuplicates(rows)); }).catch(() => undefined); });
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return groups.filter((group) => !q || `${group.label} ${group.products.map((p) => `${p.tradeName} ${p.barcode || ''}`).join(' ')}`.toLowerCase().includes(q)); }, [groups, query]);
  const barcodeGroups = groups.filter((item) => item.reason === 'barcode').length;
  const identityGroups = groups.filter((item) => item.reason === 'identity').length;
  return <div className="space-y-5 pb-16" dir="rtl">
    <SectionHeading eyebrow="جودة الكتالوج" title="كشف التكرار والباركود" description="افحص الأصناف قبل اعتمادها، واعرف هل سبب التكرار باركود مشترك أم تطابق كامل في هوية الصنف." icon={<CopyCheck className="h-6 w-6 text-[#0f9d7a]" />} action={<ActionButton tone="neutral" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-1 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />إعادة الفحص</ActionButton>} />
    <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="إجمالي الأصناف المفحوصة" value={products.length} tone="neutral" /><MetricCard label="تكرار الباركود" value={barcodeGroups} hint="يحتاج مراجعة قبل الحفظ أو الدمج" tone={barcodeGroups ? 'danger' : 'brand'} /><MetricCard label="تكرار الهوية" value={identityGroups} hint="الاسم والجرعة والشكل والشركة" tone={identityGroups ? 'review' : 'brand'} /></div>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><AlertTriangle className="ml-2 inline h-4 w-4" />هذا التقرير لا يحذف أي صنف تلقائياً. راجع السجل الصحيح أولاً، ثم استخدم أدوات التعديل أو الحذف مع توثيق القرار.</section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="relative min-w-[240px] flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الباركود أو الشركة" className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-9 text-xs outline-none focus:border-[#0f9d7a]" /></div><span className="text-xs font-bold text-slate-500">{filtered.length} مجموعة مكررة</span></div>{loading ? <div className="p-10 text-center text-sm text-slate-500">جاري فحص الكتالوج...</div> : filtered.length === 0 ? <div className="p-10 text-center"><CopyCheck className="mx-auto h-10 w-10 text-emerald-500" /><p className="mt-3 text-sm font-black text-slate-800">لا توجد مجموعات مكررة حسب المعايير الحالية</p></div> : <div className="divide-y divide-slate-100">{filtered.map((group) => <article key={group.key} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-600">{group.reason === 'barcode' ? <Barcode className="h-5 w-5" /> : <CopyCheck className="h-5 w-5" />}</span><div><h2 className="text-sm font-black text-slate-900">{group.label}</h2><p className="mt-1 text-[11px] text-slate-500">{group.reason === 'barcode' ? 'باركود متكرر بين أكثر من سجل' : 'هوية تجارية متطابقة بين أكثر من سجل'}</p></div></div><StatusPill status={group.reason === 'barcode' ? 'danger' : 'review'}>{group.reason === 'barcode' ? 'مشكلة باركود' : 'مراجعة هوية'}</StatusPill></div><div className="mt-3 grid gap-2 md:grid-cols-2">{group.products.map((product) => <div key={product.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong>{product.tradeName}</strong><span className="font-mono text-[10px] text-slate-500">{product.id}</span></div><p className="mt-1 text-slate-600">{[product.strength, product.form, product.manufacturer].filter(Boolean).join(' · ') || 'بيانات الهوية غير مكتملة'}</p>{product.barcode && <p className="mt-1 font-mono text-[10px] text-slate-500" dir="ltr">{product.barcode}</p>}</div>)}</div></article>)}</div>}</section>
  </div>;
};
