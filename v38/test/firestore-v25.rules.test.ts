import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

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
    await setDoc(doc(db, 'products/product1'), { name: 'منتج تجريبي أول' });
    await setDoc(doc(db, 'products/product2'), { name: 'منتج تجريبي ثان' });
    await setDoc(doc(db, 'prices/price1'), {
      supplierId: 'supplier1', productId: 'product1', price: 10, available: true, hidden: false,
    });
    await setDoc(doc(db, 'prices/price2'), {
      supplierId: 'supplier2', productId: 'product2', price: 20, available: true, hidden: false,
    });
  });
}

describe('current Firestore rules — warehouse representatives and pharmacy branches', () => {
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

  it('requires price creates and updates to reference an existing product', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    const validPrice = { supplierId: 'supplier1', productId: 'product1', price: 12, available: true, hidden: false };
    await assertSucceeds(setDoc(doc(db, 'prices/price-existing-product'), validPrice));
    await assertFails(setDoc(doc(db, 'prices/price-missing-product'), { ...validPrice, productId: 'product-missing' }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'prices/price-with-missing-product'), {
        ...validPrice, productId: 'product-missing',
      });
    });
    await assertFails(updateDoc(doc(db, 'prices/price-with-missing-product'), { price: 13 }));
  });

  it('allows a representative to record import progress but not change batch ownership or scope', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    const batch = {
      id: 'batch-progress', supplierId: 'supplier1', fileName: 'prices.xlsx', rowsCount: 12,
      createdBy: 'مندوب تجريبي', createdByUid: 'rep1', createdAt: new Date().toISOString(),
      importStatus: 'in_progress', writtenRowsCount: 10, progressUpdatedAt: new Date().toISOString(),
    };
    await assertSucceeds(setDoc(doc(db, 'importBatches/batch-progress'), batch));
    await assertFails(setDoc(doc(db, 'importBatches/forged-rolled-back'), {
      ...batch, id: 'forged-rolled-back', importStatus: 'rolled_back',
    }));
    await assertSucceeds(updateDoc(doc(db, 'importBatches/batch-progress'), {
      importStatus: 'interrupted', progressUpdatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(db, 'importBatches/batch-progress'), {
      importStatus: 'completed', writtenRowsCount: 12, progressUpdatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(db, 'importBatches/batch-progress'), { supplierId: 'supplier2' }));
    await assertFails(updateDoc(doc(db, 'importBatches/batch-progress'), { fileName: 'other.xlsx' }));
    await assertFails(updateDoc(doc(db, 'importBatches/batch-progress'), { writtenRowsCount: 13 }));
    const adminDb = testEnv.authenticatedContext('admin1', { admin: true }).firestore();
    await assertSucceeds(updateDoc(doc(adminDb, 'importBatches/batch-progress'), {
      importStatus: 'rolling_back', rollbackOwnerToken: 'lease-1', progressUpdatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(db, 'importBatches/batch-progress'), {
      importStatus: 'in_progress', writtenRowsCount: 12, progressUpdatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(adminDb, 'importBatches/batch-progress'), {
      importStatus: 'rolled_back', progressUpdatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(adminDb, 'importBatches/batch-progress'), {
      importStatus: 'in_progress', progressUpdatedAt: new Date().toISOString(),
    }));
  });

  it('supports a 10-product price batch with product-existence rule checks', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all(Array.from({ length: 10 }, (_, index) => setDoc(doc(db, `products/batch-product-${index}`), { name: `صنف ${index}` })));
    });
    const db = testEnv.authenticatedContext('rep1').firestore();
    const batch = writeBatch(db);
    for (let index = 0; index < 10; index += 1) {
      batch.set(doc(db, `prices/batch-price-${index}`), {
        supplierId: 'supplier1', productId: `batch-product-${index}`, price: 10 + index, available: true, hidden: false,
      });
      batch.set(doc(db, `priceHistory/batch-history-${index}`), {
        id: `batch-history-${index}`, supplierId: 'supplier1', productId: `batch-product-${index}`,
        price: 10 + index, importedAt: new Date().toISOString(), importBatchId: 'batch-ten',
        actorUid: 'rep1', actorName: 'مندوب تجريبي',
      });
    }
    batch.set(doc(db, 'importBatches/batch-ten'), {
      id: 'batch-ten', supplierId: 'supplier1', fileName: 'ten-prices.xlsx', rowsCount: 10,
      createdBy: 'مندوب تجريبي', createdByUid: 'rep1', createdAt: new Date().toISOString(),
      importStatus: 'in_progress', writtenRowsCount: 10, progressUpdatedAt: new Date().toISOString(),
    });
    await assertSucceeds(batch.commit());
  });

  it('blocks promotion changes when managePromotions is not granted', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    await assertFails(updateDoc(doc(db, 'prices/price1'), { bonus: 'اشترِ 2 واحصل على 1' }));
  });

  it('allows a promotions-only representative to manage offers in the assigned warehouse only', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/rep1'), {
        representativePermissions: { managePrices: false, managePromotions: true, manageDeliverySchedule: false },
      });
      await setDoc(doc(context.firestore(), 'supplier_offers/foreign-offer'), {
        id: 'foreign-offer', supplierId: 'supplier2', title: 'عرض آخر مستودع', productName: 'صنف',
        description: '', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'active', createdAt: new Date().toISOString(), createdByUid: 'rep1', createdByName: 'مندوب',
        updatedAt: new Date().toISOString(), updatedByUid: 'rep1', updatedByName: 'مندوب',
      });
    });

    const db = testEnv.authenticatedContext('rep1').firestore();
    const offer = {
      id: 'offer1', supplierId: 'supplier1', title: 'عرض نهاية الأسبوع', productName: 'صنف تجريبي',
      description: 'بونص محدود', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(),
      quantityLimit: 20, status: 'active', createdAt: new Date().toISOString(), createdByUid: 'rep1', createdByName: 'مندوب تجريبي',
      updatedAt: new Date().toISOString(), updatedByUid: 'rep1', updatedByName: 'مندوب تجريبي',
    };
    await assertSucceeds(setDoc(doc(db, 'supplier_offers/offer1'), offer));
    await assertFails(setDoc(doc(db, 'supplier_offers/offer2'), { ...offer, id: 'offer2', supplierId: 'supplier2' }));
    await assertFails(updateDoc(doc(db, 'supplier_offers/offer1'), { supplierId: 'supplier2', updatedAt: new Date().toISOString() }));
    await assertSucceeds(getDoc(doc(db, 'supplier_offers/offer1')));
    await assertFails(getDoc(doc(db, 'supplier_offers/foreign-offer')));
    await assertFails(updateDoc(doc(db, 'prices/price1'), { price: 12 }));
  });

  it('denies access to offers when the representative lacks the promotions permission', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'supplier_offers/offer1'), {
        id: 'offer1', supplierId: 'supplier1', title: 'عرض خاص', productName: 'صنف', description: '',
        startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'active', createdAt: new Date().toISOString(), createdByUid: 'rep1', createdByName: 'مندوب',
        updatedAt: new Date().toISOString(), updatedByUid: 'rep1', updatedByName: 'مندوب',
      });
    });
    const db = testEnv.authenticatedContext('rep1').firestore();
    await assertFails(getDoc(doc(db, 'supplier_offers/offer1')));
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

  it('allows a pharmacy user to update branch address fields but not account role or status', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/pharmacy1'), {
        uid: 'pharmacy1', role: 'pharmacy', status: 'active', name: 'مالك', pharmacyName: 'صيدلية الاختبار',
        phone: '0590000000', profileComplete: true, address: 'عنوان قديم',
      });
    });
    const db = testEnv.authenticatedContext('pharmacy1').firestore();
    const branch = {
      id: 'branch1', name: 'الفرع الرئيسي', governorateId: 'gov1', governorate: 'غزة',
      cityId: 'city1', city: 'غزة', streetId: 'street1', street: 'شارع الاختبار', addressDetail: 'مبنى 10',
    };
    await assertSucceeds(updateDoc(doc(db, 'users/pharmacy1'), {
      branches: [branch], defaultBranchId: 'branch1', governorate: 'غزة', city: 'غزة', streetId: 'street1',
      street: 'شارع الاختبار', addressDetail: 'مبنى 10', address: 'غزة - غزة - شارع الاختبار - مبنى 10',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(db, 'users/pharmacy1'), { status: 'suspended' }));
    await assertFails(updateDoc(doc(db, 'users/pharmacy1'), { branches: Array.from({ length: 11 }, (_, index) => ({ ...branch, id: `branch${index}` })) }));
  });

  it('allows alias creation only for the representative assigned to that supplier', async () => {
    const db = testEnv.authenticatedContext('rep1').firestore();
    const alias = {
      id: 'alias1', supplierId: 'supplier1', productId: 'product1', rawName: 'X-Brand 10mg tab',
      normalizedName: 'x brand 10mg tab', identityKey: 'x brand 10mg tab||||',
      createdAt: new Date().toISOString(), createdByUid: 'rep1', createdByName: 'مندوب تجريبي',
    };
    await assertSucceeds(setDoc(doc(db, 'productAliases/alias1'), alias));
    await assertSucceeds(getDoc(doc(db, 'productAliases/alias1')));
    await assertSucceeds(updateDoc(doc(db, 'productAliases/alias1'), {
      rawName: 'X-Brand 10mg tablets', normalizedName: 'x brand 10mg tablets', identityKey: 'x brand 10mg tablets||||',
    }));
    await assertFails(setDoc(doc(db, 'productAliases/missing-product-alias'), {
      ...alias, id: 'missing-product-alias', productId: 'product-missing',
    }));
    await assertFails(setDoc(doc(db, 'productAliases/alias2'), { ...alias, id: 'alias2', supplierId: 'supplier2' }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'productAliases/alias-with-missing-product'), {
        ...alias, id: 'alias-with-missing-product', productId: 'product-missing',
      });
    });
    await assertFails(updateDoc(doc(db, 'productAliases/alias-with-missing-product'), { rawName: 'اسم معدل' }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'productAliases/foreign-alias'), { ...alias, id: 'foreign-alias', supplierId: 'supplier2' });
    });
    await assertFails(getDoc(doc(db, 'productAliases/foreign-alias')));
  });
});
