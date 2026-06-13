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

test('EIP-6963: with two wallets installed, shows a picker and connects the chosen one', async ({
  page,
}) => {
  // Announce a second wallet (as Phantom would) before app code runs, so the
  // app must disambiguate instead of blindly using window.ethereum.
  await page.addInitScript(() => {
    const decoy = {
      isMetaMask: false,
      request: async () => {
        throw new Error('decoy wallet should not be called');
      },
      on: () => {},
      removeListener: () => {},
    };
    const detail = Object.freeze({
      info: {
        uuid: '00000000-0000-4000-8000-000000000002',
        name: 'Decoy Wallet',
        icon: 'data:image/svg+xml;base64,PHN2Zy8+',
        rdns: 'com.example.decoy',
      },
      provider: decoy,
    });
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', { detail }),
      );
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  });

  await page.goto('/');
  // Picker, not a single button.
  await expect(page.getByText('Connect with')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decoy Wallet' })).toBeVisible();

  // Choosing the working wallet connects via its provider, not the decoy.
  await page.getByRole('button', { name: 'Test Wallet' }).click();
  await expect(page.getByText('0xf39F…2266').first()).toBeVisible();
});
