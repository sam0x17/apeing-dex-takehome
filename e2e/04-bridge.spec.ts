import { connect, expect, test } from './fixtures';

// Real Li.Fi quote + real executeRoute against the Arbitrum fork. The source
// transaction mines on the fork; the destination side can never settle
// (relayers don't watch forks), which is exactly what lets us assert the
// core lifecycle requirement: source confirmation must NOT mark the bridge
// complete.

test('quotes USDC→pUSD live and renders the required quote fields', async ({
  page,
}) => {
  await connect(page);
  const panel = page.locator('section', { hasText: 'Bridge — Arbitrum USDC' });

  // Seeded fork balance is read through the app's Arbitrum RPC.
  await expect(panel.getByText('Balance: 250 USDC')).toBeVisible();

  await panel.getByLabel('Amount (USDC on Arbitrum)').fill('25');
  await expect(panel.getByText('Expected receive')).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.getByText('Fees + gas')).toBeVisible();
  await expect(panel.getByText('ETA')).toBeVisible();
  await expect(panel.getByText(/~\d+[ms]/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Bridge' })).toBeEnabled();
});

test('executes the source leg on the fork and never reports done without destination settlement', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await connect(page);
  const panel = page.locator('section', { hasText: 'Bridge — Arbitrum USDC' });

  await panel.getByLabel('Amount (USDC on Arbitrum)').fill('25');
  await expect(panel.getByRole('button', { name: 'Bridge' })).toBeEnabled({
    timeout: 30_000,
  });
  await panel.getByRole('button', { name: 'Bridge' }).click();

  // Fresh route + guard + wallet auto-signing (allowance, then the send).
  // The source tx mines on the Arbitrum fork and its hash appears.
  await expect(panel.getByText(/Source tx: 0x/)).toBeVisible({
    timeout: 180_000,
  });

  // Source side is now submitted/confirmed. The bridge must still be
  // in-flight: settlement can only come from the destination side.
  await expect(panel.getByRole('button', { name: 'Bridging…' })).toBeVisible();

  // Give the SDK time to poll status; the UI must keep waiting on the
  // destination — no completion, no destination tx, no terminal state.
  await page.waitForTimeout(15_000);
  await expect(panel.getByText(/Destination tx:/)).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Start another bridge' }),
  ).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Bridging…' })).toBeVisible();
});
