import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Ledger, Party, StockItem } from "../pages/vouchers/types";

export interface AccountGroup {
  id: string;
  company_id: string;
  name: string;
  nature: string;
  system_code: string | null;
  parent_id: string | null;
  group_type: string;
  is_system: boolean;
}

/**
 * Hook for fetching and caching master data (ledgers, parties, stock items, account groups).
 * Uses React Query for automatic caching, deduplication, and background refetching.
 */
interface MasterDataResult {
  ledgers: Ledger[];
  parties: Party[];
  stockItems: StockItem[];
  accountGroups: AccountGroup[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMasterData(): MasterDataResult {
  const ledgersQuery = useQuery({
    queryKey: ["ledgers"],
    queryFn: () => api.get<Ledger[]>("/coa/ledgers"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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

  const accountGroupsQuery = useQuery({
    queryKey: ["accountGroups"],
    queryFn: () => api.get<AccountGroup[]>("/coa/groups"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading = ledgersQuery.isLoading || partiesQuery.isLoading || stockItemsQuery.isLoading || accountGroupsQuery.isLoading;
  const error = ledgersQuery.error || partiesQuery.error || stockItemsQuery.error || accountGroupsQuery.error;

  const refetch = () => {
    ledgersQuery.refetch();
    partiesQuery.refetch();
    stockItemsQuery.refetch();
    accountGroupsQuery.refetch();
  };

  return {
    ledgers: ledgersQuery.data || [],
    parties: partiesQuery.data || [],
    stockItems: stockItemsQuery.data || [],
    accountGroups: accountGroupsQuery.data || [],
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
 * Returns the full inventory StockItem type (with stock_group_id, sku, opening_qty, etc.).
 */
export interface InventoryStockItem {
  id: string; stock_group_id: string | null; name: string; sku: string | null;
  hsn_sac_code: string | null; unit_of_measure: string; opening_qty: number;
  opening_rate: number; valuation_method: string; gst_rate: number; is_active: boolean;
}

export function useStockItems() {
  return useQuery({
    queryKey: ["stockItems"],
    queryFn: () => api.get<InventoryStockItem[]>("/inventory/items"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ─── Other Master Data Hooks ────────────────────────────────────────────────

/**
 * Financial year interface matching the API response.
 */
export interface FinancialYear {
  id: string;
  company_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
}

/**
 * Hook for fetching and caching financial years.
 */
export function useFinancialYears() {
  return useQuery({
    queryKey: ["financialYears"],
    queryFn: () => api.get<FinancialYear[]>("/coa/financial-years"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching and caching HSN/SAC codes.
 */
export interface HsnSac {
  id: string;
  company_id: string;
  code: string;
  description: string;
  type: string;
  gst_rate: number;
}

export function useHsnSac() {
  return useQuery({
    queryKey: ["hsnSac"],
    queryFn: () => api.get<HsnSac[]>("/gst/hsn-sac"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching and caching GST registrations.
 */
export interface GstRegistration {
  id: string;
  company_id: string;
  gstin: string;
  state_code: string;
  registration_type: string;
  is_primary: boolean;
}

export function useGstRegistrations() {
  return useQuery({
    queryKey: ["gstRegistrations"],
    queryFn: () => api.get<GstRegistration[]>("/gst/registrations"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching and caching stock groups.
 */
export interface StockGroup {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export function useStockGroups() {
  return useQuery({
    queryKey: ["stockGroups"],
    queryFn: () => api.get<StockGroup[]>("/inventory/groups"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ─── Manufacturing ──────────────────────────────────────────────────────

export interface BomLine {
  id: string;
  stock_item_id: string;
  item_name: string | null;
  quantity: number;
  rate: number | null;
  wastage_pct: number;
}

export interface Bom {
  id: string;
  company_id: string;
  name: string;
  finished_item_id: string;
  output_qty: number;
  is_active: boolean;
  lines: BomLine[];
}

export function useBoms() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (bomId: string) => api.post<Bom>(`/manufacturing/boms/${bomId}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boms"] });
    },
  });
  return {
    query: useQuery({
      queryKey: ["boms"],
      queryFn: () => api.get<Bom[]>("/manufacturing/boms"),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
    duplicate: mutation.mutateAsync,
    isDuplicating: mutation.isPending,
  };
}

export interface ProductionOrder {
  id: string;
  company_id: string;
  bom_id: string;
  order_number: string;
  order_date: string;
  planned_qty: number;
  produced_qty: number;
  status: string;
  narration: string | null;
  voucher_id: string | null;
  created_by: string | null;
}

export function useProductionOrders() {
  return useQuery({
    queryKey: ["productionOrders"],
    queryFn: () => api.get<ProductionOrder[]>("/manufacturing/production-orders"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface MaterialAvailability {
  stock_item_id: string;
  item_name: string;
  required_qty: number;
  available_qty: number;
  sufficient: boolean;
}

export function useMaterialAvailability(bomId: string | null, plannedQty: number) {
  return useQuery({
    queryKey: ["materialAvailability", bomId, plannedQty],
    queryFn: () => api.get<MaterialAvailability[]>(
      `/manufacturing/boms/${bomId}/availability?planned_qty=${plannedQty}`
    ),
    enabled: !!bomId && plannedQty > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export interface BomStockLevel {
  stock_item_id: string;
  item_name: string;
  quantity_per_unit: number;
  current_stock: number;
}

export function useBomStockLevels(bomId: string | null) {
  return useQuery({
    queryKey: ["bomStockLevels", bomId],
    queryFn: () => api.get<BomStockLevel[]>(
      `/manufacturing/boms/${bomId}/stock-levels`
    ),
    enabled: !!bomId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
