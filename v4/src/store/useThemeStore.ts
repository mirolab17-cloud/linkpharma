import { create } from 'zustand';
export type ThemeMode='light'|'dark'|'system';
interface ThemeState { theme: ThemeMode; isDark: boolean; setTheme:(theme:ThemeMode)=>void; toggleTheme:()=>void; initializeTheme:()=>void; }
const apply=(t:ThemeMode)=>{const dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';return dark;};
export const useThemeStore=create<ThemeState>((set)=>({theme:'system',isDark:false,setTheme:(theme)=>{localStorage.setItem('pharma_theme',theme);set({theme,isDark:apply(theme)});},toggleTheme:()=>{const theme=document.documentElement.classList.contains('dark')?'light':'dark';localStorage.setItem('pharma_theme',theme);set({theme,isDark:apply(theme)});},initializeTheme:()=>{const t=(localStorage.getItem('pharma_theme') as ThemeMode)||'system';set({theme:t,isDark:apply(t)});}}));
