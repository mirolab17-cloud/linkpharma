// src/utils/pharmacyCapabilities.ts
// صلاحيات إضافية تُمنح لكل صيدلية (أو لمجموعة): رفع الأسعار، إنشاء الأصناف، إنشاء المواد الفعالة.
import type { PharmacyCapabilityKey, UserProfile } from '../types';

export const PHARMACY_CAPABILITIES: { key: PharmacyCapabilityKey; label: string; description: string; tab: string }[] = [
  { key: 'uploadPrices', label: 'رفع وتحديث الأسعار', description: 'رفع ملف Excel/CSV بأسعار مستودع محدد تختاره أنت.', tab: 'prices' },
  { key: 'createProducts', label: 'إنشاء أصناف تجارية', description: 'إضافة صنف جديد للكتالوج (ويظهر لك تمييزه في صفحة ظهور الأصناف).', tab: 'products' },
  { key: 'createIngredients', label: 'إنشاء مواد فعالة', description: 'إضافة مادة فعالة جديدة للكتالوج.', tab: 'ingredients' },
];

export function hasCapability(
  user: Pick<UserProfile, 'role' | 'pharmacyCapabilities'> | null | undefined,
  key: PharmacyCapabilityKey,
): boolean {
  return user?.role === 'pharmacy' && user.pharmacyCapabilities?.[key] === true;
}

/** المستودع المسموح للصيدلية برفع أسعاره، أو undefined إذا لا تملك الصلاحية. */
export function priceUploadSupplierOf(
  user: Pick<UserProfile, 'role' | 'pharmacyCapabilities' | 'priceUploadSupplierId'> | null | undefined,
): string | undefined {
  return hasCapability(user, 'uploadPrices') && user?.priceUploadSupplierId ? user.priceUploadSupplierId : undefined;
}

export function hasAnyCapability(user: Pick<UserProfile, 'role' | 'pharmacyCapabilities' | 'priceUploadSupplierId'> | null | undefined): boolean {
  return Boolean(priceUploadSupplierOf(user)) || hasCapability(user, 'createProducts') || hasCapability(user, 'createIngredients');
}
