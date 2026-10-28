// src/services/dataStorage.ts
import {
  db,
  auth,
  isFirebaseConfigured,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  handleFirestoreError,
  OperationType,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter
} from '../firebase';
import {
  ActiveIngredient,
  Product,
  Supplier,
  PriceRecord,
  PriceHistory,
  ImportBatch,
  Order,
  OrderItem,
  OrderStatus,
  UserProfile,
  AppNotification,
  SystemSettings,
  RecurringOrderTemplate,
  ProductAlias,
  PharmacyFeatureKey,
  PharmacyFeatureOverrides,
  PharmacyCatalogPermissions,
} from '../types';
import { runTransaction } from 'firebase/firestore';
import {
  SEED_ACTIVE_INGREDIENTS,
  SEED_PRODUCTS,
  SEED_SUPPLIERS,
  SEED_PRICES
} from './seed';
import { setSystemCurrency, formatCurrency } from '../utils/formatPrice';
import { formatGregorianDate } from '../utils/formatDate';
import { useAuthStore } from '../store/useAuthStore';
import { filterVisiblePrices, recordActivity } from './v18Features';
import { createAliasIdentityKey, globalProductAliasDocumentId, normalizeAliasValue, productAliasDocumentId } from '../utils/productAliases';
import { duplicateMessage, detectProductDuplicates } from './productQuality';

const STORAGE_KEYS = {
  activeIngredients: 'pharma_db_active_ingredients',
  products: 'pharma_db_products',
  suppliers: 'pharma_db_suppliers',
  prices: 'pharma_db_prices',
  priceHistory: 'pharma_db_price_history',
  importBatches: 'pharma_db_import_batches',
  orders: 'pharma_db_orders',
  users: 'pharma_db_users',
  notifications: 'pharma_db_notifications',
  settings: 'pharma_db_settings',
};

// ======================= Memory Cache & In-Flight Dedup =======================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isFirestorePermissionDenied(error: unknown): boolean {
  const code = (error as any)?.code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

export function invalidateCache(keys?: string[]): void {
  if (!keys || keys.length === 0) {
    memoryCache.clear();
  } else {
    keys.forEach((k) => {
      for (const cacheKey of memoryCache.keys()) {
        const isCatalogSnapshot = cacheKey.startsWith('catalog_snapshot_');
        const matchesSnapshot = isCatalogSnapshot && (
          (k === 'products' && cacheKey.endsWith('_products')) ||
          (k === 'prices' && cacheKey.includes('_prices_'))
        );
        if (cacheKey === k || cacheKey.startsWith(`${k}_`) || matchesSnapshot) {
          memoryCache.delete(cacheKey);
        }
      }
    });
  }
}

async function fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      memoryCache.set(key, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

interface LiveCollection<T> {
  rows: Map<string, T>;
  initialized: boolean;
  loading?: Promise<T[]>;
  unsubscribe?: () => void;
}

const liveCollections = new Map<string, LiveCollection<any>>();
const pendingCollectionWrites = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCollectionPersist<T extends { id: string }>(collectionName: string, storageKey: string): void {
  const previous = pendingCollectionWrites.get(collectionName);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    const persistLatest = () => {
      const state = liveCollections.get(collectionName) as LiveCollection<T> | undefined;
      if (state?.initialized) setLocal(storageKey, [...state.rows.values()]);
      pendingCollectionWrites.delete(collectionName);
    };
    const requestIdle = typeof window !== 'undefined' ? (window as any).requestIdleCallback : undefined;
    if (typeof requestIdle === 'function') requestIdle(persistLatest, { timeout: 1500 });
    else persistLatest();
  }, 250);
  pendingCollectionWrites.set(collectionName, timer);
}

async function getLiveCollection<T extends { id: string }>(collectionName: string, storageKey: string): Promise<T[]> {
  if (!isFirebaseConfigured) return getLocal<T>(storageKey);
  let state = liveCollections.get(collectionName) as LiveCollection<T> | undefined;
  if (!state) {
    state = { rows: new Map<string, T>(), initialized: false };
    liveCollections.set(collectionName, state);
  }
  if (state.initialized) return [...state.rows.values()];
  if (state.loading) return state.loading;

  state.loading = new Promise<T[]>((resolve, reject) => {
    state!.unsubscribe = onSnapshot(collection(db, collectionName), (snapshot: any) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'removed') state!.rows.delete(change.doc.id);
        else state!.rows.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as T);
      }
      state!.initialized = true;
      const rows = [...state!.rows.values()];
      scheduleCollectionPersist<T>(collectionName, storageKey);
      memoryCache.set(collectionName, { data: rows, timestamp: Date.now() });
      resolve(rows);
    }, (cause: unknown) => {
      state!.unsubscribe?.();
      state!.unsubscribe = undefined;
      state!.loading = undefined;
      state!.initialized = false;
      state!.rows.clear();
      reject(cause);
    });
  });
  return state.loading;
}

function updateLiveCollection<T extends { id: string }>(collectionName: string, storageKey: string, item: T | null, id?: string): void {
  const state = liveCollections.get(collectionName) as LiveCollection<T> | undefined;
  if (!state?.initialized) return;
  if (item) state.rows.set(item.id, item);
  else if (id) state.rows.delete(id);
  const rows = [...state.rows.values()];
  scheduleCollectionPersist<T>(collectionName, storageKey);
  memoryCache.set(collectionName, { data: rows, timestamp: Date.now() });
}

function resolveSupplierScope(actor: UserProfile | null, requestedSupplierIds?: string[]): string[] | null {
  const requested = requestedSupplierIds?.length ? [...new Set(requestedSupplierIds)] : null;
  const actorScope = actor?.role === 'representative'
    ? [actor.supplierId || '__no_visible_supplier__']
    : actor?.role === 'pharmacy' && actor.allowedSuppliers?.length
      ? [...new Set([...actor.allowedSuppliers, ...(actor.pharmacyCatalogPermissions?.priceSupplierIds || [])])]
      : null;
  if (actorScope) return requested ? actorScope.filter((id) => requested.includes(id)) : actorScope;
  return requested;
}

// تهيئة البيانات المبدئية محلياً عند أول تشغيل
function initializeLocalStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.activeIngredients)) {
    const ings = SEED_ACTIVE_INGREDIENTS.map((i) => ({ ...i, createdAt: new Date().toISOString() }));
    localStorage.setItem(STORAGE_KEYS.activeIngredients, JSON.stringify(ings));
  }
  if (!localStorage.getItem(STORAGE_KEYS.products)) {
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(SEED_PRODUCTS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.suppliers)) {
    const sups = SEED_SUPPLIERS.map((s) => ({ ...s, createdAt: new Date().toISOString() }));
    localStorage.setItem(STORAGE_KEYS.suppliers, JSON.stringify(sups));
  }
  if (!localStorage.getItem(STORAGE_KEYS.prices)) {
    localStorage.setItem(STORAGE_KEYS.prices, JSON.stringify(SEED_PRICES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.priceHistory)) {
    localStorage.setItem(STORAGE_KEYS.priceHistory, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.importBatches)) {
    localStorage.setItem(STORAGE_KEYS.importBatches, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.orders)) {
    // طلبيات تجريبية أولية
    const initialOrders: Order[] = [
      {
        id: 'ord_101',
        pharmacyId: 'demo_pharmacy_uid',
        pharmacyName: 'صيدلية النور الحديثة',
        pharmacyAddress: 'الرياض - حي الملز',
        pharmacyPhone: '966501234567',
        supplierId: 'sup_1',
        supplierName: 'مستودع المتحدة للأدوية',
        items: [
          { productId: 'prod_1', name: 'Panadol Extra 500mg', qty: 10, price: 11.4 },
          { productId: 'prod_6', name: 'Augmentin 1g Tablets', qty: 5, price: 57.0 },
        ],
        total: 399.0,
        status: 'confirmed',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(initialOrders));
  }
  if (!localStorage.getItem(STORAGE_KEYS.users)) {
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.notifications)) {
    const initialNotifications: AppNotification[] = [
      {
        id: 'notif_welcome',
        userId: 'all',
        title: 'مرحباً بكم في منصة فارما لينك',
        message: 'يمكنكم مقارنة عروض أسعار مستودعات الأدوية المعتمدة واختيار العرض الأنسب وإرسال طلبياتكم مباشرة عبر واتساب.',
        type: 'admin_announcement',
        read: false,
        createdAt: new Date().toISOString(),
        metadata: { senderName: 'إدارة المنصة', priority: 'normal' }
      }
    ];
    localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(initialNotifications));
  }
}

// تنفيذ التهيئة
initializeLocalStorage();

// Helper functions for local storage operations
function getLocal<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
    return [];
  }
}

function setLocal<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.error(`Error writing ${key} to localStorage`, e);
  }
}

// ======================= Active Ingredients =======================
export async function getActiveIngredients(): Promise<ActiveIngredient[]> {
  return getLiveCollection<ActiveIngredient>('activeIngredients', STORAGE_KEYS.activeIngredients);
}

export async function saveActiveIngredient(item: Omit<ActiveIngredient, 'id'> & { id?: string }): Promise<ActiveIngredient> {
  const actor = useAuthStore.getState().user;
  const pharmacyCanCreate = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.createActiveIngredients === true && !item.id;
  if (!actor || (actor.role !== 'admin' && !pharmacyCanCreate)) throw new Error('لا تملك صلاحية إنشاء مادة فعالة.');
  invalidateCache(['activeIngredients']);
  const id = item.id || 'ing_' + Date.now();
  const newItem: ActiveIngredient = {
    ...item,
    id,
    createdAt: item.createdAt || new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'activeIngredients', id), newItem);
    } catch (e) {
      console.error('Firestore saveActiveIngredient failed:', e);
      throw new Error('تعذر حفظ المادة الفعالة في قاعدة البيانات.');
    }
  }

  const list = getLocal<ActiveIngredient>(STORAGE_KEYS.activeIngredients);
  const existingIdx = list.findIndex((i) => i.id === id);
  if (existingIdx > -1) {
    list[existingIdx] = newItem;
  } else {
    list.unshift(newItem);
  }
  setLocal(STORAGE_KEYS.activeIngredients, list);
  updateLiveCollection('activeIngredients', STORAGE_KEYS.activeIngredients, newItem);
  return newItem;
}

