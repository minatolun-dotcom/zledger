import { create } from "zustand";
import { getCompanyId } from "../api/client";

const FY_KEY_PREFIX = "zledger.fyId";

/** FY selections are per-company: the key embeds the company id because FY ids
 *  are unique per company in the DB. Without an active company we fall back to
 *  the legacy unscoped key (only relevant during logout cleanup). */
function fyStorageKey(companyId: string | null | undefined): string {
  return companyId ? `${FY_KEY_PREFIX}.${companyId}` : FY_KEY_PREFIX;
}

/** Read the saved FY selection for the given company (defaults to the active
 *  one). Exported so voucher forms read the same scoped value. */
export function getStoredFyId(companyId?: string | null): string | null {
  const id = companyId === undefined ? getCompanyId() : companyId;
  return localStorage.getItem(fyStorageKey(id));
}

interface FyState {
  activeFyId: string | null;
  setActiveFy: (id: string | null) => void;
  /** Re-read the FY selection for the (newly) active company. */
  reloadForCompany: (companyId?: string | null) => void;
}

export const useFyStore = create<FyState>((set) => ({
  activeFyId: getStoredFyId(),
  setActiveFy: (id) => {
    const key = fyStorageKey(getCompanyId());
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
    set({ activeFyId: id });
  },
  reloadForCompany: (companyId) => {
    set({ activeFyId: getStoredFyId(companyId) });
  },
}));
