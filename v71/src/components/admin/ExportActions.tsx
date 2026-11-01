import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Check, ChevronDown, FileJson, FileSpreadsheet, Printer, Settings2 } from 'lucide-react';

export interface ExportColumn<T> {
  key: string;
  label: string;
  value?: (row: T) => unknown;
}

interface ExportActionsProps<T> {
  title: string;
  filename: string;
  data: T[];
  columns: ExportColumn<T>[];
  prepareData?: (data: T[]) => Promise<T[]>;
}

const toCell = (value: unknown): string | number | boolean => {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleString('ar');
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number | boolean;
};
const escapeHtml = (value: unknown) => String(toCell(value)).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const safeFilename = (name: string) => name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'linkpharma-export';

export function ExportActions<T>({ title, filename, data, columns, prepareData }: ExportActionsProps<T>) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [showColumns, setShowColumns] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const selectedColumns = useMemo(() => columns.filter((column) => selectedKeys.includes(column.key)), [columns, selectedKeys]);
  const rows = (source: T[]) => source.map((item) => Object.fromEntries(selectedColumns.map((column) => [column.label, toCell(column.value ? column.value(item) : (item as Record<string, unknown>)[column.key])]))) as Record<string, string | number | boolean>[];
  const withPreparedData = async (run: (source: T[]) => void) => {
    if (!selectedColumns.length || preparing) return;
    setPreparing(true);
    try { run(prepareData ? await prepareData(data) : data); }
    catch (cause) { console.error('Export preparation failed', cause); window.alert('تعذر تجهيز بيانات التصدير. حاول مرة أخرى.'); }
    finally { setPreparing(false); }
  };
  const download = (content: BlobPart, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFilename(filename)}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportExcel = () => { void withPreparedData((source) => {
    const sheet = XLSX.utils.json_to_sheet(rows(source));
    sheet['!rtl'] = true;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'القائمة');
    XLSX.writeFile(workbook, `${safeFilename(filename)}.xlsx`);
  }); };
  const exportJson = () => { void withPreparedData((source) => download(`\uFEFF${JSON.stringify(rows(source), null, 2)}`, 'application/json;charset=utf-8', 'json')); };
  const printPdf = () => {
    if (!selectedColumns.length || preparing) return;
    // Open synchronously from the click gesture so browsers do not block the PDF window after async price loading.
    const printWindow = window.open('', '_blank', 'width=1000,height=750');
    if (!printWindow) return;
    void withPreparedData((source) => {
    const headers = selectedColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const body = source.map((item) => `<tr>${selectedColumns.map((column) => `<td>${escapeHtml(column.value ? column.value(item) : (item as Record<string, unknown>)[column.key])}</td>`).join('')}</tr>`).join('');
    const exportedAt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)} - LinkPharma</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#16312d;margin:28px;direction:rtl}.brand{border-bottom:3px solid #0f9d7a;padding:0 0 14px;margin-bottom:20px}.brand-name{font-size:23px;font-weight:800;color:#08785e}.brand h1{font-size:18px;margin:8px 0}.meta{font-size:11px;color:#64748b}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf6f2;color:#075b49}tr:nth-child(even){background:#f8fafc}@page{size:auto;margin:14mm}@media print{body{margin:0}}
    </style></head><body><header class="brand"><div class="brand-name">LinkPharma | لينك فارما</div><h1>${escapeHtml(title)}</h1><div class="meta">تاريخ التصدير: ${escapeHtml(exportedAt)} · عدد السجلات: ${data.length}</div></header><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
    });
  };
  const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-800';
  return <div dir="rtl" className="flex flex-wrap items-center gap-2" aria-label="تصدير القائمة">
    <span className="text-xs font-semibold text-slate-500">تصدير {data.length} سجل:</span>
    <div className="relative">
      <button type="button" className={buttonClass} onClick={() => setShowColumns((open) => !open)} aria-expanded={showColumns}><Settings2 className="h-4 w-4" />الأعمدة ({selectedColumns.length}/{columns.length})<ChevronDown className="h-3.5 w-3.5" /></button>
      {showColumns && <div className="absolute right-0 top-full z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 px-2 pb-2"><b className="text-xs">اختر أعمدة التصدير</b><button type="button" className="text-[10px] font-bold text-emerald-700" onClick={() => setSelectedKeys(columns.map((column) => column.key))}>الكل</button></div>
        {columns.map((column) => { const checked = selectedKeys.includes(column.key); return <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={checked} onChange={() => setSelectedKeys((keys) => checked ? keys.filter((key) => key !== column.key) : [...keys, column.key])} className="sr-only" /><span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3 w-3" />}</span>{column.label}</label>; })}
        <p className="px-2 pt-2 text-[10px] text-slate-500">لن يتم التصدير إذا لم تختر أي عمود.</p>
      </div>}
    </div>
    <button type="button" disabled={!selectedColumns.length || preparing} className={`${buttonClass} disabled:opacity-50`} onClick={exportExcel} title="تنزيل Excel"><FileSpreadsheet className="h-4 w-4 text-emerald-700" />{preparing ? 'جاري التجهيز...' : 'Excel'}</button>
    <button type="button" disabled={!selectedColumns.length || preparing} className={`${buttonClass} disabled:opacity-50`} onClick={exportJson} title="تنزيل JSON"><FileJson className="h-4 w-4 text-sky-700" />JSON</button>
    <button type="button" disabled={!selectedColumns.length || preparing} className={`${buttonClass} disabled:opacity-50`} onClick={printPdf} title="طباعة أو حفظ PDF"><Printer className="h-4 w-4 text-rose-700" />PDF</button>
  </div>;
}
