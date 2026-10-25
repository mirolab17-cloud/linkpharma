// src/pages/admin/QuickLink.tsx — v56: الربط السريع لأصناف المورد
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileSpreadsheet, Link2, Search, UploadCloud, AlertTriangle, XCircle, Download, ArrowLeft, Zap } from 'lucide-react';
import { getProductAliases, getProducts, getSuppliers, saveProductAliasesBatch } from '../../services/dataStorage';
import { Product, ProductAlias, Supplier } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { SearchSelect } from '../../components/SearchSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { Spinner } from '../../components/Loader';
import { ProductMatcher } from '../../utils/fuzzyMatch';
import { productAliasDocumentId } from '../../utils/productAliases';
import {
  QuickLinkRow,
  QuickLinkState,
  buildQuickLinkIndex,
  classifyQuickLinkRow,
  parseQuickLinkRows,
  quickLinkStateLabels,
  resolveQuickLinkProduct,
} from '../../utils/quickLink';

const PAGE_SIZE = 50;

type Filter = 'all' | QuickLinkState;
interface RowChoice { productId: string; include: boolean; source: 'file' | 'matcher' | 'manual' | 'none'; exact?: boolean }

const stateStyle: Record<QuickLinkState, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
  unlinked: 'bg-rose-50 text-rose-700 border-rose-200',
  linked: 'bg-sky-50 text-sky-700 border-sky-200',
  conflict: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

const productLabel = (product?: Product) => product ? [product.tradeName, product.strength && product.strength !== 'Standard' ? product.strength : '', product.form].filter(Boolean).join(' · ') : '';

