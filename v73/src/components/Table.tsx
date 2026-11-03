// src/components/Table.tsx
import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  selectedIds?: string[];
  onSelectRow?: (id: string) => void;
  onSelectAll?: () => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  // دالة تحويل الصف لبطاقة على الجوال اختيارياً
  mobileCardRender?: (item: T, isSelected: boolean, onToggleSelect?: () => void) => React.ReactNode;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  selectedIds,
  onSelectRow,
  onSelectAll,
  sortKey,
  sortDirection,
  onSort,
  mobileCardRender,
}: TableProps<T>) {
  const isAllSelected = data.length > 0 && selectedIds && selectedIds.length === data.length;
  const isSomeSelected = selectedIds && selectedIds.length > 0 && !isAllSelected;

  return (
    <div className="w-full">
      {/* عرض الجوال كبطاقات إن تم تقديم دالة مخصصة، وإلا جدول قابل للتمرير */}
      {mobileCardRender && (
        <div className="block lg:hidden space-y-3">
          {data.map((item) => {
            const id = keyExtractor(item);
            const isSelected = selectedIds ? selectedIds.includes(id) : false;
            return (
              <div key={id}>
                {mobileCardRender(item, isSelected, onSelectRow ? () => onSelectRow(id) : undefined)}
              </div>
            );
          })}
        </div>
      )}

      {/* عرض الجدول المكتبي (والجوال إذا لم يكن هناك mobileCardRender) */}
      <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs ${mobileCardRender ? 'hidden lg:block' : 'block'}`}>
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
            <tr>
              {onSelectRow && onSelectAll && (
                <th className="py-3.5 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(isAllSelected)}
                    ref={(el) => {
                      if (el) el.indeterminate = Boolean(isSomeSelected);
                    }}
                    onChange={onSelectAll}
                    className="w-4 h-4 rounded text-[#0f9d7a] focus:ring-[#0f9d7a] border-slate-300 accent-[#0f9d7a] cursor-pointer"
                  />
                </th>
              )}

              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && onSort && onSort(col.key)}
                    className={`py-3.5 px-4 font-bold ${
                      col.sortable ? 'cursor-pointer select-none hover:text-slate-900' : ''
                    } ${col.className || ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-400">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#0f9d7a]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#0f9d7a]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-700">
            {data.map((item, index) => {
              const id = keyExtractor(item);
              const isSelected = selectedIds ? selectedIds.includes(id) : false;

              return (
                <tr
                  key={id}
                  className={`transition-colors hover:bg-slate-50/70 ${
                    isSelected ? 'bg-emerald-50/40' : ''
                  }`}
                >
                  {onSelectRow && (
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectRow(id)}
                        className="w-4 h-4 rounded text-[#0f9d7a] focus:ring-[#0f9d7a] border-slate-300 accent-[#0f9d7a] cursor-pointer"
                      />
                    </td>
                  )}

                  {columns.map((col) => (
                    <td key={col.key} className={`py-3 px-4 ${col.className || ''}`}>
                      {col.render ? col.render(item, index) : (item as any)[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
