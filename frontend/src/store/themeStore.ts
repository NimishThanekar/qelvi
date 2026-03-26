import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "cobalt" | "cyan" | "rose" | "aura" | "neon" | "mono" | "paper";

const THEME_ACCENT: Record<Theme, string> = {
  cobalt: "#3B7BFF",
  cyan:   "#06B6D4",
  rose:   "#E11D48",
  aura:   "#A855F7",
  neon:   "#EC4899",
  mono:   "#EBEBEB",
  paper:  "#0F0F0F",
};

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "cobalt",
      toggleTheme: () => {
        const order: Theme[] = ["cobalt", "cyan", "rose", "aura", "neon", "mono", "paper"];
        const idx = order.indexOf(get().theme);
        const next = order[(idx + 1) % order.length];
        set({ theme: next });
      },
    }),
    { name: "theme-storage" }
  )
);

export function useAccentColor(): string {
  return THEME_ACCENT[useThemeStore((s) => s.theme)];
}
