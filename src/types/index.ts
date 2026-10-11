export type UserRole = 'admin' | 'pharmacy';
export type UserStatus = 'pending' | 'active' | 'suspended';
export type SubscriptionStatus = 'trial' | 'active' | 'expired';

export interface SystemSettings {
  id: string; // 'system'
  defaultTrialDays: number;
  adminEmails?: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: string; // ISO string
  subscriptionExpiresAtMillis?: number; // epoch ms
  trialDays?: number;
  pharmacyName?: string;
  address?: string;
  phone?: string;
  allowedSuppliers?: string[]; // Array of supplier IDs, empty means all allowed
  profileComplete?: boolean;
  createdAt?: string;
}

export interface ActiveIngredient {
  id: string;
  name: string;
  normalizedName?: string;
  category: string;
  createdAt?: string;
  productCount?: number;
}

export interface Product {
  id: string;
  tradeName: string;
  normalizedName: string;
  form: string; // أقراص، شراب، حقن، مرهم، قطرات، كبسولات...
  strength: string; // 500mg, 10mg/5ml...
  manufacturer: string;
  category: string;
  barcode?: string;
  activeIngredientId: string;
  createdAt?: string;
}

export interface ImportTemplate {
  sheetName?: string;
  startRow: number;
  columns: {
    name: string;
    price: string;
    publicPrice?: string;
    availability?: string;
    expiry?: string;
  };
}

export interface Supplier {
  id: string;
  name: string;
  whatsapp: string; // International format without + (e.g. 966501234567 or 962791234567)
  address: string;
  notes?: string;
  status: 'active' | 'paused';
  importTemplate?: ImportTemplate;
  lastPriceUpdate?: string;
  createdAt: string;
}

export interface PriceRecord {
  id?: string; // composite supplierId_productId
  productId: string;
  supplierId: string;
  price: number;
  publicPrice?: number;
  available: boolean;
  expiry?: string;
  updatedAt: string;
}

export interface PriceHistory {
  id: string;
  productId: string;
  supplierId: string;
  price: number;
  publicPrice?: number;
  available?: boolean;
  importedAt: string;
  importBatchId: string;
}

export interface ImportBatch {
  id: string;
  supplierId: string;
  supplierName?: string;
  fileName: string;
  rowsCount: number;
  createdBy: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyPhone: string;
  supplierId: string;
  supplierName: string;
  items: OrderItem[];
  total: number;
  status: 'sent' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface CartItem {
  productId: string;
  tradeName: string;
  form?: string;
  strength?: string;
  supplierId: string;
  supplierName: string;
  supplierWhatsapp: string;
  price: number;
  publicPrice?: number;
  qty: number;
}

export type NotificationType = 'status_change' | 'admin_announcement' | 'order_update' | 'system';

export interface AppNotification {
  id: string;
  userId: string; // Specific user UID or 'all' for broadcasts
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  metadata?: {
    oldStatus?: UserStatus;
    newStatus?: UserStatus;
    subscriptionStatus?: SubscriptionStatus;
    expiresAt?: string;
    actionUrl?: string;
    senderName?: string;
    priority?: 'normal' | 'high' | 'urgent';
    [key: string]: any;
  };
}
