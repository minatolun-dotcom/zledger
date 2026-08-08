import { create } from "zustand";

const THEME_KEY = "zledger.theme";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
  } else {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

function getInitial(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") return stored;
  return "system";
}

// Kept at module scope so initTheme() and the store share one media listener.
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function setupListener(theme: Theme) {
  if (mediaListener) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", mediaListener);
    mediaListener = null;
  }
  if (theme === "system") {
    mediaListener = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", mediaListener);
  }
}

/**
 * Apply the persisted theme (or system preference) to <html> before the app
 * renders. Called from `main.tsx` so every full page load gets the correct
 * theme — including pages that never mount the TopHeader (e.g. `/companies`
 * switch-mode) where the dark class used to be lost on navigation.
 * Idempotent: the store's `create` callback also calls it on first import.
 */
export function initTheme(): Theme {
  const initial = getInitial();
  applyTheme(initial);
  setupListener(initial);
  return initial;
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  // Intentional: on pages that import the store this runs alongside main.tsx's
  // explicit initTheme() call. Both are idempotent (applyTheme toggles the
  // class; setupListener swaps the prior listener), so the double run is safe.
  const initial = initTheme();
  return {
    theme: initial,
    setTheme: (t: Theme) => {
      localStorage.setItem(THEME_KEY, t);
      applyTheme(t);
      setupListener(t);
      set({ theme: t });
    },
  };
});
