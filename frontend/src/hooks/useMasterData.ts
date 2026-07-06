import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Ledger, Party, StockItem } from "../pages/vouchers/types";

/**
 * Hook for fetching and caching master data (ledgers, parties, stock items).
 * Uses React Query for automatic caching, deduplication, and background refetching.
 * 
 * Cache settings:
 * - staleTime: 5 minutes (data considered fresh for 5 min)
 * - cacheTime: 30 minutes (data kept in cache for 30 min)
 * - refetchOnWindowFocus: false (don't refetch on tab switch)
 */

interface MasterDataResult {
  ledgers: Ledger[];
  parties: Party[];
  stockItems: StockItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMasterData(): MasterDataResult {
  const ledgersQuery = useQuery({
    queryKey: ["ledgers"],
    queryFn: () => api.get<Ledger[]>("/coa/ledgers"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties"],
    queryFn: () => api.get<Party[]>("/coa/parties"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stockItemsQuery = useQuery({
    queryKey: ["stockItems"],
    queryFn: () => api.get<StockItem[]>("/inventory/items"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading = ledgersQuery.isLoading || partiesQuery.isLoading || stockItemsQuery.isLoading;
  const error = ledgersQuery.error || partiesQuery.error || stockItemsQuery.error;

  const refetch = () => {
    ledgersQuery.refetch();
    partiesQuery.refetch();
    stockItemsQuery.refetch();
  };

  return {
    ledgers: ledgersQuery.data || [],
    parties: partiesQuery.data || [],
    stockItems: stockItemsQuery.data || [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching only ledgers with caching.
 */
export function useLedgers() {
  return useQuery({
    queryKey: ["ledgers"],
    queryFn: () => api.get<Ledger[]>("/coa/ledgers"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching only parties with caching.
 */
export function useParties() {
  return useQuery({
    queryKey: ["parties"],
    queryFn: () => api.get<Party[]>("/coa/parties"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching only stock items with caching.
 */
export function useStockItems() {
  return useQuery({
    queryKey: ["stockItems"],
    queryFn: () => api.get<StockItem[]>("/inventory/items"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
