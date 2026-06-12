'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchBookTop } from '@/lib/polymarket';

/** Best bid/ask for one CLOB token, refreshed every 10s. */
export function useBookTop(tokenId: string) {
  return useQuery({
    queryKey: ['clob-book-top', tokenId],
    refetchInterval: 10_000,
    queryFn: () => fetchBookTop(tokenId),
  });
}
