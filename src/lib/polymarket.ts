import type { Address, Hex, WalletClient } from 'viem';
import { parseUnits } from 'viem';
import { POLYGON_CHAIN_ID } from './chains';

/**
 * Polymarket V2 fixed-market config + the order execution boundary.
 *
 * Everything about the market is a constant on purpose: the assessment asks
 * for ONE fixed market and the path toward a small buy/sell, not a market
 * browser. Swap `FIXED_MARKET` to point the panel at a different market.
 */

export const CLOB_BASE_URL = 'https://clob.polymarket.com';

/** V2 CTF Exchange — verifying contract for binary (non neg-risk) markets. */
export const CTF_EXCHANGE_V2: Address =
  '0xE111180000d2663C0091e4f400237545B87B996B';

/** V2 Neg Risk CTF Exchange — verifying contract for neg-risk markets. */
export const NEG_RISK_CTF_EXCHANGE_V2: Address =
  '0xe2222d279d744050d28e00520010520000310F59';

export interface FixedMarket {
  title: string;
  slug: string;
  conditionId: Hex;
  /** CLOB token ids (ERC-1155 position ids) for each outcome. */
  yesTokenId: string;
  noTokenId: string;
  negRisk: boolean;
  /** Price increment, e.g. 0.01. */
  tickSize: number;
  /** Minimum order size in outcome shares. */
  minOrderSize: number;
}

/**
 * Binary, non neg-risk, high-liquidity market (live as of 2026-06-12).
 * Resolves 2026-06-30 — replace after resolution.
 */
export const FIXED_MARKET: FixedMarket = {
  title: 'US x Iran permanent peace deal by June 30, 2026?',
  slug: 'us-x-iran-permanent-peace-deal-by-june-30-2026-837-641-896-877-363-892-537-597',
  conditionId:
    '0x6114a8a3f9ac214f48a7e20d169f1c7a5c84082cb6f7058ed9fe1137b11fd0e7',
  yesTokenId:
    '31867385211987925701696042012772036156561382644688734856312468506547392739862',
  noTokenId:
    '34730098823282204056880725250863591694415190633560416900548276632326632294207',
  negRisk: false,
  tickSize: 0.01,
  minOrderSize: 5,
};

export interface BookLevel {
  price: number;
  size: number;
}

export interface BookTop {
  bestBid?: BookLevel;
  bestAsk?: BookLevel;
  midpoint?: number;
}

interface RawBook {
  bids?: { price: string; size: string }[];
  asks?: { price: string; size: string }[];
}

/**
 * Best bid/ask for a CLOB token. The CLOB read API is unauthenticated and
 * CORS-open, so the browser fetches it directly.
 */
export async function fetchBookTop(tokenId: string): Promise<BookTop> {
  const res = await fetch(
    `${CLOB_BASE_URL}/book?token_id=${encodeURIComponent(tokenId)}`,
  );
  if (!res.ok) {
    throw new Error(`Order book request failed (HTTP ${res.status}).`);
  }
  const book = (await res.json()) as RawBook;

  const toLevel = (l?: { price: string; size: string }): BookLevel | undefined =>
    l ? { price: Number(l.price), size: Number(l.size) } : undefined;

  // CLOB returns levels sorted away from the touch; best is the last entry.
  const bestBid = toLevel(book.bids?.at(-1));
  const bestAsk = toLevel(book.asks?.at(-1));
  return {
    bestBid,
    bestAsk,
    midpoint:
      bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Order execution boundary: prepare → sign → submit.
//
// prepare/sign run fully (real EIP-712 V2 order, real wallet signature).
// submit requires L2 CLOB API credentials (HMAC over an API key derived via
// an L1 auth signature) and a non geo-blocked IP; it documents exactly what
// is missing and refuses to guess. See README "Known limitations".
// ---------------------------------------------------------------------------

export type OrderSide = 'BUY' | 'SELL';

export interface OrderIntent {
  market: FixedMarket;
  outcome: 'YES' | 'NO';
  side: OrderSide;
  /** Limit price in pUSD per share, e.g. 0.44. */
  price: number;
  /** Order size in outcome shares. */
  shares: number;
}

/** The V2 EIP-712 Order struct (taker/expiration/nonce/feeRateBps were V1). */
export interface PolymarketOrder {
  salt: bigint;
  maker: Address;
  signer: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  side: number; // 0 = BUY, 1 = SELL
  signatureType: number; // 0 = EOA
  timestamp: bigint; // milliseconds
  metadata: Hex;
  builder: Hex;
}

export const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'metadata', type: 'bytes32' },
    { name: 'builder', type: 'bytes32' },
  ],
} as const;

