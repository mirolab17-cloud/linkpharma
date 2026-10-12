// src/store/useThemeStore.ts
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

function applyThemeToDocument(isDark: boolean) {
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  isDark: false,

  setTheme: (theme: ThemeMode) => {
    localStorage.setItem('pharma_theme', theme);
    const systemPrefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
    applyThemeToDocument(isDark);
    set({ theme, isDark });
  },

  toggleTheme: () => {
    const current = get().theme;
    const isDarkCurrent = get().isDark;
    const nextTheme: ThemeMode = isDarkCurrent ? 'light' : 'dark';
    get().setTheme(nextTheme);
  },

  initializeTheme: () => {
    if (typeof window === 'undefined') return;

    const saved = (localStorage.getItem('pharma_theme') as ThemeMode) || 'system';
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = saved === 'dark' || (saved === 'system' && mediaQuery.matches);

    applyThemeToDocument(isDark);
    set({ theme: saved, isDark });

    const listener = (e: MediaQueryListEvent) => {
      if (get().theme === 'system') {
        applyThemeToDocument(e.matches);
        set({ isDark: e.matches });
      }
    };

    mediaQuery.addEventListener('change', listener);
  },
}));
