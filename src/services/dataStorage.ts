// src/services/dataStorage.ts
import { 
  db, 
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
  where
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
  RecurringOrderTemplate,
  NotificationSettings,
  UserNotificationRead
} from '../types';
import { 
  SEED_ACTIVE_INGREDIENTS, 
  SEED_PRODUCTS, 
  SEED_SUPPLIERS, 
  SEED_PRICES 
} from './seed';
import { setSystemCurrency, formatCurrency } from '../utils/formatPrice';
import { formatGregorianDate } from '../utils/formatDate';
import { sendPush, cancelScheduledPush } from './push';
import { useAuthStore } from '../store/useAuthStore';

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
  notificationSettings: 'pharma_db_notification_settings',
  notificationReads: 'pharma_db_notification_reads',
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
        title: 'مرحباً بكم في منصة مقارنة أسعار الأدوية',
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
export async function getPrices(allowedSupplierIds?: string[]): Promise<PriceRecord[]> {
  const cacheKey = allowedSupplierIds && allowedSupplierIds.length > 0
    ? `prices_${[...allowedSupplierIds].sort().join(',')}`
    : 'prices_all';

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
          return results;
        }

        const snap = await getDocs(collection(db, 'prices'));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceRecord));
      } catch (e) {
        console.warn('Firestore fallback to local for prices:', e);
      }
    }

    const allLocal = getLocal<PriceRecord>(STORAGE_KEYS.prices);
    if (allowedSupplierIds && allowedSupplierIds.length > 0) {
      const allowedSet = new Set(allowedSupplierIds);
      return allLocal.filter((p) => allowedSet.has(p.supplierId));
    }
    return allLocal;
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

  const currentPrices = getLocal<PriceRecord>(STORAGE_KEYS.prices);
  const currentHistory = getLocal<PriceHistory>(STORAGE_KEYS.priceHistory);

  let updatedCount = 0;
  let newCount = 0;

  const newHistoryRecords: PriceHistory[] = [];

  // إعداد سجلات الأسعار الجديدة وتحديث الموجود
  priceRecords.forEach((rec) => {
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
    rowsCount: priceRecords.length,
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
      const snap = await getDocs(collection(db, 'orders'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
    } catch (e) {
      console.warn('Firestore fallback for orders:', e);
    }
  }
  return getLocal<Order>(STORAGE_KEYS.orders);
}

export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt'>): Promise<Order> {
  const id = 'ord_' + Date.now();
  const newOrder: Order = {
    ...orderData,
    id,
    createdAt: new Date().toISOString(),
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

  const updatedList = list.map((o) => {
    if (o.id === orderId) {
      return { ...o, status, updatedAt: new Date().toISOString() };
    }
    return o;
  });
  setLocal(STORAGE_KEYS.orders, updatedList);

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

// إعدادات النظام العامة (الفترة التجريبية وغيرها)
export async function getSystemSettings(): Promise<SystemSettings> {
  const fallbackSettings: SystemSettings = {
    id: 'system',
    defaultTrialDays: 7,
    supportWhatsApp: '966501234567',
    warehouseSupportWhatsApp: '966552223344',
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      const user = useAuthStore.getState().user;
      const isAdminUser = user?.role === 'admin';
      const targetDoc = isAdminUser ? 'system' : 'public';
      const snap = await getDoc(doc(db, 'settings', targetDoc)).catch(() => null);
      if (snap && snap.exists()) {
        const data = snap.data() as SystemSettings;
        const merged: SystemSettings = {
          ...fallbackSettings,
          ...data,
        };
        try {
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(merged));
        } catch (_) {}
        return merged;
      }
    } catch (e) {
      console.warn('Firestore getSystemSettings failed, using fallback:', e);
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.defaultTrialDays === 'number') {
        return {
          ...fallbackSettings,
          ...parsed,
        };
      }
    }
  } catch (_) {}

  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(fallbackSettings));
  } catch (_) {}
  return fallbackSettings;
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
      // 1. المستند الحساس للإدارة (settings/system)
      await setDoc(doc(db, 'settings', 'system'), updated, { merge: true });

      // 2. المستند العام لجميع المستخدمين (settings/public) مجرد من adminEmails
      const publicPayload: Record<string, any> = {
        defaultTrialDays: updated.defaultTrialDays ?? 7,
        updatedAt: updated.updatedAt,
      };
      if (updated.currency) publicPayload.currency = updated.currency;
      if (updated.supportWhatsApp) publicPayload.supportWhatsApp = updated.supportWhatsApp;
      if (updated.warehouseSupportWhatsApp) publicPayload.warehouseSupportWhatsApp = updated.warehouseSupportWhatsApp;

      await setDoc(doc(db, 'settings', 'public'), publicPayload, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'settings/system');
    }
  }

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
        : 'انتهت فترة اشتراكك في المنصة. يمكنك التجديد الآن لمواصلة مقارنة أسعار المستودعات.'
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
export async function getNotifications(userId: string): Promise<AppNotification[]> {
  if (isFirebaseConfigured) {
    try {
      const targetIds = userId ? [userId, 'all'] : ['all'];
      const q = query(
        collection(db, 'notifications'),
        where('userId', 'in', targetIds)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    } catch (e) {
      console.warn('Firestore fallback for notifications:', e);
    }
  }

  const local = getLocal<AppNotification>(STORAGE_KEYS.notifications);
  const filtered = local.filter((n) => n.userId === userId || n.userId === 'all');
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}

// ======================= Notification Settings & Defaults =======================
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  ticker: {
    enabled: true,
    visibleCount: 3,
    intervalSeconds: 6,
    maxItems: 10,
    style: 'cards',
    pauseOnHover: true,
  },
  modal: {
    cooldownMinutes: 30,
    maxPerSession: 1,
  },
  toast: {
    enabled: true,
    maxVisible: 3,
  },
  push: {
    defaultUrl: '/app/prices',
    defaultIcon: 'pwa-192x192.png',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },
  },
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'notifications'));
      if (snap.exists()) {
        const data = snap.data() as Partial<NotificationSettings>;
        return {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...data,
          ticker: { ...DEFAULT_NOTIFICATION_SETTINGS.ticker, ...(data.ticker || {}) },
          modal: { ...DEFAULT_NOTIFICATION_SETTINGS.modal, ...(data.modal || {}) },
          toast: { ...DEFAULT_NOTIFICATION_SETTINGS.toast, ...(data.toast || {}) },
          push: { ...DEFAULT_NOTIFICATION_SETTINGS.push, ...(data.push || {}) },
        };
      }
    } catch (err) {
      console.warn('Failed to load notification settings from Firestore:', err);
    }
  }

  const saved = localStorage.getItem(STORAGE_KEYS.notificationSettings);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {}
  }
  return DEFAULT_NOTIFICATION_SETTINGS;
}

