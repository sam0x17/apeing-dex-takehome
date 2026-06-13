import { describe, expect, it } from 'vitest';
import {
  CTF_EXCHANGE_V2,
  FIXED_MARKET,
  NEG_RISK_CTF_EXCHANGE_V2,
  orderDomain,
  parseOrderShares,
  preparePolymarketOrder,
  submitPolymarketOrder,
  type OrderIntent,
} from './polymarket';

const MAKER = '0x1111111111111111111111111111111111111111' as const;
const fixedNow = () => 1_765_000_000_000;
const fixedRandom = () => 0.5;

function intent(overrides?: Partial<OrderIntent>): OrderIntent {
  return {
    market: FIXED_MARKET,
    outcome: 'YES',
    side: 'BUY',
    price: 0.44,
    shares: 5,
    ...overrides,
  };
}

describe('preparePolymarketOrder', () => {
  it('builds a BUY: pUSD in, shares out, both 6dp', () => {
    const order = preparePolymarketOrder(intent(), MAKER, fixedNow, fixedRandom);
    expect(order.side).toBe(0);
    expect(order.makerAmount).toBe(2_200_000n); // 0.44 × 5 pUSD
    expect(order.takerAmount).toBe(5_000_000n); // 5 shares
    expect(order.tokenId).toBe(BigInt(FIXED_MARKET.yesTokenId));
    expect(order.maker).toBe(MAKER);
    expect(order.signer).toBe(MAKER);
    expect(order.signatureType).toBe(0); // EOA
    expect(order.timestamp).toBe(BigInt(fixedNow()));
  });

  it('builds a SELL as the inverse of BUY', () => {
    const order = preparePolymarketOrder(
      intent({ side: 'SELL', outcome: 'NO', price: 0.56 }),
      MAKER,
      fixedNow,
      fixedRandom,
    );
    expect(order.side).toBe(1);
    expect(order.makerAmount).toBe(5_000_000n); // 5 shares in
    expect(order.takerAmount).toBe(2_800_000n); // 0.56 × 5 pUSD out
    expect(order.tokenId).toBe(BigInt(FIXED_MARKET.noTokenId));
  });

  it('rejects prices outside (0, 1)', () => {
    expect(() => preparePolymarketOrder(intent({ price: 0 }), MAKER)).toThrow(/price/i);
    expect(() => preparePolymarketOrder(intent({ price: 1 }), MAKER)).toThrow(/price/i);
  });

  it('rejects off-tick prices', () => {
    expect(() => preparePolymarketOrder(intent({ price: 0.445 }), MAKER)).toThrow(/tick/i);
  });

  it('rejects orders below the minimum size', () => {
    expect(() =>
      preparePolymarketOrder(intent({ shares: FIXED_MARKET.minOrderSize - 1 }), MAKER),
    ).toThrow(/minimum/i);
  });

  it('has no float drift on awkward price×size products', () => {
    const order = preparePolymarketOrder(
      intent({ price: 0.07, shares: 30 }),
      MAKER,
      fixedNow,
      fixedRandom,
    );
    expect(order.makerAmount).toBe(2_100_000n); // 0.07 × 30 = 2.1 pUSD exactly
  });
});

describe('parseOrderShares', () => {
  it('accepts amounts at or above the minimum', () => {
    expect(parseOrderShares('5', FIXED_MARKET)).toEqual({ ok: true, shares: 5 });
    expect(parseOrderShares('  12.5 ', FIXED_MARKET)).toEqual({ ok: true, shares: 12.5 });
  });

  it('rejects amounts below the minimum order size', () => {
    const r = parseOrderShares('4', FIXED_MARKET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/minimum order size is 5/i);
  });

  it('rejects empty, zero, negative, and non-numeric input', () => {
    expect(parseOrderShares('', FIXED_MARKET).ok).toBe(false);
    expect(parseOrderShares('0', FIXED_MARKET).ok).toBe(false);
    expect(parseOrderShares('-5', FIXED_MARKET).ok).toBe(false);
    expect(parseOrderShares('abc', FIXED_MARKET).ok).toBe(false);
  });
});

describe('orderDomain', () => {
  it('uses the V2 CTF Exchange for binary markets', () => {
    expect(orderDomain(FIXED_MARKET).verifyingContract).toBe(CTF_EXCHANGE_V2);
    expect(orderDomain(FIXED_MARKET).version).toBe('2');
  });

  it('uses the Neg Risk exchange for neg-risk markets', () => {
    expect(
      orderDomain({ ...FIXED_MARKET, negRisk: true }).verifyingContract,
    ).toBe(NEG_RISK_CTF_EXCHANGE_V2);
  });
});

describe('submitPolymarketOrder (execution boundary)', () => {
  it('does not submit, and reports exactly what is missing', async () => {
    const order = preparePolymarketOrder(intent(), MAKER, fixedNow, fixedRandom);
    const result = await submitPolymarketOrder(order, '0xdeadbeef');
    expect(result.submitted).toBe(false);
    expect(result.blockedBy.join(' ')).toMatch(/L2 CLOB API credentials/);
    expect(result.blockedBy.join(' ')).toMatch(/Geo/);
  });

  it('shapes the POST body the way the CLOB expects', async () => {
    const order = preparePolymarketOrder(intent(), MAKER, fixedNow, fixedRandom);
    const result = await submitPolymarketOrder(order, '0xdeadbeef');
    const body = result.request.body.order as Record<string, unknown>;
    expect(result.request.url).toBe('https://clob.polymarket.com/order');
    expect(body.side).toBe('BUY');
    expect(body.makerAmount).toBe('2200000');
    expect(body.takerAmount).toBe('5000000');
    expect(body.expiration).toBe('0'); // GTC, server-side only — not signed
    expect(body.signature).toBe('0xdeadbeef');
    expect(result.request.body.orderType).toBe('GTC');
  });
});
