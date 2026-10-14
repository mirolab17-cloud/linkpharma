/// <reference types="mocha" />
// test/firestore.rules.test.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

describe('Firestore Security Rules Hardening Tests', () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = 'linkpharma-rules-test';

  before(async () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  // 1. مستخدم عادي يحاول إنشاء إشعار all
  it('يمنع المستخدم العادي من إنشاء إشعار عام بـ userId="all"', async () => {
    const regularUserContext = testEnv.authenticatedContext('user_123', {
      email: 'user123@example.com',
      email_verified: true,
    });
    const db = regularUserContext.firestore();

    const notifRef = doc(db, 'notifications', 'notif_public');
    await assertFails(
      setDoc(notifRef, {
        userId: 'all',
        title: 'إعلان غير مصرح',
        message: 'محاولة اختراق',
        type: 'admin_announcement',
        createdAt: new Date().toISOString(),
      })
    );
  });

  // 2. مستخدم عادي يحاول تعديل stats في إشعار
  it('يمنع المستخدم العادي من تعديل حقل stats في مستندات الإشعارات', async () => {
    // إعداد إشعار موجود عبر سياق الأدمن
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'notifications', 'notif_existing'), {
        userId: 'all',
        title: 'إشعار رسمي',
        message: 'محتوى الإشعار',
        stats: { recipients: 10, views: 0, clicks: 0, dismissals: 0 },
        createdAt: new Date().toISOString(),
      });
    });

    const regularUserContext = testEnv.authenticatedContext('user_123');
    const db = regularUserContext.firestore();

    const notifRef = doc(db, 'notifications', 'notif_existing');
    await assertFails(
      updateDoc(notifRef, {
        stats: { recipients: 10, views: 5, clicks: 2, dismissals: 1 },
      })
    );
  });

  // 3. قراءة الإعدادات الحساسة settings/system
  it('يمنع المستخدم العادي من قراءة الإعدادات الحساسة settings/system ويسمح بقراءة settings/public', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'settings', 'system'), {
        adminEmails: ['mirolab17@gmail.com', 'admin@example.com'],
        geminiApiKey: 'secret-gemini-key',
      });
      await setDoc(doc(adminDb, 'settings', 'public'), {
        defaultTrialDays: 7,
        currency: 'SAR',
      });
    });

    const regularUserContext = testEnv.authenticatedContext('user_123');
    const db = regularUserContext.firestore();

    // القراءة من settings/system ممنوعة للمستخدم العادي
    await assertFails(getDoc(doc(db, 'settings', 'system')));

    // القراءة من settings/public مسموحة
    await assertSucceeds(getDoc(doc(db, 'settings', 'public')));
  });

  // 4. مستخدم عادي يحاول رفع نفسه لأدمن
  it('يمنع المستخدم العادي من رفع نفسه لأدمن عبر تعديل role في ملفه أو الكتابة في admins', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'user_123'), {
        uid: 'user_123',
        name: 'صيدلي عادي',
        role: 'pharmacy',
        status: 'active',
        subscriptionStatus: 'trial',
        createdAt: new Date().toISOString(),
      });
    });

    const regularUserContext = testEnv.authenticatedContext('user_123');
    const db = regularUserContext.firestore();

    // محاولة تغيير role إلى admin في users/user_123
    await assertFails(
      updateDoc(doc(db, 'users', 'user_123'), {
        role: 'admin',
      })
    );

    // محاولة كتابة سجل في مجموعة admins
    await assertFails(
      setDoc(doc(db, 'admins', 'user_123'), {
        uid: 'user_123',
        email: 'user123@example.com',
      })
    );
  });

  // 5. مستخدم عادي يحاول قراءة طلبية مستخدم آخر
  it('يمنع المستخدم العادي من قراءة طلبيات الصيدليات الأخرى', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'orders', 'order_other_999'), {
        id: 'order_other_999',
        pharmacyId: 'other_pharmacy_uid',
        supplierId: 'sup_1',
        total: 1500,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      });
    });

    const regularUserContext = testEnv.authenticatedContext('user_123');
    const db = regularUserContext.firestore();

    // محاولة قراءة طلبية تخص other_pharmacy_uid
    await assertFails(getDoc(doc(db, 'orders', 'order_other_999')));
  });
});
