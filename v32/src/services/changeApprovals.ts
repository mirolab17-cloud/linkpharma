import { runTransaction } from 'firebase/firestore';
import { collection, db, doc, getDoc, getDocs, isFirebaseConfigured, setDoc, updateDoc, writeBatch } from '../firebase';
import { AdminChangeApproval, UserProfile } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { commitImportBatch } from './dataStorage';
import { recordActivity } from './v18Features';

function requireAdmin() {
  const user = useAuthStore.getState().user;
  if (!user || user.role !== 'admin') throw new Error('هذه العملية متاحة للمدير فقط.');
  if (!isFirebaseConfigured) throw new Error('اعتماد التغييرات يتطلب اتصال Firestore.');
  return user;
}

export async function createPriceImportApproval(input: {
  supplierId: string;
  supplierName: string;
  fileName: string;
  priceRecords: { productId: string; price: number; publicPrice?: number; bonus?: string; available?: boolean; expiry?: string }[];
}): Promise<AdminChangeApproval> {
  const requester = useAuthStore.getState().user;
  if (!requester || !isFirebaseConfigured || (requester.role !== 'admin' && !(requester.role === 'representative' && requester.supplierId === input.supplierId && requester.representativePermissions?.managePrices))) {
    throw new Error('لا يحق لهذا الحساب طلب اعتماد أسعار هذا المستودع.');
  }
  if (requester.role === 'representative' && input.priceRecords.some((row) => Boolean(row.bonus?.trim())) && !requester.representativePermissions?.managePromotions) {
    throw new Error('لا تملك صلاحية إدارة العروض في هذا المستودع.');
  }
  if (input.priceRecords.length < 50) throw new Error('طلب الاعتماد الجماعي مخصص للدفعات الكبيرة التي تحتوي 50 صفًا صالحًا أو أكثر.');
  if (input.priceRecords.length > 248) throw new Error('قسّم الملف إلى دفعات لا تتجاوز 248 صنفًا لضمان تطبيقها بالكامل داخل معاملة Firestore واحدة.');
  const payload = { supplierId: input.supplierId, supplierName: input.supplierName, fileName: input.fileName, priceRecords: input.priceRecords };
  const payloadBytes = new Blob([JSON.stringify(payload)]).size;
  if (payloadBytes > 700_000) throw new Error('ملف التغيير كبير جدًا لمسار الاعتماد الآمن؛ قسّمه إلى دفعات أصغر.');
  const now = new Date().toISOString();
  const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const request: AdminChangeApproval = {
    id,
    type: 'price_import',
    status: 'pending',
    summary: `استيراد ${input.priceRecords.length} سعرًا/عرضًا إلى ${input.supplierName}`,
    requestedByUid: requester.uid,
    requestedByName: requester.name || requester.email,
    requestedAt: now,
    payload,
  };
  await setDoc(doc(db, 'admin_change_approvals', id), request);
  await recordActivity({
    type: 'change_approval_requested',
    actorId: requester.uid,
    actorName: request.requestedByName,
    actorRole: requester.role,
    message: `طلب مراجعة ثانية لاستيراد أسعار من ${input.supplierName}`,
    metadata: { approvalId: id, approvalType: request.type, supplierId: input.supplierId, rowsCount: input.priceRecords.length },
  });
  return request;
}

export async function createBulkSuspensionApproval(targets: UserProfile[]): Promise<AdminChangeApproval> {
  const requester = requireAdmin();
  const eligible = targets.filter((target) => target.role === 'pharmacy' && target.status !== 'suspended');
  const unique = Array.from(new Map(eligible.map((target) => [target.uid, target])).values());
  if (unique.length < 2 || unique.length > 50) throw new Error('يجب تحديد من صيدليتين إلى 50 صيدلية غير موقوفة.');
  const now = new Date().toISOString();
  const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const request: AdminChangeApproval = {
    id, type: 'suspend_pharmacies', status: 'pending', summary: `تعليق جماعي لـ ${unique.length} صيدلية`,
    requestedByUid: requester.uid, requestedByName: requester.name || requester.email, requestedAt: now,
    payload: { users: unique.map((target) => ({ uid: target.uid, name: target.pharmacyName || target.name, email: target.email })) },
  };
  await setDoc(doc(db, 'admin_change_approvals', id), request);
  await recordActivity({ type: 'change_approval_requested', actorId: requester.uid, actorName: request.requestedByName, actorRole: 'admin', message: request.summary, metadata: { approvalId: id, approvalType: request.type, targetUids: unique.map((target) => target.uid) } });
  return request;
}

