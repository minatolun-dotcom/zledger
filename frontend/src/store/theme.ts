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

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = getInitial();
  applyTheme(initial);

  // Listen for system preference changes when in system mode
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

  setupListener(initial);

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
