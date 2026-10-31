import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, BookOpen, Check, ChevronDown, CopyCheck, Edit3, Layers3, LoaderCircle, PackageSearch, Search, Sparkles, X } from 'lucide-react';
import type { Product, ProductAlias } from '../../types';
import {
  getGlobalProductAliases,
  getProducts,
  invalidateCache,
  retargetGlobalProductAliasesBatch,
  updateGlobalProductAlias,
} from '../../services/dataStorage';
import { useToastStore } from '../../store/useToastStore';
import { SearchSelect } from '../../components/SearchSelect';
import { Pagination } from '../../components/Pagination';
import { formatCatalogName } from '../../utils/catalogNameFormat';
import { normalizeArabic } from '../../utils/arabicNormalize';
import {
  createAliasSimilarityIndex,
  createProductSuggestionIndex,
  findExactDuplicateAliasGroups,
  findSimilarAliasPairs,
  suggestProductsForAlias,
  type AliasDuplicateGroup,
  type ProductAliasSuggestion,
  type SimilarAliasPair,
} from '../../utils/aliasSuggestions';

const PAGE_SIZE = 25;
const ANALYSIS_CHUNK_SIZE = 60;
const MAX_BULK_SELECTION = 400;
type Filter = 'all' | 'linked' | 'empty' | 'orphans';
type ViewMode = 'catalog' | 'suggestions' | 'duplicates';
interface SuggestedAliasRow { alias: ProductAlias; suggestions: ProductAliasSuggestion[] }