export const QuickLink: React.FC = () => {
  const { success, error, warning } = useToastStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<QuickLinkRow[]>([]);
  const [hasSystemColumn, setHasSystemColumn] = useState(true);
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ saved: number; alreadyLinked: number; conflicts: number; failed: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedSuppliers, loadedProducts] = await Promise.all([getSuppliers(), getProducts()]);
        if (cancelled) return;
        setSuppliers(loadedSuppliers);
        setProducts(loadedProducts);
      } catch (exception: any) {
        if (!cancelled) error(exception?.message || 'تعذر تحميل الموردين والأصناف.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!supplierId) { setAliases([]); return; }
    let cancelled = false;
    setLoadingAliases(true);
    getProductAliases(supplierId)
      .then((list) => { if (!cancelled) setAliases(list); })
      .catch(() => { if (!cancelled) setAliases([]); })
      .finally(() => { if (!cancelled) setLoadingAliases(false); });
    return () => { cancelled = true; };
  }, [supplierId]);

  const index = useMemo(() => buildQuickLinkIndex(products), [products]);
  const existingByAliasId = useMemo(() => new Map(aliases.map((alias) => [alias.id, alias.productId])), [aliases]);
  const productOptions = useMemo(() => products.map((product) => ({ id: product.id, label: product.tradeName, subLabel: [product.strength, product.form, product.packSize].filter(Boolean).join(' · ') })), [products]);

  const existingFor = (row: QuickLinkRow) => existingByAliasId.get(productAliasDocumentId({ supplierId, rawName: row.rawName }));

  // تحليل الصفوف إلى اختيارات أولية كلما تغير الملف/المورد/الأسماء المحفوظة.
  useEffect(() => {
    if (!rows.length) { setChoices({}); return; }
    const matcher = hasSystemColumn ? null : new ProductMatcher(products, aliases, supplierId);
    const next: Record<number, RowChoice> = {};
    for (const row of rows) {
      let productId = '';
      let source: RowChoice['source'] = 'none';
      let exact = false;
      if (hasSystemColumn) {
        const resolution = resolveQuickLinkProduct(row, index);
        if (resolution.product) { productId = resolution.product.id; source = 'file'; }
      } else if (matcher) {
        const match = matcher.match(row.rawName);
        const product = match.matchedProduct || match.suggestions[0]?.product;
        if (product) { productId = product.id; source = 'matcher'; exact = match.status === 'exact'; }
      }
      const fileStatus = hasSystemColumn ? row.fileStatus : exact ? 'confirmed' : 'review';
      const state = classifyQuickLinkRow({ fileStatus }, { product: productId ? index.byId.get(productId) || null : null, how: 'key' }, existingFor(row));
      next[row.rowNumber] = { productId, source, exact, include: state === 'ready' };
    }
    setChoices(next);
    setPage(1);
  }, [rows, hasSystemColumn, supplierId, aliases, index]);

  const stateOf = (row: QuickLinkRow): QuickLinkState => {
    const choice = choices[row.rowNumber];
    const product = choice?.productId ? index.byId.get(choice.productId) || null : null;
    // اختيار يدوي أو اقتراح تقريبي يبقى «يحتاج مراجعة» حتى يحدده المستخدم صراحةً.
    const fileStatus = choice?.source === 'manual' ? 'review' : hasSystemColumn ? row.fileStatus : choice?.exact ? 'confirmed' : 'review';
    return classifyQuickLinkRow({ fileStatus }, { product, how: 'key' }, existingFor(row));
  };

  const counts = useMemo(() => {
    const total: Record<Filter, number> = { all: rows.length, ready: 0, review: 0, unlinked: 0, linked: 0, conflict: 0 };
    rows.forEach((row) => { total[stateOf(row)] += 1; });
    return total;
  }, [rows, choices, aliases]);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && stateOf(row) !== filter) return false;
      if (!term) return true;
      const choice = choices[row.rowNumber];
      const product = choice?.productId ? index.byId.get(choice.productId) : undefined;
      return row.rawName.toLowerCase().includes(term) || productLabel(product).toLowerCase().includes(term);
    });
  }, [rows, filter, query, choices, aliases]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages]);

  const selectedRows = useMemo(() => rows.filter((row) => {
    const choice = choices[row.rowNumber];
    const state = stateOf(row);
    return choice?.include && choice.productId && state !== 'linked' && state !== 'conflict';
  }), [rows, choices, aliases]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames.includes('الربط الكامل') ? 'الربط الكامل' : workbook.SheetNames[0];
      const parsedRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as Array<Record<string, unknown>>;
      const parsed = parseQuickLinkRows(parsedRows);
      if (!parsed.rows.length) { error('لم أجد عمود «اسم الصنف» أو لا توجد صفوف في الملف.'); return; }
      setFileName(file.name);
      setResult(null);
      setFilter('all');
      setQuery('');
      setHasSystemColumn(parsed.hasSystemColumn);
      setRows(parsed.rows);
      if (!parsed.hasSystemColumn) warning('الملف بلا عمود «الصنف في النظام»؛ سأقترح الربط تلقائياً ويجب مراجعته قبل الاعتماد.');
    } catch (exception: any) {
      error(`تعذر قراءة الملف: ${exception?.message || 'خطأ غير معروف'}`);
    }
  };

  const setChoice = (rowNumber: number, patch: Partial<RowChoice>) => setChoices((old) => ({ ...old, [rowNumber]: { ...old[rowNumber], ...patch } as RowChoice }));

  const selectAll = (state: QuickLinkState, include: boolean) => {
    setChoices((old) => {
      const next = { ...old };
      rows.forEach((row) => { if (stateOf(row) === state && next[row.rowNumber]?.productId) next[row.rowNumber] = { ...next[row.rowNumber], include }; });
      return next;
    });
  };

  const commit = async () => {
    setConfirmOpen(false);
    if (!supplierId || !selectedRows.length) return;
    setSaving(true);
    setProgress({ done: 0, total: selectedRows.length });
    try {
      const outcome = await saveProductAliasesBatch(
        supplierId,
        selectedRows.map((row) => ({ productId: choices[row.rowNumber].productId, rawName: row.rawName })),
        (done, total) => setProgress({ done, total }),
      );
      setResult({ saved: outcome.saved, alreadyLinked: outcome.alreadyLinked, conflicts: outcome.conflicts.length, failed: outcome.failed });
      setAliases(await getProductAliases(supplierId).catch(() => aliases));
      if (outcome.saved) success(`تم ربط ${outcome.saved} صنف. سيطابقها رفع الأسعار فوراً لهذا المورد.`);
      if (outcome.failed) warning(`تعذر حفظ ${outcome.failed} ربط؛ أعد المحاولة للمتبقي.`);
    } catch (exception: any) {
      error(exception?.message || 'تعذر حفظ الربط.');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const exportUnlinked = () => {
    const list = rows.filter((row) => ['unlinked', 'review', 'conflict'].includes(stateOf(row)));
    if (!list.length) return;
    const sheet = XLSX.utils.json_to_sheet(list.map((row) => ({
      'الرقم': row.rowNumber - 1, 'اسم الصنف في الملف': row.rawName, 'العبوة': row.pack, 'السعر': row.price ?? '', 'الحالة': quickLinkStateLabels[stateOf(row)],
      'الصنف المقترح': productLabel(index.byId.get(choices[row.rowNumber]?.productId || '')),
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'غير مربوط');
    XLSX.writeFile(book, 'اصناف_تحتاج_ربط.xlsx');
  };

  const supplierOptions = suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name }));

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'الكل' }, { key: 'ready', label: 'جاهز' }, { key: 'review', label: 'مراجعة' },
    { key: 'unlinked', label: 'غير مربوط' }, { key: 'linked', label: 'مربوط مسبقاً' }, { key: 'conflict', label: 'تعارض' },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <header className="rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0f9d7a] text-white"><Zap className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-black text-slate-900">الربط السريع لأصناف المورد</h1>
            <p className="mt-1 text-xs leading-6 text-slate-600">ارفع ملف الربط المُجهَّز (اسم صنف المورد ↔ الصنف في النظام)، راجع النتيجة، ثم اعتمد دفعة واحدة. تُحفظ أسماء الملف كأسماء بديلة للمورد، فتطابقها صفحة «رفع وتحديث الأسعار» تلقائياً في أي ملف لاحق.</p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs md:grid-cols-2">
        <div>
          <SearchSelect label="1) المورد / المستودع" placeholder="اختر المورد الذي ينتمي إليه الملف" options={supplierOptions} value={supplierId} onChange={setSupplierId} required />
          {supplierId && <p className="mt-1.5 text-[11px] text-slate-500">{loadingAliases ? 'جاري تحميل الربط المحفوظ...' : `الأسماء البديلة المحفوظة لهذا المورد: ${aliases.length}`}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">2) ملف الربط (Excel)</label>
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-xs font-bold transition ${supplierId ? 'border-emerald-300 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-50' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'}`}>
            <UploadCloud className="h-5 w-5" />
            <span>{fileName || 'اختر الملف أو اسحبه هنا'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={!supplierId} onChange={handleFile} />
          </label>
          {!supplierId && <p className="mt-1.5 text-[11px] text-amber-700">اختر المورد أولاً لتفعيل رفع الملف.</p>}
        </div>
      </section>

      {rows.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {([['ready', CheckCircle2], ['review', AlertTriangle], ['unlinked', XCircle], ['linked', Link2], ['conflict', AlertTriangle]] as const).map(([state, Icon]) => (
              <button key={state} type="button" onClick={() => { setFilter(state); setPage(1); }} className={`rounded-2xl border p-3 text-right transition hover:shadow-xs ${stateStyle[state]} ${filter === state ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                <div className="flex items-center justify-between text-[11px] font-black"><span>{quickLinkStateLabels[state]}</span><Icon className="h-4 w-4" /></div>
                <div className="mt-1 text-2xl font-black">{counts[state]}</div>
              </button>
            ))}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ابحث في الاسم بالملف أو الصنف المقابل..." className="w-full rounded-xl border border-slate-200 py-2.5 pr-9 pl-3 text-xs outline-hidden focus:border-emerald-400" />
              </div>
              {filters.map((item) => (
                <button key={item.key} type="button" onClick={() => { setFilter(item.key); setPage(1); }} className={`rounded-xl px-3 py-2 text-[11px] font-black ${filter === item.key ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.label} ({counts[item.key]})</button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <button type="button" onClick={() => selectAll('ready', true)} className="rounded-lg bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 hover:bg-emerald-100">تحديد كل الجاهز</button>
              <button type="button" onClick={() => selectAll('review', true)} className="rounded-lg bg-amber-50 px-3 py-1.5 font-bold text-amber-700 hover:bg-amber-100">تحديد المراجَع أيضاً</button>
              <button type="button" onClick={() => { selectAll('ready', false); selectAll('review', false); }} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-200">إلغاء التحديد</button>
              <button type="button" onClick={exportUnlinked} className="mr-auto inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-1.5 font-bold text-sky-700 hover:bg-sky-100"><Download className="h-3.5 w-3.5" /> تصدير غير المربوط</button>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-right text-xs">
                <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr><th className="w-10 p-3">✓</th><th className="p-3">اسم الصنف في الملف</th><th className="p-3">السعر</th><th className="p-3">الحالة</th><th className="min-w-[18rem] p-3">الصنف في النظام</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((row) => {
                    const choice = choices[row.rowNumber];
                    const state = stateOf(row);
                    const locked = state === 'linked' || state === 'conflict';
                    return (
                      <tr key={row.rowNumber} className="align-top hover:bg-slate-50/60">
                        <td className="p-3"><input type="checkbox" checked={Boolean(choice?.include) && !locked} disabled={locked || !choice?.productId} onChange={(event) => setChoice(row.rowNumber, { include: event.target.checked })} className="h-4 w-4 accent-emerald-600" /></td>
                        <td className="p-3 font-bold text-slate-800" dir="ltr" style={{ textAlign: 'right' }}>{row.rawName}{row.note && <div className="mt-0.5 text-[10px] font-normal text-amber-700" dir="rtl">{row.note}</div>}</td>
                        <td className="p-3 font-bold text-slate-700">{row.price ?? '—'}</td>
                        <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${stateStyle[state]}`}>{quickLinkStateLabels[state]}</span></td>
                        <td className="p-3">
                          <SearchSelect placeholder="ابحث واختر الصنف في النظام" options={productOptions} value={choice?.productId || ''} disabled={state === 'linked'} onChange={(id) => setChoice(row.rowNumber, { productId: id, source: 'manual', include: Boolean(id) })} />
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد صفوف مطابقة للعرض الحالي.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={visibleRows.length} pageSize={PAGE_SIZE} />
          </section>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
            <div className="text-xs font-bold text-slate-700">
              <FileSpreadsheet className="ml-1 inline h-4 w-4 text-emerald-600" />
              المحدد للحفظ: <span className="text-emerald-700">{selectedRows.length}</span> من {rows.length}
              {progress && <span className="mr-3 text-slate-500">جارٍ الحفظ {progress.done}/{progress.total}...</span>}
            </div>
            <button type="button" disabled={saving || !selectedRows.length || !supplierId} onClick={() => setConfirmOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#0f9d7a] px-5 py-2.5 text-xs font-black text-white shadow-xs hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Spinner /> : <Link2 className="h-4 w-4" />} اعتماد الربط ({selectedRows.length})
            </button>
          </div>
        </>
      )}

      {result && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-xs leading-7 text-emerald-900">
          <div className="mb-1 text-sm font-black">اكتمل الربط</div>
          تم حفظ <b>{result.saved}</b> · كان مربوطاً مسبقاً <b>{result.alreadyLinked}</b> · تعارضات لم تُحفظ <b>{result.conflicts}</b> · فشل <b>{result.failed}</b>
          <div className="mt-3"><Link to="/admin/import" className="inline-flex items-center gap-1 rounded-xl bg-[#0f9d7a] px-4 py-2 font-black text-white hover:bg-emerald-700">انتقل إلى رفع الأسعار <ArrowLeft className="h-4 w-4" /></Link></div>
        </section>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={commit}
        title="اعتماد الربط"
        message={`سيتم حفظ ${selectedRows.length} اسماً بديلاً للمورد المحدد. لا يُستبدل أي ربط موجود مسبقاً، ويمكنك فك الربط لاحقاً من صفحة رفع الأسعار.`}
        confirmText="اعتماد وحفظ"
      />
    </div>
  );
};
