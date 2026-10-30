// src/pages/admin/QuickLink.tsx — v59: قاموس ربط الأسماء العام (صيغة موحدة، ثقة، تعارض، إدارة القاموس)
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveCollections } from '../../hooks/useLiveCollections';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileSpreadsheet, Link2, Search, UploadCloud, AlertTriangle, XCircle, Download, ArrowLeft, Zap, Copy } from 'lucide-react';
import { getGlobalProductAliases, getProducts, saveGlobalProductAliasesBatch } from '../../services/dataStorage';
import { Product, ProductAlias } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { SearchSelect } from '../../components/SearchSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { Spinner } from '../../components/Loader';
import { ProductMatcher } from '../../utils/fuzzyMatch';
import { globalProductAliasDocumentId, normalizeAliasValue } from '../../utils/productAliases';
import { FORM_ABBREVIATION_HELP, formatCatalogName } from '../../utils/catalogNameFormat';
import { AliasDictionaryManager } from './AliasDictionaryManager';
import {
  QuickLinkRow,
  QuickLinkState,
  buildQuickLinkIndex,
  classifyQuickLinkRow,
  confidenceLabels,
  confidenceLevel,
  parseQuickLinkRows,
  quickLinkStateLabels,
  resolveQuickLinkProduct,
} from '../../utils/quickLink';

const PAGE_SIZE = 50;

type Filter = 'all' | QuickLinkState;
interface RowChoice { productId: string; include: boolean; replace?: boolean; source: 'file' | 'matcher' | 'manual' | 'none'; exact?: boolean; how?: string }

const AI_MAPPING_PROMPT = `لديك ملفان مرفقان:
1) ملف الأصناف المصدر (ملف أسعار مستودع أو قائمة أصناف)، وفيه الأسماء كما تظهر في الملف.
2) ملف الأصناف الرئيسي المنزَّل من LinkPharma، وفيه عمود «الصنف في النظام» بصيغة: الاسم التركيز العبوة+النوع (مثل Adeaflam 75ml 6amp).

أنشئ ملف Excel واحداً جاهزاً للرفع في صفحة «قاموس ربط أسماء الأصناف» في LinkPharma. هذا قاموس عام ولا يرتبط بأي مورد أو مستودع. ورقة باسم «الربط الكامل» وبهذه الأعمدة والعناوين حرفياً:
1) «الصنف في النظام»: انسخ الصيغة حرفياً من ملف الأصناف الرئيسي (لا تغيّر فيها حرفاً).
2) «اسم الصنف في الملف»: انسخ الاسم حرفياً كما يظهر في ملف المستودع، دون تصحيح أو إعادة صياغة.
3) «نسبة الثقة»: عالية أو متوسطة أو منخفضة.

قد يكتب المستودع الاسم وحده، أو مع النوع، أو مع التركيز، أو مع التركيز والنوع. اربط بالاسم أولاً ثم تحقق من التركيز والعبوة والنوع. الأنواع المختصرة: tab أقراص، cap كبسولات، amp أمبولات، vial فيال، inj حقن، syr شراب، susp معلق، sol محلول، cream كريم، oint مرهم، gel جل، drop قطرات، eye قطرات عين، supp تحاميل، spray بخاخ، sach أكياس، patch لصقات.

إذا كان للصنف أكثر من اسم (في نفس المستودع أو في مستودعات مختلفة)، كرر «الصنف في النظام» في عدة صفوف، اسم واحد بكل صف. إن اضطررت لوضع أكثر من اسم في خلية واحدة ففصل بينها بالرمز | فقط. لا تخترع أصنافاً ولا تربط بتشابه الاسم وحده إذا اختلف التركيز أو العبوة أو النوع. عند الشك اترك «الصنف في النظام» فارغاً واكتب السبب في عمود «ملاحظة»، واجعل الثقة منخفضة. لا تحذف أي اسم من ملف المستودع. أخرج Excel فقط، بقيم نصية دون صيغ.`;

