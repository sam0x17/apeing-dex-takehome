# Polymarket V2 cross-chain deposit & trade readiness

**Live demo:** https://apeing-dex-takehome.vercel.app

A focused vertical slice: **bridge Arbitrum USDC → Polygon pUSD via Li.Fi, watch the
pUSD balance land, pass the Polymarket V2 approval gate, and walk a fixed market to
the edge of a real CLOB order.**

Four panels on one page:

1. **Bridge** — Li.Fi `getRoutes` → `executeRoute` with an amount input (and a
   **Max** that fills the full source balance), a live quote (receive amount,
   fees, ETA, tool), a fresh route fetched immediately before execution, the
   `toAmountUSD/fromAmountUSD ∈ [0.5, 1.5]` pricing sanity guard enforced at
   execution time, and full lifecycle states (`quoting → signing → source submitted →
   awaiting destination → done/failed`). The bridge is only marked complete when the
   **destination** side settles — a confirmed source tx renders as
   "awaiting destination settlement".
2. **Balance** — pUSD `balanceOf` for the connected EOA on Polygon, auto-invalidated
   the moment the bridge reports destination settlement (plus a 30s poll).
3. **Trade readiness** — pUSD allowances + ConditionalTokens `isApprovedForAll`
   for the V2 spender/operator set, read in one multicall. Only the approvals the
   *selected market* needs are required (the binary fixed market needs 2, not the
   full neg-risk set of 6), and the missing ones are submitted as a **single
   EIP-5792 batch** — one wallet confirmation, with a sequential fallback for
   wallets without batching. Approvals already set are skipped (idempotent,
   re-runnable, no wasted gas). Green "Ready to trade" when the plan is empty.
