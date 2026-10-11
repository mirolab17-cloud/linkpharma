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
  UserProfile,
  AppNotification,
  SystemSettings
} from '../types';
import { 
  SEED_ACTIVE_INGREDIENTS, 
  SEED_PRODUCTS, 
  SEED_SUPPLIERS, 
  SEED_PRICES 
} from './seed';

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
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(collection(db, 'activeIngredients'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActiveIngredient));
    } catch (e) {
      console.warn('Firestore fallback to local for activeIngredients:', e);
    }
  }
  return getLocal<ActiveIngredient>(STORAGE_KEYS.activeIngredients);
}

export async function saveActiveIngredient(item: Omit<ActiveIngredient, 'id'> & { id?: string }): Promise<ActiveIngredient> {
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
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(collection(db, 'products'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
    } catch (e) {
      console.warn('Firestore fallback to local for products:', e);
    }
  }
  return getLocal<Product>(STORAGE_KEYS.products);
}

export async function saveProduct(item: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
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
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(collection(db, 'suppliers'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier));
    } catch (e) {
      console.warn('Firestore fallback to local for suppliers:', e);
    }
  }
  return getLocal<Supplier>(STORAGE_KEYS.suppliers);
}

export async function saveSupplier(item: Omit<Supplier, 'id'> & { id?: string }): Promise<Supplier> {
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
export async function getPrices(): Promise<PriceRecord[]> {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDocs(collection(db, 'prices'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceRecord));
    } catch (e) {
      console.warn('Firestore fallback to local for prices:', e);
    }
  }
  return getLocal<PriceRecord>(STORAGE_KEYS.prices);
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

export async function updateOrderStatus(orderId: string, status: 'sent' | 'confirmed' | 'cancelled'): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (e) {
      console.error('Firestore updateOrderStatus failed:', e);
    }
  }

  const list = getLocal<Order>(STORAGE_KEYS.orders).map((o) => {
    if (o.id === orderId) {
      return { ...o, status };
    }
    return o;
  });
  setLocal(STORAGE_KEYS.orders, list);
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
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'system'));
      if (snap.exists()) {
        const data = snap.data() as SystemSettings;
        try {
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data));
        } catch (_) {}
        return data;
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
        return parsed;
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
      await setDoc(doc(db, 'settings', 'system'), updated, { merge: true });
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
        ? `تم تفعيل اشتراك صيدليتكم حتى تاريخ ${new Date(finalExpiresAt).toLocaleDateString('ar-SA')}. استمتع بمقارنة كافة الأسعار وتوليد الطلبيات.`
        : subscriptionStatus === 'trial'
        ? `تم تمديد فترتك التجريبية حتى ${new Date(finalExpiresAt).toLocaleDateString('ar-SA')}.`
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

export async function markNotificationAsRead(id: string): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error('Firestore markNotificationAsRead error:', e);
    }
  }

  const list = getLocal<AppNotification>(STORAGE_KEYS.notifications).map((n) => {
    if (n.id === id) {
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
      const batch = writeBatch(db);
      idsToUpdate.forEach((id) => {
        batch.update(doc(db, 'notifications', id), { read: true });
      });
      await batch.commit();
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

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  let unsubFirestore: (() => void) | null = null;

  if (isFirebaseConfigured) {
    try {
      const targetIds = userId ? [userId, 'all'] : ['all'];
      const q = query(
        collection(db, 'notifications'),
        where('userId', 'in', targetIds)
      );

      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          const remoteList: AppNotification[] = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as AppNotification)
          );
          remoteList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          // مزامنة المحلية مع السحابة
          const localList = getLocal<AppNotification>(STORAGE_KEYS.notifications);
          const map = new Map<string, AppNotification>();
          remoteList.forEach((n) => map.set(n.id, n));
          localList.forEach((n) => {
            if (!map.has(n.id)) map.set(n.id, n);
          });
          setLocal(STORAGE_KEYS.notifications, Array.from(map.values()));

          callback(remoteList);
        },
        (error) => {
          console.warn('Firestore notification onSnapshot error:', error);
          try {
            handleFirestoreError(error, OperationType.GET, 'notifications');
          } catch {
            // fallback
          }
        }
      );
    } catch (err) {
      console.warn('Failed to initialize Firestore notification listener:', err);
    }
  }

  const notifyFromLocal = () => {
    const local = getLocal<AppNotification>(STORAGE_KEYS.notifications);
    const filtered = local.filter((n) => n.userId === userId || n.userId === 'all');
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(filtered);
  };

  // استدعاء فوري أولي
  notifyFromLocal();

  // استماع للتحديثات المحلية عبر CustomEvent
  if (typeof window !== 'undefined') {
    window.addEventListener('pharma_notifications_updated', notifyFromLocal);
  }

  return () => {
    if (unsubFirestore) {
      unsubFirestore();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pharma_notifications_updated', notifyFromLocal);
    }
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