export async function updateNotificationSettings(settings: NotificationSettings): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'settings', 'notifications'), settings, { merge: true });
    } catch (err) {
      console.error('Failed to update notification settings:', err);
    }
  }
  localStorage.setItem(STORAGE_KEYS.notificationSettings, JSON.stringify(settings));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notification_settings_updated', { detail: settings }));
  }
}

export function subscribeToNotificationSettings(
  callback: (settings: NotificationSettings) => void
): () => void {
  let unsub: (() => void) | null = null;

  if (isFirebaseConfigured) {
    try {
      unsub = onSnapshot(doc(db, 'settings', 'notifications'), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<NotificationSettings>;
          const merged: NotificationSettings = {
            ...DEFAULT_NOTIFICATION_SETTINGS,
            ...data,
            ticker: { ...DEFAULT_NOTIFICATION_SETTINGS.ticker, ...(data.ticker || {}) },
            modal: { ...DEFAULT_NOTIFICATION_SETTINGS.modal, ...(data.modal || {}) },
            toast: { ...DEFAULT_NOTIFICATION_SETTINGS.toast, ...(data.toast || {}) },
            push: { ...DEFAULT_NOTIFICATION_SETTINGS.push, ...(data.push || {}) },
          };
          localStorage.setItem(STORAGE_KEYS.notificationSettings, JSON.stringify(merged));
          callback(merged);
        } else {
          callback(DEFAULT_NOTIFICATION_SETTINGS);
        }
      });
    } catch (err) {
      console.warn('subscribeToNotificationSettings snapshot error:', err);
    }
  }

  const onLocal = (e: any) => {
    if (e.detail) callback(e.detail);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pharma_notification_settings_updated', onLocal);
  }

  getNotificationSettings().then(callback).catch(() => callback(DEFAULT_NOTIFICATION_SETTINGS));

  return () => {
    if (unsub) unsub();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pharma_notification_settings_updated', onLocal);
    }
  };
}

