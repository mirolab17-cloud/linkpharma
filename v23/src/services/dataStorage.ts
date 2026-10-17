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
  OrderStatus,
  UserProfile,
  AppNotification,
  SystemSettings,
  RecurringOrderTemplate
} from '../types';
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

export function invalidateCache(keys?: string[]): void {
  if (!keys || keys.length === 0) {
    memoryCache.clear();
  } else {
    keys.forEach((k) => {
      for (const cacheKey of memoryCache.keys()) {
        if (cacheKey === k || cacheKey.startsWith(`${k}_`)) {
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
  return fetchWithCache('activeIngredients', async () => {
    if (isFirebaseConfigured) {
      try {
        const snap = await getDocs(collection(db, 'activeIngredients'));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActiveIngredient));
      } catch (e) {
        console.warn('Firestore fallback to local for activeIngredients:', e);
      }
    }
    return getLocal<ActiveIngredient>(STORAGE_KEYS.activeIngredients);
  });
}

export async function saveActiveIngredient(item: Omit<ActiveIngredient, 'id'> & { id?: string }): Promise<ActiveIngredient> {
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
  return newItem;
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
    }
  }

  const list = getLocal<ActiveIngredient>(STORAGE_KEYS.activeIngredients).filter(
    (item) => !ids.includes(item.id)
  );
  setLocal(STORAGE_KEYS.activeIngredients, list);
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
  const all = await getProducts();
  const offset = typeof cursor === 'number' ? cursor : 0;
  const items = all.slice(offset, offset + safeSize);
  return { items, cursor: offset + items.length, hasMore: offset + items.length < all.length };
}

export async function getPricesForProductIds(
  productIds: string[],
  allowedSupplierIds?: string[],
  includeHidden = false
): Promise<PriceRecord[]> {
  if (!productIds.length) return [];
  if (isFirebaseConfigured) {
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < productIds.length; i += 10) chunks.push(productIds.slice(i, i + 10));
      const snapshots = await Promise.all(
        chunks.map((chunk) => getDocs(query(collection(db, 'prices'), where('productId', 'in', chunk))))
      );
      const allowed = allowedSupplierIds?.length ? new Set(allowedSupplierIds) : null;
      const rows = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceRecord)))
        .filter((row) => !allowed || allowed.has(row.supplierId));
      return includeHidden ? rows : filterVisiblePrices(rows);
    } catch (e) {
      console.warn('Firestore paged prices unavailable; using cached fallback:', (e as any)?.code || 'unknown');
    }
  }
  const allowed = allowedSupplierIds?.length ? new Set(allowedSupplierIds) : null;
  return getLocal<PriceRecord>(STORAGE_KEYS.prices)
    .filter((row) => productIds.includes(row.productId) && (!allowed || allowed.has(row.supplierId)))
    .filter((row) => includeHidden || !row.hidden);
}

export async function getProducts(): Promise<Product[]> {
  return fetchWithCache('products', async () => {
    if (isFirebaseConfigured) {
      try {
        const snap = await getDocs(collection(db, 'products'));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      } catch (e) {
        console.warn('Firestore fallback to local for products:', e);
      }
    }
    return getLocal<Product>(STORAGE_KEYS.products);
  });
}

export async function saveProduct(item: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
  invalidateCache(['products', 'prices']);
  const id = item.id || 'prod_' + Date.now();
  const newItem: Product = {
    ...item,
    id,
    createdAt: item.createdAt || new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'products', id), newItem);
    } catch (e) {
      console.error('Firestore saveProduct failed:', e);
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
  return newItem;
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
    }
  }

  const list = getLocal<Product>(STORAGE_KEYS.products).filter((p) => !ids.includes(p.id));
  setLocal(STORAGE_KEYS.products, list);
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
    }
  }

  const list = getLocal<Product>(STORAGE_KEYS.products).map((p) => {
    if (ids.includes(p.id)) {
      return { ...p, category: newCategory };
    }
    return p;
  });
  setLocal(STORAGE_KEYS.products, list);
}

// ======================= Suppliers =======================
export async function getSuppliers(): Promise<Supplier[]> {
  return fetchWithCache('suppliers', async () => {
    if (isFirebaseConfigured) {
      try {
        const snap = await getDocs(collection(db, 'suppliers'));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier));
      } catch (e) {
        console.warn('Firestore fallback to local for suppliers:', e);
      }
    }
    return getLocal<Supplier>(STORAGE_KEYS.suppliers);
  });
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
  return newItem;
}

