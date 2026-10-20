import { auth, db, isFirebaseConfigured, collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, orderBy, limit } from '../firebase';
import { PharmacySuggestion, PlatformActivity, PlatformActivityType, PriceRecord } from '../types';

const KEYS = {
  suggestions: 'pharma_v18_suggestions',
  activity: 'pharma_v18_activity',
  presence: 'pharma_v18_presence',
  prices: 'pharma_db_prices',
};

function readLocal<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[]; } catch { return []; }
}
function writeLocal<T>(key: string, value: T[]) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

export async function getSuggestions(pharmacyId?: string, maxRecords = 50): Promise<PharmacySuggestion[]> {
  const cap = Math.max(1, Math.min(maxRecords, 100));
  if (isFirebaseConfigured) {
    try {
      const q = pharmacyId
        ? query(collection(db, 'suggestions'), where('pharmacyId', '==', pharmacyId), limit(cap))
        : query(collection(db, 'suggestions'), orderBy('createdAt', 'desc'), limit(cap));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PharmacySuggestion));
    } catch (error) { console.warn('v18 suggestions fallback:', error); }
  }
  const local = readLocal<PharmacySuggestion>(KEYS.suggestions);
  return (pharmacyId ? local.filter((s) => s.pharmacyId === pharmacyId) : local)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, cap);
}

