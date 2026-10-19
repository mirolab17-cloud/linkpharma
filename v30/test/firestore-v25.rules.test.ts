import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-linkpharma-v25';
let testEnv: RulesTestEnvironment;

const representativeProfile = {
  uid: 'rep1', name: 'مندوب تجريبي', email: 'rep@example.test', role: 'representative', status: 'active',
  supplierId: 'supplier1', representativePermissions: {
    managePrices: true, managePromotions: false, manageDeliverySchedule: true,
  },
};

async function seedData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/rep1'), representativeProfile);
    await setDoc(doc(db, 'suppliers/supplier1'), {
      status: 'active', name: 'المستودع الأول', deliveryDaysByArea: {}, deliveryCutoffByArea: {}, minimumOrderByArea: {},
    });
    await setDoc(doc(db, 'suppliers/supplier2'), { status: 'active', name: 'المستودع الثاني' });
    await setDoc(doc(db, 'prices/price1'), {
      supplierId: 'supplier1', productId: 'product1', price: 10, available: true, hidden: false,
    });
    await setDoc(doc(db, 'prices/price2'), {
      supplierId: 'supplier2', productId: 'product2', price: 20, available: true, hidden: false,
    });
  });
}

describe('v25 Firestore rules — warehouse representatives', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedData();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  it('prevents a user from self-registering with the representative role or warehouse permissions', async () => {
    const db = testEnv.authenticatedContext('new-user').firestore();
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      uid: 'new-user', name: 'مستخدم', email: 'new@example.test', role: 'representative', status: 'active',
      subscriptionStatus: 'trial', subscriptionExpiresAtMillis: Date.now() + 60_000,
      supplierId: 'supplier1', representativePermissions: { managePrices: true },
    }));
  });

  it('allows an authorized representative to change a price only in the assigned warehouse', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'prices/price1'), { price: 11, updatedAt: new Date() }));
    await assertFails(updateDoc(doc(db, 'prices/price2'), { price: 21, updatedAt: new Date() }));
  });

  it('blocks promotion changes when managePromotions is not granted', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    await assertFails(updateDoc(doc(db, 'prices/price1'), { bonus: 'اشترِ 2 واحصل على 1' }));
  });

  it('allows delegated delivery schedule changes but blocks unrelated supplier edits', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'suppliers/supplier1'), {
      deliveryDaysByArea: { عمّان: ['الأحد', 'الثلاثاء'] },
      deliveryCutoffByArea: { عمّان: '12:00' },
      minimumOrderByArea: { عمّان: 100 },
      deliveryScheduleUpdatedAt: new Date(),
      deliveryScheduleUpdatedByUid: 'rep1',
      deliveryScheduleUpdatedByName: 'مندوب تجريبي',
    }));
    await assertFails(updateDoc(doc(db, 'suppliers/supplier1'), { name: 'اسم جديد' }));
    await assertFails(updateDoc(doc(db, 'suppliers/supplier2'), {
      deliveryDaysByArea: {}, deliveryCutoffByArea: {}, minimumOrderByArea: {},
      deliveryScheduleUpdatedAt: new Date(), deliveryScheduleUpdatedByUid: 'rep1', deliveryScheduleUpdatedByName: 'مندوب تجريبي',
    }));
  });

  it('limits representative price-import approvals to valid large imports for their own warehouse', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    const approval = {
      id: 'approval1', type: 'price_import', status: 'pending', summary: 'استيراد تجريبي',
      requestedByUid: 'rep1', requestedByName: 'مندوب تجريبي', requestedAt: new Date(),
      payload: { supplierId: 'supplier1', priceRecords: Array.from({ length: 50 }, (_, i) => ({ productId: `p${i}` })) },
    };
    await assertSucceeds(setDoc(doc(db, 'admin_change_approvals/approval1'), approval));
    await assertFails(setDoc(doc(db, 'admin_change_approvals/approval2'), {
      ...approval, id: 'approval2', type: 'bulk_suspend', payload: { userIds: ['pharmacy1'] },
    }));
  });

  it('denies the representative access to another warehouse price record', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    await assertSucceeds(getDoc(doc(db, 'prices/price1')));
    await assertFails(getDoc(doc(db, 'prices/price2')));
  });

  it('restricts campaign creation and immutable campaign fields to admins', async () => {
    const campaign = {
      id: 'campaign1', title: 'تحديث مهم', message: 'نص تجريبي', priority: 'high',
      audience: { kind: 'all_pharmacies', label: 'جميع الصيدليات النشطة' },
      createdByUid: 'admin1', createdByName: 'مدير تجريبي',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      targetCount: 1, deliveredCount: 0, status: 'sending',
    };
    const repDb = testEnv.authenticatedContext('rep1').firestore();
    await assertFails(setDoc(doc(repDb, 'announcement_campaigns/campaign1'), campaign));

    const adminDb = testEnv.authenticatedContext('admin1', { admin: true }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'announcement_campaigns/campaign1'), campaign));
    await assertSucceeds(updateDoc(doc(adminDb, 'announcement_campaigns/campaign1'), {
      deliveredCount: 1, status: 'sent', updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(adminDb, 'announcement_campaigns/campaign1'), { title: 'عنوان معدل' }));
  });

  it('allows an admin-created targeted notification only to its addressed account', async () => {
    const adminDb = testEnv.authenticatedContext('admin1', { admin: true }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'notifications/targeted1'), {
      id: 'targeted1', userId: 'pharmacy1', title: 'خاص', message: 'إشعار موجه',
      type: 'admin_announcement', read: false, createdAt: new Date().toISOString(),
    }));
    const recipientDb = testEnv.authenticatedContext('pharmacy1').firestore();
    const otherDb = testEnv.authenticatedContext('pharmacy2').firestore();
    await assertSucceeds(getDoc(doc(recipientDb, 'notifications/targeted1')));
    await assertFails(getDoc(doc(otherDb, 'notifications/targeted1')));
    await assertSucceeds(setDoc(doc(recipientDb, 'notification_reads/pharmacy1_targeted1'), {
      uid: 'pharmacy1', notifId: 'targeted1', readAt: new Date().toISOString(), shownCount: 1,
    }));
    await assertFails(setDoc(doc(otherDb, 'notification_reads/pharmacy1_targeted1'), {
      uid: 'pharmacy1', notifId: 'targeted1', readAt: new Date().toISOString(), shownCount: 1,
    }));
  });
});