export async function deleteSupplier(id: string): Promise<void> {
  invalidateCache(['suppliers', 'prices']);
  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (e) {
      console.error('Firestore deleteSupplier failed:', e);
    }
  }

  const list = getLocal<Supplier>(STORAGE_KEYS.suppliers).filter((s) => s.id !== id);
  setLocal(STORAGE_KEYS.suppliers, list);
}

// ======================= Prices & Import Batches =======================
export async function getPrices(allowedSupplierIds?: string[], includeHidden = false): Promise<PriceRecord[]> {
  const cacheKey = `${allowedSupplierIds && allowedSupplierIds.length > 0
    ? `prices_${[...allowedSupplierIds].sort().join(',')}`
    : 'prices_all'}${includeHidden ? '_with_hidden' : ''}`;

  return fetchWithCache(cacheKey, async () => {
    if (isFirebaseConfigured) {
      try {
        if (allowedSupplierIds && allowedSupplierIds.length > 0) {
          // تقسيم الموردين لدفعات 10 كحد أقصى لتوافق استعلامات Firestore 'in'
          const chunks: string[][] = [];
          for (let i = 0; i < allowedSupplierIds.length; i += 10) {
            chunks.push(allowedSupplierIds.slice(i, i + 10));
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
        console.warn('Firestore fallback to local for prices:', e);
      }
    }

    const allLocal = getLocal<PriceRecord>(STORAGE_KEYS.prices);
    if (allowedSupplierIds && allowedSupplierIds.length > 0) {
      const allowedSet = new Set(allowedSupplierIds);
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
  priceRecords: {
    productId: string;
    price: number;
    publicPrice?: number;
    available?: boolean;
    expiry?: string;
  }[];
}): Promise<{ batchId: string; updatedCount: number; newCount: number }> {
  const { supplierId, fileName, createdBy, priceRecords } = params;
  const batchId = 'batch_' + Date.now();
  const now = new Date().toISOString();

  // منع معالجة الصنف نفسه أكثر من مرة في الدفعة؛ آخر صف صالح لنفس الصنف هو المعتمد.
  const deduped = new Map<string, typeof priceRecords[number]>();
  for (const rec of priceRecords) {
    if (!rec.productId || !Number.isFinite(rec.price) || rec.price <= 0) continue;
    deduped.set(rec.productId, rec);
  }
  const uniquePriceRecords = [...deduped.values()];
  if (uniquePriceRecords.length === 0) throw new Error('لا توجد سجلات أسعار صالحة للاعتماد.');

  const currentPrices = getLocal<PriceRecord>(STORAGE_KEYS.prices);
  const currentHistory = getLocal<PriceHistory>(STORAGE_KEYS.priceHistory);

  let updatedCount = 0;
  let newCount = 0;

  const newHistoryRecords: PriceHistory[] = [];

  // إعداد سجلات الأسعار الجديدة وتحديث الموجود
  uniquePriceRecords.forEach((rec) => {
    const recordId = `${supplierId}_${rec.productId}`;
    const existingIndex = currentPrices.findIndex(
      (p) => p.supplierId === supplierId && p.productId === rec.productId
    );

    // تسجيل في التاريخ قبل التعديل إن كان موجوداً
    if (existingIndex > -1) {
      const existing = currentPrices[existingIndex];
      newHistoryRecords.push({
        id: 'hist_' + Math.random().toString(36).substring(2, 9),
        productId: existing.productId,
        supplierId: existing.supplierId,
        price: existing.price,
        publicPrice: existing.publicPrice,
        available: existing.available,
        importedAt: existing.updatedAt || now,
        importBatchId: batchId,
      });

      currentPrices[existingIndex] = {
        id: recordId,
        productId: rec.productId,
        supplierId,
        price: rec.price,
        publicPrice: rec.publicPrice,
        available: rec.available ?? true,
        expiry: rec.expiry,
        updatedAt: now,
      };
      updatedCount++;
    } else {
      currentPrices.push({
        id: recordId,
        productId: rec.productId,
        supplierId,
        price: rec.price,
        publicPrice: rec.publicPrice,
        available: rec.available ?? true,
        expiry: rec.expiry,
        updatedAt: now,
      });
      newCount++;
    }
  });

  const importBatch: ImportBatch = {
    id: batchId,
    supplierId,
    fileName,
    rowsCount: uniquePriceRecords.length,
    createdBy,
    createdAt: now,
  };

  // حفظ محلياً
  setLocal(STORAGE_KEYS.prices, currentPrices);
  setLocal(STORAGE_KEYS.priceHistory, [...currentHistory, ...newHistoryRecords]);
  const batches = getLocal<ImportBatch>(STORAGE_KEYS.importBatches);
  batches.unshift(importBatch);
  setLocal(STORAGE_KEYS.importBatches, batches);

  // تحديث تاريخ آخر تعديل للمورد
  const suppliers = getLocal<Supplier>(STORAGE_KEYS.suppliers);
  const supIndex = suppliers.findIndex((s) => s.id === supplierId);
  if (supIndex > -1) {
    suppliers[supIndex].lastPriceUpdate = now;
    setLocal(STORAGE_KEYS.suppliers, suppliers);
  }

  invalidateCache(['prices', 'suppliers']);

  // فحص تنبيهات الأسعار الفورية للصيادلة المشتركين وإرسال إشعارات لمن وصل سعره المستهدف
  try {
    const allUsers = getLocal<UserProfile>(STORAGE_KEYS.users);
    const allProducts = getLocal<Product>(STORAGE_KEYS.products);
    const prodMap = new Map<string, Product>();
    allProducts.forEach((p) => prodMap.set(p.id, p));

    const currentSupplierName = suppliers.find((s) => s.id === supplierId)?.name || 'مورد معتمد';

    allUsers.forEach((u) => {
      if (!u.priceAlerts || Object.keys(u.priceAlerts).length === 0) return;
      // التحقق مما إذا كان المورد مسموحاً لهذه الصيدلية
      if (u.allowedSuppliers && u.allowedSuppliers.length > 0 && !u.allowedSuppliers.includes(supplierId)) {
        return;
      }

      priceRecords.forEach((rec) => {
        const targetPrice = u.priceAlerts?.[rec.productId];
        if (targetPrice !== undefined && rec.price <= targetPrice && (rec.available ?? true)) {
          const prod = prodMap.get(rec.productId);
          const prodName = prod ? prod.tradeName : 'الصنف المفضل';

          createNotification({
            userId: u.uid,
            title: `🎯 تنبيه انخفاض سعر: ${prodName}`,
            message: `توفر دواء "${prodName}" بسعر ${formatCurrency(rec.price)} لدى (${currentSupplierName})، وهو أقل من أو يساوي سعرك المستهدف (${formatCurrency(targetPrice)})!`,
            type: 'price_alert',
            metadata: {
              productId: rec.productId,
              supplierId,
              newPrice: rec.price,
              targetPrice,
              actionUrl: `/app/prices?q=${encodeURIComponent(prodName)}`,
            },
          }).catch((err) => console.warn('Could not create price alert notification:', err));
        }
      });
    });
  } catch (alertErr) {
    console.warn('Error checking price alerts during import:', alertErr);
  }

  // التخزين في Firestore إن كان مهيأً مع دفعات بحد أقصى 400 عملية
  if (isFirebaseConfigured) {
    try {
      // 1) كتابة importBatch
      await setDoc(doc(db, 'importBatches', batchId), importBatch);
      // 2) تحديث المورد
      await updateDoc(doc(db, 'suppliers', supplierId), { lastPriceUpdate: now });

      // 3) تقسيم كتابة الأسعار إلى حزم (حتى 400 عملية لكل دفعة حسب متطلبات Firestore)
      const CHUNK_SIZE = 400;
      for (let i = 0; i < priceRecords.length; i += CHUNK_SIZE) {
        const chunk = priceRecords.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((rec) => {
          const docId = `${supplierId}_${rec.productId}`;
          batch.set(doc(db, 'prices', docId), {
            productId: rec.productId,
            supplierId,
            price: rec.price,
            publicPrice: rec.publicPrice || null,
            available: rec.available ?? true,
            expiry: rec.expiry || null,
            updatedAt: now,
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.error('Firestore commitImportBatch error:', e);
    }
  }

  return { batchId, updatedCount, newCount };
}

// التراجع عن دفعة استيراد سابقة
export async function rollbackImportBatch(batchId: string): Promise<boolean> {
  const batches = getLocal<ImportBatch>(STORAGE_KEYS.importBatches);
  const targetBatch = batches.find((b) => b.id === batchId);
  if (!targetBatch) return false;

  const currentPrices = getLocal<PriceRecord>(STORAGE_KEYS.prices);
  const histories = getLocal<PriceHistory>(STORAGE_KEYS.priceHistory);

  const batchHistory = histories.filter((h) => h.importBatchId === batchId);

  // استرجاع الأسعار القديمة
  batchHistory.forEach((hist) => {
    const idx = currentPrices.findIndex(
      (p) => p.supplierId === hist.supplierId && p.productId === hist.productId
    );
    if (idx > -1) {
      currentPrices[idx].price = hist.price;
      currentPrices[idx].publicPrice = hist.publicPrice;
      currentPrices[idx].updatedAt = hist.importedAt;
    }
  });

  setLocal(STORAGE_KEYS.prices, currentPrices);
  // حذف الدفعة من القائمة
  setLocal(
    STORAGE_KEYS.importBatches,
    batches.filter((b) => b.id !== batchId)
  );

  return true;
}

export async function getImportBatches(): Promise<ImportBatch[]> {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(collection(db, 'importBatches'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImportBatch));
    } catch (e) {
      console.warn('Firestore fallback for importBatches:', e);
    }
  }
  return getLocal<ImportBatch>(STORAGE_KEYS.importBatches);
}

export async function getPriceHistory(productId?: string): Promise<PriceHistory[]> {
  const localHistory = getLocal<PriceHistory>(STORAGE_KEYS.priceHistory);
  if (productId) {
    return localHistory.filter((h) => h.productId === productId);
  }
  return localHistory;
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
  const newOrder: Order = {
    ...orderData,
    id,
    createdAt,
    statusHistory: [{ status: orderData.status, changedAt: createdAt, changedBy: orderData.pharmacyId }],
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'orders', id), newOrder);
    } catch (e) {
      console.error('Firestore createOrder failed:', e);
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

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const list = getLocal<Order>(STORAGE_KEYS.orders);
  const targetOrder = list.find((o) => o.id === orderId);

  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('Firestore updateOrderStatus failed:', e);
    }
  }

  const changedAt = new Date().toISOString();
  const updatedList = list.map((o) => {
    if (o.id === orderId) {
      return { ...o, status, updatedAt: changedAt, statusHistory: [...(o.statusHistory || []), { status, changedAt, changedBy: auth.currentUser?.uid }] };
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

  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'users', uid), updatePayload);
    } catch (e) {
      console.error('Firestore updateUserStatus failed:', e);
    }
  }

  const list = getLocal<UserProfile>(STORAGE_KEYS.users).map((u) => {
    if (u.uid === uid) {
      return { ...u, ...updatePayload };
    }
    return u;
  });
  setLocal(STORAGE_KEYS.users, list);

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

export async function getSystemSettings(): Promise<SystemSettings> {
  return fetchWithCache('systemSettings', async () => {
    const fallbackSettings: SystemSettings = {
      id: 'system', defaultTrialDays: 7, currency: '₪', supportWhatsApp: '970599999999',
      loginWhatsApp: '970599999999', loginWhatsAppEnabled: true, showDeliveryDays: true,
      warehouseSupportWhatsApp: '966552223344', updatedAt: new Date().toISOString(),
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
        await setDoc(doc(db, 'settings', 'public'), { loginWhatsApp: updated.loginWhatsApp || updated.supportWhatsApp || '970599999999', loginWhatsAppEnabled: updated.loginWhatsAppEnabled !== false, showDeliveryDays: updated.showDeliveryDays !== false, currency: '₪', platformName: updated.platformName || 'فارما لينك', supportWhatsApp: updated.supportWhatsApp || updated.loginWhatsApp || '970599999999' }, { merge: true });
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
  if (isFirebaseConfigured) {
    try {
      const notifSnap = await getDoc(doc(db, 'notifications', id));
      const owner = notifSnap.exists() ? (notifSnap.data() as any).userId : userId;
      if (owner === 'all' && userId) {
        const readRef = doc(db, 'notification_reads', `${userId}_${id}`);
        await setDoc(readRef, { uid: userId, notifId: id, readAt: new Date().toISOString(), shownCount: 1 }, { merge: true });
      } else {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      }
    } catch (e) {
      console.error('Firestore markNotificationAsRead error:', e);
    }
  }

  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications).map((n) => {
    if (n.id === id || (userId && n.userId === 'all')) {
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
      return { ...n, read: true };
    }
    return n;
  });
  setLocal(STORAGE_KEYS.notifications, updated);

  if (isFirebaseConfigured && idsToUpdate.length > 0) {
    try {
      const all = getLocal<AppNotification>(STORAGE_KEYS.notifications);
      await Promise.all(idsToUpdate.map(async (id) => {
        const notif = all.find((n) => n.id === id);
        if (notif?.userId === 'all') {
          await setDoc(doc(db, 'notification_reads', `${userId}_${id}`), { uid: userId, notifId: id, readAt: new Date().toISOString(), shownCount: 1 }, { merge: true });
        } else {
          await updateDoc(doc(db, 'notifications', id), { read: true });
        }
      }));
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