export async function saveActiveIngredientsBatch(
  items: Array<Omit<ActiveIngredient, 'id'> & { id?: string }>,
  chunkSize = 400,
): Promise<ActiveIngredient[]> {
  if (items.length === 0) return [];
  invalidateCache(['activeIngredients']);
  const saved = items.map((item, index): ActiveIngredient => ({
    ...item,
    id: item.id || `ing_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: item.createdAt || new Date().toISOString(),
  }));
  const safeChunkSize = Math.max(1, Math.min(450, Math.floor(chunkSize) || 400));
  if (isFirebaseConfigured) {
    try {
      for (let start = 0; start < saved.length; start += safeChunkSize) {
        const batch = writeBatch(db);
        saved.slice(start, start + safeChunkSize).forEach((ingredient) => {
          batch.set(doc(db, 'activeIngredients', ingredient.id), ingredient);
        });
        await batch.commit();
      }
    } catch (e) {
      console.error('Firestore saveActiveIngredientsBatch failed:', e);
      throw new Error('تعذر حفظ المواد الفعالة المستوردة في قاعدة البيانات.');
    }
  }
  const byId = new Map(getLocal<ActiveIngredient>(STORAGE_KEYS.activeIngredients).map((ingredient) => [ingredient.id, ingredient]));
  saved.forEach((ingredient) => byId.set(ingredient.id, ingredient));
  setLocal(STORAGE_KEYS.activeIngredients, [...saved, ...Array.from(byId.values()).filter((ingredient) => !saved.some((item) => item.id === ingredient.id))]);
  saved.forEach((ingredient) => updateLiveCollection('activeIngredients', STORAGE_KEYS.activeIngredients, ingredient));
  return saved;
}

export async function deleteActiveIngredients(ids: string[]): Promise<void> {
  invalidateCache(['activeIngredients']);
  if (isFirebaseConfigured) {
    try {
      const batch = writeBatch(db);
      ids.forEach((id) => batch.delete(doc(db, 'activeIngredients', id)));
      await batch.commit();
    } catch (e) {
      console.error('Firestore deleteActiveIngredients failed:', e);
      throw new Error('تعذر حذف المواد الفعالة من قاعدة البيانات.');
    }
  }

  const list = getLocal<ActiveIngredient>(STORAGE_KEYS.activeIngredients).filter(
    (item) => !ids.includes(item.id)
  );
  setLocal(STORAGE_KEYS.activeIngredients, list);
  ids.forEach((id) => updateLiveCollection<ActiveIngredient>('activeIngredients', STORAGE_KEYS.activeIngredients, null, id));
}

// ======================= Catalog Snapshots (v43) =======================
// نسخة عرض مجمعة لتقليل القراءات، مع بقاء prices المصدر الحي للتحقق النهائي.
const SNAPSHOT_CACHE_PREFIX = 'linkpharma_catalog_snapshot_';
const SNAPSHOT_CHUNK_TARGET = 180;

type CatalogSnapshotMeta = {
  version: string;
  updatedAt: string;
  productChunkIds: string[];
  priceChunkIdsBySupplier: Record<string, string[]>;
  supplierSnapshotUpdatedAt: Record<string, string>;
  productCount: number;
  priceCount: number;
  supplierCount: number;
  history?: Array<{ version: string; chunkIds: string[] }>;
};

function snapshotChunks<T>(rows: T[], target = SNAPSHOT_CHUNK_TARGET): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += target) chunks.push(rows.slice(i, i + target));
  return chunks;
}
function readSnapshotCache<T>(key: string): T | null {
  try { const raw = localStorage.getItem(`${SNAPSHOT_CACHE_PREFIX}${key}`); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
function clearSnapshotCache(keepVersion?: string, supplierId?: string): void {
  try {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(SNAPSHOT_CACHE_PREFIX));
    keys.forEach((key) => {
      const keep = keepVersion && key.includes(keepVersion) && (!supplierId || key.includes(`_${supplierId}`));
      if (!keep) localStorage.removeItem(key);
    });
  } catch { /* الكاش تحسين اختياري */ }
}
function writeSnapshotCache<T>(key: string, value: T): void {
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= 4_000_000) localStorage.setItem(`${SNAPSHOT_CACHE_PREFIX}${key}`, encoded);
  } catch { /* لا يمنع فشل الكاش تشغيل المنصة */ }
}

export async function getCatalogSnapshotMeta(): Promise<CatalogSnapshotMeta | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snapshot = await getDoc(doc(db, 'catalog_meta', 'current'));
    return snapshot.exists() ? snapshot.data() as CatalogSnapshotMeta : null;
  } catch (error) { console.warn('Catalog snapshot metadata unavailable:', error); return null; }
}

export async function getStaleCatalogSuppliers(): Promise<Supplier[]> {
  const [meta, suppliers] = await Promise.all([getCatalogSnapshotMeta(), getSuppliers()]);
  return suppliers.filter((supplier) => {
    if (!supplier.lastPriceUpdate) return false;
    if (!meta) return true;
    const snapshotTime = meta.supplierSnapshotUpdatedAt?.[supplier.id];
    return !snapshotTime || new Date(supplier.lastPriceUpdate).getTime() > new Date(snapshotTime).getTime();
  });
}

export async function getCatalogProductsSnapshot(): Promise<Product[] | null> {
  const meta = await getCatalogSnapshotMeta();
  if (!meta?.version || !meta.productChunkIds?.length) return null;
  const cacheKey = `${meta.version}_products`;
  const memoryKey = `catalog_snapshot_${cacheKey}`;
  const memoryEntry = memoryCache.get(memoryKey);
  if (memoryEntry && Date.now() - memoryEntry.timestamp < CACHE_TTL_MS) return memoryEntry.data as Product[];
  const cached = readSnapshotCache<Product[]>(cacheKey);
  if (cached) {
    memoryCache.set(memoryKey, { data: cached, timestamp: Date.now() });
    return cached;
  }
  try {
    const snapshots = await Promise.all(meta.productChunkIds.map((id) => getDoc(doc(db, 'catalog_snapshots', id))));
    const products = snapshots.flatMap((snapshot) => snapshot.exists() ? (snapshot.data().rows || []) as Product[] : []);
    writeSnapshotCache(cacheKey, products);
    memoryCache.set(memoryKey, { data: products, timestamp: Date.now() });
    return products;
  } catch (error) { console.warn('Catalog product snapshot unavailable:', error); return null; }
}

export async function getCatalogPricesSnapshot(supplierIds?: string[]): Promise<PriceRecord[] | null> {
  const meta = await getCatalogSnapshotMeta();
  if (!meta?.version) return null;
  const allSuppliers = await getSuppliers();
  const scopedSupplierIds = supplierIds?.length ? supplierIds : resolveSupplierScope(useAuthStore.getState().user);
  const allowed = scopedSupplierIds?.length ? new Set(scopedSupplierIds) : null;
  const staleIds = new Set(allSuppliers.filter((supplier) => {
    if (allowed && !allowed.has(supplier.id)) return false;
    if (!supplier.lastPriceUpdate) return false;
    const snapshotTime = meta.supplierSnapshotUpdatedAt?.[supplier.id];
    return !snapshotTime || new Date(supplier.lastPriceUpdate).getTime() > new Date(snapshotTime).getTime();
  }).map((supplier) => supplier.id));
  const scopeKey = [...(allowed || [])].sort().join(',') || 'all';
  const memoryKey = `catalog_snapshot_${meta.version}_prices_${scopeKey}_stale_${[...staleIds].sort().join(',')}`;
  const memoryEntry = memoryCache.get(memoryKey);
  if (memoryEntry && Date.now() - memoryEntry.timestamp < CACHE_TTL_MS) return memoryEntry.data as PriceRecord[];
  const freshIds = Object.entries(meta.priceChunkIdsBySupplier || {})
    .filter(([supplierId]) => (!allowed || allowed.has(supplierId)) && !staleIds.has(supplierId))
    .flatMap(([, chunkIds]) => chunkIds);
  const cacheKey = `${meta.version}_prices_${scopeKey}`;
  const cached = staleIds.size === 0 ? readSnapshotCache<PriceRecord[]>(cacheKey) : null;
  let snapshotPrices: PriceRecord[] = cached || [];
  if (!cached && freshIds.length) {
    try {
      const snapshots = await Promise.all(freshIds.map((id) => getDoc(doc(db, 'catalog_snapshots', id))));
      if (snapshots.some((snapshot) => !snapshot.exists())) return null;
      snapshotPrices = snapshots.flatMap((snapshot) => snapshot.exists() ? (snapshot.data().rows || []) as PriceRecord[] : []);
      snapshotPrices = filterVisiblePrices(snapshotPrices);
      if (staleIds.size === 0) writeSnapshotCache(cacheKey, snapshotPrices);
    } catch (error) { console.warn('Catalog price snapshot unavailable; falling back to live prices:', error); return null; }
  }
  const livePrices = staleIds.size ? await getPrices([...staleIds], false) : [];
  const result = [...snapshotPrices, ...livePrices.filter((price) => !snapshotPrices.some((row) => row.id === price.id))];
  memoryCache.set(memoryKey, { data: result, timestamp: Date.now() });
  return result;
}

async function writeSnapshotEntries(entries: Array<{ id: string; data: Record<string, any>; collection?: string }>): Promise<void> {
  const groups: typeof entries[] = [];
  for (let offset = 0; offset < entries.length; offset += 390) groups.push(entries.slice(offset, offset + 390));
  for (let i = 0; i < groups.length; i += 4) {
    await Promise.all(groups.slice(i, i + 4).map((group) => {
      const batch = writeBatch(db);
      group.forEach((entry) => batch.set(doc(db, entry.collection || 'catalog_snapshots', entry.id), entry.data));
      return batch.commit();
    }));
  }
}

export async function rebuildCatalogSnapshots(): Promise<{ version: string; products: number; prices: number; chunks: number }> {
  const actor = useAuthStore.getState().user;
  if (actor?.role !== 'admin') throw new Error('إعادة بناء نسخة الكتالوج متاحة للمدير فقط.');
  const [products, prices, suppliers, previousMeta] = await Promise.all([getProducts(), getPrices(undefined, false), getSuppliers(), getCatalogSnapshotMeta()]);
  if (!isFirebaseConfigured) return { version: 'local', products: products.length, prices: prices.length, chunks: 0 };
  const version = `v43_${Date.now()}`;
  const productParts = snapshotChunks(products);
  const pricePartsBySupplier = new Map<string, PriceRecord[][]>();
  filterVisiblePrices(prices).forEach((price) => {
    const parts = pricePartsBySupplier.get(price.supplierId) || [];
    let current = parts[parts.length - 1];
    if (!current || current.length >= SNAPSHOT_CHUNK_TARGET) { current = []; parts.push(current); }
    current.push(price); pricePartsBySupplier.set(price.supplierId, parts);
  });
  const productChunkIds = productParts.map((_, index) => `products_${version}_${index}`);
  const priceChunkIdsBySupplier: Record<string, string[]> = {};
  pricePartsBySupplier.forEach((parts, supplierId) => { priceChunkIdsBySupplier[supplierId] = parts.map((_, index) => `prices_${supplierId}_${version}_${index}`); });
  const updatedAt = new Date().toISOString();
  const supplierSnapshotUpdatedAt: Record<string, string> = {};
  suppliers.forEach((supplier) => { if (pricePartsBySupplier.has(supplier.id)) supplierSnapshotUpdatedAt[supplier.id] = updatedAt; });
  const chunkIds = [...productChunkIds, ...Object.values(priceChunkIdsBySupplier).flat()];
  const history = [{ version, chunkIds }, ...(previousMeta?.history || [])].slice(0, 3);
  const meta: CatalogSnapshotMeta = { version, updatedAt, productChunkIds, priceChunkIdsBySupplier, supplierSnapshotUpdatedAt, productCount: products.length, priceCount: filterVisiblePrices(prices).length, supplierCount: pricePartsBySupplier.size, history };
  const entries: Array<{ id: string; data: Record<string, any> }> = [];
  productParts.forEach((rows, index) => entries.push({ id: productChunkIds[index], data: { version, kind: 'products', rows, updatedAt } }));
  pricePartsBySupplier.forEach((parts, supplierId) => parts.forEach((rows, index) => entries.push({ id: priceChunkIdsBySupplier[supplierId][index], data: { version, kind: 'prices', supplierId, rows, updatedAt } })));
  await writeSnapshotEntries(entries);
  await setDoc(doc(db, 'catalog_meta', 'current'), meta);
  const oldChunkIds = (previousMeta?.history || []).slice(2).flatMap((item) => item.chunkIds || []);
  if (oldChunkIds.length) {
    for (let offset = 0; offset < oldChunkIds.length; offset += 390) {
      const batch = writeBatch(db);
      oldChunkIds.slice(offset, offset + 390).forEach((id) => batch.delete(doc(db, 'catalog_snapshots', id)));
      await batch.commit();
    }
  }
  clearSnapshotCache(version);
  return { version, products: products.length, prices: meta.priceCount, chunks: entries.length };
}

export async function rebuildSupplierSnapshot(supplierId: string): Promise<void> {
  const actor = useAuthStore.getState().user;
  if (actor?.role !== 'admin') throw new Error('إعادة بناء Snapshot المورد متاحة للمدير فقط.');
  const meta = await getCatalogSnapshotMeta();
  if (!meta || !supplierId || !isFirebaseConfigured) { await rebuildCatalogSnapshots(); return; }
  const prices = filterVisiblePrices(await getPrices([supplierId], false));
  const parts = snapshotChunks(prices);
  const updatedAt = new Date().toISOString();
  const ids = parts.map((_, index) => `prices_${supplierId}_${meta.version}_${index}`);
  const oldIds = meta.priceChunkIdsBySupplier?.[supplierId] || [];
  const entries = parts.map((rows, index) => ({ id: ids[index], data: { version: meta.version, kind: 'prices', supplierId, rows, updatedAt } }));
  await writeSnapshotEntries(entries);
  const nextMeta: CatalogSnapshotMeta = { ...meta, updatedAt, priceChunkIdsBySupplier: { ...meta.priceChunkIdsBySupplier, [supplierId]: ids }, supplierSnapshotUpdatedAt: { ...meta.supplierSnapshotUpdatedAt, [supplierId]: updatedAt }, priceCount: Math.max(0, meta.priceCount - oldIds.length * SNAPSHOT_CHUNK_TARGET + prices.length) };
  await setDoc(doc(db, 'catalog_meta', 'current'), nextMeta);
  const staleIds = oldIds.filter((id) => !ids.includes(id));
  if (staleIds.length) { const batch = writeBatch(db); staleIds.forEach((id) => batch.delete(doc(db, 'catalog_snapshots', id))); await batch.commit(); }
  clearSnapshotCache(meta.version, supplierId);
}

// ======================= Products =======================
export interface ProductsPage {
  items: Product[];
  cursor: any | null;
  hasMore: boolean;
}

// تحميل حقيقي على دفعات؛ لا نحمّل كامل الكتالوج عند فتح صفحة الأسعار.
export async function getProductsPage(pageSize = 24, cursor?: any | null): Promise<ProductsPage> {
  const safeSize = Math.min(Math.max(pageSize, 10), 50);
  const cursorKey = cursor && typeof cursor === 'object' ? cursor.id || 'cursor' : String(cursor ?? 'first');
  const cacheKey = `products_page_${safeSize}_${cursorKey}`;
  return fetchWithCache(cacheKey, async () => {
    if (isFirebaseConfigured) {
      try {
        const base = collection(db, 'products');
        const constraints: any[] = [orderBy('tradeName'), limit(safeSize + 1)];
        if (cursor) constraints.splice(1, 0, startAfter(cursor));
        const snap = await getDocs(query(base, ...constraints));
        const docs = snap.docs;
        const pageDocs = docs.slice(0, safeSize);
        return {
          items: pageDocs.map((d) => ({ id: d.id, ...d.data() } as Product)),
          cursor: pageDocs.length ? pageDocs[pageDocs.length - 1] : cursor || null,
          hasMore: docs.length > safeSize,
        };
      } catch (e) {
        console.warn('Firestore paged products unavailable; using cached fallback:', (e as any)?.code || 'unknown');
      }
    }
    // احتياطي: ترتيب ثابت بنفس ترتيب Firestore (tradeName ثم id) كي لا تتكرر الأصناف أو تتبعثر عند الدفعات التالية.
    const all = [...(await getProducts())].sort((a, b) => {
      const an = a.tradeName || '';
      const bn = b.tradeName || '';
      if (an !== bn) return an < bn ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    let offset = 0;
    if (typeof cursor === 'number') offset = cursor;
    else if (cursor && typeof cursor === 'object' && cursor.id) {
      const idx = all.findIndex((item) => item.id === cursor.id);
      offset = idx >= 0 ? idx + 1 : 0;
    }
    const items = all.slice(offset, offset + safeSize);
    return { items, cursor: offset + items.length, hasMore: offset + items.length < all.length };
  });
}

export async function getPricesForProductIds(
  productIds: string[],
  allowedSupplierIds?: string[],
  includeHidden = false
): Promise<PriceRecord[]> {
  if (!productIds.length) return [];
  const actor = useAuthStore.getState().user;
  const scopedSupplierIds = resolveSupplierScope(actor, allowedSupplierIds)?.sort() ?? null;
  if (scopedSupplierIds?.length === 0) return [];
  const stableProductIds = [...new Set(productIds)].sort();
  const scopeKey = scopedSupplierIds === null ? 'all' : scopedSupplierIds.join(',');
  const cacheKey = `prices_page_${actor?.uid || 'anonymous'}_${actor?.role || 'guest'}_${scopeKey}_${stableProductIds.join(',')}_${includeHidden ? 'hidden' : 'visible'}`;

  return fetchWithCache(cacheKey, async () => {
    if (isFirebaseConfigured) {
      try {
        const chunks: string[][] = [];
        for (let i = 0; i < stableProductIds.length; i += 10) chunks.push(stableProductIds.slice(i, i + 10));
        const snapshots = await Promise.all(chunks.flatMap((chunk) => scopedSupplierIds?.length
          ? scopedSupplierIds.map((supplierId) => getDocs(query(collection(db, 'prices'), where('productId', 'in', chunk), where('supplierId', '==', supplierId))))
          : [getDocs(query(collection(db, 'prices'), where('productId', 'in', chunk)))]));
        const allowed = scopedSupplierIds?.length ? new Set(scopedSupplierIds) : null;
        const rows = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceRecord)))
          .filter((row) => !allowed || allowed.has(row.supplierId));
        return includeHidden ? rows : filterVisiblePrices(rows);
      } catch (e) {
        if (isFirestorePermissionDenied(e)) throw e;
        console.warn('Firestore paged prices unavailable; using cached fallback:', (e as any)?.code || 'unknown');
      }
    }
    const allowed = scopedSupplierIds?.length ? new Set(scopedSupplierIds) : null;
    return getLocal<PriceRecord>(STORAGE_KEYS.prices)
      .filter((row) => stableProductIds.includes(row.productId) && (!allowed || allowed.has(row.supplierId)))
      .filter((row) => includeHidden || !row.hidden);
  });
}

export async function getProducts(): Promise<Product[]> {
  return getLiveCollection<Product>('products', STORAGE_KEYS.products);
}

export async function saveProduct(item: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
  const actor = useAuthStore.getState().user;
  const pharmacyCanCreate = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.createProducts === true && !item.id;
  if (!actor || (actor.role !== 'admin' && !pharmacyCanCreate)) throw new Error('لا تملك صلاحية إنشاء أو تعديل الأصناف.');
  if (actor.role === 'pharmacy' && (item.visibleToPharmacies !== undefined || item.compositionDisplay !== undefined || item.id)) throw new Error('يمكن للصيدلية إنشاء صنف جديد فقط؛ لا يمكن تعديل ظهوره أو سجل موجود.');
  invalidateCache(['products', 'prices']);
  const id = item.id || 'prod_' + Date.now();
  const newItem: Product = {
    ...item,
    id,
    createdAt: item.createdAt || new Date().toISOString(),
  };
  const duplicate = duplicateMessage(newItem, await getProducts());
  if (duplicate) throw new Error(duplicate);

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'products', id), newItem);
    } catch (e) {
      console.error('Firestore saveProduct failed:', e);
      throw new Error('تعذر حفظ الصنف في قاعدة البيانات.');
    }
  }

  const list = getLocal<Product>(STORAGE_KEYS.products);
  const existingIdx = list.findIndex((p) => p.id === id);
  if (existingIdx > -1) {
    list[existingIdx] = newItem;
  } else {
    list.unshift(newItem);
  }
  setLocal(STORAGE_KEYS.products, list);
  updateLiveCollection('products', STORAGE_KEYS.products, newItem);
  return newItem;
}

export async function saveProductsBatch(
  items: Array<Omit<Product, 'id'> & { id?: string }>,
  onChunkSaved?: (saved: Product[], startIndex: number, total: number) => void,
  chunkSize = 20,
): Promise<Product[]> {
  if (items.length === 0) return [];
  const actor = useAuthStore.getState().user;
  const pharmacyCanCreate = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.createProducts === true;
  if (!actor || (actor.role !== 'admin' && !pharmacyCanCreate)) throw new Error('لا تملك صلاحية إنشاء أصناف.');

  const products = items.map((item, index): Product => ({
    ...item,
    id: item.id || `prod_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: item.createdAt || new Date().toISOString(),
  }));
  const existing = await getProducts();
  if (actor?.role === 'pharmacy' && products.some((product) => existing.some((old) => old.id === product.id) || product.visibleToPharmacies !== undefined)) throw new Error('يمكن للصيدلية إنشاء أصناف جديدة فقط.');
  const duplicateGroups = detectProductDuplicates([...existing.filter((item) => !products.some((candidate) => candidate.id === item.id)), ...products]);
  const incomingIds = new Set(products.map((product) => product.id));
  const incomingDuplicate = duplicateGroups.find((group) => group.products.some((product) => incomingIds.has(product.id)));
  if (incomingDuplicate) throw new Error(incomingDuplicate.reason === 'barcode' ? `لا يمكن حفظ الدفعة: الباركود ${incomingDuplicate.products.find((product) => incomingIds.has(product.id))?.barcode || ''} مكرر.` : `لا يمكن حفظ الدفعة: هوية الصنف ${incomingDuplicate.label} مكررة.`);
  const safeChunkSize = Math.max(1, Math.min(100, Math.floor(chunkSize) || 20));

  for (let startIndex = 0; startIndex < products.length; startIndex += safeChunkSize) {
    const chunk = products.slice(startIndex, startIndex + safeChunkSize);
    if (isFirebaseConfigured) {
      const batch = writeBatch(db);
      chunk.forEach((product) => batch.set(doc(db, 'products', product.id), product));
      // Unlike saveProduct, this import path rejects on a server error instead of reporting a false success.
      await batch.commit();
    }

    const ids = new Set(chunk.map((product) => product.id));
    const existing = getLocal<Product>(STORAGE_KEYS.products).filter((product) => !ids.has(product.id));
    setLocal(STORAGE_KEYS.products, [...chunk, ...existing]);
    chunk.forEach((product) => updateLiveCollection('products', STORAGE_KEYS.products, product));
    invalidateCache(['products', 'prices']);
    onChunkSaved?.(chunk, startIndex, products.length);
  }

  return products;
}

export async function deleteProducts(ids: string[]): Promise<void> {
  invalidateCache(['products', 'prices']);
  if (isFirebaseConfigured) {
    try {
      const batch = writeBatch(db);
      ids.forEach((id) => batch.delete(doc(db, 'products', id)));
      await batch.commit();
    } catch (e) {
      console.error('Firestore deleteProducts failed:', e);
      throw new Error('تعذر حذف الأصناف من قاعدة البيانات.');
    }
  }

  const list = getLocal<Product>(STORAGE_KEYS.products).filter((p) => !ids.includes(p.id));
  setLocal(STORAGE_KEYS.products, list);
  ids.forEach((id) => updateLiveCollection<Product>('products', STORAGE_KEYS.products, null, id));
}

