import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  db,
  isFirebaseConfigured,
} from '../firebase';
import { useAuthStore } from '../store/useAuthStore';

export interface SupplierOffer {
  id: string;
  supplierId: string;
  title: string;
  productName: string;
  description: string;
  startsAt: string;
  endsAt: string;
  quantityLimit?: number;
  status: 'active' | 'paused';
  createdAt: string;
  createdByUid: string;
  createdByName: string;
  updatedAt: string;
  updatedByUid: string;
  updatedByName: string;
}

const STORAGE_KEY = 'pharma_db_supplier_offers';
const OFFER_COLLECTION = 'supplier_offers';
const MAX_OFFERS = 200;

function localRows(): SupplierOffer[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as SupplierOffer[];
  } catch {
    return [];
  }
}

function ensureCanManage(supplierId: string): NonNullable<ReturnType<typeof useAuthStore.getState>['user']> {
  const actor = useAuthStore.getState().user;
  if (!actor) throw new Error('يلزم تسجيل الدخول لإدارة العروض.');
  if (actor.role === 'admin') return actor;
  if (actor.role !== 'representative' || actor.supplierId !== supplierId || !actor.representativePermissions?.managePromotions) {
    throw new Error('لا تملك صلاحية إدارة عروض هذا المستودع.');
  }
  return actor;
}

export async function listSupplierOffers(supplierId?: string): Promise<SupplierOffer[]> {
  const actor = useAuthStore.getState().user;
  if (!actor) throw new Error('يلزم تسجيل الدخول لعرض العروض.');
  if (actor.role === 'representative') {
    if (!actor.supplierId) return [];
    supplierId = actor.supplierId;
  } else if (actor.role !== 'admin') {
    throw new Error('هذه الصفحة مخصصة للإدارة ومندوبي المستودعات.');
  }

  if (isFirebaseConfigured) {
    const base = collection(db, OFFER_COLLECTION);
    const offersQuery = supplierId
      ? query(base, where('supplierId', '==', supplierId), limit(MAX_OFFERS))
      : query(base, orderBy('createdAt', 'desc'), limit(MAX_OFFERS));
    const snapshot = await getDocs(offersQuery);
    return snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as SupplierOffer))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return localRows()
    .filter((offer) => !supplierId || offer.supplierId === supplierId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_OFFERS);
}

export async function saveSupplierOffer(input: Omit<SupplierOffer, 'id' | 'createdAt' | 'createdByUid' | 'createdByName' | 'updatedAt' | 'updatedByUid' | 'updatedByName'> & { id?: string } & Partial<Pick<SupplierOffer, 'createdAt' | 'createdByUid' | 'createdByName' | 'updatedAt' | 'updatedByUid' | 'updatedByName'>>): Promise<SupplierOffer> {
  const actor = ensureCanManage(input.supplierId);
  const title = input.title.trim();
  const productName = input.productName.trim();
  if (!title || !productName) throw new Error('أدخل عنوان العرض واسم الصنف.');
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw new Error('تحقق من تاريخ البداية والنهاية؛ يجب أن تكون النهاية بعد البداية.');
  }
  if (input.quantityLimit !== undefined && (!Number.isInteger(input.quantityLimit) || input.quantityLimit < 1)) {
    throw new Error('الكمية المحدودة يجب أن تكون عددًا صحيحًا أكبر من صفر.');
  }

  const now = new Date().toISOString();
  const id = input.id || `offer_${Date.now()}_${actor.uid.slice(0, 8)}`;
  const existing = input.id ? localRows().find((offer) => offer.id === input.id) : undefined;
  const offer: SupplierOffer = {
    id,
    supplierId: input.supplierId,
    title,
    productName,
    description: input.description.trim(),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    ...(input.quantityLimit === undefined ? {} : { quantityLimit: input.quantityLimit }),
    status: input.status,
    createdAt: input.createdAt || existing?.createdAt || now,
    createdByUid: input.createdByUid || existing?.createdByUid || actor.uid,
    createdByName: input.createdByName || existing?.createdByName || actor.name || actor.email || 'مستخدم',
    updatedAt: now,
    updatedByUid: actor.uid,
    updatedByName: actor.name || actor.email || 'مستخدم',
  };

  if (isFirebaseConfigured) {
    const ref = doc(db, OFFER_COLLECTION, id);
    if (input.id) {
      const { id: _ignoredId, supplierId: _ignoredSupplier, createdAt: _ignoredCreatedAt, createdByUid: _ignoredCreator, createdByName: _ignoredCreatorName, ...editable } = offer;
      await setDoc(ref, editable, { merge: true });
    } else {
      await setDoc(ref, offer);
    }
  }

  const rows = localRows().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([offer, ...rows]));
  return offer;
}

export async function deleteSupplierOffer(id: string, supplierId: string): Promise<void> {
  ensureCanManage(supplierId);
  if (isFirebaseConfigured) await deleteDoc(doc(db, OFFER_COLLECTION, id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localRows().filter((offer) => offer.id !== id)));
}
