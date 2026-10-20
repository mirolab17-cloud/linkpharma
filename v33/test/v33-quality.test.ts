import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { classifyProduct, comparePrice, findDuplicateNames, makeImportReportCsv, splitIntoChunks, validateImportRows } from '../src/services/importQuality';

describe('v33 data quality helpers', () => {
  it('classifies medical supplies and cosmetics', () => {
    assert.equal(classifyProduct('شاش طبي معقم'), 'مستلزم طبي');
    assert.equal(classifyProduct('واقي شمس'), 'مستحضرات تجميل');
  });
  it('flags large price changes', () => {
    assert.equal(comparePrice(10, 20, 40).unusual, true);
  });
  it('groups exact duplicate product names', () => {
    const result = findDuplicateNames([{ id: 'a', tradeName: 'Paracetamol' }, { id: 'b', tradeName: 'Paracetamol' }, { id: 'c', tradeName: 'Ibuprofen' }]);
    assert.equal([...result.values()][0]?.length, 2);
  });
  it('validates import rows and creates UTF-8 CSV', () => {
    const issues = validateImportRows([{ rowNumber: 2, rawName: '', rawPrice: null, isValid: false, validationError: 'اسم ناقص' }]);
    assert.equal(issues.length, 1);
    assert.ok(makeImportReportCsv(issues).startsWith('\uFEFF'));
  });
  it('chunks bulk operations and rejects invalid sizes', () => {
    assert.deepEqual(splitIntoChunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.throws(() => splitIntoChunks([1], 0));
  });
});
