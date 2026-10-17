/** أدوات جودة بيانات الاستيراد؛ مستقلة وقابلة للاختبار دون اتصال بالشبكة. */
import { normalizeArabic } from '../utils/arabicNormalize';

export type ProductKind = 'دواء' | 'مستلزم طبي' | 'مستحضرات تجميل' | 'عناية شخصية' | 'صنف تجاري' | 'غير مصنف';
export interface ImportIssue { rowNumber: number; name: string; price: number | null; reason: string; severity: 'error' | 'warning' }
export interface PriceChange { previous: number; next: number; changePercent: number; unusual: boolean }

export function normalizeProductName(value: unknown): string {
  return normalizeArabic(String(value ?? ''))
    .replace(/\b(mg|ml|mcg|g|kg|iu|٪|%)\b/gi, (m) => m.toLowerCase())
    .replace(/\s+/g, ' ').trim();
}

export function classifyProduct(name: string): ProductKind {
  const n = normalizeProductName(name);
  if (/مستلزم|شاش|ضماد|سرنجه|حقنه|كانيولا|قسطرة|قفاز|كمامه|كمامة|قطن طبي|ميزان حرارة|ترمومتر|جهاز ضغط|جهاز سكر/.test(n)) return 'مستلزم طبي';
  if (/كريم تجميل|سيروم|واقي شمس|مكياج|روج|احمر شفاه|ماسكارا|كحل|بودره تجميل|مستحضر تجميل/.test(n)) return 'مستحضرات تجميل';
  if (/شامبو|بلسم|غسول وجه|مرطب|مزيل عرق|صابون|معجون اسنان|فرشاة اسنان/.test(n)) return 'عناية شخصية';
  if (/دواء|اقراص|كبسول|شراب|حقن|مرهم|قطره|قطرات|تحاميل|مضاد حيوي|باراسيتامول|ايبوبروفين/.test(n)) return 'دواء';
  return 'غير مصنف';
}

export function isValidBarcode(value: string): boolean {
  const code = String(value ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(code.length)) return false;
  let sum = 0;
  let weight = 3;
  for (let i = code.length - 2; i >= 0; i--) {
    sum += Number(code[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

export function comparePrice(previous: number, next: number, thresholdPercent = 40): PriceChange {
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0 || next < 0) {
    return { previous, next, changePercent: 0, unusual: true };
  }
  const changePercent = Number((((next - previous) / previous) * 100).toFixed(1));
  return { previous, next, changePercent, unusual: Math.abs(changePercent) >= thresholdPercent };
}

export function findDuplicateNames<T extends { tradeName: string; id?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeProductName(item.tradeName);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return new Map([...groups].filter(([, values]) => values.length > 1));
}

export function validateImportRows<T extends { rowNumber: number; rawName: string; rawPrice: number | null; isValid: boolean; validationError?: string }>(rows: T[]): ImportIssue[] {
  return rows.filter((r) => !r.isValid || !r.rawName.trim() || r.rawPrice === null || !Number.isFinite(r.rawPrice) || r.rawPrice <= 0)
    .map((r) => ({ rowNumber: r.rowNumber, name: r.rawName, price: r.rawPrice, reason: r.validationError || 'بيانات الصف غير صالحة', severity: 'error' as const }));
}

export function makeImportReportCsv(issues: ImportIssue[]): string {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [['رقم الصف', 'اسم الصنف', 'السعر', 'السبب', 'الخطورة'], ...issues.map(i => [i.rowNumber, i.name, i.price ?? '', i.reason, i.severity === 'error' ? 'خطأ' : 'تنبيه'])]
    .map(row => row.map(escape).join(',')).join('\r\n');
}

export function splitIntoChunks<T>(items: T[], size = 400): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('حجم الدفعة يجب أن يكون عددًا صحيحًا موجبًا.');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function saveImportProgress(batchKey: string, completedRows: number): void {
  try { localStorage.setItem(`linkpharma_import_progress_${batchKey}`, String(Math.max(0, Math.floor(completedRows)))); } catch { /* التخزين قد يكون معطلاً */ }
}
export function getImportProgress(batchKey: string): number {
  try { const n = Number(localStorage.getItem(`linkpharma_import_progress_${batchKey}`) || 0); return Number.isFinite(n) ? Math.max(0, n) : 0; } catch { return 0; }
}
export function clearImportProgress(batchKey: string): void {
  try { localStorage.removeItem(`linkpharma_import_progress_${batchKey}`); } catch { /* التخزين قد يكون معطلاً */ }
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export function safeImportBatchKey(supplierId: string, fileName: string): string {
  return `${normalizeProductName(supplierId)}_${normalizeProductName(fileName)}`.replace(/[^\u0600-\u06FFa-z0-9_-]/gi, '_').slice(0, 120);
}
