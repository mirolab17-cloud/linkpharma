// src/services/import.ts
import * as XLSX from 'xlsx';
import { cleanPrice } from '../utils/formatPrice';
import { convertArabicNumerals } from '../utils/arabicNormalize';

export interface SheetParseResult {
  sheetNames: string[];
  selectedSheet: string;
  previewRows: Array<{ rowNumber: number; cells: string[] }>;
  allRows: Array<{ rowNumber: number; cells: string[] }>;
  columnHeaders: string[];
}

export interface MappedPriceRow {
  rowNumber: number;
  rawTradeName: string;
  rawStrength?: string;
  rawForm?: string;
  rawName: string;
  rawPrice: number | null;
  rawPublicPrice?: number | null;
  rawBonus?: string;
  rawManufacturer?: string;
  rawPack?: string;
  rawAvailability?: string;
  rawExpiry?: string;
  isValid: boolean;
  validationError?: string;
}

/**
 * Read populated cells directly rather than relying only on Excel's declared !ref.
 * Some spreadsheet writers leave !ref truncated after edits, silently hiding later rows.
 */
export function extractWorksheetRows(worksheet: XLSX.WorkSheet): Array<{ rowNumber: number; cells: string[] }> {
  let maxRow = -1;
  let maxCol = -1;
  const addresses = Object.keys(worksheet).filter((key) => /^[A-Z]+[1-9]\d*$/.test(key));
  for (const address of addresses) {
    const cell = worksheet[address] as XLSX.CellObject | undefined;
    if (!cell || (cell.v === undefined && !cell.f)) continue;
    const position = XLSX.utils.decode_cell(address);
    maxRow = Math.max(maxRow, position.r);
    maxCol = Math.max(maxCol, position.c);
  }
  if (maxRow < 0 || maxCol < 0) return [];

  return Array.from({ length: maxRow + 1 }, (_, row) => ({
    rowNumber: row + 1,
    cells: Array.from({ length: maxCol + 1 }, (_, col) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
      const value = cell?.v !== undefined && cell?.v !== null ? cell.v : cell?.f ? cell.f : '';
      return String(value).trim();
    }),
  }));
}

/**
 * قراءة ملف Excel أو CSV
 */
export async function parseSpreadsheetFile(file: File, targetSheetName?: string): Promise<SheetParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('الملف فارغ أو لا يحتوي على أوراق عمل.');
  }

  const selectedSheet = targetSheetName && sheetNames.includes(targetSheetName) ? targetSheetName : sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];

  // قراءة الخلايا الفعلية تعالج ملفات فيها !ref ناقص بعد تحرير الملف.
  const rawRows = extractWorksheetRows(worksheet);
  const maxCols = rawRows.reduce((max, row) => Math.max(max, row.cells.length), 0);

  // توليد أسماء الأعمدة القياسية (A, B, C, ...)
  const columnHeaders: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    columnHeaders.push(XLSX.utils.encode_col(i)); // 'A', 'B', 'C', ...
  }

  const allRows = rawRows.map((row) => ({
    ...row,
    cells: Array.from({ length: maxCols }, (_, colIdx) => row.cells[colIdx] || ''),
  }));

  return {
    sheetNames,
    selectedSheet,
    previewRows: allRows.slice(0, 20),
    allRows,
    columnHeaders,
  };
}

/**
 * معالجة وتطبيق ربط الأعمدة (Column Mapping) وتنظيف البيانات
 */
export function processMappedRows(params: {
  allRows: Array<{ rowNumber: number; cells: string[] }>;
  startRow: number; // 1-indexed
  nameColIdx: number;
  strengthColIdx?: number;
  formColIdx?: number;
  packColIdx?: number;
  manufacturerColIdx?: number;
  priceColIdx: number;
  publicPriceColIdx?: number;
  availColIdx?: number;
  expiryColIdx?: number;
  bonusColIdx?: number;
}): MappedPriceRow[] {
  const { allRows, startRow, nameColIdx, strengthColIdx, formColIdx, packColIdx, manufacturerColIdx, priceColIdx, publicPriceColIdx, availColIdx, expiryColIdx, bonusColIdx } = params;

  const validMappedRows: MappedPriceRow[] = [];

  for (let i = startRow - 1; i < allRows.length; i++) {
    const row = allRows[i];
    const baseName = row.cells[nameColIdx] || '';
    const strength = strengthColIdx !== undefined && strengthColIdx >= 0 ? row.cells[strengthColIdx] || '' : '';
    const form = formColIdx !== undefined && formColIdx >= 0 ? row.cells[formColIdx] || '' : '';
    const pack = packColIdx !== undefined && packColIdx >= 0 ? row.cells[packColIdx] || '' : '';
    const manufacturer = manufacturerColIdx !== undefined && manufacturerColIdx >= 0 ? row.cells[manufacturerColIdx] || '' : '';
    const rawName = [baseName, strength, form, pack].filter(Boolean).join(' ');
    const rawPriceCell = row.cells[priceColIdx] || '';

    // تخطي الصفوف الفارغة بالكامل حتى لو احتوى عمود غير مربوط على مسافة أو قيمة افتراضية.
    if (!row.cells.some((cell) => String(cell ?? '').trim() !== '')) continue;
    // صفوف لا تحتوي اسمًا ولا سعرًا لا يمكن استيرادها؛ تظل في التقرير فقط إن كان بها بيانات أخرى.
    if (!rawName.trim() && !rawPriceCell.trim()) continue;

    const price = cleanPrice(rawPriceCell);
    const publicPrice = publicPriceColIdx !== undefined && publicPriceColIdx >= 0 ? cleanPrice(row.cells[publicPriceColIdx]) : null;
    const rawAvailability = availColIdx !== undefined && availColIdx >= 0 ? row.cells[availColIdx]?.trim() : undefined;
    const rawExpiry = expiryColIdx !== undefined && expiryColIdx >= 0 ? row.cells[expiryColIdx]?.trim() : undefined;
    const rawBonus = bonusColIdx !== undefined && bonusColIdx >= 0 ? row.cells[bonusColIdx]?.trim() : undefined;

    // التحقق من صحة الصف
    let isValid = true;
    let validationError = '';

    if (!baseName.trim()) {
      isValid = false;
      validationError = 'اسم الصنف مفقود';
    } else if (price === null || isNaN(price) || price <= 0) {
      isValid = false;
      validationError = 'السعر غير صالح أو فارغ';
    }

    validMappedRows.push({
      rowNumber: row.rowNumber,
      rawTradeName: baseName.trim(),
      rawStrength: strength.trim() || undefined,
      rawForm: form.trim() || undefined,
      rawName: rawName.trim(),
      rawPrice: price,
      rawPublicPrice: publicPrice,
      rawManufacturer: manufacturer.trim() || undefined,
      rawPack: pack.trim() || undefined,
      rawAvailability,
      rawExpiry,
      rawBonus: bonusColIdx !== undefined && bonusColIdx >= 0 ? (rawBonus ?? '') : undefined,
      isValid,
      validationError,
    });
  }

  return validMappedRows;
}