export const AliasManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [page, setPage] = useState(1);
  const [orphanPage, setOrphanPage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);
  const [exactPage, setExactPage] = useState(1);
  const [similarPage, setSimilarPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftProductId, setDraftProductId] = useState('');
  const [savingId, setSavingId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkProductId, setBulkProductId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [suggestionRows, setSuggestionRows] = useState<SuggestedAliasRow[]>([]);
  const [exactDuplicateGroups, setExactDuplicateGroups] = useState<AliasDuplicateGroup[]>([]);
  const [similarAliasPairs, setSimilarAliasPairs] = useState<SimilarAliasPair[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const { success, error } = useToastStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      invalidateCache(['globalProductAliases_v1']);
      const [loadedProducts, loadedAliases] = await Promise.all([getProducts(), getGlobalProductAliases()]);
      setProducts(loadedProducts);
      setAliases(loadedAliases);
      setSelectedIds([]);
    } catch (exception) {
      error(exception instanceof Error ? exception.message : 'تعذر تحميل الكتالوج وقاموس الأسماء.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => { void load(); }, [load]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const aliasesByProduct = useMemo(() => {
    const grouped = new Map<string, ProductAlias[]>();
    aliases.forEach((alias) => {
      const list = grouped.get(alias.productId) || [];
      list.push(alias);
      grouped.set(alias.productId, list);
    });
    grouped.forEach((list) => list.sort((a, b) => a.rawName.localeCompare(b.rawName, 'ar')));
    return grouped;
  }, [aliases]);
  const productOptions = useMemo(() => products.map((product) => ({
    id: product.id,
    label: formatCatalogName(product),
    subLabel: product.manufacturer || '',
  })), [products]);
  const orphanAliases = useMemo(() => aliases
    .filter((alias) => !productById.has(alias.productId))
    .filter((alias) => !query.trim() || normalizeArabic(alias.rawName).includes(normalizeArabic(query.trim())))
    .sort((a, b) => a.rawName.localeCompare(b.rawName, 'ar')),
  [aliases, productById, query]);
  const normalizedQuery = normalizeArabic(query.trim());
  const filteredProducts = useMemo(() => products
    .filter((product) => {
      const linkedCount = aliasesByProduct.get(product.id)?.length || 0;
      if (filter === 'linked' && linkedCount === 0) return false;
      if (filter === 'empty' && linkedCount !== 0) return false;
      if (filter === 'orphans') return false;
      if (!normalizedQuery) return true;
      const searchable = [
        formatCatalogName(product), product.manufacturer, product.category,
        ...(aliasesByProduct.get(product.id) || []).map((alias) => alias.rawName),
      ].join(' ');
      return normalizeArabic(searchable).includes(normalizedQuery);
    })
    .sort((a, b) => formatCatalogName(a).localeCompare(formatCatalogName(b), 'ar')),
  [products, aliasesByProduct, filter, normalizedQuery]);
  const productPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pageProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const orphanPages = Math.max(1, Math.ceil(orphanAliases.length / PAGE_SIZE));
  const pageOrphans = orphanAliases.slice((orphanPage - 1) * PAGE_SIZE, orphanPage * PAGE_SIZE);
  const linkedProductsCount = products.filter((product) => (aliasesByProduct.get(product.id)?.length || 0) > 0).length;
  const selectedAliases = useMemo(() => selectedIds.map((id) => aliases.find((alias) => alias.id === id)).filter((alias): alias is ProductAlias => Boolean(alias)), [aliases, selectedIds]);

  useEffect(() => {
    if (viewMode !== 'suggestions' || loading) return undefined;
    let cancelled = false;
    let timer = 0;
    let cursor = 0;
    setSuggestionRows([]);
    setAnalysisProgress(0);
    setAnalysisBusy(aliases.length > 0);
    if (!aliases.length) { setAnalysisBusy(false); return undefined; }
    const index = createProductSuggestionIndex(products);
    const processChunk = () => {
      if (cancelled) return;
      const end = Math.min(cursor + ANALYSIS_CHUNK_SIZE, aliases.length);
      const chunk: SuggestedAliasRow[] = [];
      for (const alias of aliases.slice(cursor, end)) {
        const suggestions = suggestProductsForAlias(alias, index);
        if (suggestions.length) chunk.push({ alias, suggestions });
      }
      cursor = end;
      setSuggestionRows((current) => current.concat(chunk));
      setAnalysisProgress(cursor);
      if (cursor < aliases.length) timer = window.setTimeout(processChunk, 0);
      else setAnalysisBusy(false);
    };
    timer = window.setTimeout(processChunk, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [aliases, loading, products, viewMode]);

  useEffect(() => {
    if (viewMode !== 'duplicates' || loading) return undefined;
    let cancelled = false;
    let timer = 0;
    let cursor = 0;
    setExactDuplicateGroups(findExactDuplicateAliasGroups(aliases));
    setSimilarAliasPairs([]);
    setAnalysisProgress(0);
    setAnalysisBusy(aliases.length > 0);
    if (!aliases.length) { setAnalysisBusy(false); return undefined; }
    const index = createAliasSimilarityIndex(aliases);
    let pairCount = 0;
    const processChunk = () => {
      if (cancelled) return;
      const end = Math.min(cursor + ANALYSIS_CHUNK_SIZE, aliases.length);
      const pairs = findSimilarAliasPairs(aliases, index, Math.max(0, 1200 - pairCount), cursor, end);
      cursor = end;
      pairCount += pairs.length;
      setSimilarAliasPairs((current) => current.concat(pairs));
      setAnalysisProgress(cursor);
      if (cursor < aliases.length && pairCount < 1200) timer = window.setTimeout(processChunk, 0);
      else setAnalysisBusy(false);
    };
    timer = window.setTimeout(processChunk, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [aliases, loading, viewMode]);

  const beginEdit = (alias: ProductAlias, suggestedProductId?: string) => {
    setEditingId(alias.id);
    setDraftName(alias.rawName);
    setDraftProductId(suggestedProductId || alias.productId);
  };
  const cancelEdit = () => { setEditingId(null); setDraftName(''); setDraftProductId(''); };
  const saveEdit = async (alias: ProductAlias) => {
    const value = draftName.trim();
    if (!value) return error('اكتب الاسم البديل قبل الحفظ.');
    if (!draftProductId || !productById.has(draftProductId)) return error('اختر صنفاً موجوداً في الكتالوج.');
    if (draftProductId !== alias.productId) {
      const oldProduct = productById.get(alias.productId);
      const newProduct = productById.get(draftProductId);
      if (!window.confirm(`سيُنقل الاسم «${alias.rawName}» من «${oldProduct ? formatCatalogName(oldProduct) : 'صنف محذوف'}» إلى «${newProduct ? formatCatalogName(newProduct) : ''}». هل تريد المتابعة؟`)) return;
    }
    setSavingId(alias.id);
    try {
      const saved = await updateGlobalProductAlias(alias, { rawName: value, productId: draftProductId });
      setAliases((current) => [...current.filter((item) => item.id !== alias.id), saved]);
      cancelEdit();
      success('تم تحديث الاسم وربطه بالصنف المحدد.');
    } catch (exception) {
      error(exception instanceof Error ? exception.message : 'تعذر تحديث الاسم أو الربط.');
    } finally { setSavingId(''); }
  };
  const toggleSelected = (aliasId: string) => {
    setSelectedIds((current) => current.includes(aliasId) ? current.filter((id) => id !== aliasId) : current.length >= MAX_BULK_SELECTION ? current : [...current, aliasId]);
  };
  const selectGroup = (group: ProductAlias[]) => {
    setSelectedIds((current) => [...new Set([...current, ...group.map((alias) => alias.id)])].slice(0, MAX_BULK_SELECTION));
  };
  const applyBulkTarget = async () => {
    if (!bulkProductId || !productById.has(bulkProductId)) return error('اختر الصنف الجديد أولاً.');
    if (!selectedAliases.length) return error('حدد اسماً واحداً على الأقل.');
    const target = productById.get(bulkProductId)!;
    const sample = selectedAliases.slice(0, 4).map((alias) => `• ${alias.rawName}`).join('\n');
    const more = selectedAliases.length > 4 ? `\n• و${selectedAliases.length - 4} أسماء أخرى` : '';
    if (!window.confirm(`سيتم نقل ربط ${selectedAliases.length} اسماً إلى «${formatCatalogName(target)}» دون تغيير نصوصها.\n${sample}${more}\n\nلن يحدث النقل إلا بعد تأكيدك. متابعة؟`)) return;
    setBulkSaving(true);
    try {
      const updated = await retargetGlobalProductAliasesBatch(selectedAliases, bulkProductId);
      const updatedById = new Map(updated.map((alias) => [alias.id, alias]));
      setAliases((current) => current.map((alias) => updatedById.get(alias.id) || alias));
      setSelectedIds([]);
      setBulkProductId('');
      success(updated.length ? `تم نقل ربط ${updated.length} اسماً بنجاح.` : 'الأسماء المحددة مرتبطة بهذا الصنف بالفعل.');
    } catch (exception) {
      error(exception instanceof Error ? exception.message : 'تعذر تطبيق النقل الجماعي. حدّث البيانات ثم أعد المحاولة.');
    } finally { setBulkSaving(false); }
  };
  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(1); setOrphanPage(1); setReviewPage(1); setExactPage(1); setSimilarPage(1);
  };
  const changeQuery = (value: string) => {
    setQuery(value); setPage(1); setOrphanPage(1); setReviewPage(1); setExactPage(1); setSimilarPage(1);
  };

  const renderAlias = (alias: ProductAlias) => {
    const currentProduct = productById.get(alias.productId);
    const isSaving = savingId === alias.id;
    const isSelected = selectedIds.includes(alias.id);
    return (
      <div key={alias.id} className={`rounded-xl border p-3 ${isSelected ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
        <div className="mb-2 flex justify-end">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(alias.id)} disabled={bulkSaving || (!isSelected && selectedIds.length >= MAX_BULK_SELECTION)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            تحديد للنقل الجماعي
          </label>
        </div>
        {editingId === alias.id ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(18rem,1.2fr)_auto] lg:items-end">
            <label className="block text-xs font-bold text-slate-600">الاسم البديل<input dir="auto" value={draftName} onChange={(event) => setDraftName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500" /></label>
            <div><SearchSelect label="الصنف المرتبط" placeholder="اكتب أو ابحث عن الصنف" options={productOptions} value={draftProductId} onChange={setDraftProductId} disabled={isSaving} /></div>
            <div className="flex gap-2">
              <button type="button" disabled={isSaving} onClick={() => void saveEdit(alias)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50"><Check className="h-4 w-4" />{isSaving ? 'جارٍ الحفظ' : 'حفظ'}</button>
              <button type="button" disabled={isSaving} onClick={cancelEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-50"><X className="h-4 w-4" />إلغاء</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p dir="auto" className="break-words text-sm font-black text-slate-800">{alias.rawName}</p><p className="mt-1 text-[11px] text-slate-500">مرتبط بـ: <span className="font-bold text-slate-700">{currentProduct ? formatCatalogName(currentProduct) : 'صنف غير موجود في الكتالوج'}</span></p></div>
            <button type="button" onClick={() => beginEdit(alias)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"><Edit3 className="h-4 w-4" />تعديل الاسم أو الربط</button>
          </div>
        )}
      </div>
    );
  };

  const filteredSuggestions = useMemo(() => suggestionRows.filter(({ alias, suggestions }) => {
    if (!normalizedQuery) return true;
    const text = [alias.rawName, ...suggestions.map(({ product }) => formatCatalogName(product))].join(' ');
    return normalizeArabic(text).includes(normalizedQuery);
  }), [normalizedQuery, suggestionRows]);
  const reviewPages = Math.max(1, Math.ceil(filteredSuggestions.length / PAGE_SIZE));
  const pageSuggestions = filteredSuggestions.slice((reviewPage - 1) * PAGE_SIZE, reviewPage * PAGE_SIZE);
  const matchingExactGroups = useMemo(() => exactDuplicateGroups.filter((group) => !normalizedQuery || normalizeArabic(group.aliases.map((alias) => alias.rawName).join(' ')).includes(normalizedQuery)), [exactDuplicateGroups, normalizedQuery]);
  const exactPages = Math.max(1, Math.ceil(matchingExactGroups.length / PAGE_SIZE));
  const pageExactGroups = matchingExactGroups.slice((exactPage - 1) * PAGE_SIZE, exactPage * PAGE_SIZE);
  const matchingSimilarPairs = useMemo(() => similarAliasPairs.filter((pair) => !normalizedQuery || normalizeArabic(`${pair.left.rawName} ${pair.right.rawName}`).includes(normalizedQuery)), [normalizedQuery, similarAliasPairs]);
  const similarPages = Math.max(1, Math.ceil(matchingSimilarPairs.length / PAGE_SIZE));
  const pageSimilarPairs = matchingSimilarPairs.slice((similarPage - 1) * PAGE_SIZE, similarPage * PAGE_SIZE);

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: 'كل الأصناف', count: products.length },
    { id: 'linked', label: 'لديها أسماء', count: linkedProductsCount },
    { id: 'empty', label: 'بلا أسماء', count: products.length - linkedProductsCount },
    { id: 'orphans', label: 'أسماء لصنف محذوف', count: aliases.filter((alias) => !productById.has(alias.productId)).length },
  ];
  const views: Array<{ id: ViewMode; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'catalog', label: 'الكتالوج', count: products.length, icon: <BookOpen className="h-4 w-4" /> },
    { id: 'suggestions', label: 'اقتراحات الربط', count: suggestionRows.length, icon: <Sparkles className="h-4 w-4" /> },
    { id: 'duplicates', label: 'التكرارات والتشابه', count: exactDuplicateGroups.length + similarAliasPairs.length, icon: <CopyCheck className="h-4 w-4" /> },
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-1 sm:p-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><BookOpen className="h-6 w-6" /></div><div><h1 className="text-2xl font-black text-slate-900">إدارة الأسماء المرتبطة</h1><p className="mt-1 text-sm text-slate-500">راجع اقتراحات التشابه والتكرار، واعتمد الربط يدوياً بعد التحقق من بيانات الدواء.</p></div></div>
        <button type="button" onClick={() => void load()} disabled={loading || bulkSaving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"><LoaderCircle className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />تحديث البيانات</button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['إجمالي الأصناف التجارية', products.length],
          ['إجمالي الأسماء في القاموس العام', aliases.length],
          ['أصناف لديها اسم بديل واحد على الأقل', linkedProductsCount],
          ['أسماء مرتبطة بصنف محذوف', aliases.filter((alias) => !productById.has(alias.productId)).length],
        ].map(([label, count]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{loading ? '—' : count}</p></div>)}
      </div>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2" aria-label="طرق مراجعة القاموس">
        {views.map((view) => <button key={view.id} type="button" onClick={() => setMode(view.id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${viewMode === view.id ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{view.icon}{view.label}<span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px]">{view.count}</span></button>)}
      </nav>

      {selectedIds.length > 0 && (
        <section className="sticky top-2 z-20 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-lg">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-black text-emerald-950"><Layers3 className="h-4 w-4" />تعديل جماعي للربط · {selectedIds.length} / {MAX_BULK_SELECTION}</p><p className="mt-1 text-[11px] leading-5 text-emerald-900">انقل الأسماء المحددة إلى صنف واحد. لن يتغير نص أي اسم، ولن يتم التعديل قبل التأكيد.</p><button type="button" disabled={bulkSaving} onClick={() => setSelectedIds([])} className="mt-2 text-[11px] font-bold text-slate-600 underline">إلغاء التحديد</button></div>
            <div className="w-full lg:max-w-xl"><SearchSelect label="الصنف المستهدف للأسماء المحددة" placeholder="ابحث واختر الصنف الجديد" options={productOptions} value={bulkProductId} onChange={setBulkProductId} disabled={bulkSaving} /></div>
            <button type="button" disabled={bulkSaving || !bulkProductId} onClick={() => void applyBulkTarget()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><ArrowRightLeft className="h-4 w-4" />{bulkSaving ? 'جارٍ النقل...' : 'نقل المحدد'}</button>
          </div>
        </section>
      )}

      {aliases.some((alias) => !productById.has(alias.productId)) && viewMode === 'catalog' && filter !== 'orphans' && (
        <button type="button" onClick={() => { setFilter('orphans'); setPage(1); setOrphanPage(1); }} className="flex w-full items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right hover:bg-amber-100"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><span className="text-xs font-bold leading-6 text-amber-900">يوجد {aliases.filter((alias) => !productById.has(alias.productId)).length} اسم مرتبط بصنف لم يعد موجوداً. افتح القائمة لإعادة ربطها بصنف صحيح.</span></button>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={viewMode === 'suggestions' ? 'ابحث عن اسم أو صنف مقترح...' : viewMode === 'duplicates' ? 'ابحث في مجموعات التكرار والتشابه...' : filter === 'orphans' ? 'ابحث في الأسماء التي تحتاج إعادة ربط...' : 'ابحث باسم الصنف أو الشركة أو الاسم البديل...'} className="w-full rounded-xl border border-slate-200 py-3 pr-10 pl-3 text-sm outline-none focus:border-emerald-400" /></div>
        {viewMode === 'catalog' && <div className="mt-3 flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} type="button" onClick={() => { setFilter(item.id); setPage(1); setOrphanPage(1); }} className={`rounded-xl px-3 py-2 text-xs font-black transition ${filter === item.id ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{item.label} <span className="mr-1 opacity-75">({item.count})</span></button>)}</div>}
      </section>

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-600" />جارٍ تحميل الأصناف والأسماء...</div> : viewMode === 'catalog' ? filter === 'orphans' ? (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="font-black text-slate-800">أسماء تحتاج إعادة ربط</h2></div>{pageOrphans.length ? pageOrphans.map(renderAlias) : <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">لا توجد أسماء يتيمة تطابق البحث.</div>}<Pagination currentPage={orphanPage} totalPages={orphanPages} onPageChange={setOrphanPage} totalItems={orphanAliases.length} pageSize={PAGE_SIZE} /></section>
      ) : (
        <section className="space-y-3">{pageProducts.length ? pageProducts.map((product) => {
          const productAliases = aliasesByProduct.get(product.id) || [];
          return <details key={product.id} className="group rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-3 p-4"><div className="rounded-xl bg-slate-50 p-2 text-slate-500"><PackageSearch className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{formatCatalogName(product)}</p><p className="mt-1 truncate text-xs text-slate-500">{product.manufacturer || 'الشركة غير محددة'}{product.category ? ` · ${product.category}` : ''}</p></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${productAliases.length ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{productAliases.length} اسم</span><ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary><div className="space-y-2 border-t border-slate-100 p-3 sm:p-4">{productAliases.length ? productAliases.map(renderAlias) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">لا توجد أسماء بديلة مرتبطة بهذا الصنف في القاموس العام.</div>}</div></details>;
        }) : <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">لا توجد أصناف تطابق البحث أو المرشح المحدد.</div>}<Pagination currentPage={page} totalPages={productPages} onPageChange={setPage} totalItems={filteredProducts.length} pageSize={PAGE_SIZE} /></section>
      ) : viewMode === 'suggestions' ? (
        <section className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div><h2 className="text-sm font-black text-sky-950">اقتراحات للمراجعة فقط</h2><p className="mt-1 text-xs leading-5 text-sky-900">هذه نتائج تشابه نصي وليست مطابقة مؤكدة. افحص التركيز والشكل والعبوة، ثم اضغط «مراجعة الربط» لاعتماد المرشح يدوياً.</p></div></div>
          {analysisBusy && <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-600"><LoaderCircle className="ml-2 inline h-4 w-4 animate-spin text-emerald-600" />يحلل الأسماء تدريجياً: {analysisProgress} من {aliases.length}</div>}
          {pageSuggestions.map(({ alias, suggestions }) => <article key={alias.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">{renderAlias(alias)}<div className="space-y-2 border-r-2 border-sky-200 pr-3">{suggestions.map((suggestion) => <div key={suggestion.product.id} className="flex flex-col gap-2 rounded-xl bg-sky-50/70 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-800">مرشح: {formatCatalogName(suggestion.product)}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]"><span className={`rounded-full px-2 py-1 font-black ${suggestion.confidence === 'high' ? 'bg-emerald-100 text-emerald-800' : suggestion.confidence === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>تشابه {Math.round(suggestion.score * 100)}% · {suggestion.confidence === 'high' ? 'مرتفع' : suggestion.confidence === 'medium' ? 'متوسط' : 'منخفض'}</span>{suggestion.warnings.map((warning) => <span key={warning} className="font-bold text-amber-800">{warning}</span>)}</div></div><button type="button" onClick={() => beginEdit(alias, suggestion.product.id)} className="shrink-0 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-800 hover:bg-sky-100">مراجعة الربط</button></div>)}</div></article>)}
          {!analysisBusy && !pageSuggestions.length && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{suggestionRows.length ? 'لا توجد اقتراحات تطابق البحث.' : 'لم تظهر أسماء ذات مرشحين كافيين. يمكنك متابعة التعديل اليدوي من تبويب الكتالوج.'}</div>}
          <Pagination currentPage={reviewPage} totalPages={reviewPages} onPageChange={setReviewPage} totalItems={filteredSuggestions.length} pageSize={PAGE_SIZE} />
        </section>
      ) : (
        <section className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="text-sm font-black text-amber-950">التكرار أو التشابه تنبيه للمراجعة وليس حذفاً أو نقلاً تلقائياً</h2><p className="mt-1 text-xs leading-5 text-amber-900">قد تكون أسماء متقاربة لأدوية مختلفة. راجع التركيز والشكل الدوائي قبل اختيار أي إجراء جماعي.</p></div></div>
          {analysisBusy && <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-600"><LoaderCircle className="ml-2 inline h-4 w-4 animate-spin text-emerald-600" />يفحص القاموس تدريجياً: {analysisProgress} من {aliases.length}</div>}
          <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><CopyCheck className="h-4 w-4 text-rose-600" />أسماء متطابقة بعد التطبيع ({matchingExactGroups.length})</h2><span className="text-[10px] text-slate-500">اختلافات المسافات والكتابة المعتادة تُوحّد</span></div>
            {pageExactGroups.map((group) => <div key={group.normalizedName} className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-rose-900">{group.aliases.length} سجل للاسم «{group.aliases[0].rawName}»</p><button type="button" onClick={() => selectGroup(group.aliases)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[11px] font-black text-rose-800">حدد المجموعة للنقل الجماعي</button></div>{group.aliases.map(renderAlias)}</div>)}
            {!analysisBusy && !pageExactGroups.length && <p className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-500">لا توجد أسماء متطابقة تطابق البحث.</p>}
            <Pagination currentPage={exactPage} totalPages={exactPages} onPageChange={setExactPage} totalItems={matchingExactGroups.length} pageSize={PAGE_SIZE} />
          </div>
          <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Sparkles className="h-4 w-4 text-amber-600" />أسماء متقاربة تحتاج تحققاً ({matchingSimilarPairs.length})</h2><span className="text-[10px] text-slate-500">تُعرض الأزواج الأعلى تشابهاً</span></div>
            {pageSimilarPairs.map((pair) => <div key={`${pair.left.id}:${pair.right.id}`} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><span className="text-[11px] font-black text-amber-800">تشابه {Math.round(pair.score * 100)}%</span><button type="button" onClick={() => selectGroup([pair.left, pair.right])} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600">حدد الاسمين</button></div><div className="grid gap-2 sm:grid-cols-2">{renderAlias(pair.left)}{renderAlias(pair.right)}</div></div>)}
            {!analysisBusy && !pageSimilarPairs.length && <p className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-500">لا توجد أسماء متقاربة تطابق البحث.</p>}
            <Pagination currentPage={similarPage} totalPages={similarPages} onPageChange={setSimilarPage} totalItems={matchingSimilarPairs.length} pageSize={PAGE_SIZE} />
          </div>
          {similarAliasPairs.length >= 1200 && <p className="text-center text-[11px] font-bold text-slate-500">عُرضت أول 1200 نتيجة تشابه للحد من تكرار النتائج. استخدم البحث لتضييق المراجعة.</p>}
        </section>
      )}
    </div>
  );
};
