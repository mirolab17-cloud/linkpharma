import React, { useMemo, useState } from 'react';
import { Search, Trash2, BookOpen } from 'lucide-react';
import { Product, ProductAlias } from '../../types';
import { changeGlobalProductAliasTarget, deleteGlobalProductAlias, getGlobalProductAliases } from '../../services/dataStorage';
import { useToastStore } from '../../store/useToastStore';
import { SearchSelect } from '../../components/SearchSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { formatCatalogName } from '../../utils/catalogNameFormat';

const PAGE_SIZE = 25;

interface Props {
  aliases: ProductAlias[];
  products: Product[];
  onChanged: (aliases: ProductAlias[]) => void;
}

/** عرض القاموس العام الحالي: بحث، حذف ربط خاطئ، أو نقله إلى صنف آخر. */
export const AliasDictionaryManager: React.FC<Props> = ({ aliases, products, onChanged }) => {
  const { success, error, warning } = useToastStore();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<ProductAlias | null>(null);
  const [busyId, setBusyId] = useState('');

  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const options = useMemo(() => products.map((product) => ({ id: product.id, label: formatCatalogName(product), subLabel: product.manufacturer || '' })), [products]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = [...aliases].sort((a, b) => a.rawName.localeCompare(b.rawName));
    if (!term) return list;
    return list.filter((alias) => alias.rawName.toLowerCase().includes(term) || formatCatalogName(byId.get(alias.productId) || { tradeName: '', strength: '', form: '' }).toLowerCase().includes(term));
  }, [aliases, query, byId]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const refresh = async () => onChanged(await getGlobalProductAliases().catch(() => aliases));

  const remove = async () => {
    const alias = toDelete;
    setToDelete(null);
    if (!alias) return;
    setBusyId(alias.id);
    try {
      await deleteGlobalProductAlias(alias);
      await refresh();
      success('تم حذف الاسم البديل من القاموس.');
    } catch (exception: any) {
      error(exception?.message || 'تعذر حذف الاسم البديل.');
    } finally { setBusyId(''); }
  };

  const retarget = async (alias: ProductAlias, productId: string) => {
    if (!productId || productId === alias.productId) return;
    setBusyId(alias.id);
    try {
      const outcome = await changeGlobalProductAliasTarget(alias, productId);
      await refresh();
      if (outcome.replaced) success('تم نقل الاسم البديل إلى الصنف الجديد.');
      else warning('لم يتم النقل؛ أعد المحاولة.');
    } catch (exception: any) {
      error(exception?.message || 'تعذر تعديل الربط.');
    } finally { setBusyId(''); }
  };

  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-black text-slate-800"><BookOpen className="h-4 w-4 text-emerald-600" /> القاموس الحالي ({aliases.length}) — مراجعة وتعديل وحذف</summary>
      <div className="mt-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ابحث في الاسم البديل أو الصنف..." className="w-full rounded-xl border border-slate-200 py-2.5 pr-9 pl-3 text-xs outline-hidden focus:border-emerald-400" />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[40rem] text-right text-xs">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="p-3">الاسم البديل</th><th className="min-w-[18rem] p-3">الصنف في النظام</th><th className="w-12 p-3" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((alias) => (
                <tr key={alias.id} className="align-top">
                  <td className="p-3 font-bold text-slate-800" dir="ltr" style={{ textAlign: 'right' }}>{alias.rawName}</td>
                  <td className="p-3">
                    {byId.has(alias.productId)
                      ? <SearchSelect placeholder="اختر الصنف" options={options} value={alias.productId} disabled={busyId === alias.id} onChange={(id) => void retarget(alias, id)} />
                      : <span className="text-[11px] font-bold text-rose-600">الصنف المرتبط محذوف من الكتالوج</span>}
                  </td>
                  <td className="p-3"><button type="button" disabled={busyId === alias.id} onClick={() => setToDelete(alias)} title="حذف" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {!pageRows.length && <tr><td colSpan={3} className="p-6 text-center text-slate-400">لا توجد أسماء مطابقة.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>
      <ConfirmDialog isOpen={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={remove} title="حذف اسم بديل" message={`سيُحذف «${toDelete?.rawName || ''}» من القاموس العام، ولن يُربط تلقائياً بعد الآن.`} confirmText="حذف" />
    </details>
  );
};
