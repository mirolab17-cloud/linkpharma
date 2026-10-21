import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  isFirebaseConfigured,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '../firebase';
import { RepresentativePermissions, Supplier, UserProfile, WarehouseLinkRequest, WarehouseLinkRequestStatus } from '../types';
import { useAuthStore } from '../store/useAuthStore';

const requestsCollection = () => collection(db, 'warehouse_link_requests');
const requireFirebase = () => {
  if (!isFirebaseConfigured) throw new Error('يتطلب هذا الإجراء اتصال Firebase مهيأ؛ لا تحفظ صلاحيات المندوب محليًا.');
};
const requireAdmin = () => {
  const user = useAuthStore.getState().user;
  if (!user || user.role !== 'admin') throw new Error('هذه العملية متاحة للإدارة فقط.');
  return user;
};

export async function submitWarehouseLinkRequest(input: {
  supplierId: string;
  phone: string;
  note?: string;
}): Promise<WarehouseLinkRequest> {
  requireFirebase();
  const user = useAuthStore.getState().user;
  if (!user || user.role !== 'pharmacy') throw new Error('يجب تسجيل الدخول بحساب مستخدم لإرسال الطلب.');
  if (!input.supplierId || !input.phone.trim()) throw new Error('اختر المستودع وأدخل رقم التواصل.');

  const previous = await getDocs(query(requestsCollection(), where('userId', '==', user.uid)));
  const current = previous.docs
    .map((snap) => ({ id: snap.id, ...snap.data() } as WarehouseLinkRequest))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (current?.status === 'pending') throw new Error('لديك طلب ربط قيد المراجعة بالفعل.');
  if (current?.status === 'approved') throw new Error('حسابك مرتبط بمستودع بالفعل. تواصل مع الإدارة لتغيير الربط.');

  const now = new Date().toISOString();
  const id = `request_${user.uid}_${Date.now()}`;
  const request: WarehouseLinkRequest = {
    id,
    userId: user.uid,
    userName: user.name,
    userEmail: user.email,
    phone: input.phone.trim(),
    supplierId: input.supplierId,
    note: input.note?.trim() || '',
    status: 'pending',
    createdAt: now,
  };
  await setDoc(doc(db, 'warehouse_link_requests', id), request);
  return request;
}

export async function getMyWarehouseLinkRequest(userId: string): Promise<WarehouseLinkRequest | null> {
  requireFirebase();
  const snap = await getDocs(query(requestsCollection(), where('userId', '==', userId)));
  const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() } as WarehouseLinkRequest));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