export async function getAdminChangeApprovals(): Promise<AdminChangeApproval[]> {
  requireAdmin();
  const snap = await getDocs(collection(db, 'admin_change_approvals'));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as AdminChangeApproval)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function reviewAdminChangeApproval(id: string, decision: 'approved' | 'rejected', reviewNote = ''): Promise<void> {
  const reviewer = requireAdmin();
  const ref = doc(db, 'admin_change_approvals', id);
  let loadedApproval: AdminChangeApproval | undefined;
  const reviewedAt = new Date().toISOString();
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('طلب الاعتماد غير موجود.');
    const current = { id: snapshot.id, ...snapshot.data() } as AdminChangeApproval;
    if (current.status !== 'pending') throw new Error('هذا الطلب لم يعد بانتظار المراجعة.');
    if (current.requestedByUid === reviewer.uid) throw new Error('لا يمكن لمقدم الطلب اعتماد تغييره بنفسه؛ يلزم مدير ثانٍ.');
    loadedApproval = current;
    transaction.update(ref, {
      status: decision === 'approved' ? 'processing' : 'rejected',
      reviewedByUid: reviewer.uid,
      reviewedByName: reviewer.name || reviewer.email,
      reviewedAt,
      reviewNote,
    });
  });
  const approval = loadedApproval as AdminChangeApproval | undefined;
  if (!approval) throw new Error('تعذر تحميل طلب الاعتماد.');
  if (decision === 'rejected') {
    await recordActivity({
      type: 'change_approval_rejected', actorId: reviewer.uid, actorName: reviewer.name || reviewer.email,
      actorRole: 'admin', message: `رفض ${reviewer.name || reviewer.email} طلب تغيير جماعي`,
      metadata: { approvalId: id, requestedByUid: approval.requestedByUid, reviewNote },
    });
    return;
  }
  try {
    const payload = approval.payload;
    let resultId = '';
    if (approval.type === 'price_import') {
      const result = await commitImportBatch({
        supplierId: String(payload.supplierId), fileName: String(payload.fileName),
        createdBy: approval.requestedByName, createdByUid: approval.requestedByUid,
        priceRecords: payload.priceRecords, approvalId: id,
        approvedByUid: reviewer.uid, approvedByName: reviewer.name || reviewer.email,
      });
      resultId = result.batchId;
    } else if (approval.type === 'suspend_pharmacies') {
      const targets: { uid: string; name: string; email: string }[] = Array.isArray(payload.users) ? payload.users : [];
      if (targets.length < 2 || targets.length > 50) throw new Error('قائمة التعليق الجماعي غير صالحة.');
      const snapshots = await Promise.all(targets.map((target) => getDoc(doc(db, 'users', target.uid))));
      const freshUsers = snapshots.map((snapshot, index) => {
        if (!snapshot.exists()) throw new Error(`الحساب ${targets[index].uid} لم يعد موجودًا.`);
        const fresh = { uid: snapshot.id, ...snapshot.data() } as UserProfile;
        if (fresh.role !== 'pharmacy' || fresh.status === 'suspended') throw new Error(`الحساب ${fresh.pharmacyName || fresh.name} لم يعد مؤهلًا للتعليق الجماعي.`);
        return fresh;
      });
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();
      freshUsers.forEach((target) => {
        batch.update(doc(db, 'users', target.uid), { status: 'suspended', updatedAt: timestamp, suspensionReason: `تعليق جماعي بموافقة ${reviewer.name || reviewer.email}` });
        const activityId = `activity_bulk_suspend_${id}_${target.uid}`;
        batch.set(doc(db, 'platform_activity', activityId), {
          id: activityId, type: 'user_access_changed', actorId: reviewer.uid, actorName: reviewer.name || reviewer.email,
          actorRole: 'admin', message: `تعليق حساب ${target.pharmacyName || target.name} بعد اعتماد ثانٍ`, createdAt: timestamp,
          metadata: { targetUid: target.uid, previousStatus: target.status, newStatus: 'suspended', approvalId: id, requestedByUid: approval.requestedByUid },
        });
        const notificationId = `notif_bulk_suspend_${id}_${target.uid}`;
        batch.set(doc(db, 'notifications', notificationId), {
          id: notificationId, userId: target.uid, title: 'تنبيه إداري: تم تعليق حساب الصيدلية',
          message: 'تم تعليق حساب الصيدلية بعد مراجعة إدارية ثانية. يرجى التواصل مع إدارة المنصة للاستفسار.',
          type: 'status_change', createdAt: timestamp, read: false, metadata: { approvalId: id, senderName: reviewer.name || reviewer.email },
        });
      });
      resultId = `${freshUsers.length} حسابًا`;
      batch.update(ref, { status: 'approved', resultId, reviewedAt: timestamp, reviewedByUid: reviewer.uid, reviewedByName: reviewer.name || reviewer.email });
      await batch.commit();
    } else {
      throw new Error('نوع هذا الطلب غير مدعوم.');
    }
    await recordActivity({
      type: 'change_approval_approved', actorId: reviewer.uid, actorName: reviewer.name || reviewer.email,
      actorRole: 'admin', message: `اعتمد ${reviewer.name || reviewer.email} دفعة أسعار طلبها ${approval.requestedByName}`,
      metadata: { approvalId: id, resultId, requestedByUid: approval.requestedByUid, supplierId: payload.supplierId, rowsCount: payload.priceRecords?.length || 0 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDoc(ref, { status: 'failed', reviewNote: `فشل التطبيق بعد الاعتماد: ${message}` });
    await recordActivity({
      type: 'change_approval_failed', actorId: reviewer.uid, actorName: reviewer.name || reviewer.email,
      actorRole: 'admin', message: `فشل تطبيق تغيير اعتمده ${reviewer.name || reviewer.email}`,
      metadata: { approvalId: id, error: message },
    });
    throw error;
  }
}
