// src/utils/pharmacyFeatures.ts
// صلاحيات إظهار/إخفاء ميزات واجهة الصيدلية: إعداد عام للكل + استثناء لكل صيدلية.
import type { FeatureOverride, PharmacyFeatureKey, PharmacyFeatureOverrides, SystemSettings, UserProfile } from '../types';

export const PHARMACY_FEATURES: { key: PharmacyFeatureKey; label: string; description: string }[] = [
  { key: 'cheapest', label: 'ميزة الأرخص', description: 'شارة «الأرخص»، زر «الأرخص أولاً»، ورسائل التوفير في صفحة الأسعار.' },
  { key: 'cartOptimization', label: 'أفضل سلة', description: 'اقتراح بدائل توريد أرخص داخل السلة.' },
  { key: 'publicPrice', label: 'سعر الجمهور', description: 'السعر المشطوب (سعر العموم) بجانب سعر الشراء.' },
];

export const DEFAULT_FEATURES: Record<PharmacyFeatureKey, boolean> = {
  cheapest: true,
  cartOptimization: true,
  publicPrice: true,
};

export function resolveFeature(
  user: Pick<UserProfile, 'featureOverrides'> | null | undefined,
  settings: Pick<SystemSettings, 'pharmacyFeatureDefaults'> | null | undefined,
  key: PharmacyFeatureKey,
): boolean {
  const override: FeatureOverride | undefined = user?.featureOverrides?.[key];
  if (override === 'show') return true;
  if (override === 'hide') return false;
  const globalValue = settings?.pharmacyFeatureDefaults?.[key];
  return typeof globalValue === 'boolean' ? globalValue : DEFAULT_FEATURES[key];
}

export function resolveAllFeatures(
  user: Pick<UserProfile, 'featureOverrides'> | null | undefined,
  settings: Pick<SystemSettings, 'pharmacyFeatureDefaults'> | null | undefined,
): Record<PharmacyFeatureKey, boolean> {
  return {
    cheapest: resolveFeature(user, settings, 'cheapest'),
    cartOptimization: resolveFeature(user, settings, 'cartOptimization'),
    publicPrice: resolveFeature(user, settings, 'publicPrice'),
  };
}

export type { PharmacyFeatureOverrides };
