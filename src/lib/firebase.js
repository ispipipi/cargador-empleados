import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(Boolean);
}

export function getFirebaseServices() {
  if (!isFirebaseConfigured()) {
    return null;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  return {
    app,
    auth: getAuth(app),
    database: getFirestore(app),
    storage: getStorage(app),
  };
}

export function subscribeToFirebaseAuth(onChange, onError) {
  const services = getFirebaseServices();
  if (!services) {
    onChange(null);
    return () => {};
  }

  return onAuthStateChanged(services.auth, onChange, onError);
}

export async function signInWithGoogle() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase aún no está configurado para esta instalación.');
  }

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(services.auth, provider);
  return result.user;
}

export async function signOutFirebase() {
  const services = getFirebaseServices();
  if (services) {
    await signOut(services.auth);
  }
}
