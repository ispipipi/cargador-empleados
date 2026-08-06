import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
import { getFirebaseServices } from './firebase';

const MAX_SESSIONS = 50;

export async function saveCloudSession(user, { metadata, data }) {
  const services = requireServices();
  const storagePath = `users/${user.uid}/sessions/${metadata.id}.json`;
  const storageReference = ref(services.storage, storagePath);

  await uploadString(storageReference, JSON.stringify(data), 'raw', {
    contentType: 'application/json',
    customMetadata: {
      ownerUid: user.uid,
      sessionId: metadata.id,
    },
  });

  await setDoc(doc(services.database, 'users', user.uid, 'sessions', metadata.id), {
    ...metadata,
    ownerUid: user.uid,
    storagePath,
    storage: 'cloud',
  });
}

export async function listCloudSessions(user) {
  const services = requireServices();
  const sessionsQuery = query(
    collection(services.database, 'users', user.uid, 'sessions'),
    orderBy('updatedAt', 'desc'),
    limit(MAX_SESSIONS),
  );
  const snapshot = await getDocs(sessionsQuery);

  return snapshot.docs.map((sessionDocument) => ({
    ...sessionDocument.data(),
    storage: 'cloud',
  }));
}

export async function loadCloudSession(user, sessionId) {
  const services = requireServices();
  const sessionReference = doc(services.database, 'users', user.uid, 'sessions', sessionId);
  const sessionSnapshot = await getDoc(sessionReference);

  if (!sessionSnapshot.exists()) {
    return null;
  }

  const metadata = sessionSnapshot.data();
  const storageReference = ref(services.storage, metadata.storagePath);
  const downloadUrl = await getDownloadURL(storageReference);
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error('No se pudo recuperar la carga desde Firebase Storage.');
  }

  return {
    metadata: { ...metadata, storage: 'cloud' },
    data: await response.json(),
  };
}

export async function deleteCloudSession(user, session) {
  const services = requireServices();
  const storagePath = session.storagePath || `users/${user.uid}/sessions/${session.id}.json`;

  await deleteObject(ref(services.storage, storagePath)).catch((error) => {
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  });
  await deleteDoc(doc(services.database, 'users', user.uid, 'sessions', session.id));
}

export async function loadCloudMappings(user, namespace) {
  const services = requireServices();
  const mappingSnapshot = await getDoc(doc(services.database, 'users', user.uid, 'mappings', namespace));
  return mappingSnapshot.exists() ? mappingSnapshot.data().entries ?? {} : {};
}

export async function saveCloudMappings(user, namespace, entries) {
  const services = requireServices();
  await setDoc(doc(services.database, 'users', user.uid, 'mappings', namespace), {
    ownerUid: user.uid,
    entries,
    updatedAt: new Date().toISOString(),
  });
}

function requireServices() {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase aún no está configurado para esta instalación.');
  }

  return services;
}
