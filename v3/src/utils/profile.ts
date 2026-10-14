import { convertArabicNumerals } from './arabicNormalize';
import { UserProfile } from '../types';
export function normalizeSaudiLocalPhone(value: string): string { return convertArabicNumerals(value || '').replace(/\D/g, ''); }
export function isValidSaudiLocalPhone(value: string): boolean { return /^05\d{8}$/.test(normalizeSaudiLocalPhone(value)); }
export function isProfileComplete(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile) return false;
  const pharmacyName = String(profile.pharmacyName || '').trim();
  const name = String(profile.name || '').trim();
  return Boolean((pharmacyName.length >= 2 && pharmacyName !== 'صيدليتي' || name.length >= 2) && String(profile.address || '').trim().length >= 3 && isValidSaudiLocalPhone(profile.phone || ''));
}
export function triggerHaptic(pattern: number | number[] = 12): void { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern); }
export function playSuccessSound(): void {
  if (typeof window === 'undefined' || localStorage.getItem('pharma_sound_effects') !== 'on') return;
  try { const C = window.AudioContext || (window as any).webkitAudioContext; if (!C) return; const c = new C(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 700; g.gain.value = 0.05; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .16); } catch (_) {}
}
