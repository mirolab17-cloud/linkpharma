// src/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  getRedirectResult,
  signInWithRedirect,
  signInWithPopup,
  User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  collection,
  getDoc,
  getDocs,
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch as rawWriteBatch,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
// Firebase configuration: environment variables first, then fallback from firebase-applet-config.json
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDgKxltoVlUxjOAqqhACmZagGLHLbvoP_I',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'refined-might-8mn89.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'refined-might-8mn89',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'refined-might-8mn89.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '652233191904',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:652233191904:web:df3333c93f1281619f3b85',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-db7166d9-197a-4088-a47b-4865511559c0',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = (() => {
  const databaseId = firebaseConfig.firestoreDatabaseId;
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, databaseId);
  } catch {
    return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }
})();

// نفس تهيئة v1 الناجحة: getAuth الافتراضي (يحمّل محلّل النافذة المنبثقة تلقائياً ويستخدم أفضل تخزين متاح)
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const isFirebaseConfigured = Boolean(
  firebaseConfig &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.trim() !== ''
);

/**
 * تنظيف وحذف أي حقول بقيمة undefined بشكل جذري وشامل من أي كائن يتم إرساله إلى Firestore
 */
function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefinedFields(item)) as unknown as T;
  }
  // استثناء كائنات الفايربيس الخاصة وتواريخ JavaScript
  if (obj.constructor && obj.constructor.name !== 'Object') {
    return obj;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = removeUndefinedFields(val);
    }
  }
  return cleaned as T;
}

const safeSetDoc = (async (reference: any, data: any, options?: any) => {
  const sanitized = removeUndefinedFields(data);
  return options !== undefined
    ? (rawSetDoc as any)(reference, sanitized, options)
    : (rawSetDoc as any)(reference, sanitized);
}) as typeof rawSetDoc;

const safeUpdateDoc = (async (reference: any, dataOrField: any, ...moreFieldsAndValues: any[]) => {
  if (typeof dataOrField === 'object' && dataOrField !== null) {
    const sanitized = removeUndefinedFields(dataOrField);
    return (rawUpdateDoc as any)(reference, sanitized, ...moreFieldsAndValues);
  }
  return (rawUpdateDoc as any)(reference, dataOrField, ...moreFieldsAndValues);
}) as typeof rawUpdateDoc;

const safeWriteBatch: typeof rawWriteBatch = (firestore: any) => {
  const batch = rawWriteBatch(firestore);
  const origSet = batch.set.bind(batch);
  const origUpdate = batch.update.bind(batch);

  batch.set = (documentRef: any, data: any, options?: any) => {
    const sanitized = removeUndefinedFields(data);
    return options !== undefined ? origSet(documentRef, sanitized, options) : origSet(documentRef, sanitized);
  };

  batch.update = (documentRef: any, dataOrField: any, ...moreFieldsAndValues: any[]) => {
    if (typeof dataOrField === 'object' && dataOrField !== null) {
      const sanitized = removeUndefinedFields(dataOrField);
      return (origUpdate as any)(documentRef, sanitized, ...moreFieldsAndValues);
    }
    return (origUpdate as any)(documentRef, dataOrField, ...moreFieldsAndValues);
  };

  return batch;
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test per skill guidelines
export async function testConnection() {
  if (!isFirebaseConfigured) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// Test connection on boot
testConnection();

export {
  app,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  getRedirectResult,
  signInWithRedirect,
  signInWithPopup,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  safeSetDoc as setDoc,
  safeUpdateDoc as updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  safeWriteBatch as writeBatch,
  serverTimestamp,
  onSnapshot,
  removeUndefinedFields
};
export type { FirebaseUser };
export default app;
