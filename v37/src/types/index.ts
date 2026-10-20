export type UserRole = 'admin' | 'pharmacy' | 'representative';
export type UserStatus = 'pending' | 'active' | 'suspended';
export type SubscriptionStatus = 'trial' | 'active' | 'expired';

export interface RepresentativePermissions {
  managePrices: boolean;
  managePromotions: boolean;
  manageDeliverySchedule: boolean;
}

export type WarehouseLinkRequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface WarehouseLinkRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  phone?: string;
  supplierId: string;
  note?: string;
  status: WarehouseLinkRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewNote?: string;
  permissions?: RepresentativePermissions;
}

export interface SystemSettings {
  id: string; // 'system'
  defaultTrialDays: number;
  currency?: string; // ILS / ₪ default
  adminEmails?: string[];
  supportWhatsApp?: string; // رقم واتساب الدعم الفني والمدير المعتمد (مثال: 966501234567)
  updatedAt?: string;
  updatedBy?: string;
  platformName?: string;
  gazaLocations?: Record<string, string[]>;
  loginWhatsAppEnabled?: boolean;
  loginWhatsApp?: string;
  showDeliveryDays?: boolean;
  warehousePriceSortMode?: 'cheapest' | 'latest' | 'random';
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
  ownerName?: string;
  governorate?: string;
  city?: string;
  addressDetail?: string;
  address?: string;
  phone?: string;
  allowedSuppliers?: string[]; // Array of supplier IDs, empty means all allowed
  profileComplete?: boolean;
  createdAt?: string;
  favorites?: string[]; // Array of favorite product IDs
  supplierFavorites?: string[]; // Array of favorite supplier IDs
  priceAlerts?: Record<string, number>; // productId -> target price
  supplierId?: string; // the single warehouse assigned to an approved representative
  representativePermissions?: RepresentativePermissions;
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
  packSize?: string;
  manufacturer: string;
  category: string;
  barcode?: string;
  activeIngredientId: string; // فارغ للمستلزمات والمنتجات غير الدوائية
  productType?: 'medicine' | 'medical_supply' | 'other';
  createdAt?: string;
}

export interface ImportTemplate {
  sheetName?: string;
  startRow: number;
  columns: {
    name: string;
    strength?: string;
    form?: string;
    pack?: string;
    manufacturer?: string;
    price: string;
    publicPrice?: string;
    availability?: string;
    expiry?: string;
    bonus?: string;
  };
}

export interface Supplier {
  id: string;
  name: string;
  whatsapp: string; // International format without + (e.g. 966501234567 or 972591234567)
  address: string;
  notes?: string;
  representativeName?: string;
  serviceAreas?: string[];
  deliveryDaysByArea?: Record<string, string[]>;
  deliveryCutoffByArea?: Record<string, string>;
  minimumOrderByArea?: Record<string, number>;
  deliveryScheduleUpdatedAt?: string;
  deliveryScheduleUpdatedByUid?: string;
  deliveryScheduleUpdatedByName?: string;
  lastPriceUpdatedByUid?: string;
  lastPriceUpdatedByName?: string;
  status: 'active' | 'paused';
  importTemplate?: ImportTemplate;
  importTemplateUpdatedAt?: string;
  importTemplateUpdatedByUid?: string;
  importTemplateUpdatedByName?: string;
  deliveryFee?: number;
  lastPriceUpdate?: string;
  minimumOrderAmount?: number; // الحد الأدنى للطلب بالشيكل
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
  bonus?: string; // e.g. "10+2" or "10+1"
  effectivePrice?: number; // السعر الفعلي بعد احتساب البونص
  updatedAt: string;
  hidden?: boolean;
}

export interface PriceHistory {
  id: string;
  productId: string;
  supplierId: string;
  price: number;
  publicPrice?: number;
  available?: boolean;
  bonus?: string;
  importedAt: string;
  importBatchId: string;
  changeType?: 'created' | 'updated';
  previous?: Pick<PriceRecord, 'price' | 'publicPrice' | 'available' | 'expiry' | 'bonus'> | null;
  next?: Pick<PriceRecord, 'price' | 'publicPrice' | 'available' | 'expiry' | 'bonus'>;
  actorUid?: string;
  actorName?: string;
}

export interface ImportBatch {
  id: string;
  supplierId: string;
  supplierName?: string;
  fileName: string;
  rowsCount: number;
  createdBy: string;
  createdByUid?: string;
  createdAt: string;
}

export interface AdminChangeApproval {
  id: string;
  type: 'price_import' | 'suspend_pharmacies';
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'failed';
  summary: string;
  requestedByUid: string;
  requestedByName: string;
  requestedAt: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  resultId?: string;
  payload: Record<string, any>;
}

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  bonus?: string;
}

export type OrderStatus = 'sent' | 'confirmed' | 'processing' | 'delivered' | 'cancelled';

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
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  pdfExportedAt?: string;
  statusHistory?: OrderStatusEvent[];
  editHistory?: OrderEditEvent[];
}

export interface OrderEditEvent {
  changedAt: string;
  changedBy: string;
  previousTotal: number;
  total: number;
  previousItems: OrderItem[];
  items: OrderItem[];
}

export interface OrderStatusEvent {
  status: OrderStatus;
  changedAt: string;
  changedBy?: string;
  note?: string;
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
  bonus?: string;
  qty: number;
}

export type NotificationType = 'status_change' | 'admin_announcement' | 'order_update' | 'system' | 'price_alert' | 'suggestion';

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
    orderId?: string;
    orderStatus?: OrderStatus;
    productId?: string;
    [key: string]: any;
  };
}

export interface RecurringOrderTemplate {
  id: string;
  name: string;
  schedule: 'weekly' | 'monthly' | 'custom';
  items: CartItem[];
  createdAt: string;
}


export type SuggestionStatus = 'new' | 'reviewed' | 'resolved' | 'dismissed';

export interface PharmacySuggestion {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  subject: string;
  message: string;
  createdAt: string;
  status: SuggestionStatus;
  adminReply?: string;
  reviewedAt?: string;
}

export type PlatformActivityType = 'login' | 'order_created' | 'order_edited' | 'pharmacy_imported' | 'user_access_changed' | 'suggestion_created' | 'profile_updated' | 'price_imported' | 'price_import_failed' | 'price_visibility_changed' | 'order_status_changed' | 'representative_link_approved' | 'representative_link_rejected' | 'representative_link_revoked' | 'delivery_schedule_updated' | 'supplier_template_updated' | 'change_approval_requested' | 'change_approval_approved' | 'change_approval_rejected' | 'change_approval_failed' | 'backup_created' | 'backup_restored' | 'announcement_sent';

export interface PlatformActivity {
  id: string;
  type: PlatformActivityType;
  actorId?: string;
  actorName?: string;
  actorRole?: UserRole;
  message: string;
  createdAt: string;
  metadata?: Record<string, any>;
}
