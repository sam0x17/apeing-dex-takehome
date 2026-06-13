import { createPublicClient, http, maxUint256 } from 'viem';
import { CTF_EXCHANGE_V2, CONDITIONAL_TOKENS } from '../src/lib/approvals';
import { PUSD } from '../src/lib/chains';
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from '../src/lib/erc20';
import { connect, expect, POLYGON_FORK_URL, test } from './fixtures';
import { TEST_ACCOUNT } from './helpers/anvil';

const fork = createPublicClient({ transport: http(POLYGON_FORK_URL) });

test('batches exactly the missing approvals, then reports ready (idempotent)', async ({
  page,
}) => {
  await connect(page);
  const panel = page.locator('section', { hasText: 'Trade readiness' });

  // Fresh wallet on the binary fixed market: only the 2 CTF-Exchange
  // approvals are required (not the full neg-risk set).
  await expect(
    panel.getByRole('button', { name: 'Set approvals (2 transactions)' }),
  ).toBeVisible();

  // One click → one EIP-5792 batch (the test wallet implements wallet_sendCalls).
  await panel.getByRole('button', { name: /Set approvals/ }).click();

  await expect(panel.getByText('✓ Ready to trade')).toBeVisible({
    timeout: 60_000,
  });
  await expect(panel.getByRole('button', { name: /Set approvals/ })).toHaveCount(0);

  // Verify on-chain that the batch actually landed both approvals.
  const allowance = await fork.readContract({
    address: PUSD,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [TEST_ACCOUNT, CTF_EXCHANGE_V2.address],
  });
  expect(allowance).toBe(maxUint256);

  const isOperator = await fork.readContract({
    address: CONDITIONAL_TOKENS,
    abi: CONDITIONAL_TOKENS_ABI,
    functionName: 'isApprovedForAll',
    args: [TEST_ACCOUNT, CTF_EXCHANGE_V2.address],
  });
  expect(isOperator).toBe(true);
});

test('a reload re-reads chain state and still shows ready — no re-prompt', async ({
  page,
}) => {
  await connect(page);
  const panel = page.locator('section', { hasText: 'Trade readiness' });

  await expect(panel.getByText('✓ Ready to trade')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Set approvals/ })).toHaveCount(0);
});
