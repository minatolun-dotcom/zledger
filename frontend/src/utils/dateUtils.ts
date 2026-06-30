// ── Date utilities for dd/mm/yyyy format ──────────────────────────────────
//
// All dates in the API use YYYY-MM-DD format.
// All dates displayed to users use dd/mm/yyyy format.

/**
 * Convert YYYY-MM-DD (API format) to dd/mm/yyyy (display format)
 * @param isoDate - Date string in YYYY-MM-DD format
 * @returns Date string in dd/mm/yyyy format
 */
export function toDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Convert dd/mm/yyyy (display format) to YYYY-MM-DD (API format)
 * @param displayDate - Date string in dd/mm/yyyy format
 * @returns Date string in YYYY-MM-DD format
 */
export function toIsoDate(displayDate: string): string {
  const parts = displayDate.split("/");
  if (parts.length !== 3) return displayDate;
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get today's date in dd/mm/yyyy format
 */
export function todayDisplay(): string {
  return toDisplayDate(todayIso());
}

/**
 * Calculate end date (day before start date in next year) in ISO format
 * @param startDate - Start date in YYYY-MM-DD format
 * @returns End date in YYYY-MM-DD format
 */
export function calculateEndDate(startDate: string): string {
  const date = new Date(startDate);
  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

/**
 * Generate FY name from start date
 * @param startDate - Start date in YYYY-MM-DD format
 * @returns FY name like "2025-2026"
 */
export function generateFyName(startDate: string): string {
  if (!startDate) return "";
  const year = new Date(startDate).getFullYear();
  return `${year}-${year + 1}`;
}