// ======================= Notification CRUD & Operations =======================
export async function createNotification(
  item: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & { 
    id?: string; 
    read?: boolean; 
    createdAt?: string;
  }
): Promise<AppNotification> {
  const id = item.id || 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();
  
  // تحديد الحالة الافتراضية بناءً على الجدولة
  let status = item.status;
  if (!status) {
    if (item.scheduledAt && new Date(item.scheduledAt).getTime() > Date.now()) {
      status = 'scheduled';
    } else {
      status = 'sent';
    }
  }

  const newNotif: AppNotification = {
    ...item,
    id,
    userId: item.userId || 'all',
    type: item.type || 'system',
    priority: item.priority || 'normal',
    channels: item.channels && item.channels.length > 0 ? item.channels : ['inbox'],
    status,
    read: false,
    createdAt: item.createdAt || now,
    stats: item.stats || { recipients: 0, views: 0, clicks: 0, dismissals: 0 },
  };

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'notifications', id), newNotif);
    } catch (e) {
      console.error('Firestore createNotification error:', e);
      try {
        handleFirestoreError(e, OperationType.CREATE, `notifications/${id}`);
      } catch {}
    }
  }

  // حفظ محلياً
  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications);
  list.unshift(newNotif);
  setLocal(STORAGE_KEYS.notifications, list);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }

  // إرسال Push Notification إذا كانت القناة push وكان المستخدم أدمن
  if (newNotif.channels?.includes('push')) {
    try {
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.role === 'admin') {
        const baseUrl = 'https://mirolab17-cloud.github.io/linkpharma/#';
        let targetPath = newNotif.actionUrl || '/app/prices';
        if (!targetPath.startsWith('/')) targetPath = `/${targetPath}`;

        const fullUrl = `${baseUrl}${targetPath}`;
        const isUsers = newNotif.audience?.type === 'users' && (newNotif.audience.userIds?.length || 0) > 0;
        const externalIds = isUsers ? newNotif.audience?.userIds : (newNotif.userId && newNotif.userId !== 'all' ? [newNotif.userId] : undefined);

        sendPush({
          title: newNotif.title,
          message: newNotif.message,
          url: fullUrl,
          audience: externalIds && externalIds.length > 0 ? 'users' : 'all',
          externalIds,
          sendAfter: newNotif.scheduledAt,
          priority: newNotif.priority,
          image: newNotif.imageUrl,
        }).then((res) => {
          if (res?.ok && res.id) {
            updateNotification(id, { pushIds: [res.id] }).catch(() => {});
          }
        }).catch((pushErr) => {
          console.warn('sendPush background call caught:', pushErr);
        });
      }
    } catch (pushErr) {
      console.warn('sendPush error:', pushErr);
    }
  }

  return newNotif;
}

export async function updateNotification(
  id: string,
  updates: Partial<AppNotification>
): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'notifications', id), updates);
    } catch (e) {
      console.error('Firestore updateNotification error:', e);
    }
  }

  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications).map((n) => {
    if (n.id === id) {
      return { ...n, ...updates };
    }
    return n;
  });
  setLocal(STORAGE_KEYS.notifications, list);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

/**
 * تنظيف كاش الإشعارات وسجلات القراءة المحلية عند تبديل الحساب أو تسجيل الخروج
 */
export function clearNotificationCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.notificationReads);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('seen_notifs_') || key.startsWith('pharma_notification_reads'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (_) {}
}

/**
 * تحديد إشعار كمقروء لمستخدم محدد عبر collection منفصلة notification_reads حصراً
 */
