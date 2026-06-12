import { verifyTypedData, type Hex } from 'viem';
import {
  FIXED_MARKET,
  ORDER_TYPES,
  orderDomain,
} from '../src/lib/polymarket';
import { connect, expect, test } from './fixtures';
import { TEST_ACCOUNT } from './helpers/anvil';

// Depends on 02-readiness having set the approvals on the shared fork.

test('shows the live book and signs a real V2 order that recovers to the EOA', async ({
  page,
}) => {
  await connect(page);
  const panel = page.locator('section', { hasText: 'Fixed market' });

  await expect(panel.getByText(FIXED_MARKET.title)).toBeVisible();

  // Live CLOB read: the best bid row eventually shows "0.xx × size".
  await expect(panel.getByText(/0\.\d{2} × /).first()).toBeVisible({
    timeout: 30_000,
  });

  const buy = panel.getByRole('button', { name: `Buy ${FIXED_MARKET.minOrderSize} YES` });
  await expect(buy).toBeEnabled(); // pUSD seeded + approvals set in 02

  await buy.click();

  // The execution boundary renders with the exact blocked reasons…
  await expect(
    panel.getByText('Order prepared and signed', { exact: false }),
  ).toBeVisible();
  await expect(panel.getByText(/L2 CLOB API credentials/)).toBeVisible();
  await expect(panel.getByText(/Geo-restriction/)).toBeVisible();

  // …and the would-be POST payload.
  await panel.locator('summary').click();
  const payloadText = await panel.locator('pre').innerText();
  const payload = JSON.parse(payloadText) as {
    order: Record<string, string> & { signatureType: number };
    orderType: string;
  };
  expect(payload.orderType).toBe('GTC');
  expect(payload.order.side).toBe('BUY');
  expect(payload.order.maker.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());

  // Strongest possible check: the EIP-712 signature in the payload recovers
  // to the connected EOA over the exact V2 Order struct and domain.
  const valid = await verifyTypedData({
    address: TEST_ACCOUNT,
    domain: orderDomain(FIXED_MARKET),
    types: ORDER_TYPES,
    primaryType: 'Order',
    message: {
      salt: BigInt(payload.order.salt),
      maker: payload.order.maker as Hex,
      signer: payload.order.signer as Hex,
      tokenId: BigInt(payload.order.tokenId),
      makerAmount: BigInt(payload.order.makerAmount),
      takerAmount: BigInt(payload.order.takerAmount),
      side: 0,
      signatureType: payload.order.signatureType,
      timestamp: BigInt(payload.order.timestamp),
      metadata: payload.order.metadata as Hex,
      builder: payload.order.builder as Hex,
    },
    signature: payload.order.signature as Hex,
  });
  expect(valid).toBe(true);
});

test('buy/sell stay disabled without a connected wallet', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('section', { hasText: 'Fixed market' });
  await expect(
    panel.getByRole('button', { name: /Buy \d+ YES/ }),
  ).toBeDisabled();
  await expect(panel.getByText('Connect a wallet to trade.')).toBeVisible();
});
