import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractWorksheetRows, processMappedRows } from '../src/services/import';

// ورقة يعلن مُنشئ الملف أن نطاقها ينتهي عند الصف الثالث رغم وجود بيانات فعلية حتى الصف 800.
const worksheet: XLSX.WorkSheet = {
  '!ref': 'A1:C3',
  A1: { t: 's', v: 'الصنف' }, B1: { t: 's', v: 'السعر' }, C1: { t: 's', v: 'البونص' },
  A2: { t: 's', v: 'دواء 1' }, B2: { t: 'n', v: 12 },
  A3: { t: 's', v: 'دواء 2' }, B3: { t: 'n', v: 14 },
  A800: { t: 's', v: 'دواء 799' }, B800: { t: 'n', v: 25 }, C800: { t: 's', v: '10*1' },
};
const rows = extractWorksheetRows(worksheet);
assert.equal(rows.length, 800, 'must discover populated cells outside a truncated worksheet !ref');
assert.equal(rows[799].rowNumber, 800, 'must preserve original Excel row numbers');
assert.deepEqual(rows[799].cells, ['دواء 799', '25', '10*1']);

const mapped = processMappedRows({ allRows: rows, startRow: 2, nameColIdx: 0, priceColIdx: 1, bonusColIdx: 2 });
assert.equal(mapped.length, 3, 'all populated named, priced rows should be considered; empty gaps are ignored');
assert.equal(mapped.at(-1)?.rowNumber, 800);
assert.equal(mapped.at(-1)?.rawBonus, '10*1');

console.log('Spreadsheet row extraction tests passed.');
