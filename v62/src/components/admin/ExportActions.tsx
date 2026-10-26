import React from 'react';
import * as XLSX from 'xlsx';
import { FileJson, FileSpreadsheet, Printer } from 'lucide-react';

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
}

const toCell = (value: unknown): string | number | boolean => {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleString('ar');
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number | boolean;
};
const escapeHtml = (value: unknown) => String(toCell(value)).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const safeFilename = (name: string) => name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'linkpharma-export';

export function ExportActions<T>({ title, filename, data, columns }: ExportActionsProps<T>) {
  const rows = () => data.map((item) => Object.fromEntries(columns.map((column) => [column.label, toCell(column.value ? column.value(item) : (item as Record<string, unknown>)[column.key])]))) as Record<string, string | number | boolean>[];
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
  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(rows());
    sheet['!rtl'] = true;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'القائمة');
    XLSX.writeFile(workbook, `${safeFilename(filename)}.xlsx`);
  };
  const exportJson = () => download(`\uFEFF${JSON.stringify(rows(), null, 2)}`, 'application/json;charset=utf-8', 'json');
  const printPdf = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=750');
    if (!printWindow) return;
    const headers = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const body = data.map((item) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value ? column.value(item) : (item as Record<string, unknown>)[column.key])}</td>`).join('')}</tr>`).join('');
    const exportedAt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)} - LinkPharma</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#16312d;margin:28px;direction:rtl}.brand{border-bottom:3px solid #0f9d7a;padding:0 0 14px;margin-bottom:20px}.brand-name{font-size:23px;font-weight:800;color:#08785e}.brand h1{font-size:18px;margin:8px 0}.meta{font-size:11px;color:#64748b}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf6f2;color:#075b49}tr:nth-child(even){background:#f8fafc}@page{size:auto;margin:14mm}@media print{body{margin:0}}
    </style></head><body><header class="brand"><div class="brand-name">LinkPharma | لينك فارما</div><h1>${escapeHtml(title)}</h1><div class="meta">تاريخ التصدير: ${escapeHtml(exportedAt)} · عدد السجلات: ${data.length}</div></header><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };
  const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-800';
  return <div dir="rtl" className="flex flex-wrap items-center gap-2" aria-label="تصدير القائمة">
    <span className="text-xs font-semibold text-slate-500">تصدير {data.length} سجل:</span>
    <button type="button" className={buttonClass} onClick={exportExcel} title="تنزيل Excel"><FileSpreadsheet className="h-4 w-4 text-emerald-700" />Excel</button>
    <button type="button" className={buttonClass} onClick={exportJson} title="تنزيل JSON"><FileJson className="h-4 w-4 text-sky-700" />JSON</button>
    <button type="button" className={buttonClass} onClick={printPdf} title="طباعة أو حفظ PDF"><Printer className="h-4 w-4 text-rose-700" />PDF</button>
  </div>;
}
