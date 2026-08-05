/**
 * Date helpers for E2E specs.
 *
 * Voucher dates must fall inside an OPEN financial year — the seed closes older
 * FYs (2023-24/2024-25/2025-26), and the API rejects vouchers dated in a closed
 * period with a 400. Instead of hardcoding a year that rots when the seed closes
 * another FY, derive dates from the company's active (open) FY.
 */
import type { APIRequestContext } from "@playwright/test";

const API = "http://localhost:9090/api";

/** Add `days` to a `YYYY-MM-DD` string, returning another `YYYY-MM-DD` string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Return the start date of the company's first OPEN financial year.
 * Falls back to today (which is always inside whatever FY is currently open)
 * if the lookup fails.
 */
export async function activeFyStart(
  request: APIRequestContext,
  token: string,
  cid: string
): Promise<string> {
  try {
    const res = await request.get(`${API}/coa/financial-years`, {
      headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
    });
    const fys = (await res.json()) as Array<{ is_closed?: boolean; start_date?: string }>;
    if (Array.isArray(fys)) {
      const open = fys.find((f) => !f.is_closed);
      if (open?.start_date) return open.start_date;
    }
  } catch {
    /* fall through to fallback */
  }
  return new Date().toISOString().slice(0, 10);
}