const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`;

export function orderDomain(market: FixedMarket) {
  return {
    name: 'Polymarket CTF Exchange',
    version: '2',
    chainId: POLYGON_CHAIN_ID,
    // Neg-risk markets settle through their own exchange contract.
    verifyingContract: market.negRisk
      ? NEG_RISK_CTF_EXCHANGE_V2
      : CTF_EXCHANGE_V2,
  } as const;
}

/**
 * Build the exact V2 Order struct for a small fixed-market trade.
 *
 * BUY:  makerAmount = pUSD in (price × shares), takerAmount = shares out.
 * SELL: makerAmount = shares in, takerAmount = pUSD out.
 * Both legs use 6 decimals.
 */
export function preparePolymarketOrder(
  intent: OrderIntent,
  maker: Address,
  now: () => number = Date.now,
  random: () => number = Math.random,
): PolymarketOrder {
  const { market, outcome, side, price, shares } = intent;

  if (price <= 0 || price >= 1) {
    throw new Error('Price must be between 0 and 1 pUSD per share.');
  }
  const ticks = Math.round(price / market.tickSize);
  if (Math.abs(ticks * market.tickSize - price) > 1e-9) {
    throw new Error(`Price must be a multiple of the ${market.tickSize} tick size.`);
  }
  if (shares < market.minOrderSize) {
    throw new Error(`Minimum order size is ${market.minOrderSize} shares.`);
  }

  const shareUnits = parseUnits(shares.toString(), 6);
  const pusdUnits = parseUnits((price * shares).toFixed(6), 6);

  return {
    salt: BigInt(Math.floor(random() * Number.MAX_SAFE_INTEGER)),
    maker,
    signer: maker,
    tokenId: BigInt(outcome === 'YES' ? market.yesTokenId : market.noTokenId),
    makerAmount: side === 'BUY' ? pusdUnits : shareUnits,
    takerAmount: side === 'BUY' ? shareUnits : pusdUnits,
    side: side === 'BUY' ? 0 : 1,
    signatureType: 0, // plain EOA signature
    timestamp: BigInt(now()),
    metadata: ZERO_BYTES32,
    builder: ZERO_BYTES32,
  };
}

/** EIP-712 signature from the connected EOA over the V2 Order struct. */
export async function signPolymarketOrder(
  walletClient: WalletClient,
  order: PolymarketOrder,
  market: FixedMarket,
): Promise<Hex> {
  return walletClient.signTypedData({
    account: order.maker,
    domain: orderDomain(market),
    types: ORDER_TYPES,
    primaryType: 'Order',
    message: order,
  });
}

export interface SubmitResult {
  submitted: false;
  /** What a production build needs before this POST can go out. */
  blockedBy: string[];
  /** The exact request that would be sent. */
  request: { url: string; body: Record<string, unknown> };
}

/**
 * Execution boundary for `POST /order`.
 *
 * Intentionally does not send: order placement needs L2 API credentials
 * (api key + HMAC secret + passphrase, derived via an L1 ClobAuth EIP-712
 * signature against POST /auth/api-key) and is geo-blocked at the IP level.
 * Neither belongs in an unauthenticated take-home build, so this returns
 * the fully-formed request plus the precise list of blockers instead.
 */
export async function submitPolymarketOrder(
  order: PolymarketOrder,
  signature: Hex,
): Promise<SubmitResult> {
  const body = {
    order: {
      salt: order.salt.toString(),
      maker: order.maker,
      signer: order.signer,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: order.tokenId.toString(),
      makerAmount: order.makerAmount.toString(),
      takerAmount: order.takerAmount.toString(),
      side: order.side === 0 ? 'BUY' : 'SELL',
      signatureType: order.signatureType,
      timestamp: order.timestamp.toString(),
      expiration: '0', // GTC; enforced server-side, not part of the signature
      metadata: order.metadata,
      builder: order.builder,
      signature,
    },
    owner: '<L2 api key>',
    orderType: 'GTC',
  };

  return {
    submitted: false,
    blockedBy: [
      'L2 CLOB API credentials: POST /auth/api-key with an L1 ClobAuth EIP-712 signature yields {key, secret, passphrase}; order POSTs are HMAC-signed with them.',
      'Geo-restriction: clob.polymarket.com rejects order placement from blocked regions (incl. US IPs); needs a compliant deployment region.',
    ],
    request: { url: `${CLOB_BASE_URL}/order`, body },
  };
}
