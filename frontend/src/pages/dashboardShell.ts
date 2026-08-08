/**
 * Shared dashboard card-language constants.
 *
 * Every dashboard surface (stat cards, charts, pending actions, quick actions,
 * manufacturing widgets) uses these so the page reads as one coherent design:
 *   - light: white surface + hairline slate border + soft shadow
 *   - dark:  app surface-2 (#16161f) + subtle border (per dark palette in index.css)
 */
export const cardShell =
  "rounded-xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05)] " +
  "transition-all duration-300 dark:border-[#1e1e28] dark:bg-[#16161f] dark:shadow-none";

/** Interactive row/button inside a card — subtle hover lift. */
export const rowInteractive =
  "flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 text-left " +
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md " +
  "dark:border-[#282832] dark:bg-[#1a1a24] dark:hover:border-[#33333f] dark:hover:shadow-dark-md";

/** Small icon tile inside cards (colored tint square). */
export const iconTile = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg";
