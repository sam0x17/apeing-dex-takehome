import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBookTop } from './polymarket';

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify(body), { status: ok ? status : 500 }),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchBookTop', () => {
  it('takes the last level of each side as the touch and computes the midpoint', async () => {
    mockFetch({
      bids: [
        { price: '0.30', size: '100' },
        { price: '0.42', size: '50' },
      ],
      asks: [
        { price: '0.60', size: '80' },
        { price: '0.44', size: '20' },
      ],
    });
    const top = await fetchBookTop('123');
    expect(top.bestBid).toEqual({ price: 0.42, size: 50 });
    expect(top.bestAsk).toEqual({ price: 0.44, size: 20 });
    expect(top.midpoint).toBeCloseTo(0.43);
  });

  it('handles a one-sided book without a midpoint', async () => {
    mockFetch({ bids: [{ price: '0.42', size: '50' }], asks: [] });
    const top = await fetchBookTop('123');
    expect(top.bestBid).toBeDefined();
    expect(top.bestAsk).toBeUndefined();
    expect(top.midpoint).toBeUndefined();
  });

  it('throws a readable error on HTTP failure', async () => {
    mockFetch({}, false);
    await expect(fetchBookTop('123')).rejects.toThrow(/HTTP 500/);
  });
});
