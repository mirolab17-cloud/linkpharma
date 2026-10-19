import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PriceRecord, Supplier } from '../src/types';
import { sortPriceOffers } from '../src/utils/priceOfferSorting';

const offer = (supplierId: string, price: number, available = true, bonus = '', updatedAt = ''): PriceRecord => ({
  id: `offer-${supplierId}`,
  productId: 'product-1',
  supplierId,
  price,
  available,
  bonus,
  updatedAt,
} as PriceRecord);

const supplier = (id: string, name: string): Supplier => ({ id, name } as Supplier);

describe('sortPriceOffers', () => {
  it('sorts available suppliers ahead of unavailable ones and uses effective unit price', () => {
    const offers = [offer('closed', 1, false), offer('high', 10), offer('low', 8)];
    assert.deepEqual(sortPriceOffers(offers, [], 'cheapest').map((row) => row.supplierId), ['low', 'high', 'closed']);
  });

  it('ranks bonus-adjusted unit cost rather than sticker price', () => {
    const offers = [offer('plain', 9), offer('bonus', 10, true, '10+2')];
    assert.deepEqual(sortPriceOffers(offers, [], 'cheapest').map((row) => row.supplierId), ['bonus', 'plain']);
  });

  it('sorts most recently updated offers first', () => {
    const offers = [offer('old', 1, true, '', '2026-01-01'), offer('new', 99, true, '', '2026-09-01')];
    assert.deepEqual(sortPriceOffers(offers, [], 'updated').map((row) => row.supplierId), ['new', 'old']);
  });

  it('sorts by warehouse name and uses stable ID tie-breaks', () => {
    const offers = [offer('b', 1), offer('a', 2)];
    const suppliers = [supplier('b', 'Beta'), supplier('a', 'Alpha')];
    assert.deepEqual(sortPriceOffers(offers, suppliers, 'alphabetical').map((row) => row.supplierId), ['a', 'b']);
  });

  it('keeps all offers and does not mutate the input in random mode', () => {
    const offers = [offer('one', 1), offer('two', 2), offer('closed', 0, false)];
    const originalIds = offers.map((row) => row.supplierId);
    const result = sortPriceOffers(offers, [], 'random');
    assert.deepEqual(offers.map((row) => row.supplierId), originalIds);
    assert.deepEqual([...result.map((row) => row.supplierId)].sort(), [...originalIds].sort());
    assert.equal(result.at(-1)?.supplierId, 'closed');
  });
});
