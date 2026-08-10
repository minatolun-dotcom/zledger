/**
 * Shared keyboard-navigation highlight for table rows.
 *
 * Used by every consumer of useListKeyboardNav (SortableTable's keyboardNav,
 * Day Book, Voucher List) so the highlighted-row style can never drift between
 * tables — change it here and every table updates.
 */
export const HIGHLIGHT_ROW_CLASS =
  "bg-brand-50/60 dark:bg-brand-500/5 ring-1 ring-inset ring-brand-300 dark:ring-brand-500/30";

/** Returns the highlight class when `isHighlighted`, otherwise an empty string. */
export function highlightRowClass(isHighlighted: boolean): string {
  return isHighlighted ? HIGHLIGHT_ROW_CLASS : "";
}
