// src/store/useThemeStore.ts
import { create } from 'zustand';

export type ThemeMode = 'light';

interface ThemeState {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

function enforceDaytimeTheme() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('pharma_theme');
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'light',
  isDark: false,

  setTheme: () => {
    enforceDaytimeTheme();
    set({ theme: 'light', isDark: false });
  },

  toggleTheme: () => {
    enforceDaytimeTheme();
    set({ theme: 'light', isDark: false });
  },

  initializeTheme: () => {
    enforceDaytimeTheme();
    set({ theme: 'light', isDark: false });
  },
}));