const stateStyle: Record<QuickLinkState, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
  unlinked: 'bg-rose-50 text-rose-700 border-rose-200',
  linked: 'bg-sky-50 text-sky-700 border-sky-200',
  conflict: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

const productLabel = (product?: Product) => product ? formatCatalogName(product) : '';

export const QuickLink: React.FC = () => {
  const { success, error, warning } = useToastStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [result, setResult] = useState<{ saved: number; alreadyLinked: number; conflicts: number; failed: number; replaced: number } | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedProducts, loadedAliases] = await Promise.all([getProducts(), getGlobalProductAliases()]);
        if (cancelled) return;
        setProducts(loadedProducts);
        setAliases(loadedAliases);
      } catch (exception: any) {
        if (!cancelled) error(exception?.message || 'تعذر تحميل الأصناف وقاموس الأسماء العام.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useLiveCollections(['products'], () => { void getProducts().then(setProducts).catch(() => undefined); });

  const index = useMemo(() => buildQuickLinkIndex(products), [products]);
  const existingByAliasId = useMemo(() => new Map(aliases.map((alias) => [alias.id, alias.productId])), [aliases]);
  const productOptions = useMemo(() => products.map((product) => ({ id: product.id, label: formatCatalogName(product), subLabel: product.manufacturer || '' })), [products]);

  const existingFor = (row: QuickLinkRow) => existingByAliasId.get(globalProductAliasDocumentId(row.rawName));

  // تحليل الصفوف إلى اختيارات أولية كلما تغير الملف أو الأسماء العامة المحفوظة.
  useEffect(() => {
    if (!rows.length) { setChoices({}); return; }
    const matcher = new ProductMatcher(products, aliases, '');
    const next: Record<number, RowChoice> = {};
    for (const row of rows) {
      let productId = '';
      let source: RowChoice['source'] = 'none';
      let exact = false;
      let how = 'none';
      const hasExplicitTarget = Boolean(hasSystemColumn && (row.sysName.trim() || row.key.trim()));
      if (hasExplicitTarget) {
        const resolution = resolveQuickLinkProduct(row, index);
        how = resolution.how;
        if (resolution.product) { productId = resolution.product.id; source = 'file'; }
      } else {
        const match = matcher.match(row.rawName, undefined, { packSize: row.pack });
        const product = match.matchedProduct || match.suggestions[0]?.product;
        how = match.status === 'exact' ? 'name' : 'suggestion';
        if (product) { productId = product.id; source = 'matcher'; exact = match.status === 'exact'; }
      }
      const fileStatus = hasExplicitTarget ? row.fileStatus : exact ? 'confirmed' : 'review';
      const state = classifyQuickLinkRow({ fileStatus, confidence: hasExplicitTarget ? row.confidence : 0 }, { product: productId ? index.byId.get(productId) || null : null, how }, existingFor(row));
      next[row.rowNumber] = { productId, source, exact, how, include: state === 'ready' };
    }
    setChoices(next);
    setPage(1);
  }, [rows, hasSystemColumn, aliases, index]);

  // نفس الاسم البديل مختاراً لصنفين مختلفين داخل الملف نفسه.
  const fileConflictNames = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    rows.forEach((row) => {
      const productId = choices[row.rowNumber]?.productId;
      if (!productId) return;
      const key = normalizeAliasValue(row.rawName);
      const set = seen.get(key) || new Set<string>();
      set.add(productId);
      seen.set(key, set);
    });
    return new Set([...seen.entries()].filter(([, set]) => set.size > 1).map(([key]) => key));
  }, [rows, choices]);

  const existingConflict = (row: QuickLinkRow) => {
    const existing = existingFor(row);
    const productId = choices[row.rowNumber]?.productId;
    return Boolean(existing && productId && existing !== productId);
  };

  const stateOf = (row: QuickLinkRow): QuickLinkState => {
    const choice = choices[row.rowNumber];
    const product = choice?.productId ? index.byId.get(choice.productId) || null : null;
    // اختيار يدوي أو اقتراح تقريبي يبقى «يحتاج مراجعة» حتى يحدده المستخدم صراحةً.
    const hasExplicitTarget = Boolean(hasSystemColumn && (row.sysName.trim() || row.key.trim()));
    const fileStatus = choice?.source === 'manual' ? 'review' : hasExplicitTarget ? row.fileStatus : choice?.exact ? 'confirmed' : 'review';
    if (product && !existingFor(row) && fileConflictNames.has(normalizeAliasValue(row.rawName))) return 'conflict';
    return classifyQuickLinkRow({ fileStatus, confidence: hasExplicitTarget && choice?.source === 'file' ? row.confidence : 0 }, { product, how: choice?.how || 'none' }, existingFor(row));
  };

  const counts = useMemo(() => {
    const total: Record<Filter, number> = { all: rows.length, ready: 0, review: 0, unlinked: 0, linked: 0, conflict: 0 };
    rows.forEach((row) => { total[stateOf(row)] += 1; });
    return total;
  }, [rows, choices, aliases, fileConflictNames]);

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
    if (!choice?.include || !choice.productId || state === 'linked') return false;
    if (state === 'conflict') return Boolean(choice.replace && existingConflict(row));
    return true;
  }), [rows, choices, aliases, fileConflictNames]);

  // معاينة ما سيحدث قبل الاعتماد.
  const preview = useMemo(() => {
    const names = new Set<string>();
    let fresh = 0; let dupInFile = 0; let replace = 0;
    selectedRows.forEach((row) => {
      const key = normalizeAliasValue(row.rawName);
      if (names.has(key)) { dupInFile += 1; return; }
      names.add(key);
      if (choices[row.rowNumber]?.replace && existingConflict(row)) replace += 1; else fresh += 1;
    });
    return { fresh, dupInFile, replace, linked: counts.linked, conflicts: counts.conflict - replace };
  }, [selectedRows, choices, counts, aliases]);

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
    if (!selectedRows.length) return;
    setSaving(true);
    setProgress({ done: 0, total: selectedRows.length });
    try {
      const outcome = await saveGlobalProductAliasesBatch(
        selectedRows.map((row) => ({ productId: choices[row.rowNumber].productId, rawName: row.rawName, replace: Boolean(choices[row.rowNumber].replace) })),
        (done, total) => setProgress({ done, total }),
      );
      setResult({ saved: outcome.saved, alreadyLinked: outcome.alreadyLinked, conflicts: outcome.conflicts.length, failed: outcome.failed, replaced: outcome.replaced || 0 });
      setAliases(await getGlobalProductAliases().catch(() => aliases));
      if (outcome.saved || outcome.replaced) success(`تم حفظ ${outcome.saved + (outcome.replaced || 0)} اسماً بديلاً في القاموس العام للمنصة.`);
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
    // نفس أعمدة ملف الربط، فيمكن إرساله للذكاء الاصطناعي أو إكماله يدوياً ثم رفعه هنا مجدداً.
    const sheet = XLSX.utils.json_to_sheet(list.map((row) => ({
      'الصنف في النظام': productLabel(index.byId.get(choices[row.rowNumber]?.productId || '')),
      'اسم الصنف في الملف': row.rawName,
      'نسبة الثقة': confidenceLabels[confidenceLevel(row.confidence)] === '—' ? '' : confidenceLabels[confidenceLevel(row.confidence)],
      'الحالة': quickLinkStateLabels[stateOf(row)],
      'العبوة': row.pack, 'السعر': row.price ?? '', 'ملاحظة': row.note,
    })));
    sheet['!cols'] = [{ wch: 42 }, { wch: 42 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 28 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'الربط الكامل');
    XLSX.writeFile(book, 'اصناف_تحتاج_ربط.xlsx');
  };

  const downloadCatalogNames = () => {
    if (!products.length) { warning('لا توجد أصناف في الكتالوج.'); return; }
    const names = [...new Set(products.map((product) => formatCatalogName(product)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const sheet = XLSX.utils.aoa_to_sheet([['الصنف في النظام'], ...names.map((name) => [name])]);
    sheet['!cols'] = [{ wch: 48 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'الأصناف');
    XLSX.writeFile(workbook, 'الاصناف_الرئيسية_LinkPharma.xlsx');
    success(`تم تنزيل ${names.length} صنفاً بصيغة: الاسم التركيز العبوة+النوع.`);
  };

  const downloadMappingTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['الصنف في النظام', 'اسم الصنف في الملف', 'نسبة الثقة', 'ملاحظة'],
      ['Adeaflam 75ml 6amp', 'ADEAFLAM AMP 75MG', 'عالية', 'مثال توضيحي - استبدل هذا الصف'],
    ]);
    sheet['!cols'] = [{ wch: 38 }, { wch: 38 }, { wch: 14 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'الربط الكامل');
    XLSX.writeFile(workbook, 'قالب_قاموس_أسماء_الأصناف.xlsx');
  };

  // مطابقة تلقائية داخل الصفحة للصفوف غير المربوطة؛ تبقى «تحتاج مراجعة» ولا تُحفظ دون تحديدك.
  const autoMatchUnlinked = () => {
    const matcher = new ProductMatcher(products, aliases, '');
    const additions: Record<number, RowChoice> = {};
    rows.forEach((row) => {
      if (choices[row.rowNumber]?.productId) return;
      const match = matcher.match(row.rawName, undefined, { packSize: row.pack });
      const product = match.matchedProduct || match.suggestions[0]?.product;
      if (product) additions[row.rowNumber] = { productId: product.id, source: 'manual', exact: false, how: 'suggestion', include: false };
    });
    const found = Object.keys(additions).length;
    if (!found) { warning('لم أجد اقتراحات إضافية.'); return; }
    setChoices((old) => ({ ...old, ...additions }));
    success(`تم اقتراح ${found} ربطاً؛ راجعها في فلتر «مراجعة» ثم حدّدها.`);
  };

  const copyAIPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_MAPPING_PROMPT);
      setPromptCopied(true);
      success('تم نسخ البرومبت. أرفق معه ملف الأصناف وملف قاعدة البيانات في أداة الذكاء الاصطناعي.');
      window.setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      warning('تعذر النسخ التلقائي؛ حدد نص البرومبت الظاهر وانسخه يدوياً.');
    }
  };

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
            <h1 className="text-lg font-black text-slate-900">قاموس ربط أسماء الأصناف العام</h1>
            <p className="mt-1 text-xs leading-6 text-slate-600">اربط الاسم الرسمي في كتالوج LinkPharma بأي اسم أو صيغة بديلة، دون اختيار مورد. تُحفظ الروابط في قاموس المنصة وتُستخدم عند استيراد الأصناف والأسعار أينما ظهر الاسم.</p>
          </div>
        </div>
      </header>

      <section className="space-y-3 rounded-3xl border border-sky-200 bg-sky-50/70 p-5 shadow-xs">
        <div>
          <h2 className="text-sm font-black text-slate-900">ما ملف Excel المطلوب؟</h2>
          <p className="mt-1 text-xs leading-6 text-slate-700">ملف واحد بعمود للاسم الرسمي الموجود في قاعدة بيانات LinkPharma وعمود للاسم البديل كما يظهر في أي ملف مصدر. لا يوجد اختيار مورد؛ كل ربط معتمد يصبح عاماً لكل المنصة ولكل ملفات الاستيراد.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-sky-100 bg-white">
          <table className="w-full min-w-[32rem] text-right text-xs">
            <thead className="bg-sky-100 text-slate-700"><tr><th className="p-2.5">الصنف في النظام (الاسم التركيز العبوة+النوع)</th><th className="p-2.5">اسم الصنف في الملف (كما كتبه المستودع)</th><th className="p-2.5">نسبة الثقة</th></tr></thead>
            <tbody>
              <tr className="text-slate-600"><td className="p-2.5" dir="ltr">Adeaflam 75ml 6amp</td><td className="p-2.5" dir="ltr">ADEAFLAM AMP 75MG</td><td className="p-2.5">عالية</td></tr>
              <tr className="text-slate-500"><td colSpan={3} className="px-2.5 pb-2 text-[10px]">مثال توضيحي فقط؛ للصنف الرسمي الواحد يمكن تكرار اسمه في عدة صفوف، اسم بديل واحد بكل صف. لا يرتبط الربط بأي مورد. الأنواع المختصرة: <span dir="ltr">{FORM_ABBREVIATION_HELP}</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadMappingTemplate} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100"><Download className="h-4 w-4" /> تنزيل قالب Excel</button>
          <button type="button" onClick={() => void copyAIPrompt()} className="inline-flex items-center gap-2 rounded-xl bg-[#0f9d7a] px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"><Copy className="h-4 w-4" /> {promptCopied ? 'تم نسخ البرومبت' : 'نسخ برومبت الذكاء الاصطناعي'}</button>
          <button type="button" onClick={downloadCatalogNames} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50"><FileSpreadsheet className="h-4 w-4" /> تنزيل الأصناف الرئيسية (الاسم التركيز العبوة+النوع)</button>
        </div>
        <details className="rounded-xl border border-sky-100 bg-white p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-700">عرض البرومبت الجاهز وملاحظات المطابقة</summary>
          <p className="mt-2 whitespace-pre-line text-[11px] leading-6 text-slate-600">{AI_MAPPING_PROMPT}</p>
          <p className="mt-2 text-[11px] font-bold text-amber-800">مهم: احفظ كل صيغة بديلة مستخدمة فعلياً في الملفات. إذا كان الاسم ملتبساً أو اختلف التركيز/الشكل، اترك الصنف المقابل فارغاً ولا تخمّن.</p>
        </details>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs md:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="text-xs font-black text-emerald-900">قاموس عام مشترك</div>
          <p className="mt-1 text-[11px] leading-5 text-emerald-800">الأسماء البديلة المحفوظة للمنصة: {aliases.length}. لا تختار مورداً ولا يتغير نطاق الربط باختلاف المورد.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">ملف الربط (Excel)</label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50">
            <UploadCloud className="h-5 w-5" />
            <span>{fileName || 'اختر الملف أو اسحبه هنا'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
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
              <button type="button" onClick={autoMatchUnlinked} className="rounded-lg bg-violet-50 px-3 py-1.5 font-bold text-violet-700 hover:bg-violet-100">مطابقة تلقائية للأسماء المتشابهة</button>
              <button type="button" onClick={exportUnlinked} className="mr-auto inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-1.5 font-bold text-sky-700 hover:bg-sky-100"><Download className="h-3.5 w-3.5" /> تصدير غير المربوط</button>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-right text-xs">
                <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr><th className="w-10 p-3">✓</th><th className="p-3">اسم الصنف في الملف</th><th className="p-3">الثقة</th><th className="p-3">الحالة</th><th className="min-w-[18rem] p-3">الصنف في النظام</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((row) => {
                    const choice = choices[row.rowNumber];
                    const state = stateOf(row);
                    const hasOldConflict = existingConflict(row);
                    const locked = state === 'linked' || (state === 'conflict' && !hasOldConflict);
                    return (
                      <tr key={row.rowNumber} className="align-top hover:bg-slate-50/60">
                        <td className="p-3"><input type="checkbox" checked={Boolean(choice?.include) && !locked && (state !== 'conflict' || Boolean(choice?.replace))} disabled={locked || !choice?.productId || (state === 'conflict' && !choice?.replace)} onChange={(event) => setChoice(row.rowNumber, { include: event.target.checked })} className="h-4 w-4 accent-emerald-600" /></td>
                        <td className="p-3 font-bold text-slate-800" dir="ltr" style={{ textAlign: 'right' }}>{row.rawName}{row.note && <div className="mt-0.5 text-[10px] font-normal text-amber-700" dir="rtl">{row.note}</div>}</td>
                        <td className="p-3 text-[11px] font-black"><span className={({ high: 'text-emerald-700', medium: 'text-amber-700', low: 'text-rose-700', none: 'text-slate-400' } as const)[confidenceLevel(row.confidence)]}>{confidenceLabels[confidenceLevel(row.confidence)]}</span></td>
                        <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${stateStyle[state]}`}>{quickLinkStateLabels[state]}</span></td>
                        <td className="p-3">
                          <SearchSelect placeholder="ابحث واختر الصنف في النظام" options={productOptions} value={choice?.productId || ''} disabled={state === 'linked'} onChange={(id) => setChoice(row.rowNumber, { productId: id, source: 'manual', include: Boolean(id), replace: false })} />
                          {hasOldConflict && (
                            <label className="mt-1.5 flex items-start gap-1.5 text-[10px] font-bold text-fuchsia-700">
                              <input type="checkbox" checked={Boolean(choice?.replace)} onChange={(event) => setChoice(row.rowNumber, { replace: event.target.checked, include: event.target.checked })} className="mt-0.5 h-3.5 w-3.5 accent-fuchsia-600" />
                              <span>مربوط حالياً بـ «{productLabel(index.byId.get(existingFor(row) || '')) || 'صنف محذوف'}» — استبدال الربط القديم</span>
                            </label>
                          )}
                          {state === 'conflict' && !hasOldConflict && <div className="mt-1.5 text-[10px] font-bold text-fuchsia-700">هذا الاسم مختار لصنفين مختلفين في الملف؛ عدّل أحدهما.</div>}
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
              <span className="mr-3 text-[11px] font-bold text-slate-500">جديد {preview.fresh} · استبدال {preview.replace} · مكرر {preview.dupInFile + preview.linked} · تعارض {Math.max(0, preview.conflicts)}</span>
              {progress && <span className="mr-3 text-slate-500">جارٍ الحفظ {progress.done}/{progress.total}...</span>}
            </div>
            <button type="button" disabled={saving || !selectedRows.length} onClick={() => setConfirmOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#0f9d7a] px-5 py-2.5 text-xs font-black text-white shadow-xs hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Spinner /> : <Link2 className="h-4 w-4" />} اعتماد الربط ({selectedRows.length})
            </button>
          </div>
        </>
      )}

      <AliasDictionaryManager aliases={aliases} products={products} onChanged={setAliases} />

      {result && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-xs leading-7 text-emerald-900">
          <div className="mb-1 text-sm font-black">اكتمل الربط</div>
          تم حفظ <b>{result.saved}</b> · استُبدل <b>{result.replaced}</b> · كان مربوطاً مسبقاً <b>{result.alreadyLinked}</b> · تعارضات لم تُحفظ <b>{result.conflicts}</b> · فشل <b>{result.failed}</b>
          <div className="mt-3"><Link to="/admin/import" className="inline-flex items-center gap-1 rounded-xl bg-[#0f9d7a] px-4 py-2 font-black text-white hover:bg-emerald-700">انتقل إلى رفع الأسعار <ArrowLeft className="h-4 w-4" /></Link></div>
        </section>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={commit}
        title="اعتماد الربط"
        message={`معاينة: ${preview.fresh} ربط جديد، ${preview.replace} استبدال لربط قديم، ${preview.dupInFile} مكرر داخل الملف يُتجاهل، ${preview.linked} مربوط مسبقاً، ${Math.max(0, preview.conflicts)} تعارض غير محسوم لن يُحفظ. الربط عام لكل الموردين ولا يُستبدل أي ربط قديم إلا ما علّمته بالاستبدال.`}
        confirmText="اعتماد وحفظ"
      />
    </div>
  );
};