export async function updateProductsCategory(ids: string[], newCategory: string): Promise<void> {
  invalidateCache(['products']);
  if (isFirebaseConfigured) {
    try {
      const batch = writeBatch(db);
      ids.forEach((id) => batch.update(doc(db, 'products', id), { category: newCategory }));
      await batch.commit();
    } catch (e) {
      console.error('Firestore updateProductsCategory failed:', e);
      throw new Error('تعذر تعديل تصنيف الأصناف في قاعدة البيانات.');
    }
  }

  const list = getLocal<Product>(STORAGE_KEYS.products).map((p) => {
    if (ids.includes(p.id)) {
      return { ...p, category: newCategory };
    }
    return p;
  });
  setLocal(STORAGE_KEYS.products, list);
  list.filter((product) => ids.includes(product.id)).forEach((product) => updateLiveCollection('products', STORAGE_KEYS.products, product));
}

// ======================= Suppliers =======================
export async function getSuppliers(): Promise<Supplier[]> {
  return getLiveCollection<Supplier>('suppliers', STORAGE_KEYS.suppliers);
}

export async function getProductAliases(supplierId: string): Promise<ProductAlias[]> {
  const actor = useAuthStore.getState().user;
  const pharmacyCanManage = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.managePrices && actor.pharmacyCatalogPermissions.priceSupplierIds?.includes(supplierId);
  if (!actor || (actor.role !== 'admin' && !(actor.role === 'representative' && actor.supplierId === supplierId && actor.representativePermissions?.managePrices) && !pharmacyCanManage)) {
    throw new Error('ليس لديك صلاحية قراءة أسماء أصناف هذا المستودع.');
  }
  if (!supplierId) return [];
  const key = `productAliases_${actor.uid}_${supplierId}`;
  return fetchWithCache(key, async () => {
    if (isFirebaseConfigured) {
      const snapshot = await getDocs(query(collection(db, 'productAliases'), where('supplierId', '==', supplierId)));
      const aliases = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ProductAlias));
      try { localStorage.setItem(`pharma_db_${key}`, JSON.stringify(aliases)); } catch (_) {}
      return aliases;
    }
    try { return JSON.parse(localStorage.getItem(`pharma_db_${key}`) || '[]') as ProductAlias[]; } catch (_) { return []; }
  });
}

const GLOBAL_PRODUCT_ALIASES_CACHE_KEY = 'globalProductAliases_v1';

/** Platform-wide aliases. Any signed-in importer can read them; writes are admin-only. */
export async function getGlobalProductAliases(): Promise<ProductAlias[]> {
  if (!useAuthStore.getState().user) throw new Error('سجّل الدخول لتحميل قاموس أسماء الأصناف العام.');
  return fetchWithCache(GLOBAL_PRODUCT_ALIASES_CACHE_KEY, async () => {
    if (isFirebaseConfigured) {
      try {
        const snapshot = await getDocs(collection(db, 'globalProductAliases'));
        const aliases = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ProductAlias));
        try { localStorage.setItem(`pharma_db_${GLOBAL_PRODUCT_ALIASES_CACHE_KEY}`, JSON.stringify(aliases)); } catch (_) {}
        return aliases;
      } catch (error) {
        try {
          const cached = JSON.parse(localStorage.getItem(`pharma_db_${GLOBAL_PRODUCT_ALIASES_CACHE_KEY}`) || '[]') as ProductAlias[];
          if (cached.length) return cached;
        } catch (_) {}
        throw error;
      }
    }
    try { return JSON.parse(localStorage.getItem(`pharma_db_${GLOBAL_PRODUCT_ALIASES_CACHE_KEY}`) || '[]') as ProductAlias[]; }
    catch (_) { return []; }
  });
}

export async function saveGlobalProductAliasesBatch(
  items: ProductAliasBatchItem[],
  onProgress?: (done: number, total: number) => void,
  chunkSize = 200,
): Promise<ProductAliasBatchResult> {
  const actor = useAuthStore.getState().user;
  const repCanManage = actor?.role === 'representative' && actor.status === 'active' && actor.representativePermissions?.managePrices === true;
  const pharmacyCanManage = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.managePrices === true && (actor.pharmacyCatalogPermissions.priceSupplierIds?.length || 0) > 0;
  if (!actor || (actor.role !== 'admin' && !repCanManage && !pharmacyCanManage)) throw new Error('إدارة قاموس الأسماء العام متاحة لمدير المنصة أو لمن لديه صلاحية تحديث الأسعار.');
  if (actor.role !== 'admin') items = items.map((item) => ({ ...item, replace: false }));
  const result: ProductAliasBatchResult = { saved: 0, alreadyLinked: 0, conflicts: [], failed: 0 };
  if (!items.length) return result;
  const cacheKey = GLOBAL_PRODUCT_ALIASES_CACHE_KEY;
  let known: ProductAlias[] = [];
  try { known = await getGlobalProductAliases(); } catch {
    try { known = JSON.parse(localStorage.getItem(`pharma_db_${cacheKey}`) || '[]') as ProductAlias[]; } catch (_) { known = []; }
  }
  const knownByName = new Map(known.map((alias) => [alias.normalizedName, alias]));
  const pending: ProductAlias[] = [];
  const replacements: Array<{ old: ProductAlias; next: ProductAlias }> = [];
  const seen = new Map<string, string>();
  const now = new Date().toISOString();
  for (const item of items) {
    const rawName = item.rawName.trim();
    if (!item.productId || !rawName) { result.failed += 1; continue; }
    const normalizedName = normalizeAliasValue(rawName);
    if (!normalizedName) { result.failed += 1; continue; }
    const existing = knownByName.get(normalizedName);
    if (existing) {
      if (existing.productId === item.productId) result.alreadyLinked += 1;
      else if (item.replace && !seen.has(normalizedName)) {
        seen.set(normalizedName, item.productId);
        replacements.push({ old: existing, next: {
          id: globalProductAliasDocumentId(rawName), supplierId: '*', scope: 'global', productId: item.productId,
          rawName, normalizedName, identityKey: createAliasIdentityKey({ rawName }), createdAt: now,
          createdByUid: actor.uid, createdByName: actor.name || actor.email,
        } });
      }
      else result.conflicts.push({ rawName, reason: 'هذا الاسم العام مرتبط مسبقاً بصنف آخر؛ لا يمكن ربطه بصنفين.' });
      continue;
    }
    const seenProductId = seen.get(normalizedName);
    if (seenProductId) {
      if (seenProductId === item.productId) result.alreadyLinked += 1;
      else result.conflicts.push({ rawName, reason: 'الاسم نفسه مرتبط بصنفين مختلفين داخل الملف.' });
      continue;
    }
    seen.set(normalizedName, item.productId);
    pending.push({
      id: globalProductAliasDocumentId(rawName), supplierId: '*', scope: 'global', productId: item.productId,
      rawName, normalizedName, identityKey: createAliasIdentityKey({ rawName }), createdAt: now,
      createdByUid: actor.uid, createdByName: actor.name || actor.email,
    });
  }

  const safeChunk = Math.max(1, Math.min(400, Math.floor(chunkSize) || 200));
  const committed: ProductAlias[] = [];
  for (let start = 0; start < pending.length; start += safeChunk) {
    const chunk = pending.slice(start, start + safeChunk);
    try {
      if (isFirebaseConfigured) {
        const batch = writeBatch(db);
        chunk.forEach((alias) => batch.set(doc(db, 'globalProductAliases', alias.id), alias));
        await batch.commit();
      }
      committed.push(...chunk);
      result.saved += chunk.length;
    } catch (error) {
      console.warn('global alias batch failed', error);
      result.failed += chunk.length;
    }
    onProgress?.(Math.min(start + chunk.length, pending.length), pending.length);
  }
  // الاستبدال: حذف الربط القديم ثم إنشاء الجديد (قواعد Firestore تمنع تغيير productId بالتحديث)، مع استرجاع القديم عند الفشل.
  const replacedOld = new Set<string>();
  for (const { old, next } of replacements) {
    try {
      if (isFirebaseConfigured) {
        await deleteDoc(doc(db, 'globalProductAliases', old.id));
        try { await setDoc(doc(db, 'globalProductAliases', next.id), next); }
        catch (error) { await setDoc(doc(db, 'globalProductAliases', old.id), old).catch(() => undefined); throw error; }
      }
      replacedOld.add(old.id);
      committed.push(next);
      result.replaced = (result.replaced || 0) + 1;
    } catch (error) {
      console.warn('global alias replace failed', error);
      result.failed += 1;
    }
  }
  if (committed.length) {
    const rows = [...known.filter((alias) => !replacedOld.has(alias.id)), ...committed];
    memoryCache.set(cacheKey, { data: rows, timestamp: Date.now() });
    try { localStorage.setItem(`pharma_db_${cacheKey}`, JSON.stringify(rows)); } catch (_) {}
  }
  return result;
}

/** حذف اسم بديل عام (ربط خاطئ). للمدير فقط. */
export async function deleteGlobalProductAlias(alias: ProductAlias): Promise<void> {
  const actor = useAuthStore.getState().user;
  if (!actor || actor.role !== 'admin') throw new Error('إدارة قاموس الأسماء العام متاحة لمدير المنصة فقط.');
  if (isFirebaseConfigured) await deleteDoc(doc(db, 'globalProductAliases', alias.id));
  const rows = (await getGlobalProductAliases().catch(() => [] as ProductAlias[])).filter((item) => item.id !== alias.id);
  memoryCache.set(GLOBAL_PRODUCT_ALIASES_CACHE_KEY, { data: rows, timestamp: Date.now() });
  try { localStorage.setItem(`pharma_db_${GLOBAL_PRODUCT_ALIASES_CACHE_KEY}`, JSON.stringify(rows)); } catch (_) {}
}

/** تعديل ربط خاطئ: نقل الاسم البديل إلى صنف آخر. */
export async function changeGlobalProductAliasTarget(alias: ProductAlias, productId: string): Promise<ProductAliasBatchResult> {
  return saveGlobalProductAliasesBatch([{ productId, rawName: alias.rawName, replace: true }]);
}

export async function saveProductAlias(input: {
  supplierId: string; productId: string; rawName: string; manufacturer?: string; strength?: string;
  form?: string; packSize?: string; barcode?: string;
}): Promise<ProductAlias> {
  const actor = useAuthStore.getState().user;
  const pharmacyCanManage = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.managePrices && actor.pharmacyCatalogPermissions.priceSupplierIds?.includes(input.supplierId);
  if (!actor || (actor.role !== 'admin' && !(actor.role === 'representative' && actor.supplierId === input.supplierId && actor.representativePermissions?.managePrices) && !pharmacyCanManage)) {
    throw new Error('ليس لديك صلاحية حفظ أسماء بديلة لهذا المستودع.');
  }
  const rawName = input.rawName.trim();
  if (!input.supplierId || !input.productId || !rawName) throw new Error('اسم المورد والصنف والاسم البديل مطلوبة.');
  const id = productAliasDocumentId({ ...input, rawName });
  const now = new Date().toISOString();
  const alias: ProductAlias = {
    ...input, id, rawName, normalizedName: normalizeAliasValue(rawName),
    identityKey: createAliasIdentityKey({ ...input, rawName }),
    createdAt: now, createdByUid: actor.uid, createdByName: actor.name || actor.email,
  };
  const key = `productAliases_${actor.uid}_${input.supplierId}`;
  const cachedEntry = memoryCache.get(key);
  // لا نستدعِ getProductAliases هنا: قراءة قائمة الأسماء تستخدم query على مجموعة كاملة،
  // وقد تتعطل في بعض جلسات Firestore. افحص المستند المحدد بمعرّفه الحتمي بدلاً منها.
  let cached = (cachedEntry?.data as ProductAlias[] | undefined);
  if (!cached) {
    try { cached = JSON.parse(localStorage.getItem(`pharma_db_${key}`) || '[]') as ProductAlias[]; }
    catch { cached = []; }
  }
  let existing = cached.find((item) => item.id === id);
  if (existing && (existing.productId !== input.productId || existing.identityKey !== alias.identityKey)) {
    throw new Error('هذا الاسم البديل مرتبط مسبقاً بصنف آخر؛ راجع المطابقة يدوياً ولا يمكن استبداله تلقائياً.');
  }
  if (isFirebaseConfigured) {
    const aliasRef = doc(db, 'productAliases', id);
    const storedSnapshot = await getDoc(aliasRef);
    if (storedSnapshot.exists()) {
      const stored = { id: storedSnapshot.id, ...storedSnapshot.data() } as ProductAlias;
      if (stored.productId !== input.productId || stored.identityKey !== alias.identityKey) {
        throw new Error('هذا الاسم البديل مرتبط مسبقاً بصنف آخر؛ راجع المطابقة يدوياً ولا يمكن استبداله تلقائياً.');
      }
      existing = stored;
      if (!cached.some((item) => item.id === stored.id)) cached = [...cached, stored];
    } else {
      await setDoc(aliasRef, alias);
    }
  }
  const rows = existing ? cached.map((item) => item.id === id ? existing! : item) : [...cached, alias];
  memoryCache.set(key, { data: rows, timestamp: Date.now() });
  try { localStorage.setItem(`pharma_db_${key}`, JSON.stringify(rows)); } catch (_) {}
  return alias;
}

export interface ProductAliasBatchItem {
  productId: string;
  rawName: string;
  /** القاموس العام فقط: استبدال ربط قديم بصنف آخر (افتراضياً يُتجاهل التعارض). */
  replace?: boolean;
  manufacturer?: string;
  strength?: string;
  form?: string;
  packSize?: string;
  barcode?: string;
}

export interface ProductAliasBatchResult {
  saved: number;
  alreadyLinked: number;
  conflicts: Array<{ rawName: string; reason: string }>;
  failed: number;
  replaced?: number;
}

/**
 * v57: حفظ مئات الأسماء البديلة دفعة واحدة (500 عملية كتابة كحد أقصى لكل دفعة Firestore؛ نستخدم 200).
 * لا يستبدل ربطاً موجوداً بصنف آخر: التعارض يُبلَّغ ولا يُحفظ.
 */
export async function saveProductAliasesBatch(
  supplierId: string,
  items: ProductAliasBatchItem[],
  onProgress?: (done: number, total: number) => void,
  chunkSize = 200,
): Promise<ProductAliasBatchResult> {
  const actor = useAuthStore.getState().user;
  const pharmacyCanManage = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.managePrices && actor.pharmacyCatalogPermissions.priceSupplierIds?.includes(supplierId);
  if (!actor || (actor.role !== 'admin' && !(actor.role === 'representative' && actor.supplierId === supplierId && actor.representativePermissions?.managePrices) && !pharmacyCanManage)) {
    throw new Error('ليس لديك صلاحية حفظ أسماء بديلة لهذا المستودع.');
  }
  if (!supplierId) throw new Error('اختر المورد أولاً.');
  const result: ProductAliasBatchResult = { saved: 0, alreadyLinked: 0, conflicts: [], failed: 0 };
  if (!items.length) return result;

  const cacheKey = `productAliases_${actor.uid}_${supplierId}`;
  let known: ProductAlias[] = [];
  try { known = await getProductAliases(supplierId); } catch {
    try { known = JSON.parse(localStorage.getItem(`pharma_db_${cacheKey}`) || '[]') as ProductAlias[]; } catch { known = []; }
  }
  const knownById = new Map(known.map((alias) => [alias.id, alias]));
  const now = new Date().toISOString();
  const pending: ProductAlias[] = [];
  const seen = new Map<string, string>();
  for (const item of items) {
    const rawName = item.rawName.trim();
    if (!item.productId || !rawName) { result.failed += 1; continue; }
    const input = { supplierId, productId: item.productId, rawName, manufacturer: item.manufacturer, strength: item.strength, form: item.form, packSize: item.packSize, barcode: item.barcode };
    const id = productAliasDocumentId(input);
    const identityKey = createAliasIdentityKey(input);
    const existing = knownById.get(id);
    if (existing) {
      if (existing.productId === item.productId) result.alreadyLinked += 1;
      else result.conflicts.push({ rawName, reason: 'الاسم مرتبط مسبقاً بصنف آخر' });
      continue;
    }
    const duplicateProductId = seen.get(id);
    if (duplicateProductId) {
      if (duplicateProductId === item.productId) result.alreadyLinked += 1;
      else result.conflicts.push({ rawName, reason: 'الاسم نفسه مربوط بصنفين مختلفين داخل ملف الرفع' });
      continue;
    }
    seen.set(id, item.productId);
    const alias: ProductAlias = {
      id, supplierId, productId: item.productId, rawName, normalizedName: normalizeAliasValue(rawName), identityKey,
      createdAt: now, createdByUid: actor.uid, createdByName: actor.name || actor.email,
    };
    for (const field of ['manufacturer', 'strength', 'form', 'packSize', 'barcode'] as const) {
      if (item[field]) (alias as any)[field] = item[field];
    }
    pending.push(alias);
  }

  const safeChunk = Math.max(1, Math.min(400, Math.floor(chunkSize) || 200));
  const committed: ProductAlias[] = [];
  for (let start = 0; start < pending.length; start += safeChunk) {
    const chunk = pending.slice(start, start + safeChunk);
    try {
      if (isFirebaseConfigured) {
        const batch = writeBatch(db);
        chunk.forEach((alias) => batch.set(doc(db, 'productAliases', alias.id), alias));
        await batch.commit();
      }
      committed.push(...chunk);
      result.saved += chunk.length;
    } catch (error) {
      console.warn('alias batch failed', error);
      result.failed += chunk.length;
    }
    onProgress?.(Math.min(start + chunk.length, pending.length), pending.length);
  }

  if (committed.length) {
    const rows = [...known, ...committed];
    memoryCache.set(cacheKey, { data: rows, timestamp: Date.now() });
    try { localStorage.setItem(`pharma_db_${cacheKey}`, JSON.stringify(rows)); } catch (_) {}
  }
  return result;
}

