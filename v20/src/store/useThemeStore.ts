import { create } from 'zustand';
export type ThemeMode='light';
interface ThemeState { theme: ThemeMode; isDark: boolean; setTheme:(theme:ThemeMode)=>void; toggleTheme:()=>void; initializeTheme:()=>void; }
const apply=()=>{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';return false;};
export const useThemeStore=create<ThemeState>((set)=>({theme:'light',isDark:false,setTheme:()=>{localStorage.setItem('pharma_theme','light');set({theme:'light',isDark:apply()});},toggleTheme:()=>{localStorage.setItem('pharma_theme','light');set({theme:'light',isDark:apply()});},initializeTheme:()=>{localStorage.setItem('pharma_theme','light');set({theme:'light',isDark:apply()});}}));