export async function getWarehouseLinkRequests(): Promise<WarehouseLinkRequest[]> {
  requireFirebase();
  requireAdmin();
  const snap = await getDocs(requestsCollection());
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() } as WarehouseLinkRequest))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function decideWarehouseLinkRequest(input: {
  request: WarehouseLinkRequest;
  decision: Extract<WarehouseLinkRequestStatus, 'approved' | 'rejected' | 'revoked'>;
  supplier?: Supplier;
  permissions?: RepresentativePermissions;
  reviewNote?: string;
}): Promise<void> {
  requireFirebase();
  const admin = requireAdmin();
  const { request, decision } = input;
  if (!request.id || !request.userId) throw new Error('بيانات طلب الربط غير مكتملة.');
  if (decision === 'approved') {
    if (!input.supplier?.id || input.supplier.id !== request.supplierId) throw new Error('اختر المستودع الذي طلبه المستخدم.');
    const permissions = input.permissions;
    if (!permissions) throw new Error('اختر قيم الصلاحيات التي ستُسند للحساب.');
    const supplierSnap = await getDoc(doc(db, 'suppliers', input.supplier.id));
    if (!supplierSnap.exists() || supplierSnap.data().status !== 'active') throw new Error('المستودع غير موجود أو غير نشط.');
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const requestRef = doc(db, 'warehouse_link_requests', request.id);
  const userRef = doc(db, 'users', request.userId);
  const activityId = `activity_rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const statusLabel = decision === 'approved' ? 'قبول' : decision === 'rejected' ? 'رفض' : 'إلغاء ربط';

  batch.update(requestRef, {
    status: decision,
    reviewedAt: now,
    reviewedByUid: admin.uid,
    reviewedByName: admin.name,
    reviewNote: input.reviewNote?.trim() || '',
    ...(decision === 'approved' ? { supplierId: input.supplier!.id, permissions: input.permissions } : {}),
  });
  if (decision === 'approved') {
    batch.update(userRef, {
      role: 'representative',
      status: 'active',
      supplierId: input.supplier!.id,
      representativePermissions: input.permissions,
      updatedAt: now,
    });
  } else if (decision === 'revoked') {
    batch.update(userRef, { role: 'pharmacy', supplierId: null, representativePermissions: null, updatedAt: now });
  }
  batch.set(doc(db, 'platform_activity', activityId), {
    id: activityId,
    type: decision === 'approved' ? 'representative_link_approved' : decision === 'rejected' ? 'representative_link_rejected' : 'representative_link_revoked',
    actorId: admin.uid,
    actorName: admin.name,
    actorRole: 'admin',
    message: `${statusLabel} طلب ربط ${request.userName} بمستودع ${input.supplier?.name || request.supplierId}`,
    createdAt: now,
    metadata: { requestId: request.id, userId: request.userId, supplierId: request.supplierId, permissions: input.permissions || null, reviewNote: input.reviewNote || '' },
  });
  await batch.commit();
}

export async function updateRepresentativeDeliverySchedule(
  supplier: Supplier,
  schedules: Record<string, string[]>,
  cutoffs: Record<string, string> = supplier.deliveryCutoffByArea || {},
  minimums: Record<string, number> = supplier.minimumOrderByArea || {},
): Promise<void> {
  requireFirebase();
  const user = useAuthStore.getState().user;
  if (!user || (user.role !== 'admin' && (user.role !== 'representative' || user.supplierId !== supplier.id || !user.representativePermissions?.manageDeliverySchedule))) {
    throw new Error('ليس لديك صلاحية تعديل جدول هذا المستودع.');
  }
  const now = new Date().toISOString();
  const actorName = user.name || user.email;
  const activityId = `activity_delivery_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'suppliers', supplier.id), {
    deliveryDaysByArea: schedules,
    deliveryCutoffByArea: cutoffs,
    minimumOrderByArea: minimums,
    deliveryScheduleUpdatedAt: now,
    deliveryScheduleUpdatedByUid: user.uid,
    deliveryScheduleUpdatedByName: actorName,
  });
  batch.set(doc(db, 'platform_activity', activityId), {
    id: activityId,
    type: 'delivery_schedule_updated',
    actorId: user.uid,
    actorName,
    actorRole: user.role,
    message: `تعديل جدول توصيل ${supplier.name} بواسطة ${actorName}`,
    createdAt: now,
    metadata: { supplierId: supplier.id, previous: { days: supplier.deliveryDaysByArea || {}, cutoffs: supplier.deliveryCutoffByArea || {}, minimums: supplier.minimumOrderByArea || {} }, next: { days: schedules, cutoffs, minimums } },
  });
  await batch.commit();
}

export async function saveSupplierImportTemplate(
  supplierId: string,
  importTemplate: NonNullable<Supplier['importTemplate']>,
): Promise<void> {
  requireFirebase();
  const user = useAuthStore.getState().user;
  if (!user || user.role !== 'representative' || user.supplierId !== supplierId || !user.representativePermissions?.managePrices) {
    throw new Error('ليس لديك صلاحية حفظ قالب Excel لهذا المستودع.');
  }
  const now = new Date().toISOString();
  const activityId = `activity_template_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'suppliers', supplierId), { importTemplate, importTemplateUpdatedAt: now, importTemplateUpdatedByUid: user.uid, importTemplateUpdatedByName: user.name });
  batch.set(doc(db, 'platform_activity', activityId), {
    id: activityId,
    type: 'supplier_template_updated',
    actorId: user.uid,
    actorName: user.name,
    actorRole: user.role,
    message: `تحديث قالب استيراد الأسعار لمستودع بواسطة ${user.name}`,
    createdAt: now,
    metadata: { supplierId, importTemplate },
  });
  await batch.commit();
}
