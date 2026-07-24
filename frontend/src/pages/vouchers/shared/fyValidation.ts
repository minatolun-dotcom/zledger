/**
 * Financial Year validation helpers for voucher forms.
 */

export interface FinancialYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/**
 * Find the Financial Year that contains the given date.
 * Returns null if no FY matches.
 */
export function findFyForDate(fys: FinancialYear[], date: string): FinancialYear | null {
  return fys.find((fy) => date >= fy.start_date && date <= fy.end_date) || null;
}

/**
 * Validate that a voucher date falls within an existing Financial Year.
 * Returns an error message if invalid, null if valid.
 */
export function validateDateInFy(fys: FinancialYear[], date: string): string | null {
  if (fys.length === 0) return null;
  if (!findFyForDate(fys, date)) {
    return `Date ${date} does not fall within any Financial Year. Please select a date within an existing FY or create a new FY.`;
  }
  return null;
}
