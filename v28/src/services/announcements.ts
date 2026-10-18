import { collection, db, doc, getDocs, isFirebaseConfigured, limit, orderBy, query, setDoc, updateDoc, writeBatch } from '../firebase';
import { recordActivity } from './v18Features';

export type AnnouncementPriority = 'normal' | 'high' | 'urgent';
export type AnnouncementAudience =
  | { kind: 'all_pharmacies'; label: string }
  | { kind: 'pharmacy_area'; label: string; governorate: string; city?: string }
  | { kind: 'warehouse_representatives'; label: string; supplierId: string; supplierName: string };

export interface AnnouncementCampaign {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  targetCount: number;
  deliveredCount: number;
  status: 'sending' | 'sent' | 'partial' | 'failed';
  failureMessage?: string;
}

interface SendAnnouncementInput {
  title: string;
  message: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  recipientUids: string[];
  actorUid: string;
  actorName: string;
}

const CAMPAIGN_BATCH_SIZE = 400;

export async function getAnnouncementCampaigns(): Promise<AnnouncementCampaign[]> {
  if (!isFirebaseConfigured) return [];
  const snapshot = await getDocs(query(
    collection(db, 'announcement_campaigns'),
    orderBy('createdAt', 'desc'),
    limit(30),
  ));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AnnouncementCampaign));
}

export async function sendAnnouncementCampaign(input: SendAnnouncementInput): Promise<AnnouncementCampaign> {
  if (!isFirebaseConfigured) throw new Error('إعداد Firebase غير مكتمل؛ لم يتم إرسال أي إشعار.');
  if (!input.actorUid || !input.actorName.trim()) throw new Error('تعذر تحديد المدير الذي ينشئ الحملة.');

  const recipients = [...new Set(input.recipientUids.map((uid) => uid.trim()).filter(Boolean))];
  if (recipients.length === 0) throw new Error('لا توجد حسابات نشطة ضمن الجمهور المحدد.');

  const campaignRef = doc(collection(db, 'announcement_campaigns'));
  const campaignId = campaignRef.id;
  const createdAt = new Date().toISOString();
  const baseCampaign: AnnouncementCampaign = {
    id: campaignId,
    title: input.title.trim(),
    message: input.message.trim(),
    priority: input.priority,
    audience: input.audience,
    createdByUid: input.actorUid,
    createdByName: input.actorName.trim(),
    createdAt,
    updatedAt: createdAt,
    targetCount: recipients.length,
    deliveredCount: 0,
    status: 'sending',
  };

  await setDoc(campaignRef, baseCampaign);
  let deliveredCount = 0;

  try {
    for (let start = 0; start < recipients.length; start += CAMPAIGN_BATCH_SIZE) {
      const chunk = recipients.slice(start, start + CAMPAIGN_BATCH_SIZE);
      const batch = writeBatch(db);
      const batchTime = new Date().toISOString();

      for (const uid of chunk) {
        const notificationId = `ann_${campaignId}_${uid}`;
        batch.set(doc(db, 'notifications', notificationId), {
          id: notificationId,
          userId: uid,
          title: baseCampaign.title,
          message: baseCampaign.message,
          type: 'admin_announcement',
          read: false,
          createdAt: batchTime,
          metadata: {
            senderName: 'إدارة المنصة',
            priority: input.priority,
            campaignId,
            audienceLabel: input.audience.label,
          },
        });
      }

      const nextDeliveredCount = deliveredCount + chunk.length;
      const isLastChunk = nextDeliveredCount === recipients.length;
      batch.update(campaignRef, {
        deliveredCount: nextDeliveredCount,
        status: isLastChunk ? 'sent' : 'sending',
        updatedAt: batchTime,
        ...(isLastChunk ? { completedAt: batchTime } : {}),
      });
      await batch.commit();
      deliveredCount = nextDeliveredCount;
    }
  } catch (cause) {
    const status = deliveredCount > 0 ? 'partial' : 'failed';
    const failureMessage = cause instanceof Error ? cause.message.slice(0, 240) : 'فشل غير معروف أثناء الكتابة';
    try {
      await updateDoc(campaignRef, {
        status,
        deliveredCount,
        updatedAt: new Date().toISOString(),
        failureMessage,
      });
    } catch {
      // تظل قيمة deliveredCount المسجلة مع آخر دفعة ناجحة مرجعًا لحالة الإرسال.
    }
    await recordActivity({
      type: 'announcement_sent',
      actorId: input.actorUid,
      actorName: input.actorName,
      actorRole: 'admin',
      message: `تعثر إرسال حملة «${baseCampaign.title}»: وصل إلى ${deliveredCount} من ${recipients.length} حسابًا`,
      metadata: { campaignId, targetCount: recipients.length, deliveredCount, status, audience: input.audience },
    });
    throw new Error(`توقف الإرسال بعد وصول الإشعار إلى ${deliveredCount} من ${recipients.length} حسابًا. راجع سجل الحملة قبل إعادة المحاولة.`);
  }

  const completedAt = new Date().toISOString();
  const completedCampaign: AnnouncementCampaign = {
    ...baseCampaign,
    deliveredCount,
    status: 'sent',
    updatedAt: completedAt,
    completedAt,
  };
  await recordActivity({
    type: 'announcement_sent',
    actorId: input.actorUid,
    actorName: input.actorName,
    actorRole: 'admin',
    message: `إرسال حملة «${baseCampaign.title}» إلى ${deliveredCount} حسابًا`,
    metadata: { campaignId, targetCount: recipients.length, deliveredCount, status: 'sent', audience: input.audience },
  });
  return completedCampaign;
}