export async function markNotificationAsRead(id: string, uid?: string): Promise<void> {
  const currentUid = uid || useAuthStore.getState().user?.uid;
  if (!currentUid) return;
  const now = new Date().toISOString();

  if (isFirebaseConfigured) {
    try {
      const readRef = doc(db, 'notification_reads', `${currentUid}_${id}`);
      await setDoc(readRef, {
        uid: currentUid,
        notifId: id,
        readAt: now,
      }, { merge: true });
    } catch (e) {
      console.error('Firestore markNotificationAsRead read_ref error:', e);
    }
  }

  // تحديث محلي لسجل القراءات
  const reads = getLocal<UserNotificationRead>(STORAGE_KEYS.notificationReads);
  const existingIdx = reads.findIndex((r) => r.uid === currentUid && r.notifId === id);
  if (existingIdx >= 0) {
    reads[existingIdx].readAt = now;
  } else {
    reads.push({ uid: currentUid, notifId: id, readAt: now });
  }
  setLocal(STORAGE_KEYS.notificationReads, reads);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

/**
 * تحديد كافة الإشعارات كمقروءة للمستخدم في notification_reads
 */
export async function markAllNotificationsAsRead(userId: string, notifIds?: string[]): Promise<void> {
  if (!userId) return;
  const now = new Date().toISOString();

  let targetIds = notifIds;
  if (!targetIds || targetIds.length === 0) {
    if (isFirebaseConfigured) {
      try {
        const snap = await getDocs(collection(db, 'notifications'));
        targetIds = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as AppNotification))
          .filter((n) => {
            if (n.userId === userId || n.userId === 'all' || !n.userId) return true;
            if (n.audience?.type === 'all') return true;
            if (n.audience?.type === 'users' && n.audience?.userIds?.includes(userId)) return true;
            return false;
          })
          .map((n) => n.id);
      } catch (e) {
        console.warn('Firestore fetch for markAllNotificationsAsRead fallback:', e);
      }
    }
  }

  if (!targetIds || targetIds.length === 0) {
    const notifs = getLocal<AppNotification>(STORAGE_KEYS.notifications);
    targetIds = notifs
      .filter((n) => n.userId === userId || n.userId === 'all' || !n.userId || n.audience?.type === 'all' || (n.audience?.userIds && n.audience.userIds.includes(userId)))
      .map((n) => n.id);
  }

  if (isFirebaseConfigured && targetIds.length > 0) {
    try {
      const batch = writeBatch(db);
      targetIds.forEach((nid) => {
        const readRef = doc(db, 'notification_reads', `${userId}_${nid}`);
        batch.set(readRef, {
          uid: userId,
          notifId: nid,
          readAt: now,
        }, { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.error('Firestore markAllNotificationsAsRead error:', e);
    }
  }

  const reads = getLocal<UserNotificationRead>(STORAGE_KEYS.notificationReads);
  targetIds.forEach((nid) => {
    const idx = reads.findIndex((r) => r.uid === userId && r.notifId === nid);
    if (idx >= 0) {
      reads[idx].readAt = now;
    } else {
      reads.push({ uid: userId, notifId: nid, readAt: now });
    }
  });
  setLocal(STORAGE_KEYS.notificationReads, reads);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

/**
 * تسجيل أحداث التفاعل مع الإشعار في notification_reads فقط بدون المساس بـ stats الإشعار العام
 */
export async function recordNotificationEvent(
  notifId: string,
  uid: string,
  event: 'view' | 'click' | 'dismiss'
): Promise<void> {
  if (!notifId || !uid) return;
  const now = new Date().toISOString();

  if (isFirebaseConfigured) {
    try {
      const readRef = doc(db, 'notification_reads', `${uid}_${notifId}`);
      const updateData: Record<string, any> = {
        uid,
        notifId,
      };

      if (event === 'view') {
        updateData.lastShownAt = now;
      } else if (event === 'click') {
        updateData.readAt = now;
      } else if (event === 'dismiss') {
        updateData.dismissed = true;
      }

      await setDoc(readRef, updateData, { merge: true });
    } catch (e) {
      console.warn('recordNotificationEvent error:', e);
    }
  }

  // تحديث محلي
  const reads = getLocal<UserNotificationRead>(STORAGE_KEYS.notificationReads);
  const idx = reads.findIndex((r) => r.uid === uid && r.notifId === notifId);
  const current = idx >= 0 ? reads[idx] : { uid, notifId };
  if (event === 'view') {
    current.shownCount = (current.shownCount || 0) + 1;
    current.lastShownAt = now;
  } else if (event === 'click') {
    current.readAt = now;
  } else if (event === 'dismiss') {
    current.dismissed = true;
  }
  if (idx >= 0) reads[idx] = current;
  else reads.push(current);
  setLocal(STORAGE_KEYS.notificationReads, reads);
}

/**
 * حذف الإشعار (إذا كان أدمن: حذف فعلي من السحابة؛ إذا كان مستخدم عادي: إخفاء dismissed فقط)
 */
export async function deleteNotification(
  id: string,
  uid?: string,
  isAdmin?: boolean
): Promise<void> {
  const currentUid = uid || useAuthStore.getState().user?.uid;

  if (isAdmin) {
    if (isFirebaseConfigured) {
      try {
        const notifDoc = await getDoc(doc(db, 'notifications', id)).catch(() => null);
        if (notifDoc && notifDoc.exists()) {
          const pushIds: string[] = notifDoc.data().pushIds || [];
          for (const pid of pushIds) {
            cancelScheduledPush(pid).catch(() => {});
          }
        }
        await deleteDoc(doc(db, 'notifications', id));
      } catch (e) {
        console.error('Firestore deleteNotification error:', e);
      }
    }

    const list = getLocal<AppNotification>(STORAGE_KEYS.notifications).filter((n) => n.id !== id);
    setLocal(STORAGE_KEYS.notifications, list);
  } else if (currentUid) {
    // إخفاء للمستخدم فقط دون التأثير على البقية
    await recordNotificationEvent(id, currentUid, 'dismiss');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma_notifications_updated'));
  }
}

/**
 * اشتراك ذكي يدمج مستندات الإشعارات مع حالة القراءة الخاصة بالمستخدم من notification_reads حصراً
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  isAdmin?: boolean
): () => void {
  let unsubNotifications: (() => void) | null = null;
  let unsubReads: (() => void) | null = null;

  let currentNotifs: AppNotification[] = [];
  const userReadsMap = new Map<string, UserNotificationRead>();

  const computeAndEmit = () => {
    const nowIso = new Date().toISOString();

    const merged = currentNotifs
      .map((notif) => {
        const readRecord = userReadsMap.get(notif.id);
        // حالة القراءة الوحيدة والمطلقة: وجود readAt في notification_reads لهذا المستخدم
        const isRead = Boolean(readRecord?.readAt);
        const isDismissed = Boolean(readRecord?.dismissed);
        const shownCount = readRecord?.shownCount || 0;
        const lastShownAt = readRecord?.lastShownAt;

        return {
          ...notif,
          read: isRead,
          dismissed: isDismissed,
          shownCount,
          lastShownAt,
        };
      })
      .filter((n) => {
        if (isAdmin) return true;
        // استبعاد المحذوف / المغلق
        if (n.dismissed) return false;
        // استبعاد المجدول الذي لم يحن وقته بعد
        if (n.scheduledAt && n.scheduledAt > nowIso) return false;
        // استبعاد المنتهي
        if (n.expiresAt && n.expiresAt <= nowIso) return false;
        // استبعاد غير المرسل إن وُجد حقل status
        if (n.status && n.status !== 'sent') return false;

        // مطابقة الجمهور
        if (n.userId === 'all' || !n.userId) return true;
        if (n.userId === userId) return true;
        if (n.audience) {
          if (n.audience.type === 'all') return true;
          if (n.audience.type === 'users' && n.audience.userIds?.includes(userId)) return true;
        }
        return false;
      });

    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(merged);
  };

  if (isFirebaseConfigured) {
    try {
      // الاستماع لمجموعة notifications
      const notifsCol = collection(db, 'notifications');
      unsubNotifications = onSnapshot(notifsCol, (snapshot) => {
        currentNotifs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        computeAndEmit();
      }, (err) => {
        console.warn('Firestore notifications snapshot error:', err);
      });

      // الاستماع لسجل قراءات المستخدم الحالي
      if (userId) {
        const qReads = query(collection(db, 'notification_reads'), where('uid', '==', userId));
        unsubReads = onSnapshot(qReads, (snapshot) => {
          userReadsMap.clear();
          snapshot.docs.forEach((d) => {
            const data = d.data() as UserNotificationRead;
            userReadsMap.set(data.notifId, data);
          });
          computeAndEmit();
        }, (err) => {
          console.warn('Firestore notification_reads snapshot error:', err);
        });
      }
    } catch (err) {
      console.warn('Failed to setup Firestore notification listeners:', err);
    }
  }

  // الاسترجاع المحلي الأولي والمزامنة
  const notifyFromLocal = () => {
    currentNotifs = getLocal<AppNotification>(STORAGE_KEYS.notifications);
    if (userId) {
      const localReads = getLocal<UserNotificationRead>(STORAGE_KEYS.notificationReads);
      userReadsMap.clear();
      localReads.filter((r) => r.uid === userId).forEach((r) => userReadsMap.set(r.notifId, r));
    }
    computeAndEmit();
  };

  notifyFromLocal();

  let onUpdateHandler: (() => void) | null = null;
  if (typeof window !== 'undefined') {
    onUpdateHandler = () => notifyFromLocal();
    window.addEventListener('pharma_notifications_updated', onUpdateHandler);
  }

  return () => {
    if (unsubNotifications) {
      unsubNotifications();
      unsubNotifications = null;
    }
    if (unsubReads) {
      unsubReads();
      unsubReads = null;
    }
    if (typeof window !== 'undefined' && onUpdateHandler) {
      window.removeEventListener('pharma_notifications_updated', onUpdateHandler);
    }
    userReadsMap.clear();
  };
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
