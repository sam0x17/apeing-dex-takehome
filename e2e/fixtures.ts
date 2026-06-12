import { expect, test as base, type Page } from '@playwright/test';
import { ARBITRUM_CHAIN_ID, POLYGON_CHAIN_ID } from '../src/lib/chains';
import { ARBITRUM_FORK_PORT, POLYGON_FORK_PORT } from './global-setup';
import { TEST_ACCOUNT } from './helpers/anvil';
import { injectTestWallet } from './helpers/wallet-init';

export const POLYGON_FORK_URL = `http://127.0.0.1:${POLYGON_FORK_PORT}`;
export const ARBITRUM_FORK_URL = `http://127.0.0.1:${ARBITRUM_FORK_PORT}`;

/** Page fixture with the EIP-1193 test wallet injected before app code runs. */
export const test = base.extend({
  // Playwright names this callback `use`; rename so the React hooks lint
  // rule doesn't mistake it for a hook.
  page: async ({ page }, provide) => {
    await page.addInitScript(injectTestWallet, {
      account: TEST_ACCOUNT,
      chains: {
        [POLYGON_CHAIN_ID]: POLYGON_FORK_URL,
        [ARBITRUM_CHAIN_ID]: ARBITRUM_FORK_URL,
      },
      initialChainId: POLYGON_CHAIN_ID,
    });
    await provide(page);
  },
});

export { expect };

/** Open the app and connect the test wallet. */
export async function connect(page: Page): Promise<void> {
  await page.goto('/');
  // .first(): once connected the address renders in several panels.
  const address = page.getByText('0xf39F…2266').first();
  const button = page.getByRole('button', { name: 'Connect wallet' });
  // A click that lands before hydration is silently dropped, so re-click
  // until the wallet state flips. The isVisible guard + bounded click
  // timeout prevent a deadlock when a previous click already connected
  // (the button unmounts on success).
  await expect(async () => {
    if (await address.isVisible()) return;
    await button.click({ timeout: 2_000 });
    await expect(address).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}
