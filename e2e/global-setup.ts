import { parseUnits } from 'viem';
import { CONDITIONAL_TOKENS } from '../src/lib/approvals';
import {
  ARBITRUM_USDC,
  PUSD,
} from '../src/lib/chains';
import {
  seedErc20,
  seedErc20FromHolder,
  startFork,
  TEST_ACCOUNT,
  type AnvilFork,
} from './helpers/anvil';

export const POLYGON_FORK_PORT = 8645;
export const ARBITRUM_FORK_PORT = 8646;

// Fork sources must be archive-grade: publicnode/drpc load-balance across
// replicas that prune recent state and intermittently fail fork storage
// reads with "historical state is not available". Tenderly's public
// gateways are archive nodes.
// `||` not `??`: unset CI secrets surface as empty strings.
const POLYGON_FORK_RPC =
  process.env.E2E_POLYGON_FORK_RPC || 'https://polygon.gateway.tenderly.co';
const ARBITRUM_FORK_RPC =
  process.env.E2E_ARBITRUM_FORK_RPC || 'https://arbitrum.gateway.tenderly.co';

/** Seeded balances the specs assert against. */
export const SEEDED_PUSD = parseUnits('123.45', 6);
export const SEEDED_USDC = parseUnits('250', 6);

const forks: AnvilFork[] = [];

export default async function globalSetup() {
  console.log('[e2e] starting Polygon + Arbitrum mainnet forks…');
  const [polygon, arbitrum] = await Promise.all([
    startFork(POLYGON_FORK_RPC, POLYGON_FORK_PORT),
    startFork(ARBITRUM_FORK_RPC, ARBITRUM_FORK_PORT),
  ]);
  forks.push(polygon, arbitrum);

  try {
    console.log('[e2e] seeding pUSD (Polygon) and USDC (Arbitrum)…');
    await Promise.all([
      // pUSD uses namespaced storage, so the slot search can't find its
      // balances mapping; transfer from the ConditionalTokens escrow instead.
      seedErc20FromHolder(
        polygon,
        PUSD,
        CONDITIONAL_TOKENS,
        TEST_ACCOUNT,
        SEEDED_PUSD,
      ),
      seedErc20(arbitrum, ARBITRUM_USDC, TEST_ACCOUNT, SEEDED_USDC),
    ]);
    console.log('[e2e] forks ready');
  } catch (error) {
    // If setup throws, Playwright never runs the returned teardown —
    // kill the forks here or they orphan and poison the next run.
    for (const fork of forks) fork.process.kill();
    throw error;
  }

  return async () => {
    for (const fork of forks) fork.process.kill();
  };
}
