import { spawn, type ChildProcess } from 'node:child_process';
import {
  createTestClient,
  encodeAbiParameters,
  http,
  keccak256,
  pad,
  parseEther,
  publicActions,
  toHex,
  walletActions,
  type Address,
  type Hex,
  type PublicActions,
  type TestClient,
  type WalletActions,
} from 'viem';

export interface AnvilFork {
  process: ChildProcess;
  rpcUrl: string;
  client: TestClient<'anvil'> & PublicActions & WalletActions;
}

const ERC20_MINI_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

/** First anvil dev account — anvil signs txs and typed data for it. */
export const TEST_ACCOUNT: Address =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

export async function startFork(
  forkUrl: string,
  port: number,
): Promise<AnvilFork> {
  // A leftover anvil (e.g. from an aborted previous run) would silently
  // serve stale fork state — fail loudly instead.
  const occupied = await fetch(`http://127.0.0.1:${port}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}',
  }).then(
    () => true,
    () => false,
  );
  if (occupied) {
    throw new Error(
      `Port ${port} is already in use (orphaned anvil?). Kill it first: lsof -ti :${port} | xargs kill`,
    );
  }

  const proc = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--port', String(port), '--silent'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  proc.stderr?.on('data', (d) => (stderr += d));

  const rpcUrl = `http://127.0.0.1:${port}`;
  const client = createTestClient({
    mode: 'anvil',
    transport: http(rpcUrl, { timeout: 60_000 }),
  })
    .extend(publicActions)
    .extend(walletActions);

  // Wait for the fork to answer (initial fork-block fetch can take a while).
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (proc.exitCode !== null) {
      throw new Error(`anvil exited (fork ${forkUrl}): ${stderr}`);
    }
    try {
      await client.getChainId();
      break;
    } catch {
      if (Date.now() > deadline) {
        proc.kill();
        throw new Error(`anvil did not become ready for ${forkUrl}: ${stderr}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { process: proc, rpcUrl, client };
}

/**
 * Give `account` an ERC-20 balance on a fork by locating the balances
 * mapping slot: write the amount into keccak(account, slot) for each
 * candidate slot until balanceOf reflects it, reverting misses.
 */
export async function seedErc20(
  fork: AnvilFork,
  token: Address,
  account: Address,
  amount: bigint,
): Promise<void> {
  const value = pad(toHex(amount), { size: 32 });

  for (let slot = 0n; slot < 64n; slot++) {
    const key = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [account, slot],
      ),
    );
    const previous = await fork.client.getStorageAt({
      address: token,
      slot: key,
    });
    await fork.client.request({
      // anvil_setStorageAt is the cheatcode; viem's setStorageAt targets hardhat
      method: 'anvil_setStorageAt' as never,
      params: [token, key, value] as never,
    });
    const balance = await fork.client.readContract({
      address: token,
      abi: ERC20_MINI_ABI,
      functionName: 'balanceOf',
      args: [account],
    });
    if (balance === amount) return;
    await fork.client.request({
      method: 'anvil_setStorageAt' as never,
      params: [token, key, previous ?? (pad('0x0', { size: 32 }) as Hex)] as never,
    });
  }
  throw new Error(`Could not locate balances slot for token ${token}`);
}

/**
 * Give `account` an ERC-20 balance by impersonating a known on-chain holder
 * and transferring from it. Works for tokens with non-standard (e.g.
 * ERC-7201 namespaced) storage layouts where the slot search can't.
 */
export async function seedErc20FromHolder(
  fork: AnvilFork,
  token: Address,
  holder: Address,
  account: Address,
  amount: bigint,
): Promise<void> {
  const holderBalance = await fork.client.readContract({
    address: token,
    abi: ERC20_MINI_ABI,
    functionName: 'balanceOf',
    args: [holder],
  });
  if (holderBalance < amount) {
    throw new Error(
      `Holder ${holder} has ${holderBalance} of ${token}, need ${amount}`,
    );
  }
  await fork.client.setBalance({ address: holder, value: parseEther('10') });
  await fork.client.impersonateAccount({ address: holder });
  await fork.client.writeContract({
    account: holder,
    address: token,
    abi: ERC20_MINI_ABI,
    functionName: 'transfer',
    args: [account, amount],
    chain: null,
  });
  await fork.client.stopImpersonatingAccount({ address: holder });
}
