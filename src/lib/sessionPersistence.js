import { normalizeText } from './utils';

const DATABASE_NAME = 'maper-local-memory';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const SESSION_DATA_STORE = 'session-data';
const MAPPING_STORAGE_KEY = 'maper.mapping-memory.v1';

let databasePromise;

export function createSessionId() {
  return crypto.randomUUID();
}

export function createSessionMetadata({ id, selectedModule, selectedOrigin, selectedDestination, sourceFile, step }) {
  return {
    id,
    selectedModule,
    selectedOrigin,
    selectedDestination,
    fileName: sourceFile?.fileName ?? '',
    workbookName: sourceFile?.workbookName ?? '',
    rowCount: sourceFile?.rows?.length ?? 0,
    step,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveSession({ metadata, data }) {
  const database = await openDatabase();

  await runTransaction(database, [SESSION_STORE, SESSION_DATA_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(SESSION_STORE).put(metadata);
    transaction.objectStore(SESSION_DATA_STORE).put({
      id: metadata.id,
      ...data,
      updatedAt: metadata.updatedAt,
    });
  });
}

export async function listSessions() {
  const database = await openDatabase();
  const sessions = await requestToPromise(database.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE).getAll());

  return sessions.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function loadSession(sessionId) {
  const database = await openDatabase();
  const transaction = database.transaction([SESSION_STORE, SESSION_DATA_STORE], 'readonly');
  const metadata = await requestToPromise(transaction.objectStore(SESSION_STORE).get(sessionId));
  const data = await requestToPromise(transaction.objectStore(SESSION_DATA_STORE).get(sessionId));

  return metadata && data ? { metadata, data } : null;
}

export async function deleteSession(sessionId) {
  const database = await openDatabase();

  await runTransaction(database, [SESSION_STORE, SESSION_DATA_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(SESSION_STORE).delete(sessionId);
    transaction.objectStore(SESSION_DATA_STORE).delete(sessionId);
  });
}

export function loadMappingMemory() {
  try {
    const rawValue = window.localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberConceptMappings(namespace, decisions) {
  if (!decisions?.length) {
    return;
  }

  const memory = loadMappingMemory();
  const namespaceMemory = { ...(memory[namespace] ?? {}) };

  decisions.forEach((decision) => {
    const key = getMappingKey(namespace, decision);
    if (!key) {
      return;
    }

    namespaceMemory[key] = {
      targetId: decision.targetId ?? '',
      targetName: decision.targetName ?? '',
      action: decision.action ?? '',
      excluded: Boolean(decision.excluded),
      approved: Boolean(decision.approved),
      sequence: decision.sequence ?? '',
      savedAt: new Date().toISOString(),
    };
  });

  try {
    window.localStorage.setItem(
      MAPPING_STORAGE_KEY,
      JSON.stringify({ ...memory, [namespace]: namespaceMemory }),
    );
  } catch {
    // A blocked or full localStorage should not interrupt the mapping flow.
  }
}

export function applyStoredConceptMapping(namespace, decision, { concepts = [] } = {}) {
  const memory = loadMappingMemory();
  const stored = memory[namespace]?.[getMappingKey(namespace, decision)];

  if (!stored) {
    return decision;
  }

  if (stored.excluded) {
    return {
      ...decision,
      action: 'exclude',
      matchStatus: 'excluded',
      excluded: true,
      targetConcept: null,
      targetId: '',
      targetName: '',
      approved: true,
    };
  }

  if (stored.action === 'create' && stored.targetId) {
    return {
      ...decision,
      action: 'create',
      matchStatus: 'proposal',
      targetConcept: null,
      targetId: stored.targetId,
      targetName: stored.targetName || decision.sourceName,
      sequence: stored.sequence || decision.proposedSequence,
      excluded: false,
      approved: stored.approved,
    };
  }

  const targetConcept = concepts.find((concept) => concept.id === stored.targetId);
  if (!targetConcept) {
    return decision;
  }

  return {
    ...decision,
    action: 'reuse',
    matchStatus: stored.approved ? 'assigned' : decision.matchStatus,
    targetConcept,
    targetId: targetConcept.id,
    targetName: targetConcept.name,
    excluded: false,
    approved: stored.approved,
  };
}

export function applyStoredHistoricalMapping(namespace, decision, { concepts = [] } = {}) {
  const memory = loadMappingMemory();
  const stored = memory[namespace]?.[getMappingKey(namespace, decision)];

  if (!stored) {
    return decision;
  }

  if (stored.excluded) {
    return {
      ...decision,
      excluded: true,
      approved: true,
      targetConcept: null,
      targetId: '',
      targetName: '',
    };
  }

  const targetConcept = concepts.find((concept) => concept.id === stored.targetId);
  if (!targetConcept) {
    return decision;
  }

  return {
    ...decision,
    targetConcept,
    targetId: targetConcept.id,
    targetName: targetConcept.name,
    excluded: false,
    approved: stored.approved,
  };
}

function getMappingKey(namespace, decision) {
  const sourceCode = normalizeText(decision.sourceCode);
  const sourceKey = normalizeText(decision.sourceKey);
  const sourceName = normalizeText(decision.sourceName);
  const stableValue = sourceCode || sourceKey || sourceName;

  return stableValue ? `${namespace}:${stableValue}` : '';
}

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('El navegador no permite memoria local avanzada.'));
        return;
      }

      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SESSION_STORE)) {
          database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(SESSION_DATA_STORE)) {
          database.createObjectStore(SESSION_DATA_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la memoria local.'));
    });
  }

  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la memoria local.'));
  });
}

function runTransaction(database, storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    callback(transaction);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar en la memoria local.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo guardar en la memoria local.'));
  });
}
