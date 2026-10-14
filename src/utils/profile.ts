import { convertArabicNumerals } from './arabicNormalize';
import { UserProfile } from '../types';

/**
 * صيغة الجوال المحلية المطلوبة للملف: 05XXXXXXXX (10 أرقام بالضبط).
 */
export function normalizeSaudiLocalPhone(value: string): string {
  return convertArabicNumerals(value || '').replace(/\D/g, '');
}

export function isValidSaudiLocalPhone(value: string): boolean {
  const phone = normalizeSaudiLocalPhone(value);
  return /^05\d{8}$/.test(phone);
}

export function isProfileComplete(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile) return false;
  const pharmacyName = String(profile.pharmacyName || '').trim();
  const address = String(profile.address || '').trim();
  const name = String(profile.name || '').trim();
  const hasRealName = pharmacyName.length >= 2 && pharmacyName !== 'صيدليتي';
  return Boolean((hasRealName || name.length >= 2) && address.length >= 3 && isValidSaudiLocalPhone(profile.phone || ''));
}

export function triggerHaptic(pattern: number | number[] = 12): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export function playSuccessSound(): void {
  if (typeof window === 'undefined' || localStorage.getItem('pharma_sound_effects') !== 'on') return;
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch (_) {
    // الصوت تحسين اختياري ولا ينبغي أن يعطل الطلبية.
  }
}
