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
  rawName: string;
  rawPrice: number | null;
  rawPublicPrice?: number | null;
  rawAvailability?: string;
  rawExpiry?: string;
  isValid: boolean;
  validationError?: string;
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

  // تحويل إلى مصفوفة صفوف (Array of Arrays)
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  // استخراج أقصى عدد أعمدة
  let maxCols = 0;
  rawRows.forEach((r) => {
    if (r.length > maxCols) maxCols = r.length;
  });

  // توليد أسماء الأعمدة القياسية (A, B, C, ...)
  const columnHeaders: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    columnHeaders.push(XLSX.utils.encode_col(i)); // 'A', 'B', 'C', ...
  }

  const allRows = rawRows.map((row, idx) => ({
    rowNumber: idx + 1,
    cells: Array.from({ length: maxCols }, (_, colIdx) => {
      const val = row[colIdx];
      return val !== undefined && val !== null ? String(val).trim() : '';
    }),
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
  priceColIdx: number;
  publicPriceColIdx?: number;
  availColIdx?: number;
  expiryColIdx?: number;
}): MappedPriceRow[] {
  const { allRows, startRow, nameColIdx, priceColIdx, publicPriceColIdx, availColIdx, expiryColIdx } = params;

  const validMappedRows: MappedPriceRow[] = [];

  for (let i = startRow - 1; i < allRows.length; i++) {
    const row = allRows[i];
    const rawName = row.cells[nameColIdx] || '';
    const rawPriceCell = row.cells[priceColIdx] || '';

    // تخطي الصفوف الفارغة بالكامل
    if (!rawName.trim() && !rawPriceCell.trim()) {
      continue;
    }

    const price = cleanPrice(rawPriceCell);
    const publicPrice = publicPriceColIdx !== undefined && publicPriceColIdx >= 0 ? cleanPrice(row.cells[publicPriceColIdx]) : null;
    const rawAvailability = availColIdx !== undefined && availColIdx >= 0 ? row.cells[availColIdx]?.trim() : undefined;
    const rawExpiry = expiryColIdx !== undefined && expiryColIdx >= 0 ? row.cells[expiryColIdx]?.trim() : undefined;

    // التحقق من صحة الصف
    let isValid = true;
    let validationError = '';

    if (!rawName.trim()) {
      isValid = false;
      validationError = 'اسم الصنف مفقود';
    } else if (price === null || isNaN(price) || price <= 0) {
      isValid = false;
      validationError = 'السعر غير صالح أو فارغ';
    }

    validMappedRows.push({
      rowNumber: row.rowNumber,
      rawName: rawName.trim(),
      rawPrice: price,
      rawPublicPrice: publicPrice,
      rawAvailability,
      rawExpiry,
      isValid,
      validationError,
    });
  }

  return validMappedRows;
}
