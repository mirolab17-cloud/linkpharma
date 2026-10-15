import { convertArabicNumerals } from './arabicNormalize';
import { UserProfile } from '../types';

/** يحوّل أرقام الجوال القديمة والدولية إلى الصيغة المحلية 05XXXXXXXX. */
export function normalizeSaudiLocalPhone(value: string): string {
  let digits = convertArabicNumerals(value || '').replace(/\D/g, '');
  if (digits.startsWith('00970')) digits = digits.slice(5);
  else if (digits.startsWith('970')) digits = digits.slice(3);
  else if (digits.startsWith('00972')) digits = digits.slice(5);
  else if (digits.startsWith('972')) digits = digits.slice(3);
  else if (digits.startsWith('96605')) digits = digits.slice(3);
  else if (digits.startsWith('966') && digits.length === 12) digits = '0' + digits.slice(3);
  if (digits.startsWith('5') && digits.length === 9) digits = '0' + digits;
  return digits;
}

export function isValidSaudiLocalPhone(value: string): boolean {
  return /^05\d{8}$/.test(normalizeSaudiLocalPhone(value));
}

export function isProfileComplete(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile) return false;
  const pharmacyName = String(profile.pharmacyName || '').trim();
  const ownerName = String(profile.ownerName || profile.name || '').trim();
  const address = String(profile.addressDetail || profile.address || '').trim();
  const hasLocation = Boolean(String(profile.governorate || '').trim() && String(profile.city || '').trim());
  const validName = pharmacyName.length >= 2 && pharmacyName !== 'صيدليتي' && ownerName.length >= 2;
  const validAddress = address.length >= 3 && (hasLocation || Boolean(profile.address));
  return Boolean(validName && validAddress && isValidSaudiLocalPhone(profile.phone || ''));
}

export function triggerHaptic(pattern: number | number[] = 12): void { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern); }
export function playSuccessSound(): void {
  if (typeof window === 'undefined' || localStorage.getItem('pharma_sound_effects') !== 'on') return;
  try { const C = window.AudioContext || (window as any).webkitAudioContext; if (!C) return; const c = new C(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 700; g.gain.value = 0.05; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .16); } catch (_) {}
}