export async function createSuggestion(input: Omit<PharmacySuggestion, 'id' | 'createdAt' | 'status'>): Promise<PharmacySuggestion> {
  const suggestion: PharmacySuggestion = {
    ...input,
    id: `suggestion_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'new',
  };
  if (isFirebaseConfigured) {
    try { await setDoc(doc(db, 'suggestions', suggestion.id), suggestion); } catch (error) { console.warn('v18 suggestion save fallback:', error); }
  }
  writeLocal(KEYS.suggestions, [suggestion, ...readLocal<PharmacySuggestion>(KEYS.suggestions)]);
  await recordActivity({
    type: 'suggestion_created',
    actorId: input.pharmacyId,
    actorName: input.pharmacyName,
    actorRole: 'pharmacy',
    message: `اقتراح جديد من ${input.pharmacyName}: ${input.subject}`,
    metadata: { suggestionId: suggestion.id },
  });
  return suggestion;
}

export async function updateSuggestionStatus(id: string, status: PharmacySuggestion['status'], adminReply?: string): Promise<void> {
  const patch = { status, ...(adminReply !== undefined ? { adminReply } : {}), reviewedAt: new Date().toISOString() };
  if (isFirebaseConfigured) {
    try { await updateDoc(doc(db, 'suggestions', id), patch); } catch (error) { console.warn('v18 suggestion update fallback:', error); }
  }
  writeLocal(KEYS.suggestions, readLocal<PharmacySuggestion>(KEYS.suggestions).map((s) => s.id === id ? { ...s, ...patch } : s));
}

const IMPORTANT_ACTIVITY_TYPES = new Set<PlatformActivityType>([
  'pharmacy_imported', 'user_access_changed', 'price_imported', 'price_import_failed',
  'price_visibility_changed', 'order_status_changed', 'representative_link_approved',
  'representative_link_rejected', 'representative_link_revoked', 'delivery_schedule_updated',
  'supplier_template_updated', 'change_approval_requested', 'change_approval_approved',
  'change_approval_rejected', 'change_approval_failed', 'backup_restored',
]);

export async function getPlatformActivity(maxRecords = 50): Promise<PlatformActivity[]> {
  const cap = Math.max(1, Math.min(maxRecords || 50, 200));
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(query(collection(db, 'platform_activity'), orderBy('createdAt', 'desc'), limit(cap)));
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as PlatformActivity))
        .filter((activity) => IMPORTANT_ACTIVITY_TYPES.has(activity.type));
    } catch (error) { console.warn('v18 activity fallback:', error); }
  }
  return readLocal<PlatformActivity>(KEYS.activity)
    .filter((activity) => IMPORTANT_ACTIVITY_TYPES.has(activity.type))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, cap);
}

export async function recordActivity(input: Omit<PlatformActivity, 'id' | 'createdAt'>): Promise<PlatformActivity> {
  const activity: PlatformActivity = { ...input, id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() };
  // أحداث الدخول والملف الشخصي والاقتراحات الروتينية لا تنشئ مستنداً إضافياً.
  if (!IMPORTANT_ACTIVITY_TYPES.has(activity.type)) return activity;
  if (isFirebaseConfigured) {
    try { await setDoc(doc(db, 'platform_activity', activity.id), activity); } catch (error) { console.warn('v18 activity save fallback:', error); }
  }
  writeLocal(KEYS.activity, [activity, ...readLocal<PlatformActivity>(KEYS.activity)].slice(0, 200));
  return activity;
}

export async function setPriceVisibility(supplierId: string, productIds: string[], hidden: boolean): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseConfigured) {
    try {
      await Promise.all(productIds.map((productId) => updateDoc(doc(db, 'prices', `${supplierId}_${productId}`), { hidden, visibilityUpdatedAt: now })));
    } catch (error) {
      console.error('v18 price visibility update failed:', error);
      throw error;
    }
  }
  const ids = new Set(productIds);
  const local = readLocal<PriceRecord>(KEYS.prices).map((p) => p.supplierId === supplierId && ids.has(p.productId) ? { ...p, hidden } : p);
  writeLocal(KEYS.prices, local);
  await recordActivity({
    type: 'price_visibility_changed',
    actorId: auth.currentUser?.uid,
    actorName: auth.currentUser?.displayName || auth.currentUser?.email || 'إدارة المنصة',
    actorRole: 'admin',
    message: `${hidden ? 'إخفاء' : 'إظهار'} عروض مورد لعدد ${productIds.length} من الأصناف`,
    metadata: { supplierId, productIds, hidden },
  });
}

export function filterVisiblePrices(prices: PriceRecord[]): PriceRecord[] {
  return prices.filter((price) => !price.hidden);
}

export function buildNormalizedTradeKey(name: string, strength = '', form = '', manufacturer = ''): string {
  return [name, strength, form, manufacturer].map((part) => part.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean).join('|');
}

export function deliveryRuleForSupplier(supplier: { deliveryDaysByArea?: Record<string, string[]>; deliveryCutoffByArea?: Record<string, string>; minimumOrderByArea?: Record<string, number>; minimumOrderAmount?: number }, area?: string | Array<string | undefined>) {
  const requestedAreas = (Array.isArray(area) ? area : [area]).filter((value): value is string => Boolean(value?.trim()));
  const schedules = supplier.deliveryDaysByArea || {};
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s_-]/g, '');
  let matchedKey: string | undefined;
  for (const requested of requestedAreas) {
    matchedKey = Object.keys(schedules).find((key) => normalize(key) === normalize(requested));
    if (matchedKey) break;
  }
  if (!matchedKey) matchedKey = Object.keys(schedules).find((key) => ['عام', 'كلالمناطق', 'جميعالمناطق'].includes(normalize(key)));
  return {
    area: matchedKey,
    days: matchedKey ? schedules[matchedKey] || [] : [],
    cutoffTime: matchedKey ? supplier.deliveryCutoffByArea?.[matchedKey] || '' : '',
    minimumOrderAmount: matchedKey ? supplier.minimumOrderByArea?.[matchedKey] ?? supplier.minimumOrderAmount ?? 0 : supplier.minimumOrderAmount ?? 0,
  };
}

export function deliveryDaysForSupplier(supplier: { deliveryDaysByArea?: Record<string, string[]>; deliveryCutoffByArea?: Record<string, string>; minimumOrderByArea?: Record<string, number>; minimumOrderAmount?: number; serviceAreas?: string[] }, area?: string | Array<string | undefined>): string[] {
  return deliveryRuleForSupplier(supplier, area).days;
}
