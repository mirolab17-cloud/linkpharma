// src/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
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
  writeBatch as rawWriteBatch,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true
    }, (firebaseConfig as any).firestoreDatabaseId);
  } catch {
    return getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
  }
})();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const isFirebaseConfigured = Boolean(firebaseConfig && firebaseConfig.projectId);

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
  signInWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  safeSetDoc as setDoc,
  safeUpdateDoc as updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  safeWriteBatch as writeBatch,
  serverTimestamp,
  onSnapshot,
  removeUndefinedFields
};
export type { FirebaseUser };
export default app;