4. **Fixed market** — one hardcoded V2 binary market with YES/NO token ids, live
   best bid/ask from the CLOB, **implied odds** (the token price as a probability)
   on each outcome, the user's pUSD balance, and a **shares input** (any size at or
   above the market minimum, with an estimated cost and an affordability check).
   Buy/sell are disabled until balance + approvals are ready, then prepare the real
   V2 EIP-712 order struct and collect a real EOA signature before stopping at a
   documented execution boundary (see [Known limitations](#known-limitations)).

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Other commands: `pnpm test` (vitest, 65 unit tests), `pnpm test:e2e` (Playwright,
9 fork-based e2e tests — see [Testing](#testing)), `pnpm typecheck`, `pnpm lint`,
`pnpm build`. CI runs all five on every push/PR.

You need an injected EOA wallet (MetaMask) with a little USDC + ETH on Arbitrum to
exercise the bridge end-to-end yourself.

### Env vars

```bash
NEXT_PUBLIC_POLYGON_RPC=        # Polygon RPC for reads (default: publicnode)
NEXT_PUBLIC_LIFI_INTEGRATOR=    # Li.Fi integrator id (default: sam-johnson-assessment)
NEXT_PUBLIC_ARBITRUM_RPC=       # optional, source-chain balance reads
```

All have working defaults; the app runs with no `.env` at all. See `.env.example`.

## Testing

Two layers, no mocks inside the app:

**Unit (vitest, 65 tests)** — every pure function in `src/lib/`: pricing-guard
boundaries, bridge-lifecycle derivation (incl. "steps claim DONE but destination
pending must not be done"), market-scoped approval planning + call encoding,
EIP-6963 provider dedupe, V2 order math (integer-exact amounts, tick/min/share-size
validation), implied-probability derivation, quote summarization, book parsing.

**E2E (Playwright, 9 tests)** — there is no usable testnet for this stack (Li.Fi
is mainnet-only, Polymarket has no public testnet CLOB, pUSD exists only on
Polygon mainnet), so the suite runs the real app against **anvil mainnet forks**
of Polygon + Arbitrum with real read-only Li.Fi / CLOB APIs:

- `e2e/global-setup.ts` spawns both forks and seeds the test EOA (pUSD by
  impersonating the ConditionalTokens escrow — pUSD uses namespaced storage, so
  the usual balance-slot trick can't; USDC via storage-slot search).
- An injected EIP-1193 test wallet (`e2e/helpers/wallet-init.ts`) proxies
  JSON-RPC to the forks and implements EIP-6963 announce + EIP-5792
  `wallet_sendCalls`, so the app's wallet discovery, batched-approval, and Li.Fi
  paths all run unmodified; anvil signs txs and typed data for its dev accounts.
- The specs then prove, with real transactions: the EIP-6963 picker connects the
  chosen wallet when two are present; seeded balance renders; the **approval flow
  batches the market's required approvals into one EIP-5792 call and is idempotent**
  (allowance + operator verified on-chain afterward, reload shows ready with no
  re-prompt); the trade panel signs a **real V2 EIP-712 order — for a custom share
  amount — whose signature recovers to the test EOA**; and the bridge executes a
  fresh Li.Fi route to a **mined source tx while the UI provably never reports
  completion** — destination settlement can't happen on a fork, which is exactly the
  false-completion case the assessment forbids.

Requires [foundry](https://getfoundry.sh) (`anvil` on PATH) and network access.
Three env knobs exist solely so the e2e suite can pin fork-compatible behavior
(`playwright.config.ts` sets them; the app defaults are the assessment values):
`NEXT_PUBLIC_LIFI_EXECUTION_TYPE` (e2e: `transaction`),
`NEXT_PUBLIC_LIFI_BRIDGE_DENY` (e2e: `mayan,across` — their source txs depend on
off-chain auction/quote-freshness state that doesn't hold on forks), and
`NEXT_PUBLIC_LIFI_DISABLE_MESSAGE_SIGNING` (e2e: `1` — EIP-2612 native permits
can't be validated against a fork).

## Architecture decisions

- **Pure-function core, thin hooks, dumb panels.** Everything with judgment in it —
  pricing guard, bridge lifecycle derivation, approval planning, order construction —
  is a pure function in `src/lib/` with unit tests. Hooks (`src/hooks/`) only wire
  those functions to TanStack Query and the wallet; panels only render hook state.
- **Bridge completion = destination settlement, structurally.** The lifecycle mapper
  (`lib/bridgeLifecycle.ts`) requires the Li.Fi `RECEIVING_CHAIN` action to be `DONE`
  before reporting `done`; there is no code path that marks complete off the source
  tx, and a test asserts steps claiming `DONE` without destination settlement stay
  pending.
- **The preview quote is never executed.** `useBridge.start()` always re-fetches a
  route and re-runs the pricing guard before `executeRoute`; the guard also runs on
  every displayed quote so the user sees the rejection reason before clicking.
- **Approvals are a market-scoped, idempotent plan submitted as one batch.**
  `computeApprovalPlan` diffs on-chain state (one multicall) against
  `requiredApprovals(market)` — market-aware, so the user is never asked to approve
  contracts the current market won't touch (binary needs 2, neg-risk 4) — then
  encodes the missing calls (`approvalToCall`) and sends them via viem `sendCalls`
  (EIP-5792) for a single wallet confirmation, with `experimental_fallback` to
  sequential `eth_sendTransaction`. Idempotence is a property of the data flow; the
  V2 address set in `lib/approvals.ts` is config.
- **viem + a small injected-wallet store instead of wagmi, with EIP-6963 discovery.**
  A `useSyncExternalStore`-based EIP-1193 store covers connect/accounts/chain-switch
  without a second framework and feeds the Li.Fi `EthereumProvider` directly.
  EIP-6963 (`lib/eip6963.ts`) enumerates announced wallets so MetaMask isn't shadowed
  by e.g. Phantom grabbing `window.ethereum` — a picker appears when more than one is
  present; the global is a last-resort fallback.
- **Li.Fi SDK v4** (current major: `createClient` + provider packages,
  `execution.actions[]`). `order: 'SAFEST'` is passed as specified — it still
  type-checks but is deprecated upstream (server treats it as legacy ordering);
  flagged here rather than silently swapped for `CHEAPEST`.
- **Polymarket reads go straight from the browser** — the CLOB (`/book`) is
  unauthenticated and CORS-open (verified), so no proxy layer exists to maintain.
- **The fixed market is a constant** (`lib/polymarket.ts`), verified live: binary,
  non-neg-risk, high liquidity. The order domain still handles the neg-risk case so
  swapping the constant is enough to retarget the panel.
- **Order amounts are computed in integer ticks/units** (`parseUnits`, tick-multiple
  validation) so `0.07 × 30` is exactly `2100000`, never `2099999.99…`.
- **No backend.** Every flow here is wallet-signed client-side state; a server would
  add deploy surface without adding signal. (Production would add one — see below.)

## Known limitations

- **Order submission stops at a documented boundary.**
  `preparePolymarketOrder` and `signPolymarketOrder` run for real (correct V2
  `Order` struct — `salt/maker/signer/tokenId/makerAmount/takerAmount/side/
  signatureType/timestamp/metadata/builder` — signed against the
  `Polymarket CTF Exchange, version 2` domain). `submitPolymarketOrder` returns the
  fully-formed `POST /order` payload plus what blocks sending it:
  1. **L2 CLOB credentials** — an L1 `ClobAuth` EIP-712 signature exchanged at
     `POST /auth/api-key` for `{key, secret, passphrase}`, then HMAC-SHA256 request
     signing on every order POST. Wiring this is mechanical but belongs server-side
     (the secret must not live in a browser bundle).
  2. **Geo-blocking** — clob.polymarket.com rejects order placement from US/UK/FR/DE
     and other blocked-region IPs regardless of credentials.
- **Solana as a source chain is not wired** (assessment allowed picking one).
  Li.Fi v4 supports it via `@lifi/sdk-provider-solana` + a wallet-standard wallet;
  it slots into the same `providers: []` array and the same lifecycle mapper, but
  doubles the wallet-connection surface for no extra flow signal.
- **Bridging into pUSD assumes Li.Fi routes terminate in pUSD.** pUSD is a 1:1
  USDC wrapper; the documented primitive is `CollateralOnramp.wrap()` from USDC.e.
  If no direct route exists for an amount, the form reports "no route" rather than
  composing bridge + wrap itself — production would quote to USDC.e and append the
  wrap call (Li.Fi contract-calls API or a second tx).
- **Approval set is scoped to the market** (binary → CTF Exchange V2; neg-risk →
  Neg Risk CTF Exchange V2 + Neg Risk Adapter), for both pUSD allowance and CTF
  operator. The official ts-sdk additionally approves the collateral adapters
  (split/merge/redeem) and router/Exchange-V3 (forward-compat); they're one-line
  additions to the venue list in `requiredApprovals`.
- The fixed market resolves 2026-06-30; after that the constant needs replacing.
- `MIN_USABLE_ALLOWANCE` treats a finite-but-tiny allowance as missing and
  re-approves to max — simple, but a user who deliberately set a small allowance
  will be asked to widen it.

## What I'd ship for production

- A small server (the team's Rust stack fits naturally here) for: CLOB L2
  credential custody and order relay, route/quote logging for support forensics,
  and webhook-driven bridge status tracking instead of client polling.
- Persistent bridge state: store the active Li.Fi route in localStorage + backend,
  call `resumeRoute` on reload, reconcile with `getStatus(txHash)` so a closed tab
  can't orphan an in-flight bridge; surface stuck/refunded substates
  (`PARTIAL`, `REFUNDED`) with explicit recovery copy.
- The bridge+wrap fallback path into pUSD described above, and Solana source
  support.
- Real order lifecycle after submission: open-order list, fills via the CLOB user
  websocket, cancel/replace.
- Further wallet hardening: Ledger-via-MetaMask quirks (`signTypedData_v4` support
  detection) and explicit handling for wallets that silently drop chain-switch
  requests. (EIP-6963 multi-provider discovery is already implemented — see
  Architecture decisions.)
- Observability: structured event log per bridge attempt (route id, tool, hashes,
  substatus transitions) — this is the dataset the recovery UX below depends on.
- A scheduled mainnet canary: the fork e2e (already in CI) can't observe real
  destination settlement, so production would add a periodic micro-amount
  ($1–2) live bridge exercising the full settle path with alerting.

## Polygon ↔ HyperLiquid bridge production risks

### Why this is harder than Solana → Polygon

Solana → Polygon is one hop between two general-purpose chains, both natively
supported by major bridges, with independent liquidity on each side and no special
deposit semantics. HyperLiquid is different in kind, not just in degree:

- **HyperLiquid is not a general-purpose EVM destination.** Funds live either on
  HyperCore (the L1 order-book ledger) or HyperEVM, and trading balances require a
  **deposit into the exchange ledger**, not just tokens at an address. The canonical
  ingress is USDC via Arbitrum into the HyperLiquid bridge contract; most routes
  from Polygon are therefore **two-legged**: Polygon → Arbitrum → HyperLiquid
  deposit. Two legs means an intermediate chain where funds can strand —
  Solana → Polygon has no such state.
- **Asymmetric directions.** Withdrawal from HyperLiquid is initiated on
  HyperLiquid itself (validator-signed release on Arbitrum), with its own
  finalization delay and minimums. Polygon → HyperLiquid and HyperLiquid → Polygon
  are *different protocols*, not the same route reversed — separate state machines,
  separate failure modes.
- **Tighter invariants.** Exchange deposits have minimums (a sub-minimum deposit
  can be ignored or lost), specific token requirements (native USDC, not a bridged
  variant), and the destination "settlement" signal is an exchange-ledger credit,
  which generic bridge status APIs don't model as a first-class state.

### Avoiding stranded funds on an intermediate chain

- Treat **each leg as a checkpointed transaction** with a persisted record
  (route id, leg index, tx hashes, amounts) written *before* leg 1 is signed —
  never derive state only from what a UI session remembers.
- After leg 1 settles, **verify leg 2's preconditions before executing it**:
  fresh quote, destination deposit minimum met *after* fees, and the exact asset
  the next leg requires (native USDC on Arbitrum — USDC.e is the classic trap).
  If leg 2 can't proceed, funds are parked at the user's own address on the
  intermediate chain — by construction, never inside a contract we control — and
  the UI must say exactly where they are.
- **Gas the intermediate hop.** A user with zero ETH on Arbitrum cannot execute
  leg 2. Either route gas along (LI.Fuel-style top-up), use a relayer that accepts
  token-denominated fees, or check and block up-front with a clear message.
- Enforce the **pricing sanity guard per leg**, not just end-to-end, so a broken
  leg-2 quote can't silently eat what leg 1 delivered.

### Tracking source transaction vs destination settlement

- Model the transfer as an explicit per-leg state machine:
  `submitted(srcTx) → srcConfirmed → bridgeAttested → destTx → destSettled`,
  with HyperLiquid adding a final `exchangeCredited` state confirmed against the
  HyperLiquid API (ledger/balance update) — "tokens reached the bridge contract"
  is not "user can trade".
- Persist `(legId, srcTxHash)` as the primary key and reconcile from chain data +
  bridge status APIs (`getStatus`-by-txHash style), never from in-memory execution
  state; a page reload or crashed tab must be able to reattach.
- Treat source confirmation as the *beginning* of the dangerous window. The UI rule
  from this assessment generalizes: **never display "complete" until the final
  ledger the user cares about shows the money.**

### Failed and partial bridge states

- Distinguish at minimum: source reverted (nothing left the wallet); source
  confirmed + bridge refunded (funds back on source chain, possibly minus fees);
  stuck-pending (attestation/relay delay); partial fill (`DONE` with `PARTIAL`
  substatus — less than quoted arrived); delivered-but-not-credited (sitting on
  Arbitrum, or a sub-minimum exchange deposit).
- Map every state to: (a) where the funds are right now, (b) whether retry is
  safe, (c) whether money is owed back via refund. Refunds land asynchronously on
  the source chain — watch for them explicitly instead of reporting "failed" and
  nothing else.
- Make retries **idempotent**: a retry must reference the persisted leg record and
  re-verify on-chain state first, so a double-click or a replayed webhook can't
  double-spend a leg.

### Recovery UX

- Always show: a leg-by-leg timeline with explorer links for every hash; where the
  funds are *right now* ("Your 50 USDC is on Arbitrum at your address — leg 2
  didn't start"); and one primary action per state — **Resume** (re-quote leg 2),
  **Refund/Return** (route back), or **Wait** (with an honest ETA bound, not a
  spinner).
- Support tickets die without identifiers: a copyable bundle (route id, leg
  hashes, timestamps, quoted vs received amounts) on every terminal state.
- Never auto-retry money movement silently; surface the plan, execute on click.

### Gas / nonce / route / settlement guards

- **Gas:** simulate before prompting (`eth_estimateGas` against the real calldata);
  check destination-leg gas *before* leg 1 executes; on Polygon specifically, use
  aggressive EIP-1559 fee bumping — underpriced txs there routinely hang for
  minutes, which users read as "the bridge stole my money".
- **Nonce:** one in-flight tx per account per chain from the app; avoid firing
  state-changing txs in parallel (the approval flow batches them into one EIP-5792
  call where the wallet supports it, sidestepping multiple in-flight nonces, and
  falls back to serialized sends otherwise); track the account nonce, not just the
  tx hash, so a MetaMask speed-up/replace doesn't orphan tracking.
- **Route:** re-quote immediately before each leg's execution (never execute a
  stale quote); pin the per-leg sanity ratio; deny-list tools that can't deliver
  the exact asset the next leg requires; enforce deposit minimums **after** fees.
- **Settlement:** per-leg timeout SLOs (source confirmed but no destination event
  after N minutes → "delayed" UX + alerting); verify received vs quoted amounts
  and flag shortfalls beyond slippage; for HyperLiquid, poll the exchange ledger
  for the credit and only then unlock trading UI.

## Repository layout

```
src/
  lib/        pure logic: chains, approvals plan, route guard, lifecycle mapper,
              quote summary, order construction (+ unit tests alongside)
  hooks/      TanStack Query + wallet wiring (useBridge, useReadiness, useTrade…)
  components/ the four panels + small UI primitives
  app/        Next.js App Router shell (layout, page, providers)
e2e/          Playwright suite: anvil fork bootstrap, injected test wallet, specs
```
