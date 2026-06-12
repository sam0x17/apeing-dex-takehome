import { createPublicClient, http, maxUint256 } from 'viem';
import { PUSD_SPENDERS } from '../src/lib/approvals';
import { PUSD } from '../src/lib/chains';
import { ERC20_ABI } from '../src/lib/erc20';
import { connect, expect, POLYGON_FORK_URL, test } from './fixtures';
import { TEST_ACCOUNT } from './helpers/anvil';

const fork = createPublicClient({ transport: http(POLYGON_FORK_URL) });

test('submits exactly the missing approvals, then reports ready (idempotent)', async ({
  page,
}) => {
  await connect(page);
  const panel = page.locator('section', { hasText: 'Trade readiness' });

  // Fresh wallet on the fork: all six approvals missing.
  await expect(
    panel.getByRole('button', { name: 'Set approvals (6 transactions)' }),
  ).toBeVisible();

  await panel.getByRole('button', { name: /Set approvals/ }).click();

  // Six real transactions mined on the Polygon fork.
  await expect(panel.getByText('✓ Ready to trade')).toBeVisible({
    timeout: 60_000,
  });
  await expect(panel.getByRole('button', { name: /Set approvals/ })).toHaveCount(0);

  // Verify on-chain, not just in the UI.
  for (const spender of PUSD_SPENDERS) {
    const allowance = await fork.readContract({
      address: PUSD,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [TEST_ACCOUNT, spender.address],
    });
    expect(allowance).toBe(maxUint256);
  }
});

test('a reload re-reads chain state and still shows ready — no re-prompt', async ({
  page,
}) => {
  await connect(page);
  const panel = page.locator('section', { hasText: 'Trade readiness' });

  await expect(panel.getByText('✓ Ready to trade')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Set approvals/ })).toHaveCount(0);
});
