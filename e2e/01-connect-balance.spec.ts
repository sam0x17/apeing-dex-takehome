import { connect, expect, test } from './fixtures';

test('connects the injected EOA and reads the seeded pUSD balance from the fork', async ({
  page,
}) => {
  await connect(page);

  const balancePanel = page.locator('section', {
    hasText: 'pUSD balance on Polygon',
  });
  // 123.45 pUSD was written into the pUSD balances mapping in global-setup.
  await expect(balancePanel.getByText('123.45')).toBeVisible();
  await expect(balancePanel.getByText('0xC011…2DFB')).toBeVisible();
});

test('shows the connect prompt instead of balances when no wallet is connected', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByText('Connect a wallet to see your balance.'),
  ).toBeVisible();
});
