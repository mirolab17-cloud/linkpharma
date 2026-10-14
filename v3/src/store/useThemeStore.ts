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

function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function storedTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const saved = localStorage.getItem('pharma_theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',
  isDark: false,

  setTheme: (theme) => {
    localStorage.setItem('pharma_theme', theme);
    applyTheme(theme);
    set({ theme, isDark: theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) });
  },

  toggleTheme: () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem('pharma_theme', next);
    applyTheme(next);
    set({ theme: next, isDark: next === 'dark' });
  },

  initializeTheme: () => {
    const theme = storedTheme();
    applyTheme(theme);
    set({ theme, isDark: document.documentElement.classList.contains('dark') });
  },
}));
