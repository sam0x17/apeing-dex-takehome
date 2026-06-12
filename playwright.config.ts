import { defineConfig } from '@playwright/test';

/**
 * E2E suite: real app against anvil mainnet forks of Polygon + Arbitrum
 * (spawned in e2e/global-setup.ts), with real Li.Fi / Polymarket CLOB read
 * APIs over the network. Requires `anvil` (foundry) on PATH.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  // Specs share fork state (approvals persist) and run in filename order.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3300',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Production build + server: deterministic assets (no dev-cache
    // collisions, no hydration races). NEXT_PUBLIC_* env is inlined at
    // build time, so the build must run under this same env block.
    command: 'pnpm build && pnpm start --port 3300',
    url: 'http://127.0.0.1:3300',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      NEXT_PUBLIC_POLYGON_RPC: 'http://127.0.0.1:8645',
      NEXT_PUBLIC_ARBITRUM_RPC: 'http://127.0.0.1:8646',
      // The assessment-required default is 'all'; e2e pins 'transaction' so
      // the source leg is an observable on-chain tx on the fork.
      NEXT_PUBLIC_LIFI_EXECUTION_TYPE: 'transaction',
      // Mayan Swift (off-chain auction state) and Across V4 (quote
      // freshness checks) source txs revert on forks; CCTP burn routes
      // (mayanMCTP) are state-independent and mine cleanly.
      NEXT_PUBLIC_LIFI_BRIDGE_DENY: 'mayan,across',
      // Native-permit signatures can't be validated on a fork; use plain
      // approve transactions.
      NEXT_PUBLIC_LIFI_DISABLE_MESSAGE_SIGNING: '1',
    },
  },
});