/** فك ربط اسم بديل محفوظ (للإدارة فقط؛ قواعد Firestore تسمح بالحذف للأدمن فقط). */
export async function deleteProductAlias(supplierId: string, aliasId: string): Promise<void> {
  const actor = useAuthStore.getState().user;
  if (!actor || actor.role !== 'admin') throw new Error('فك ربط الاسم البديل متاح لمدير المنصة فقط.');
  if (!supplierId || !aliasId) throw new Error('بيانات الاسم البديل ناقصة.');
  if (isFirebaseConfigured) await deleteDoc(doc(db, 'productAliases', aliasId));
  const key = `productAliases_${actor.uid}_${supplierId}`;
  let rows = (memoryCache.get(key)?.data as ProductAlias[] | undefined);
  if (!rows) {
    try { rows = JSON.parse(localStorage.getItem(`pharma_db_${key}`) || '[]') as ProductAlias[]; } catch { rows = []; }
  }
  const next = rows.filter((item) => item.id !== aliasId);
  memoryCache.set(key, { data: next, timestamp: Date.now() });
  try { localStorage.setItem(`pharma_db_${key}`, JSON.stringify(next)); } catch (_) {}
}

export async function saveSupplier(item: Omit<Supplier, 'id'> & { id?: string }): Promise<Supplier> {
  invalidateCache(['suppliers', 'prices']);
  const id = item.id || 'sup_' + Date.now();
  const newItem: Supplier = {
    ...item,
    id,
    createdAt: item.createdAt || new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'suppliers', id), newItem);
    } catch (e) {
      console.error('Firestore saveSupplier failed:', e);
      throw new Error('تعذر حفظ بيانات المستودع في قاعدة البيانات.');
    }
  }

  const list = getLocal<Supplier>(STORAGE_KEYS.suppliers);
  const existingIdx = list.findIndex((s) => s.id === id);
  if (existingIdx > -1) {
    list[existingIdx] = newItem;
  } else {
    list.unshift(newItem);
  }
  setLocal(STORAGE_KEYS.suppliers, list);
  updateLiveCollection('suppliers', STORAGE_KEYS.suppliers, newItem);
  return newItem;
}

export async function deleteSupplier(id: string): Promise<void> {
  invalidateCache(['suppliers', 'prices']);
  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (e) {
      console.error('Firestore deleteSupplier failed:', e);
      throw new Error('تعذر حذف المستودع من قاعدة البيانات.');
    }
  }

  const list = getLocal<Supplier>(STORAGE_KEYS.suppliers).filter((s) => s.id !== id);
  setLocal(STORAGE_KEYS.suppliers, list);
  updateLiveCollection<Supplier>('suppliers', STORAGE_KEYS.suppliers, null, id);
}

/** جلب أسعار الطلبية مباشرة من Firebase لحظة الإرسال، بلا الاعتماد على كاش السلة. */
export async function getVerifiedOrderItems(supplierId: string, items: OrderItem[]): Promise<OrderItem[]> {
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean)));
  if (!supplierId || !productIds.length) throw new Error('لا توجد أصناف صالحة للتحقق من أسعارها.');
  let records: PriceRecord[];
  if (isFirebaseConfigured) {
    try {
      const snapshot = await getDocs(query(collection(db, 'prices'), where('supplierId', '==', supplierId)));
      records = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as PriceRecord));
    } catch (error) {
      console.error('Fresh Firebase price verification failed:', error);
      throw new Error('تعذر التحقق من الأسعار الحالية من Firebase؛ لم يتم إرسال الطلبية.');
    }
  } else {
    records = getLocal<PriceRecord>(STORAGE_KEYS.prices).filter((row) => row.supplierId === supplierId);
  }
  const byProduct = new Map(records.filter((row) => productIds.includes(row.productId) && row.available !== false && row.hidden !== true).map((row) => [row.productId, row]));
  if (productIds.some((productId) => !byProduct.has(productId))) throw new Error('تغيرت أسعار بعض الأصناف أو لم تعد متوفرة؛ حدّث السلة ثم أعد المحاولة.');
  return items.map((item) => {
    const current = byProduct.get(item.productId)!;
    return { ...item, price: current.price, ...(current.bonus ? { bonus: current.bonus } : {}) };
  });
}

// ======================= Prices & Import Batches =======================
export async function getPrices(allowedSupplierIds?: string[], includeHidden = false): Promise<PriceRecord[]> {
  const actor = useAuthStore.getState().user;
  const effectiveSupplierIds = resolveSupplierScope(actor, allowedSupplierIds)?.sort() ?? null;
  if (effectiveSupplierIds?.length === 0) return [];
  const scopeKey = effectiveSupplierIds === null ? 'all' : effectiveSupplierIds.join(',');
  const cacheKey = `prices_${actor?.uid || 'anonymous'}_${actor?.role || 'guest'}_${scopeKey}${includeHidden ? '_with_hidden' : ''}`;

  return fetchWithCache(cacheKey, async () => {
    if (isFirebaseConfigured) {
      try {
        if (effectiveSupplierIds?.length) {
          // تقسيم الموردين لدفعات 10 كحد أقصى لتوافق استعلامات Firestore 'in'
          const chunks: string[][] = [];
          for (let i = 0; i < effectiveSupplierIds.length; i += 10) {
            chunks.push(effectiveSupplierIds.slice(i, i + 10));
          }

          const queries = chunks.map((chunk) =>
            getDocs(query(collection(db, 'prices'), where('supplierId', 'in', chunk)))
          );

          const snapshots = await Promise.all(queries);
          const results: PriceRecord[] = [];
          snapshots.forEach((snap) => {
            snap.docs.forEach((d) => {
              results.push({ id: d.id, ...d.data() } as PriceRecord);
            });
          });
          return includeHidden ? results : filterVisiblePrices(results);
        }

        const snap = await getDocs(collection(db, 'prices'));
        const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceRecord));
        return includeHidden ? records : filterVisiblePrices(records);
      } catch (e) {
        if (isFirestorePermissionDenied(e)) throw e;
        console.warn('Firestore fallback to local for prices:', e);
      }
    }

    const allLocal = getLocal<PriceRecord>(STORAGE_KEYS.prices);
    if (effectiveSupplierIds?.length) {
      const allowedSet = new Set(effectiveSupplierIds);
      const scoped = allLocal.filter((p) => allowedSet.has(p.supplierId));
      return includeHidden ? scoped : filterVisiblePrices(scoped);
    }
    return includeHidden ? allLocal : filterVisiblePrices(allLocal);
  });
}

export async function commitImportBatch(params: {
  supplierId: string;
  fileName: string;
  createdBy: string;
  createdByUid?: string;
  priceRecords: {
    productId: string;
    price: number;
    publicPrice?: number;
    bonus?: string;
    available?: boolean;
    expiry?: string;
  }[];
  onProgress?: (completed: number, total: number) => void;
}): Promise<{ batchId: string; updatedCount: number; newCount: number }> {
  const actor = useAuthStore.getState().user;
  const pharmacyCanManage = actor?.role === 'pharmacy' && actor.status === 'active' && actor.pharmacyCatalogPermissions?.managePrices === true && actor.pharmacyCatalogPermissions.priceSupplierIds?.includes(params.supplierId);
  if (!actor || (actor.role !== 'admin' && actor.role !== 'representative' && !pharmacyCanManage)) throw new Error('لا تملك صلاحية اعتماد الأسعار.');
  if (actor.role === 'representative' && (actor.supplierId !== params.supplierId || !actor.representativePermissions?.managePrices)) {
    throw new Error('هذا الحساب غير مخول برفع أسعار هذا المستودع.');
  }
  if (actor.role === 'pharmacy' && !pharmacyCanManage) throw new Error('هذا الحساب غير مخول برفع أسعار هذا المستودع.');
  if (!params.supplierId) throw new Error('لم يتم تحديد المستودع.');
  const hasPromotions = params.priceRecords.some((record) => Boolean(record.bonus?.trim()));
  if (actor.role === 'representative' && hasPromotions && !actor.representativePermissions?.managePromotions) {
    throw new Error('لم يمنحك المدير صلاحية تعديل العروض/البونص.');
  }

  const { supplierId, fileName, createdBy, priceRecords } = params;
  const actorName = await resolveActorDisplayName(actor, createdBy);
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const deduped = new Map<string, typeof priceRecords[number]>();
  for (const rec of priceRecords) {
    if (!rec.productId || !Number.isFinite(rec.price) || rec.price <= 0) continue;
    deduped.set(rec.productId, rec);
  }
  const uniquePriceRecords = [...deduped.values()];
  if (uniquePriceRecords.length === 0) throw new Error('لا توجد سجلات أسعار صالحة للاعتماد.');

  let existingRows: PriceRecord[] = [];
  if (isFirebaseConfigured) {
    try {
      if (uniquePriceRecords.length > 60) {
        const snap = await getDocs(query(collection(db, 'prices'), where('supplierId', '==', supplierId)));
        existingRows = snap.docs.map((item) => ({ id: item.id, ...item.data() } as PriceRecord));
      } else {
        const productIds = uniquePriceRecords.map((record) => record.productId);
        const productIdChunks: string[][] = [];
        for (let index = 0; index < productIds.length; index += 30) productIdChunks.push(productIds.slice(index, index + 30));
        const snapshots = await Promise.all(productIdChunks.map((chunk) => getDocs(query(
          collection(db, 'prices'),
          where('supplierId', '==', supplierId),
          where('productId', 'in', chunk)
        ))));
        existingRows = snapshots.flatMap((snap) => snap.docs.map((item) => ({ id: item.id, ...item.data() } as PriceRecord)));
      }
    } catch (error) {
      console.error('Could not read current supplier prices before import:', error);
      throw new Error('تعذر قراءة الأسعار الحالية من Firestore؛ أوقفنا الاستيراد حتى لا نكتب سجلًا ناقصًا.');
    }
  } else {
    existingRows = getLocal<PriceRecord>(STORAGE_KEYS.prices).filter((row) => row.supplierId === supplierId);
  }

  const currentByProduct = new Map(existingRows.map((row) => [row.productId, row]));
  const updatedPrices: PriceRecord[] = [];
  const historyRecords: PriceHistory[] = [];
  let updatedCount = 0;
  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  for (const rec of uniquePriceRecords) {
    const previous = currentByProduct.get(rec.productId);
    const next: PriceRecord = {
      id: `${supplierId}_${rec.productId}`,
      productId: rec.productId,
      supplierId,
      price: rec.price,
      publicPrice: rec.publicPrice ?? previous?.publicPrice,
      available: rec.available ?? previous?.available ?? true,
      expiry: rec.expiry ?? previous?.expiry,
      bonus: (actor.role === 'representative' && !actor.representativePermissions?.managePromotions) || actor.role === 'pharmacy'
        ? previous?.bonus
        : (rec.bonus !== undefined ? rec.bonus : previous?.bonus),
      updatedAt: now,
      hidden: previous?.hidden,
    };
    updatedPrices.push(next);
    if (previous) updatedCount++; else newCount++;
    const sameValue = previous && previous.price === next.price && (previous.publicPrice ?? null) === (next.publicPrice ?? null)
      && previous.available === next.available && (previous.expiry ?? null) === (next.expiry ?? null)
      && (previous.bonus ?? null) === (next.bonus ?? null) && (previous.hidden ?? false) === (next.hidden ?? false);
    if (sameValue) unchangedCount++; else changedCount++;
    const snapshot = (row: PriceRecord): Pick<PriceRecord, 'price' | 'publicPrice' | 'available' | 'expiry' | 'bonus' | 'hidden' | 'updatedAt'> => ({
      price: row.price, available: row.available, hidden: row.hidden ?? false, updatedAt: row.updatedAt,
      ...(row.publicPrice === undefined ? {} : { publicPrice: row.publicPrice }),
      ...(row.expiry === undefined ? {} : { expiry: row.expiry }),
      ...(row.bonus === undefined ? {} : { bonus: row.bonus }),
    });
    const historyRecord: PriceHistory = {
      id: `hist_${batchId}_${rec.productId}`,
      productId: rec.productId,
      supplierId,
      price: previous?.price ?? next.price,
      importedAt: now,
      importBatchId: batchId,
      changeType: previous ? 'updated' : 'created',
      previous: previous ? snapshot(previous) : null,
      next: snapshot(next),
      actorUid: actor.uid,
      actorName,
    };
    if (previous?.publicPrice !== undefined) historyRecord.publicPrice = previous.publicPrice;
    if (previous?.available !== undefined) historyRecord.available = previous.available;
    if (previous?.bonus !== undefined) historyRecord.bonus = previous.bonus;
    historyRecords.push(historyRecord);
  }

  let supplierName = getLocal<Supplier>(STORAGE_KEYS.suppliers).find((item) => item.id === supplierId)?.name || supplierId;
  if (isFirebaseConfigured) {
    const supplierSnapshot = await getDoc(doc(db, 'suppliers', supplierId));
    if (!supplierSnapshot.exists()) throw new Error('المستودع المرتبط غير موجود في Firestore.');
    supplierName = supplierSnapshot.data().name || supplierName;
  }
  const importBatch: ImportBatch = {
    id: batchId,
    supplierId,
    supplierName,
    fileName,
    rowsCount: updatedPrices.length,
    createdBy: actorName,
    createdByUid: actor.uid,
    createdAt: now,
    importStatus: 'in_progress',
    writtenRowsCount: 0,
    progressUpdatedAt: now,
    reviewStatus: 'not_required',
    requiresReview: false,
    changedCount,
    unchangedCount,
  };
  const activityId = `activity_price_${batchId}`;
  const activity = {
    id: activityId,
    type: 'price_imported',
    actorId: actor.uid,
    actorName,
    actorRole: actor.role,
    message: `استيراد ${updatedPrices.length} سعرًا/عرضًا للمستودع ${importBatch.supplierName || supplierId} بواسطة ${actorName}`,
    createdAt: now,
    metadata: { supplierId, batchId, fileName, rowsCount: updatedPrices.length, updatedCount, newCount, changedCount, unchangedCount },
  };

  if (isFirebaseConfigured) {
    // Each price write verifies its product in Firestore rules (access-call limit 20 per batch),
    // so batches stay at 10 prices but are committed in parallel.
    const CHUNK_SIZE = 10;
    const CONCURRENCY = 12;
    const total = updatedPrices.length;
    const batchRef = doc(db, 'importBatches', batchId);
    await setDoc(batchRef, { ...importBatch, importStatus: 'in_progress', writtenRowsCount: 0, progressUpdatedAt: new Date().toISOString() });
    let nextOffset = 0;
    let written = 0;
    let failure: unknown = null;
    let lastProgressWrite = 0;
    let progressChain: Promise<unknown> = Promise.resolve();
    const worker = async () => {
      while (!failure) {
        const offset = nextOffset;
        if (offset >= total) return;
        nextOffset += CHUNK_SIZE;
        const chunkPrices = updatedPrices.slice(offset, offset + CHUNK_SIZE);
        const chunkHistory = historyRecords.slice(offset, offset + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunkPrices.forEach((price) => {
          const priceData: Record<string, any> = {
            productId: price.productId,
            supplierId,
            price: price.price,
            publicPrice: price.publicPrice ?? null,
            available: price.available,
            expiry: price.expiry ?? null,
            hidden: price.hidden ?? false,
            updatedAt: now,
          };
          if (actor.role === 'admin' || (actor.role === 'representative' && actor.representativePermissions?.managePromotions)) priceData.bonus = price.bonus ?? null;
          batch.set(doc(db, 'prices', `${supplierId}_${price.productId}`), priceData, { merge: true });
        });
        chunkHistory.forEach((history) => batch.set(doc(db, 'priceHistory', history.id), history));
        try {
          await batch.commit();
        } catch (error) {
          failure = error;
          return;
        }
        written += chunkPrices.length;
        params.onProgress?.(Math.min(written, total), total);
        const tick = Date.now();
        if (tick - lastProgressWrite > 3000 && written < total) {
          lastProgressWrite = tick;
          const snapshotWritten = written;
          progressChain = progressChain.then(() => updateDoc(batchRef, { importStatus: 'in_progress', writtenRowsCount: snapshotWritten, progressUpdatedAt: new Date().toISOString() })).catch(() => undefined);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.ceil(total / CHUNK_SIZE)) }, worker));
    await progressChain;
    if (failure) {
      invalidateCache(['prices', 'priceHistory', 'importBatches', 'suppliers']);
      try {
        await updateDoc(batchRef, { importStatus: 'interrupted', writtenRowsCount: Math.min(written, total), progressUpdatedAt: new Date().toISOString() });
      } catch (statusError) {
        console.warn('Could not mark interrupted import batch:', statusError);
      }
      console.error('Firestore import chunk failed:', failure);
      throw new Error('فشل حفظ جزء من الاستيراد. راجع سجل الدفعات؛ إذا ظهرت كغير مكتملة فتراجع عنها قبل إعادة الرفع.');
    }
    try {
      const finalBatch = writeBatch(db);
      finalBatch.update(batchRef, { importStatus: 'completed', writtenRowsCount: total, progressUpdatedAt: new Date().toISOString() });
      finalBatch.set(doc(db, 'platform_activity', activityId), activity);
      finalBatch.update(doc(db, 'suppliers', supplierId), {
        lastPriceUpdate: now,
        lastPriceUpdatedByUid: actor.uid,
        lastPriceUpdatedByName: actorName,
      });
      await finalBatch.commit();
    } catch (error) {
      invalidateCache(['prices', 'priceHistory', 'importBatches', 'suppliers']);
      console.error('Firestore import finalize failed:', error);
      throw new Error('تم حفظ الأسعار لكن تعذر إنهاء سجل الدفعة. أعد المحاولة أو راجع سجل الدفعات.');
    }
    params.onProgress?.(total, total);
  }

  const localPrices = getLocal<PriceRecord>(STORAGE_KEYS.prices);
  const changedKeys = new Set(updatedPrices.map((row) => `${row.supplierId}_${row.productId}`));
  setLocal(STORAGE_KEYS.prices, [...localPrices.filter((row) => !changedKeys.has(`${row.supplierId}_${row.productId}`)), ...updatedPrices]);
  if (!isFirebaseConfigured) setLocal(STORAGE_KEYS.priceHistory, [...getLocal<PriceHistory>(STORAGE_KEYS.priceHistory), ...historyRecords]);
  const localBatches = getLocal<ImportBatch>(STORAGE_KEYS.importBatches);
  const completedImportBatch: ImportBatch = {
    ...importBatch,
    importStatus: 'completed',
    writtenRowsCount: updatedPrices.length,
    progressUpdatedAt: now,
    publishedAt: now,
  };
  setLocal(STORAGE_KEYS.importBatches, [completedImportBatch, ...localBatches.filter((row) => row.id !== batchId)]);
  const localSuppliers = getLocal<Supplier>(STORAGE_KEYS.suppliers);
  setLocal(STORAGE_KEYS.suppliers, localSuppliers.map((supplier) => supplier.id === supplierId ? { ...supplier, lastPriceUpdate: now } : supplier));
  invalidateCache(['prices', 'priceHistory', 'importBatches', 'suppliers']);
  if (!isFirebaseConfigured) params.onProgress?.(updatedPrices.length, updatedPrices.length);
  // العمل اللاحق لا يعطّل الواجهة: يُنفَّذ في الخلفية بعد اكتمال الحفظ.
  void (async () => {
    if (actor.role === 'admin') {
      try { await rebuildSupplierSnapshot(supplierId); } catch (snapshotError) { console.warn('Price snapshots rebuild deferred:', snapshotError); }
    }
    try {
      const allUsers = getLocal<UserProfile>(STORAGE_KEYS.users);
      const productMap = new Map(getLocal<Product>(STORAGE_KEYS.products).map((product) => [product.id, product]));
      const priceByProduct = new Map(updatedPrices.map((record) => [record.productId, record]));
      const alertSupplierName = importBatch.supplierName || 'مورد معتمد';
      allUsers.forEach((user) => {
        if (!user.priceAlerts || (user.allowedSuppliers?.length && !user.allowedSuppliers.includes(supplierId))) return;
        Object.entries(user.priceAlerts).forEach(([productId, targetPrice]) => {
          const record = priceByProduct.get(productId);
          if (!record || targetPrice === undefined || !(record.price <= targetPrice) || !record.available) return;
          const productName = productMap.get(productId)?.tradeName || 'الصنف المفضل';
          createNotification({
            userId: user.uid,
            title: `تنبيه انخفاض سعر: ${productName}`,
            message: `تغير سعر ${productName} لدى ${alertSupplierName} إلى ${formatCurrency(record.price)}.`,
            type: 'price_alert',
            metadata: { productId, supplierId, newPrice: record.price, targetPrice },
          }).catch((error) => console.warn('Could not create price alert notification:', error));
        });
      });
    } catch (error) { console.warn('Price alert check failed after import:', error); }
    try {
      const settings = await getSystemSettings();
      if (settings.priceImportNotificationsEnabled !== false) {
        const message = changedCount
          ? `أضاف ${supplierName} تحديث أسعار: تغير سعر ${changedCount} صنفاً${unchangedCount ? `، وبقي ${unchangedCount} دون تغيير` : ''}.`
          : `رفع ${supplierName} دفعة أسعار، ولم يتغير سعر أي صنف.`;
        const recipients = new Set<string>([actor.uid]);
        if (actor.role === 'admin') {
          getLocal<UserProfile>(STORAGE_KEYS.users).filter((candidate) => candidate.role === 'representative' && candidate.supplierId === supplierId).forEach((candidate) => recipients.add(candidate.uid));
        }
        await Promise.all([...recipients].map((userId) => createNotification({
          userId, title: changedCount ? 'تم تحديث أسعار المستودع' : 'اكتملت مراجعة أسعار المستودع', message,
          type: 'price_import', metadata: { supplierId, batchId, changedCount, unchangedCount, actionUrl: actor.role === 'representative' ? '/app/representative' : '/admin/import' },
        })));
      }
    } catch (notificationError) { console.warn('Price import notification failed:', notificationError); }
  })();

  return { batchId, updatedCount, newCount };
}

