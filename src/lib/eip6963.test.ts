import type { EIP1193Provider } from 'viem';
import { describe, expect, it } from 'vitest';
import { upsertProviderDetail, type EIP6963ProviderDetail } from './eip6963';

const provider = {} as EIP1193Provider;

function detail(rdns: string, name: string): EIP6963ProviderDetail {
  return {
    info: { uuid: rdns, name, icon: '', rdns },
    provider,
  };
}

describe('upsertProviderDetail', () => {
  it('adds a newly-announced wallet', () => {
    const list = upsertProviderDetail([], detail('io.metamask', 'MetaMask'));
    expect(list).toHaveLength(1);
    expect(list[0].info.name).toBe('MetaMask');
  });

  it('dedupes by rdns — a re-announce replaces, never duplicates', () => {
    const first = upsertProviderDetail([], detail('io.metamask', 'MetaMask'));
    const updated = detail('io.metamask', 'MetaMask (Flask)');
    const second = upsertProviderDetail(first, updated);
    expect(second).toHaveLength(1);
    expect(second[0].info.name).toBe('MetaMask (Flask)');
  });

  it('keeps distinct wallets and sorts by name (deterministic picker order)', () => {
    let list: EIP6963ProviderDetail[] = [];
    list = upsertProviderDetail(list, detail('app.phantom', 'Phantom'));
    list = upsertProviderDetail(list, detail('io.metamask', 'MetaMask'));
    list = upsertProviderDetail(list, detail('com.coinbase', 'Coinbase Wallet'));
    expect(list.map((d) => d.info.name)).toEqual([
      'Coinbase Wallet',
      'MetaMask',
      'Phantom',
    ]);
  });

  it('does not mutate the input list', () => {
    const original = [detail('io.metamask', 'MetaMask')];
    const copy = [...original];
    upsertProviderDetail(original, detail('app.phantom', 'Phantom'));
    expect(original).toEqual(copy);
  });
});