// التراجع عن دفعة استيراد سابقة
export async function rollbackImportBatch(batchId: string): Promise<boolean> {
  const actor = useAuthStore.getState().user;
  if (!actor || actor.role !== 'admin') throw new Error('التراجع عن دفعات الاستيراد متاح للمشرف فقط.');
  const now = new Date().toISOString();
  const localBatches = getLocal<ImportBatch>(STORAGE_KEYS.importBatches);
  let targetBatch = localBatches.find((batch) => batch.id === batchId);
  let batchHistory: PriceHistory[] = [];
  let allBatchHistory: PriceHistory[] = [];
  const rollbackActorName = await resolveActorDisplayName(actor, actor.email || 'مشرف');
  const rollbackToken = `rollback_${actor.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  if (isFirebaseConfigured) {
    const batchRef = doc(db, 'importBatches', batchId);
    const acquired = await runTransaction(db, async (transaction) => {
      const batchSnapshot = await transaction.get(batchRef);
      if (!batchSnapshot.exists()) return false;
      const currentBatch = { ...batchSnapshot.data(), id: batchId } as ImportBatch;
      if (currentBatch.importStatus === 'rolled_back') return false;
      const progressAt = Date.parse(currentBatch.progressUpdatedAt || currentBatch.createdAt);
      const activeState = currentBatch.importStatus === 'in_progress' || currentBatch.importStatus === 'rolling_back';
      if (activeState && (!Number.isFinite(progressAt) || Date.now() - progressAt < 5 * 60 * 1000)) {
        throw new Error(currentBatch.importStatus === 'rolling_back'
          ? 'هناك عملية تراجع أخرى تعمل على هذه الدفعة؛ انتظر خمس دقائق من آخر تقدم قبل استئنافها.'
          : 'دفعة الاستيراد ما زالت تعمل. أعد المحاولة بعد انتهاء الرفع أو بعد خمس دقائق من آخر تقدم.');
      }
      transaction.update(batchRef, {
        importStatus: 'rolling_back',
        progressUpdatedAt: now,
        rollbackOwnerToken: rollbackToken,
      });
      targetBatch = { ...currentBatch, importStatus: 'rolling_back', progressUpdatedAt: now, rollbackOwnerToken: rollbackToken };
      return true;
    });
    if (!acquired) return false;
    const historySnapshot = await getDocs(query(collection(db, 'priceHistory'), where('importBatchId', '==', batchId)));
    allBatchHistory = historySnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PriceHistory));
    if (!allBatchHistory.length) throw new Error('لا يوجد سجل تغييرات كامل لهذه الدفعة؛ أوقفنا التراجع حتى لا نخمن الأسعار السابقة.');
    if (allBatchHistory.some((history) => history.supplierId !== targetBatch!.supplierId || !history.productId)) {
      throw new Error('بيانات تاريخ الدفعة غير متطابقة مع المستودع؛ لم يتم تغيير أي سعر.');
    }
    batchHistory = allBatchHistory.filter((history) => !history.rolledBackAt);
    if (batchHistory.some((history) => history.changeType !== 'created' && !history.previous)) {
      throw new Error('هذه الدفعة لا تحتوي لقطة كاملة للأسعار السابقة؛ لا يمكن التراجع عنها بأمان.');
    }

    const currentByProduct = new Map<string, PriceRecord>();
    for (let offset = 0; offset < batchHistory.length; offset += 20) {
      const chunk = batchHistory.slice(offset, offset + 20);
      const snapshots = await Promise.all(chunk.map((history) => getDoc(doc(db, 'prices', `${history.supplierId}_${history.productId}`))));
      snapshots.forEach((snapshot, index) => {
        if (snapshot.exists()) currentByProduct.set(chunk[index].productId, { id: snapshot.id, ...snapshot.data() } as PriceRecord);
      });
    }

    const actions: Array<{ history: PriceHistory; kind: 'delete' | 'skip' } | { history: PriceHistory; kind: 'restore'; record: PriceRecord }> = [];
    for (const history of batchHistory) {
      const current = currentByProduct.get(history.productId);
      if (!current && history.changeType === 'created') {
        actions.push({ history, kind: 'skip' });
        continue;
      }
      if (!current) throw new Error(`السعر الحالي للصنف ${history.productId} غير موجود؛ لم يتم التراجع عن أي عنصر.`);
      const expectedUpdatedAt = history.next?.updatedAt || history.importedAt;
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        throw new Error(`تم تحديث سعر الصنف ${history.productId} بعد هذه الدفعة؛ أوقفنا التراجع كي لا نمحو تعديلاً أحدث.`);
      }
      if (history.changeType === 'created') {
        actions.push({ history, kind: 'delete' });
      } else {
        const previous = history.previous!;
        actions.push({ history, kind: 'restore', record: {
          id: `${history.supplierId}_${history.productId}`,
          productId: history.productId,
          supplierId: history.supplierId,
          price: previous.price,
          publicPrice: previous.publicPrice,
          available: previous.available ?? true,
          expiry: previous.expiry,
          bonus: previous.bonus,
          hidden: previous.hidden ?? current.hidden ?? false,
          updatedAt: now,
        } });
      }
    }

    const supplierSnapshot = await getDoc(doc(db, 'suppliers', targetBatch!.supplierId));
    if (!supplierSnapshot.exists()) throw new Error('المستودع المرتبط بالدفعة غير موجود؛ لم يتم التراجع.');
    const activityId = `activity_rollback_${batchId}`;
    // Keep product checks at 10 per atomic transaction; reread prices and history transactionally
    // so a concurrent import cannot be overwritten between validation and rollback commit.
    for (let offset = 0; offset < Math.max(1, actions.length); offset += 10) {
      const chunkActions = actions.slice(offset, offset + 10);
      const isLast = offset + 10 >= Math.max(1, actions.length);
      try {
        await runTransaction(db, async (transaction) => {
          const batchRef = doc(db, 'importBatches', batchId);
          const supplierRef = doc(db, 'suppliers', targetBatch!.supplierId);
          const historyRefs = chunkActions.map((action) => doc(db, 'priceHistory', action.history.id));
          const priceRefs = chunkActions.map((action) => doc(db, 'prices', `${action.history.supplierId}_${action.history.productId}`));
          const [batchSnapshot, historySnapshots, priceSnapshots, currentSupplier] = await Promise.all([
            transaction.get(batchRef),
            Promise.all(historyRefs.map((ref) => transaction.get(ref))),
            Promise.all(priceRefs.map((ref) => transaction.get(ref))),
            isLast ? transaction.get(supplierRef) : Promise.resolve(null),
          ]);

          if (!batchSnapshot.exists()) {
            if (historySnapshots.every((snapshot) => snapshot.exists() && Boolean(snapshot.data().rolledBackAt))) return;
            throw new Error('اختفى سجل الدفعة أثناء التراجع؛ حدّث الصفحة قبل المحاولة مجدداً.');
          }
          if (batchSnapshot.data().rollbackOwnerToken !== rollbackToken) {
            throw new Error('انتقلت ملكية التراجع إلى جلسة أخرى؛ أوقفنا هذه المحاولة لتجنب التعارض.');
          }
          if (isLast && !currentSupplier?.exists()) throw new Error('المستودع المرتبط بالدفعة غير موجود؛ لم يتم التراجع.');

          for (let index = 0; index < chunkActions.length; index += 1) {
            const historySnapshot = historySnapshots[index];
            if (!historySnapshot.exists()) throw new Error('اختفى سجل تاريخ سعر أثناء التراجع؛ أوقفنا العملية بأمان.');
            const history = { ...historySnapshot.data(), id: historySnapshot.id } as PriceHistory;
            if (history.rolledBackAt) continue;
            if (history.supplierId !== targetBatch!.supplierId || !history.productId) {
              throw new Error('بيانات تاريخ الدفعة غير متطابقة مع المستودع؛ لم يتم تغيير هذا الجزء.');
            }

            const priceSnapshot = priceSnapshots[index];
            const priceRef = priceRefs[index];
            if (!priceSnapshot.exists() && history.changeType === 'created') {
              transaction.update(historyRefs[index], { rolledBackAt: now });
              continue;
            }
            if (!priceSnapshot.exists()) throw new Error(`السعر الحالي للصنف ${history.productId} غير موجود؛ أوقفنا التراجع.`);
            const current = { id: priceSnapshot.id, ...priceSnapshot.data() } as PriceRecord;
            const expectedUpdatedAt = history.next?.updatedAt || history.importedAt;
            if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
              throw new Error(`تم تحديث سعر الصنف ${history.productId} بعد هذه الدفعة؛ أوقفنا التراجع كي لا نمحو تعديلاً أحدث.`);
            }

            if (history.changeType === 'created') {
              transaction.delete(priceRef);
            } else {
              if (!history.previous) throw new Error('هذه الدفعة لا تحتوي لقطة سابقة لهذا السعر؛ أوقفنا التراجع.');
              const previous = history.previous;
              transaction.set(priceRef, {
                productId: history.productId,
                supplierId: history.supplierId,
                price: previous.price,
                publicPrice: previous.publicPrice ?? null,
                available: previous.available ?? true,
                expiry: previous.expiry ?? null,
                bonus: previous.bonus ?? null,
                hidden: previous.hidden ?? false,
                updatedAt: now,
              });
            }
            transaction.update(historyRefs[index], { rolledBackAt: now });
          }

          if (isLast) {
            transaction.update(supplierRef, {
              lastPriceUpdate: now,
              lastPriceUpdatedByUid: actor.uid,
              lastPriceUpdatedByName: rollbackActorName,
            });
            transaction.update(batchRef, {
              importStatus: 'rolled_back',
              progressUpdatedAt: now,
              rollbackOwnerToken: rollbackToken,
            });
            transaction.set(doc(db, 'platform_activity', activityId), {
              id: activityId,
              type: 'price_import_rolled_back',
              actorId: actor.uid,
              actorName: rollbackActorName,
              actorRole: actor.role,
              message: `تم التراجع عن دفعة أسعار ${targetBatch!.supplierName || targetBatch!.supplierId} (${targetBatch!.fileName}).`,
              createdAt: now,
              metadata: { supplierId: targetBatch!.supplierId, batchId, rowsCount: allBatchHistory.length },
            });
          } else {
            transaction.update(batchRef, {
              importStatus: 'rolling_back',
              progressUpdatedAt: new Date().toISOString(),
              rollbackOwnerToken: rollbackToken,
            });
          }
        });
      } catch (cause) {
        invalidateCache(['prices', 'priceHistory', 'importBatches', 'suppliers']);
        console.error('Import rollback chunk failed:', cause);
        if (cause instanceof Error && cause.message.includes('تم تحديث سعر الصنف')) throw cause;
        throw new Error('تعذر إكمال التراجع. حدّث الصفحة ثم أعد المحاولة؛ سيُستكمل فقط ما لم يُسترجع بعد.');
      }
    }
  } else {
    if (!targetBatch) return false;
    batchHistory = getLocal<PriceHistory>(STORAGE_KEYS.priceHistory).filter((history) => history.importBatchId === batchId);
    allBatchHistory = batchHistory;
    if (!batchHistory.length || batchHistory.some((history) => history.changeType !== 'created' && !history.previous)) {
      throw new Error('لا توجد لقطة محلية كاملة للأسعار السابقة؛ لا يمكن التراجع بأمان.');
    }
    let currentPrices = getLocal<PriceRecord>(STORAGE_KEYS.prices);
    for (const history of batchHistory) {
      const index = currentPrices.findIndex((price) => price.supplierId === history.supplierId && price.productId === history.productId);
      if (history.changeType === 'created') {
        if (index >= 0) currentPrices.splice(index, 1);
      } else if (index < 0) {
        throw new Error(`السعر المحلي للصنف ${history.productId} غير موجود؛ لم يتم التراجع.`);
      } else {
        const previous = history.previous!;
        currentPrices[index] = { ...currentPrices[index], ...previous, updatedAt: now };
      }
    }
    setLocal(STORAGE_KEYS.prices, currentPrices);
    const localSuppliers = getLocal<Supplier>(STORAGE_KEYS.suppliers);
    setLocal(STORAGE_KEYS.suppliers, localSuppliers.map((supplier) => supplier.id === targetBatch!.supplierId ? { ...supplier, lastPriceUpdate: now } : supplier));
  }

  setLocal(STORAGE_KEYS.importBatches, localBatches.map((batch) => batch.id === batchId
    ? { ...batch, importStatus: 'rolled_back', progressUpdatedAt: now, rollbackOwnerToken: rollbackToken }
    : batch));
  if (isFirebaseConfigured) {
    const updatedIds = new Set(allBatchHistory.map((history) => history.productId));
    const current = getLocal<PriceRecord>(STORAGE_KEYS.prices);
    const next = current.filter((price) => !(price.supplierId === targetBatch!.supplierId && updatedIds.has(price.productId)));
    for (const history of allBatchHistory) {
      if (history.changeType === 'created') continue;
      const previous = history.previous;
      if (!previous) continue;
      next.push({
        id: `${history.supplierId}_${history.productId}`, productId: history.productId, supplierId: history.supplierId,
        price: previous.price, publicPrice: previous.publicPrice, available: previous.available ?? true,
        expiry: previous.expiry, bonus: previous.bonus, hidden: previous.hidden ?? false, updatedAt: now,
      });
    }
    setLocal(STORAGE_KEYS.prices, next);
    const localSuppliers = getLocal<Supplier>(STORAGE_KEYS.suppliers);
    const nextSuppliers = localSuppliers.map((supplier) => supplier.id === targetBatch!.supplierId ? { ...supplier, lastPriceUpdate: now } : supplier);
    setLocal(STORAGE_KEYS.suppliers, nextSuppliers);
    const updatedSupplier = nextSuppliers.find((supplier) => supplier.id === targetBatch!.supplierId);
    if (updatedSupplier) updateLiveCollection('suppliers', STORAGE_KEYS.suppliers, updatedSupplier);
  }
  invalidateCache(['prices', 'priceHistory', 'importBatches', 'suppliers']);
  try { await rebuildSupplierSnapshot(targetBatch!.supplierId); } catch (snapshotError) { console.warn('Rollback supplier snapshot rebuild deferred:', snapshotError); }
  return true;
}

export async function getImportBatches(): Promise<ImportBatch[]> {
  if (isFirebaseConfigured) {
    try {
      const actor = useAuthStore.getState().user;
      if (actor?.role === 'representative') {
        if (!actor.supplierId) return [];
        const snap = await getDocs(query(collection(db, 'importBatches'), where('supplierId', '==', actor.supplierId)));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImportBatch));
      }
      if (actor?.role === 'pharmacy') {
        const ids = actor.pharmacyCatalogPermissions?.managePrices ? [...new Set(actor.pharmacyCatalogPermissions.priceSupplierIds || [])] : [];
        if (!ids.length) return [];
        const chunks: string[][] = []; for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        const snaps = await Promise.all(chunks.map((chunk) => getDocs(query(collection(db, 'importBatches'), where('supplierId', 'in', chunk)))));
        return snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImportBatch)));
      }
      const snap = await getDocs(collection(db, 'importBatches'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImportBatch));
    } catch (e) {
      console.warn('Firestore fallback for importBatches:', e);
    }
  }
  return getLocal<ImportBatch>(STORAGE_KEYS.importBatches);
}

export async function getPriceHistory(productId?: string, allowedSupplierIds?: string[], maxRecords = 100): Promise<PriceHistory[]> {
  const cap = Math.max(1, Math.min(maxRecords || 100, 5000));
  const actor = useAuthStore.getState().user;
  if (isFirebaseConfigured) {
    try {
      if (!productId) {
        let supplierIds = allowedSupplierIds || [];
        if (actor?.role === 'representative') supplierIds = actor.supplierId ? [actor.supplierId] : [];
        if (actor?.role === 'admin' && !supplierIds.length) {
          const snap = await getDocs(query(collection(db, 'priceHistory'), orderBy('importedAt', 'desc'), limit(cap)));
          return snap.docs.map((item) => ({ id: item.id, ...item.data() } as PriceHistory));
        }
        if (!supplierIds.length) return [];
        const snapshots = await Promise.all(supplierIds.slice(0, 10).map((supplierId) => getDocs(query(collection(db, 'priceHistory'), where('supplierId', '==', supplierId), orderBy('importedAt', 'desc'), limit(cap)))));
        return snapshots.flatMap((snap) => snap.docs.map((item) => ({ id: item.id, ...item.data() } as PriceHistory)))
          .sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, cap);
      }
      let supplierIds = allowedSupplierIds || [];
      if (actor?.role === 'representative') supplierIds = actor.supplierId ? [actor.supplierId] : [];
      else if (!supplierIds.length && actor?.role === 'pharmacy' && actor.allowedSuppliers?.length) supplierIds = actor.allowedSuppliers;
      if (supplierIds.length) {
        const snapshots = await Promise.all(supplierIds.map((supplierId) => getDocs(query(
          collection(db, 'priceHistory'),
          where('productId', '==', productId),
          where('supplierId', '==', supplierId),
        ))));
        return snapshots.flatMap((snap) => snap.docs.map((item) => ({ id: item.id, ...item.data() } as PriceHistory)));
      }
      if (actor?.role === 'admin' || (actor?.role === 'pharmacy' && !actor.allowedSuppliers?.length)) {
        const snap = await getDocs(query(collection(db, 'priceHistory'), where('productId', '==', productId)));
        return snap.docs.map((item) => ({ id: item.id, ...item.data() } as PriceHistory));
      }
      return [];
    } catch (error) {
      console.warn('Firestore price history unavailable:', (error as any)?.code || error);
      if (actor?.role === 'representative') return [];
    }
  }
  const localHistory = getLocal<PriceHistory>(STORAGE_KEYS.priceHistory);
  const scoped = productId ? localHistory.filter((row) => row.productId === productId) : localHistory.slice(0, cap);
  if (actor?.role === 'representative') return scoped.filter((row) => row.supplierId === actor.supplierId);
  return allowedSupplierIds?.length ? scoped.filter((row) => allowedSupplierIds.includes(row.supplierId)) : scoped;
}

export async function toggleProductFavorite(userId: string, productId: string): Promise<string[]> {
  const users = getLocal<UserProfile>(STORAGE_KEYS.users);
  const user = users.find((u) => u.uid === userId);
  const currentFavs = user?.favorites || [];
  const exists = currentFavs.includes(productId);
  const newFavs = exists ? currentFavs.filter((id) => id !== productId) : [...currentFavs, productId];

  if (user) {
    user.favorites = newFavs;
    setLocal(STORAGE_KEYS.users, users);
  }

  // حفظ في التخزين المحلي للمستخدم الحالي
  try {
    const activeLocal = localStorage.getItem('pharma_local_user');
    if (activeLocal) {
      const parsed = JSON.parse(activeLocal);
      parsed.favorites = newFavs;
      localStorage.setItem('pharma_local_user', JSON.stringify(parsed));
    }
  } catch (_) {}

  if (isFirebaseConfigured && userId) {
    try {
      await updateDoc(doc(db, 'users', userId), { favorites: newFavs });
    } catch (e) {
      console.warn('Firestore toggleProductFavorite error:', e);
    }
  }

  return newFavs;
}

export async function toggleSupplierFavorite(userId: string, supplierId: string): Promise<string[]> {
  const currentUser = useAuthStore.getState().user;
  const current = currentUser?.supplierFavorites || [];
  const next = current.includes(supplierId) ? current.filter((id) => id !== supplierId) : [...current, supplierId];
  useAuthStore.setState((state) => state.user ? { user: { ...state.user, supplierFavorites: next } } : state);
  if (!isFirebaseConfigured) {
    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
    const updated = users.map((u: UserProfile) => u.uid === userId ? { ...u, supplierFavorites: next } : u);
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(updated));
    return next;
  }
  try {
    await updateDoc(doc(db, 'users', userId), { supplierFavorites: next });
  } catch (e) { console.warn('Firestore toggleSupplierFavorite error:', e); }
  return next;
}

export async function setProductPriceAlert(
  userId: string,
  productId: string,
  targetPrice: number | null
): Promise<void> {
  const users = getLocal<UserProfile>(STORAGE_KEYS.users);
  const user = users.find((u) => u.uid === userId);
  const currentAlerts = { ...(user?.priceAlerts || {}) };

  if (targetPrice === null || targetPrice <= 0) {
    delete currentAlerts[productId];
  } else {
    currentAlerts[productId] = targetPrice;
  }

  if (user) {
    user.priceAlerts = currentAlerts;
    setLocal(STORAGE_KEYS.users, users);
  }

  try {
    const activeLocal = localStorage.getItem('pharma_local_user');
    if (activeLocal) {
      const parsed = JSON.parse(activeLocal);
      parsed.priceAlerts = currentAlerts;
      localStorage.setItem('pharma_local_user', JSON.stringify(parsed));
    }
  } catch (_) {}

  if (isFirebaseConfigured && userId) {
    try {
      await updateDoc(doc(db, 'users', userId), { priceAlerts: currentAlerts });
    } catch (e) {
      console.warn('Firestore setProductPriceAlert error:', e);
    }
  }
}

// ======================= Orders =======================
const recurringTemplatesKey = (uid: string) => `pharma_recurring_templates_${uid}`;

export async function getRecurringOrderTemplates(uid: string): Promise<RecurringOrderTemplate[]> {
  if (!uid) return [];
  const localKey = recurringTemplatesKey(uid);
  if (isFirebaseConfigured) {
    try {
      const snapshot = await getDoc(doc(db, 'pharmacy_templates', uid));
      const templates = snapshot.exists() ? snapshot.data().templates : [];
      if (Array.isArray(templates)) {
        setLocal(localKey, templates as RecurringOrderTemplate[]);
        return templates as RecurringOrderTemplate[];
      }
    } catch (e) {
      console.warn('Firestore templates fallback for pharmacy:', uid, e);
    }
  }
  return getLocal<RecurringOrderTemplate>(localKey);
}

export async function saveRecurringOrderTemplates(uid: string, templates: RecurringOrderTemplate[]): Promise<boolean> {
  if (!uid) throw new Error('Missing pharmacy UID');
  const localKey = recurringTemplatesKey(uid);
  setLocal(localKey, templates);
  if (!isFirebaseConfigured) return false;
  try {
    await setDoc(doc(db, 'pharmacy_templates', uid), {
      pharmacyId: uid,
      templates,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('Firestore template save fallback for pharmacy:', uid, e);
    return false;
  }
}

export async function restoreDataBackup(payload: Record<string, any>): Promise<Record<string, { added: number; replaced: number }>> {
  if (useAuthStore.getState().user?.role !== 'admin') throw new Error('استعادة النسخة الاحتياطية متاحة للمدير فقط.');
  const specs: Array<{ key: string; collection: string; id: (row: any) => string }> = [
    { key: 'activeIngredients', collection: 'activeIngredients', id: (row) => row.id },
    { key: 'products', collection: 'products', id: (row) => row.id },
    { key: 'suppliers', collection: 'suppliers', id: (row) => row.id },
    { key: 'prices', collection: 'prices', id: (row) => row.id || `${row.supplierId}_${row.productId}` },
    { key: 'priceHistory', collection: 'priceHistory', id: (row) => row.id },
    { key: 'importBatches', collection: 'importBatches', id: (row) => row.id },
    { key: 'orders', collection: 'orders', id: (row) => row.id },
    { key: 'users', collection: 'users', id: (row) => row.uid || row.id },
    { key: 'activity', collection: 'platform_activity', id: (row) => row.id },
  ];
  const report: Record<string, { added: number; replaced: number }> = {};
  const writes: Array<{ collection: string; id: string; value: Record<string, any> }> = [];
  for (const spec of specs) {
    const rows = payload[spec.key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new Error(`صيغة ${spec.key} في ملف النسخة غير صحيحة.`);
    if (rows.some((row) => !row || typeof row !== 'object' || !spec.id(row))) throw new Error(`توجد سجلات ناقصة المعرف ضمن ${spec.key}.`);
    const existingIds = new Set<string>();
    if (isFirebaseConfigured) {
      const snapshot = await getDocs(collection(db, spec.collection));
      snapshot.docs.forEach((item) => existingIds.add(item.id));
    }
    report[spec.key] = { added: 0, replaced: 0 };
    rows.forEach((row) => {
      const id = String(spec.id(row));
      if (existingIds.has(id)) report[spec.key].replaced += 1;
      else report[spec.key].added += 1;
      writes.push({ collection: spec.collection, id, value: row });
    });
  }
  if (payload.settings !== undefined) {
    if (!payload.settings || typeof payload.settings !== 'object' || Array.isArray(payload.settings)) throw new Error('صيغة إعدادات النظام في ملف النسخة غير صحيحة.');
    let settingsExist = false;
    if (isFirebaseConfigured) settingsExist = (await getDoc(doc(db, 'settings', 'system'))).exists();
    report.settings = { added: settingsExist ? 0 : 1, replaced: settingsExist ? 1 : 0 };
    writes.push({ collection: 'settings', id: 'system', value: { ...payload.settings, id: 'system' } });
  }
  if (isFirebaseConfigured) {
    let batch = writeBatch(db);
    let batchWriteCount = 0;
    let batchPriceChecks = 0;
    for (const entry of writes) {
      if (batchWriteCount >= 400 || (entry.collection === 'prices' && batchPriceChecks >= 10)) {
        await batch.commit();
        batch = writeBatch(db);
        batchWriteCount = 0;
        batchPriceChecks = 0;
      }
      batch.set(doc(db, entry.collection, entry.id), entry.value, { merge: true });
      batchWriteCount += 1;
      if (entry.collection === 'prices') batchPriceChecks += 1;
    }
    if (batchWriteCount > 0) await batch.commit();
    for (const [key, rows] of Object.entries(payload)) {
      if (key === 'settings' || !Array.isArray(rows)) continue;
      const storageKey = (STORAGE_KEYS as Record<string, string>)[key];
      if (storageKey) setLocal(storageKey, rows);
      if (key === 'activity') localStorage.setItem('pharma_v18_activity', JSON.stringify(rows));
    }
    if (payload.settings) setLocal(STORAGE_KEYS.settings, [{ ...payload.settings, id: 'system' }]);
  } else {
    for (const [key, rows] of Object.entries(payload)) {
      const storageKey = (STORAGE_KEYS as Record<string, string>)[key];
      if (storageKey && Array.isArray(rows)) setLocal(storageKey, rows);
      if (key === 'activity' && Array.isArray(rows)) localStorage.setItem('pharma_v18_activity', JSON.stringify(rows));
    }
    if (payload.settings) setLocal(STORAGE_KEYS.settings, [{ ...payload.settings, id: 'system' }]);
    for (const [key, rows] of Object.entries(payload)) if (Array.isArray(rows)) report[key] = { added: rows.length, replaced: 0 };
  }
  invalidateCache();
  return report;
}

export async function updateOrderItems(orderId: string, pharmacyUid: string, items: OrderItem[], total: number): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== pharmacyUid) throw new Error('يجب تسجيل الدخول بحساب الصيدلية صاحبة الطلب.');
  let currentOrder: Order | undefined;
  if (isFirebaseConfigured) {
    const snapshot = await getDoc(doc(db, 'orders', orderId));
    if (snapshot.exists()) currentOrder = { id: snapshot.id, ...snapshot.data() } as Order;
  }
  currentOrder ||= getLocal<Order>(STORAGE_KEYS.orders).find((order) => order.id === orderId);
  if (!currentOrder || currentOrder.pharmacyId !== pharmacyUid) throw new Error('لم يتم العثور على الطلبية التابعة لحسابك.');
  if (currentOrder.status !== 'sent') throw new Error('لا يمكن تعديل الطلبية بعد تأكيد استلامها من المستودع.');
  if (!items.length || items.some((item) => !item.productId || !Number.isInteger(item.qty) || item.qty < 1)) {
    throw new Error('تحتوي الطلبية على أصناف أو كميات غير صالحة.');
  }
  const verifiedItems = await getVerifiedOrderItems(currentOrder.supplierId, items);
  const updatedAt = new Date().toISOString();
  const normalizedTotal = verifiedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  if (Math.abs(normalizedTotal - total) > 0.01) throw new Error('إجمالي الطلبية لا يطابق الأصناف.');
  const editHistory = [...(currentOrder.editHistory || []), {
    changedAt: updatedAt,
    changedBy: pharmacyUid,
    previousTotal: currentOrder.total,
    total: normalizedTotal,
    previousItems: currentOrder.items,
    items: verifiedItems,
  }];
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, 'orders', orderId), { items: verifiedItems, total: normalizedTotal, updatedAt, editHistory });
  }
  const localOrders = getLocal<Order>(STORAGE_KEYS.orders);
  setLocal(STORAGE_KEYS.orders, localOrders.map((order) => order.id === orderId ? { ...order, items: verifiedItems, total: normalizedTotal, updatedAt, editHistory } : order));
  await recordActivity({
    type: 'order_edited',
    actorId: pharmacyUid,
    actorName: currentOrder.pharmacyName,
    actorRole: 'pharmacy',
    message: `تم تعديل الطلبية ${currentOrder.supplierName} قبل تأكيد المستودع`,
    metadata: { orderId, supplierId: currentOrder.supplierId, previousTotal: currentOrder.total, total: normalizedTotal, itemCount: items.length },
  });
}

export async function getSupplierOrders(supplierId: string): Promise<Order[]> {
  const actor = useAuthStore.getState().user;
  if (!supplierId || !actor || (actor.role !== 'admin' && !(actor.role === 'representative' && actor.supplierId === supplierId))) return [];
  if (isFirebaseConfigured) {
    const snap = await getDocs(query(collection(db, 'orders'), where('supplierId', '==', supplierId), orderBy('createdAt', 'desc'), limit(500)));
    return snap.docs.map((item) => ({ id: item.id, ...item.data() } as Order));
  }
  return getLocal<Order>(STORAGE_KEYS.orders).filter((order) => order.supplierId === supplierId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSupplierProductsWithPrices(supplierId: string): Promise<Array<Product & { supplierPrice?: PriceRecord }>> {
  const [products, prices] = await Promise.all([getProducts(), getPrices([supplierId], false)]);
  const priceMap = new Map(prices.map((price) => [price.productId, price]));
  return products.filter((product) => priceMap.has(product.id)).map((product) => ({ ...product, supplierPrice: priceMap.get(product.id) }));
}

export async function getOrders(): Promise<Order[]> {
  if (isFirebaseConfigured) {
    try {
      const current = useAuthStore.getState().user;
      const ordersQuery = current?.role === 'admin'
        ? collection(db, 'orders')
        : query(collection(db, 'orders'), where('pharmacyId', '==', auth.currentUser?.uid || ''));
      const snap = await getDocs(ordersQuery);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
    } catch (e) {
      console.warn('Firestore fallback for orders:', e);
    }
  }
  return getLocal<Order>(STORAGE_KEYS.orders);
}

export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt'>): Promise<Order> {
  const id = 'ord_' + Date.now();
  const createdAt = new Date().toISOString();
  const verifiedItems = await getVerifiedOrderItems(orderData.supplierId, orderData.items);
  const verifiedTotal = verifiedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const newOrder: Order = {
    ...orderData,
    items: verifiedItems,
    total: verifiedTotal,
    id,
    createdAt,
    statusHistory: [{ status: orderData.status, changedAt: createdAt, changedBy: orderData.pharmacyId }],
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'orders', id), newOrder);
    } catch (e) {
      console.error('Firestore createOrder failed:', e);
      throw e;
    }
  }

  const list = getLocal<Order>(STORAGE_KEYS.orders);
  list.unshift(newOrder);
  setLocal(STORAGE_KEYS.orders, list);
  await recordActivity({
    type: 'order_created',
    actorId: orderData.pharmacyId,
    actorName: orderData.pharmacyName,
    actorRole: 'pharmacy',
    message: `طلبية جديدة من ${orderData.pharmacyName} إلى ${orderData.supplierName}`,
    metadata: { orderId: id, supplierId: orderData.supplierId, total: orderData.total },
  });
  return newOrder;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, orderContext?: Order): Promise<void> {
  const list = getLocal<Order>(STORAGE_KEYS.orders);
  const targetOrder = orderContext || list.find((o) => o.id === orderId);
  const changedAt = new Date().toISOString();
  const event = { status, changedAt, changedBy: auth.currentUser?.uid };

  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status,
        updatedAt: changedAt,
        statusHistory: [...(targetOrder?.statusHistory || []), event],
      });
    } catch (e) {
      console.error('Firestore updateOrderStatus failed:', e);
      throw e;
    }
  }

  const updatedList = list.map((o) => {
    if (o.id === orderId) {
      return { ...o, status, updatedAt: changedAt, statusHistory: [...(o.statusHistory || []), event] };
    }
    return o;
  });
  setLocal(STORAGE_KEYS.orders, updatedList);
  if (targetOrder) {
    await recordActivity({
      type: 'order_status_changed',
      actorId: auth.currentUser?.uid,
      actorName: auth.currentUser?.displayName || auth.currentUser?.email || 'إدارة المنصة',
      actorRole: useAuthStore.getState().user?.role || 'admin',
      message: `تغيير حالة طلبية ${targetOrder.supplierName} إلى ${status}`,
      metadata: { orderId, status, pharmacyId: targetOrder.pharmacyId },
    });
  }

  // إرسال إشعار فوري للصيدلية بتحديث حالة الطلبية
  if (targetOrder) {
    const statusLabels: Record<OrderStatus, string> = {
      sent: 'تم إرسال الطلبية للمستودع',
      confirmed: 'تم تأكيد استلام الطلبية من المستودع',
      processing: 'جاري تجهيز وتعبئة طلبيتك للشحن',
      delivered: 'تم تسليم الطلبية بنجاح للصيدلية',
      cancelled: 'تم إلغاء الطلبية',
    };

    // إرسال إشعار فوري للصيدلية بتحديث حالة الطلبية وتمريره عبر createNotification
    await createNotification({
      userId: targetOrder.pharmacyId,
      title: `تحديث حالة طلبيتك من ${targetOrder.supplierName}`,
      message: statusLabels[status] || `أصبحت حالة الطلبية: ${status}`,
      type: 'order_update',
      metadata: {
        orderId,
        orderStatus: status,
        actionUrl: '/app/orders',
      },
    });
  }
}

// ======================= Pharmacies / Users =======================
export async function importPharmacyProfiles(records: Array<Partial<UserProfile>>): Promise<{ added: number; updated: number }> {
  if (useAuthStore.getState().user?.role !== 'admin') throw new Error('استيراد الحسابات متاح للمدير فقط.');
  if (!records.length) throw new Error('لم يتم العثور على سجلات قابلة للاستيراد.');
  const seen = new Set<string>();
  for (const row of records) {
    if (!row.uid || !row.email) throw new Error('يجب أن يحتوي كل صف على UID وبريد إلكتروني؛ البريد وحده لا يحدد حساب Firebase.');
    if (seen.has(row.uid)) throw new Error(`معرّف UID مكرر في الملف: ${row.uid}`);
    seen.add(row.uid);
  }
  const current = await getUsers();
  const currentById = new Map(current.map((user) => [user.uid, user]));
  const next = records.map((row) => {
    const existing = currentById.get(row.uid!);
    return {
      ...existing,
      uid: row.uid!,
      name: String(row.name || row.ownerName || existing?.name || row.email),
      email: String(row.email).trim().toLowerCase(),
      role: 'pharmacy' as const,
      status: existing?.status || 'pending' as const,
      pharmacyName: String(row.pharmacyName || existing?.pharmacyName || ''),
      ownerName: String(row.ownerName || existing?.ownerName || row.name || ''),
      phone: String(row.phone || existing?.phone || ''),
      governorate: String(row.governorate || existing?.governorate || ''),
      city: String(row.city || existing?.city || ''),
      addressDetail: String(row.addressDetail || existing?.addressDetail || ''),
      createdAt: existing?.createdAt || new Date().toISOString(),
    } satisfies UserProfile;
  });
  if (isFirebaseConfigured) {
    for (const profile of next) await setDoc(doc(db, 'users', profile.uid), profile, { merge: true });
  }
  const merged = new Map(current.map((user) => [user.uid, user]));
  next.forEach((user) => merged.set(user.uid, user));
  setLocal(STORAGE_KEYS.users, [...merged.values()]);
  const added = next.filter((user) => !currentById.has(user.uid)).length;
  await recordActivity({ type: 'pharmacy_imported', actorId: auth.currentUser?.uid, actorName: auth.currentUser?.displayName || 'إدارة المنصة', actorRole: 'admin', message: `استيراد ${next.length} سجل صيدلية من ملف`, metadata: { added, updated: next.length - added } });
  return { added, updated: next.length - added };
}

export async function getUsers(): Promise<UserProfile[]> {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
    } catch (e) {
      console.warn('Firestore fallback for users:', e);
    }
  }
  return getLocal<UserProfile>(STORAGE_KEYS.users);
}

export async function updateUserStatusAndSuppliers(
  uid: string,
  status: 'pending' | 'active' | 'suspended',
  allowedSuppliers?: string[],
  adminCustomNote?: string
): Promise<void> {
  const updatePayload: any = { status };
  if (allowedSuppliers !== undefined) {
    updatePayload.allowedSuppliers = allowedSuppliers;
  }
  const localBefore = getLocal<UserProfile>(STORAGE_KEYS.users).find((user) => user.uid === uid);
  let previous: UserProfile | undefined = localBefore;

  if (isFirebaseConfigured) {
    try {
      const snapshot = await getDoc(doc(db, 'users', uid));
      if (snapshot.exists()) previous = { uid, ...snapshot.data() } as UserProfile;
      await updateDoc(doc(db, 'users', uid), updatePayload);
    } catch (e) {
      console.error('Firestore updateUserStatus failed:', e);
      throw e;
    }
  }

  const list = getLocal<UserProfile>(STORAGE_KEYS.users).map((u) => {
    if (u.uid === uid) {
      return { ...u, ...updatePayload };
    }
    return u;
  });
  setLocal(STORAGE_KEYS.users, list);
  await recordActivity({
    type: 'user_access_changed',
    actorId: auth.currentUser?.uid,
    actorName: auth.currentUser?.displayName || auth.currentUser?.email || 'إدارة المنصة',
    actorRole: 'admin',
    message: `تعديل حالة/صلاحيات حساب ${previous?.pharmacyName || previous?.email || uid}`,
    metadata: {
      targetUid: uid,
      previousStatus: previous?.status,
      newStatus: status,
      previousAllowedSuppliers: previous?.allowedSuppliers || [],
      newAllowedSuppliers: allowedSuppliers ?? previous?.allowedSuppliers ?? [],
    },
  });

  // إرسال إشعار فوري للصيدلية بتغيير حالة الحساب
  try {
    const statusTitles: Record<string, string> = {
      active: 'تهانينا! تم تفعيل حساب صيدليتكم بنجاح 🎉',
      suspended: 'تنبيه إداري: تم تعليق حساب الصيدلية',
      pending: 'تحديث: تم وضع حساب الصيدلية قيد المراجعة',
    };
    const defaultMessages: Record<string, string> = {
      active: 'قام مدير المنصة بالموافقة على حساب صيدليتكم وتفعيله. يمكنك الآن استعراض أسعار الأدوية بين كافة المستودعات المتاحة ومقارنة العروض وإرسال الطلبيات مباشرة عبر واتساب.',
      suspended: 'تم تعليق حساب صيدليتكم مؤقتاً من قبل إدارة المنصة. يرجى مراجعة إدارة المنصة أو التواصل مع الدعم الفني.',
      pending: 'تمت إعادة حساب صيدليتكم إلى حالة انتظار التفعيل للمراجعة والتدقيق الإداري.',
    };

    await createNotification({
      userId: uid,
      title: statusTitles[status] || `تحديث حالة الحساب: ${status}`,
      message: adminCustomNote?.trim() || defaultMessages[status] || `تم تحديث حالة حسابكم في النظام إلى ${status}.`,
      type: 'status_change',
      metadata: {
        newStatus: status,
        senderName: 'إدارة المنصة',
        priority: status === 'active' ? 'high' : 'normal'
      }
    });
  } catch (notifErr) {
    console.warn('Failed to send status notification:', notifErr);
  }
}

export async function getPublicLoginSettings(): Promise<{ loginWhatsApp: string; loginWhatsAppEnabled: boolean }> {
  const fallback = { loginWhatsApp: '970599999999', loginWhatsAppEnabled: true };
  if (isFirebaseConfigured) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'public'));
      if (snap.exists()) return { ...fallback, ...(snap.data() as any) };
    } catch (_) {}
  }
  return fallback;
}

// إعدادات النظام العامة (الفترة التجريبية وغيرها)
let systemSettingsWarned = false;

async function resolveActorDisplayName(actor: { role?: string; name?: string; email?: string }, fallback: string): Promise<string> {
  if (actor.role === 'admin') {
    try {
      const custom = (await getSystemSettings()).adminDisplayName?.trim();
      if (custom) return custom;
    } catch (_) {}
  }
  return actor.name || fallback;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  return fetchWithCache('systemSettings', async () => {
    const fallbackSettings: SystemSettings = {
      id: 'system', defaultTrialDays: 7, currency: '₪', supportWhatsApp: '970599999999',
      loginWhatsApp: '970599999999', loginWhatsAppEnabled: true, showDeliveryDays: true,
      warehousePriceSortMode: 'cheapest', priceImportNotificationsEnabled: true, hideProductsWithoutOffers: true,
      updatedAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured) {
      try {
        // public متاح للمستخدمين؛ لا نطلب settings/system الذي يخص المدير فقط.
        const snap = await getDoc(doc(db, 'settings', 'public'));
        if (snap.exists()) {
          const merged: SystemSettings = { ...fallbackSettings, ...(snap.data() as Partial<SystemSettings>), id: 'system' };
          try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(merged)); } catch (_) {}
          return merged;
        }
      } catch (e) {
        if (!systemSettingsWarned) {
          systemSettingsWarned = true;
          console.warn('Firestore public settings unavailable; using local fallback.', (e as any)?.code || 'unknown');
        }
      }
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.settings);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.defaultTrialDays === 'number') return { ...fallbackSettings, ...parsed };
      }
    } catch (_) {}
    try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(fallbackSettings)); } catch (_) {}
    return fallbackSettings;
  });
}

export async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const updated: SystemSettings = {
    ...current,
    ...settings,
    id: 'system',
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'settings', 'system'), updated, { merge: true });
      {
        await setDoc(doc(db, 'settings', 'public'), { loginWhatsApp: updated.loginWhatsApp || updated.supportWhatsApp || '970599999999', loginWhatsAppEnabled: updated.loginWhatsAppEnabled !== false, showDeliveryDays: updated.showDeliveryDays !== false, warehousePriceSortMode: updated.warehousePriceSortMode || 'cheapest', priceImportNotificationsEnabled: updated.priceImportNotificationsEnabled !== false, hideProductsWithoutOffers: updated.hideProductsWithoutOffers !== false, pharmacyFeatureDefaults: updated.pharmacyFeatureDefaults || {}, ...(updated.productCardConfig ? { productCardConfig: updated.productCardConfig } : {}), adminDisplayName: updated.adminDisplayName || '', defaultTrialDays: updated.defaultTrialDays || 7, ...(updated.gazaLocations ? { gazaLocations: updated.gazaLocations } : {}), ...(updated.locationCatalog ? { locationCatalog: updated.locationCatalog } : {}), ...(updated.subscriptionPolicy ? { subscriptionPolicy: updated.subscriptionPolicy } : {}), updatedAt: updated.updatedAt, currency: updated.currency || '₪', platformName: updated.platformName || 'فارما لينك', supportWhatsApp: updated.supportWhatsApp || updated.loginWhatsApp || '970599999999' }, { merge: true });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'settings/system');
    }
  }
  invalidateCache(['systemSettings']);

  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(updated));
  } catch (_) {}
  return updated;
}

// منح قدرات الكتالوج والأسعار لصيدلية/حسابات مختارة؛ لا يمكن للحساب تعديل هذه الصلاحيات بنفسه.
export async function updatePharmacyCatalogPermissions(uid: string, permissions: PharmacyCatalogPermissions): Promise<void> {
  const actor = useAuthStore.getState().user;
  if (actor?.role !== 'admin') throw new Error('هذه الصلاحية متاحة للإدارة فقط.');
  const clean: PharmacyCatalogPermissions = {
    managePrices: Boolean(permissions.managePrices),
    createProducts: Boolean(permissions.createProducts),
    createActiveIngredients: Boolean(permissions.createActiveIngredients),
    priceSupplierIds: permissions.managePrices ? [...new Set(permissions.priceSupplierIds || [])] : [],
  };
  const updatedAt = new Date().toISOString();
  if (isFirebaseConfigured) await updateDoc(doc(db, 'users', uid), { pharmacyCatalogPermissions: clean, updatedAt });
  const list = getLocal<UserProfile>(STORAGE_KEYS.users).map((user) => user.uid === uid ? { ...user, pharmacyCatalogPermissions: clean, updatedAt } : user);
  setLocal(STORAGE_KEYS.users, list);
  await recordActivity({ type: 'user_access_changed', actorId: actor.uid, actorName: actor.name || actor.email, actorRole: 'admin', message: `تحديث صلاحيات الكتالوج والأسعار للحساب ${uid}`, metadata: { targetUid: uid, pharmacyCatalogPermissions: clean } });
}

// تخصيص إظهار ميزات الواجهة (الأرخص، أفضل سلة...) لصيدلية محددة؛ 'inherit' يعني اتباع الإعداد العام.
export async function updateUserFeatureOverrides(uid: string, overrides: PharmacyFeatureOverrides): Promise<void> {
  const clean: PharmacyFeatureOverrides = {};
  (Object.keys(overrides) as PharmacyFeatureKey[]).forEach((key) => {
    if (overrides[key] === 'show' || overrides[key] === 'hide') clean[key] = overrides[key];
  });
  const updatedAt = new Date().toISOString();
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, 'users', uid), { featureOverrides: clean, updatedAt });
  }
  const list = getLocal<UserProfile>(STORAGE_KEYS.users).map((u) => (u.uid === uid ? { ...u, featureOverrides: clean, updatedAt } : u));
  setLocal(STORAGE_KEYS.users, list);
  await recordActivity({
    type: 'user_access_changed',
    actorId: auth.currentUser?.uid,
    actorName: auth.currentUser?.displayName || auth.currentUser?.email || 'إدارة المنصة',
    actorRole: 'admin',
    message: `تعديل صلاحيات إظهار الميزات لحساب ${uid}`,
    metadata: { targetUid: uid, featureOverrides: clean },
  });
}

// تعيين أو تغيير دور المستخدم (ترقية لمدير أو تخفيض لصيدلية)
export async function updateUserRole(uid: string, newRole: 'admin' | 'pharmacy'): Promise<void> {
  const list = getLocal<UserProfile>(STORAGE_KEYS.users);
  const targetUser = list.find((u) => u.uid === uid);
  const userEmail = targetUser?.email?.trim().toLowerCase();

  const updatePayload: Partial<UserProfile> = {
    role: newRole,
  };

  if (newRole === 'admin') {
    updatePayload.status = 'active';
    updatePayload.subscriptionStatus = 'active';
  }

  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'users', uid), updatePayload as any);

      if (newRole === 'admin') {
        await setDoc(doc(db, 'admins', uid), {
          uid,
          email: userEmail || '',
          addedAt: new Date().toISOString(),
        });

        if (userEmail) {
          const sys = await getSystemSettings();
          const adminEmails = new Set(sys.adminEmails || []);
          adminEmails.add(userEmail);
          adminEmails.add('mirolab17@gmail.com');
          await updateSystemSettings({ adminEmails: Array.from(adminEmails) });
        }
      } else {
        // إذا تم التخفيض لصيدلية
        await deleteDoc(doc(db, 'admins', uid)).catch(() => {});
        if (userEmail && userEmail !== 'mirolab17@gmail.com') {
          const sys = await getSystemSettings();
          const adminEmails = (sys.adminEmails || []).filter((e) => e.toLowerCase() !== userEmail);
          await updateSystemSettings({ adminEmails });
        }
      }
    } catch (e) {
      console.error('Firestore updateUserRole failed:', e);
      handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
    }
  }

  const updatedList = list.map((u) => {
    if (u.uid === uid) {
      return { ...u, ...updatePayload };
    }
    return u;
  });
  setLocal(STORAGE_KEYS.users, updatedList);
}

// إضافة مدير جديد بالبريد الإلكتروني مباشرة
export async function addAdminByEmail(rawEmail: string): Promise<{ success: boolean; message: string; userPromoted: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { success: false, message: 'يرجى إدخال بريد إلكتروني صحيح.', userPromoted: false };
  }

  // 1. تحديث قائمة مدراء النظام في settings/system
  const sys = await getSystemSettings();
  const emails = new Set((sys.adminEmails || []).map((e) => e.toLowerCase()));
  emails.add(email);
  emails.add('mirolab17@gmail.com');
  await updateSystemSettings({ adminEmails: Array.from(emails) });

  // 2. التحقق من وجود مستخدم مسجل مسبقاً بهذا البريد لترقيته فوراً
  const allUsers = await getUsers();
  const matchedUser = allUsers.find((u) => u.email?.trim().toLowerCase() === email);

  if (matchedUser) {
    await updateUserRole(matchedUser.uid, 'admin');
    return {
      success: true,
      message: `تم ترقية المستخدم (${matchedUser.name || matchedUser.pharmacyName || email}) إلى مدير نظام بنجاح!`,
      userPromoted: true,
    };
  }

  return {
    success: true,
    message: `تمت إضافة البريد (${email}) إلى قائمة المشرفين المصرحين. بمجرد تسجيل دخوله بحساب Google سيتم منحه صلاحيات المدير تلقائياً!`,
    userPromoted: false,
  };
}

// إزالة مدير من قائمة المشرفين بالبريد
export async function removeAdminByEmail(rawEmail: string): Promise<{ success: boolean; message: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (email === 'mirolab17@gmail.com') {
    return { success: false, message: 'لا يمكن إزالة الحساب الرئيسي للنظام.' };
  }

  const sys = await getSystemSettings();
  const emails = (sys.adminEmails || []).filter((e) => e.toLowerCase() !== email);
  await updateSystemSettings({ adminEmails: emails });

  // إذا كان هناك مستخدم مسجل، تخفيض دوره إلى صيدلية
  const allUsers = await getUsers();
  const matchedUser = allUsers.find((u) => u.email?.trim().toLowerCase() === email);
  if (matchedUser) {
    await updateUserRole(matchedUser.uid, 'pharmacy');
  }

  return { success: true, message: `تمت إزالة البريد (${email}) من قائمة مدراء النظام.` };
}

// إدارة واشتراكات الصيدليات
export async function updateUserSubscription(
  uid: string,
  params: {
    subscriptionStatus: 'trial' | 'active' | 'expired';
    daysToAdd?: number;
    trialDays?: number;
    newExpiresAt?: string;
    customNote?: string;
  }
): Promise<void> {
  const { subscriptionStatus, daysToAdd, trialDays, newExpiresAt, customNote } = params;
  const now = Date.now();

  let finalExpiresAt: string;
  let finalExpiresAtMillis: number;

  const list = getLocal<UserProfile>(STORAGE_KEYS.users);
  const existing = list.find((u) => u.uid === uid);

  if (newExpiresAt) {
    finalExpiresAt = newExpiresAt;
    finalExpiresAtMillis = new Date(newExpiresAt).getTime();
  } else if (trialDays && trialDays > 0 && subscriptionStatus === 'trial') {
    // تحديد مدة التجربة بالكامل مباشرة
    finalExpiresAtMillis = now + trialDays * 24 * 60 * 60 * 1000;
    finalExpiresAt = new Date(finalExpiresAtMillis).toISOString();
  } else if (daysToAdd && daysToAdd > 0) {
    const baseMillis = existing?.subscriptionExpiresAtMillis && existing.subscriptionExpiresAtMillis > now
      ? existing.subscriptionExpiresAtMillis
      : now;
    finalExpiresAtMillis = baseMillis + daysToAdd * 24 * 60 * 60 * 1000;
    finalExpiresAt = new Date(finalExpiresAtMillis).toISOString();
  } else if (subscriptionStatus === 'expired') {
    finalExpiresAtMillis = now - 1000;
    finalExpiresAt = new Date(finalExpiresAtMillis).toISOString();
  } else {
    finalExpiresAtMillis = now + 30 * 24 * 60 * 60 * 1000;
    finalExpiresAt = new Date(finalExpiresAtMillis).toISOString();
  }

  const updatePayload: any = {
    subscriptionStatus,
    subscriptionExpiresAt: finalExpiresAt,
    subscriptionExpiresAtMillis: finalExpiresAtMillis,
    status: subscriptionStatus === 'expired' ? 'active' : 'active',
  };

  if (trialDays && trialDays > 0) {
    updatePayload.trialDays = trialDays;
  }

  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'users', uid), updatePayload);
    } catch (e) {
      console.error('Firestore updateUserSubscription failed:', e);
    }
  }

  const updatedList = list.map((u) => {
    if (u.uid === uid) {
      return { ...u, ...updatePayload };
    }
    return u;
  });
  setLocal(STORAGE_KEYS.users, updatedList);

  // إرسال إشعار فوري في الوقت الحقيقي للصيدلية
  try {
    const notifTitle = subscriptionStatus === 'active'
      ? 'تم تفعيل / تجديد اشتراك صيدليتكم بنجاح 🎉'
      : subscriptionStatus === 'trial'
      ? 'تم تمديد فترتكم التجريبية'
      : 'إشعار بانتهاء فترة الاشتراك';

    const notifMsg = customNote || (
      subscriptionStatus === 'active'
        ? `تم تفعيل اشتراك صيدليتكم حتى تاريخ ${formatGregorianDate(finalExpiresAt)}. استمتع بمقارنة كافة الأسعار وتوليد الطلبيات.`
        : subscriptionStatus === 'trial'
        ? `تم تمديد فترتك التجريبية حتى ${formatGregorianDate(finalExpiresAt)}.`
        : 'انتهت فترة اشتراكك في المنصة. يمكنك التجديد الآن لمواصلة أسعار فارما لينك المستودعات.'
    );

    await createNotification({
      userId: uid,
      title: notifTitle,
      message: notifMsg,
      type: 'status_change',
      metadata: {
        newSubscriptionStatus: subscriptionStatus,
        expiresAt: finalExpiresAt,
        senderName: 'إدارة المنصة',
        priority: subscriptionStatus === 'active' ? 'high' : 'normal'
      }
    });
  } catch (err) {
    console.warn('Failed to send subscription update notification:', err);
  }
}

export async function deleteUser(uid: string): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e) {
      console.error('Firestore deleteUser failed:', e);
    }
  }

  const list = getLocal<UserProfile>(STORAGE_KEYS.users).filter((u) => u.uid !== uid);
  setLocal(STORAGE_KEYS.users, list);
}

// ======================= Notifications =======================
export async function getNotifications(userId: string, accountCreatedAt?: string): Promise<AppNotification[]> {
  if (isFirebaseConfigured) {
    try {
      const targetIds = userId ? [userId, 'all'] : ['all'];
      const q = query(
        collection(db, 'notifications'),
        where('userId', 'in', targetIds)
      );
      const snap = await getDocs(q);
      const cutoff = accountCreatedAt ? new Date(accountCreatedAt).getTime() : 0;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification)).filter((n) => !cutoff || new Date(n.createdAt).getTime() >= cutoff);
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    } catch (e) {
      console.warn('Firestore fallback for notifications:', e);
    }
  }

  const local = getLocal<AppNotification>(STORAGE_KEYS.notifications);
  const cutoff = accountCreatedAt ? new Date(accountCreatedAt).getTime() : 0;
  const filtered = local.filter((n) => (n.userId === userId || n.userId === 'all') && (!cutoff || new Date(n.createdAt).getTime() >= cutoff));
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}

export async function createNotification(
  item: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & {
    id?: string;
    read?: boolean;
    createdAt?: string
  }
): Promise<AppNotification> {
  const id = item.id || 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const newNotif: AppNotification = {
    ...item,
    id,
    read: item.read ?? false,
    createdAt: item.createdAt || new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'notifications', id), newNotif);
    } catch (e) {
      console.error('Firestore createNotification error:', e);
      try {
        handleFirestoreError(e, OperationType.CREATE, `notifications/${id}`);
      } catch {
        // preserve flow for caller
      }
    }
  }

  // حفظ محلياً
  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications);
  list.unshift(newNotif);
  setLocal(STORAGE_KEYS.notifications, list);

  // إشعار فوري لجميع النوافذ والمكونات
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }



  return newNotif;
}

export async function markNotificationAsRead(id: string, userId?: string): Promise<void> {
  if (isFirebaseConfigured && userId) {
    try {
      const readRef = doc(db, 'notification_reads', `${userId}_${id}`);
      await setDoc(readRef, { uid: userId, notifId: id, readAt: new Date().toISOString(), shownCount: 1 }, { merge: true });
    } catch (e) {
      console.error('Firestore markNotificationAsRead error:', e);
    }
  }

  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications).map((n) => {
    if (n.id === id && n.userId !== 'all') {
      return { ...n, read: true };
    }
    return n;
  });
  setLocal(STORAGE_KEYS.notifications, list);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications);
  const idsToUpdate: string[] = [];

  const updated = list.map((n) => {
    if ((n.userId === userId || n.userId === 'all') && !n.read) {
      idsToUpdate.push(n.id);
      return n.userId === 'all' ? n : { ...n, read: true };
    }
    return n;
  });
  setLocal(STORAGE_KEYS.notifications, updated);

  if (isFirebaseConfigured && idsToUpdate.length > 0) {
    try {
      const readAt = new Date().toISOString();
      await Promise.all(idsToUpdate.map((id) => setDoc(
        doc(db, 'notification_reads', `${userId}_${id}`),
        { uid: userId, notifId: id, readAt, shownCount: 1 },
        { merge: true },
      )));
    } catch (e) {
      console.error('Firestore markAllNotificationsAsRead batch error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

export async function deleteNotification(id: string): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.error('Firestore deleteNotification error:', e);
    }
  }

  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications).filter((n) => n.id !== id);
  setLocal(STORAGE_KEYS.notifications, list);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

export function subscribeToNotifications(userId: string, callback: (notifications: AppNotification[]) => void, accountCreatedAt?: string): () => void {
  let unsubFirestore: (() => void) | null = null;
  let disposed = false;
  const cutoff = accountCreatedAt ? new Date(accountCreatedAt).getTime() : 0;
  const emit = async (remoteList: AppNotification[]) => {
    const filtered = remoteList.filter((n) => (n.userId === userId || n.userId === 'all') && (!cutoff || new Date(n.createdAt).getTime() >= cutoff));
    let readIds = new Set<string>();
    if (isFirebaseConfigured && userId) {
      try {
        const reads = await getDocs(query(collection(db, 'notification_reads'), where('uid', '==', userId)));
        readIds = new Set(reads.docs.map((d) => String((d.data() as any).notifId)));
      } catch (_) {}
    }
    const finalList = filtered.map((n) => readIds.has(n.id) ? { ...n, read: true } : n);
    finalList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!disposed) callback(finalList);
  };
  if (isFirebaseConfigured) {
    try {
      const q = query(collection(db, 'notifications'), where('userId', 'in', userId ? [userId, 'all'] : ['all']));
      unsubFirestore = onSnapshot(q, (snapshot) => {
        const remote = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        void emit(remote);
        const local = getLocal<AppNotification>(STORAGE_KEYS.notifications).filter((n) => !cutoff || new Date(n.createdAt).getTime() >= cutoff);
        setLocal(STORAGE_KEYS.notifications, [...remote, ...local.filter((n) => !remote.some((r) => r.id === n.id))]);
      }, (error) => console.warn('Firestore notification listener:', error));
    } catch (err) { console.warn('Failed to initialize notifications:', err); }
  }
  const notifyFromLocal = () => {
    const local = getLocal<AppNotification>(STORAGE_KEYS.notifications).filter((n) => (n.userId === userId || n.userId === 'all') && (!cutoff || new Date(n.createdAt).getTime() >= cutoff));
    void emit(local);
  };
  notifyFromLocal();
  if (typeof window !== 'undefined') window.addEventListener('pharma_notifications_updated', notifyFromLocal);
  return () => { disposed = true; unsubFirestore?.(); if (typeof window !== 'undefined') window.removeEventListener('pharma_notifications_updated', notifyFromLocal); };
}

// ======================= Reset & Re-Seed Functions =======================
export async function seedDatabase(): Promise<void> {
  // كتابة البيانات الأولية
  const ings = SEED_ACTIVE_INGREDIENTS.map((i) => ({ ...i, createdAt: new Date().toISOString() }));
  const sups = SEED_SUPPLIERS.map((s) => ({ ...s, createdAt: new Date().toISOString() }));

  setLocal(STORAGE_KEYS.activeIngredients, ings);
  setLocal(STORAGE_KEYS.products, SEED_PRODUCTS);
  setLocal(STORAGE_KEYS.suppliers, sups);
  setLocal(STORAGE_KEYS.prices, SEED_PRICES);

  if (isFirebaseConfigured) {
    try {
      const batch = writeBatch(db);
      ings.forEach((i) => batch.set(doc(db, 'activeIngredients', i.id), i));
      sups.forEach((s) => batch.set(doc(db, 'suppliers', s.id), s));
      SEED_PRODUCTS.forEach((p) => batch.set(doc(db, 'products', p.id), p));
      SEED_PRICES.forEach((pr) => batch.set(doc(db, 'prices', `${pr.supplierId}_${pr.productId}`), pr));
      await batch.commit();
    } catch (e) {
      console.error('Firestore seed error:', e);
    }
  }
}

export async function clearDatabase(): Promise<void> {
  setLocal(STORAGE_KEYS.activeIngredients, []);
  setLocal(STORAGE_KEYS.products, []);
  setLocal(STORAGE_KEYS.suppliers, []);
  setLocal(STORAGE_KEYS.prices, []);
  setLocal(STORAGE_KEYS.priceHistory, []);
  setLocal(STORAGE_KEYS.importBatches, []);
  setLocal(STORAGE_KEYS.orders, []);
}
