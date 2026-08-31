import { normalizeText } from './utils';

const DATABASE_NAME = 'maper-local-memory';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const SESSION_DATA_STORE = 'session-data';
const MAPPING_STORAGE_KEY = 'maper.mapping-memory.v1';
const CONCEPT_CATALOG_STORAGE_KEY = 'maper.concept-catalog.v1';
const LEGACY_MAPPING_SCOPE_KEY = 'meta4:rex:finning';

let databasePromise;

export function createSessionId() {
  return crypto.randomUUID();
}

export function createSessionMetadata({ id, selectedModule, selectedOrigin, selectedDestination, mappingCompany, sourceFile, step }) {
  return {
    id,
    selectedModule,
    selectedOrigin,
    selectedDestination,
    mappingCompany: mappingCompany ?? 'FINNING',
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

export function loadConceptCatalogMemory() {
  try {
    const rawValue = window.localStorage.getItem(CONCEPT_CATALOG_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveConceptCatalogMemory(concepts) {
  if (!Array.isArray(concepts) || concepts.length === 0) {
    return;
  }

  try {
    window.localStorage.setItem(CONCEPT_CATALOG_STORAGE_KEY, JSON.stringify(concepts));
    window.dispatchEvent(new CustomEvent('maper-concept-catalog-changed', {
      detail: { concepts },
    }));
  } catch {
    // A blocked or full localStorage should not interrupt the mapping flow.
  }
}

export function rememberConceptMappings(namespace, decisions, scope) {
  if (!decisions?.length) {
    return;
  }

  const memory = loadMappingMemory();
  const namespaceMemory = { ...(memory[namespace] ?? {}) };
  const mappingScope = normalizeMappingScope(scope);

  decisions.forEach((decision) => {
    const key = getMappingKey(namespace, decision, mappingScope.key);
    if (!key) {
      return;
    }

    namespaceMemory[key] = {
      sourceName: decision.sourceName ?? '',
      sourceCode: decision.sourceCode ?? '',
      sourceKey: decision.sourceKey ?? '',
      targetId: decision.targetId ?? '',
      targetName: decision.targetName ?? '',
      action: decision.action ?? '',
      excluded: Boolean(decision.excluded),
      approved: Boolean(decision.approved),
      sequence: decision.sequence ?? '',
      type: decision.type ?? '',
      lreField: decision.lreField ?? '',
      classification: decision.classification ?? '',
      scopeKey: mappingScope.key,
      scopeOrigin: mappingScope.origin,
      scopeDestination: mappingScope.destination,
      scopeCompany: mappingScope.company,
      savedAt: new Date().toISOString(),
    };
  });

  try {
    window.localStorage.setItem(
      MAPPING_STORAGE_KEY,
      JSON.stringify({ ...memory, [namespace]: namespaceMemory }),
    );
    window.dispatchEvent(new CustomEvent('maper-mappings-changed', {
      detail: { namespace, entries: namespaceMemory },
    }));
  } catch {
    // A blocked or full localStorage should not interrupt the mapping flow.
  }

  return namespaceMemory;
}

export function mergeStoredMappingEntries(namespace, entries) {
  if (!entries || typeof entries !== 'object' || Object.keys(entries).length === 0) {
    return;
  }

  const memory = loadMappingMemory();

  try {
    window.localStorage.setItem(
      MAPPING_STORAGE_KEY,
      JSON.stringify({
        ...memory,
        [namespace]: {
          ...entries,
          ...(memory[namespace] ?? {}),
        },
      }),
    );
  } catch {
    // A blocked or full localStorage should not interrupt the mapping flow.
  }
}

export function applyStoredConceptMapping(namespace, decision, { concepts = [], scope } = {}) {
  const memory = loadMappingMemory();
  const mappingScope = normalizeMappingScope(scope);
  const stored = findStoredMapping(memory, namespace, decision, mappingScope);

  if (!stored || !isConfirmedStoredMapping(stored)) {
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

  const storedTargetConcept = findStoredConceptTarget(concepts, stored);

  if (stored.action === 'create' && stored.targetId && !storedTargetConcept) {
    return {
      ...decision,
      action: 'create',
      matchStatus: 'exact',
      matchOrigin: 'memory',
      targetConcept: null,
      targetId: stored.targetId,
      targetName: stored.targetName || decision.sourceName,
      sequence: stored.sequence || decision.proposedSequence,
      excluded: false,
      approved: true,
    };
  }

  if (storedTargetConcept) {
    return {
      ...decision,
      action: 'reuse',
      matchStatus: 'exact',
      matchOrigin: 'memory',
      targetConcept: storedTargetConcept,
      targetId: storedTargetConcept.id,
      targetName: storedTargetConcept.name,
      excluded: false,
      approved: true,
    };
  }

  if (stored.action !== 'reuse' || !stored.targetId) {
    return decision;
  }

  return {
    ...decision,
    action: 'reuse',
    matchStatus: 'exact',
    matchOrigin: 'memory',
    targetConcept: null,
    targetId: stored.targetId,
    targetName: stored.targetName || decision.sourceName,
    excluded: false,
    approved: true,
  };
}

export function applyStoredHistoricalMapping(namespace, decision, { concepts = [], scope, strictCatalog = false } = {}) {
  if (decision.autoExcluded) {
    return decision;
  }

  const memory = loadMappingMemory();
  const mappingScope = normalizeMappingScope(scope);
  const stored = findStoredHistoricalMapping(memory, namespace, decision, mappingScope);

  if (!stored || !isConfirmedStoredMapping(stored)) {
    return decision;
  }

  if (stored.excluded) {
    return {
      ...decision,
      action: 'exclude',
      matchStatus: 'excluded',
      excluded: true,
      approved: true,
      targetConcept: null,
      targetId: '',
      targetName: '',
    };
  }

  const storedTargetConcept = findStoredConceptTarget(concepts, stored);

  if (stored.action === 'create' && stored.targetId && !storedTargetConcept) {
    return {
      ...decision,
      action: 'create',
      matchStatus: 'exact',
      exactMatch: true,
      matchOrigin: 'memory',
      targetConcept: null,
      targetId: stored.targetId,
      targetName: stored.targetName || decision.sourceName,
      sequence: stored.sequence || decision.proposedSequence,
      type: stored.type || decision.type,
      lreField: stored.lreField || decision.lreField,
      excluded: false,
      approved: true,
    };
  }

  if (storedTargetConcept) {
    return {
      ...decision,
      action: 'reuse',
      matchStatus: 'exact',
      exactMatch: true,
      matchOrigin: 'memory',
      targetConcept: storedTargetConcept,
      targetId: storedTargetConcept.id,
      targetName: storedTargetConcept.name,
      excluded: false,
      approved: true,
    };
  }

  if (stored.action !== 'reuse' || !stored.targetId) {
    return decision;
  }

  if (strictCatalog) {
    return decision;
  }

  return {
    ...decision,
    action: 'reuse',
    matchStatus: 'exact',
    exactMatch: true,
    matchOrigin: 'memory',
    targetConcept: null,
    targetId: stored.targetId,
    targetName: stored.targetName || decision.sourceName,
    excluded: false,
    approved: true,
  };
}

function isConfirmedStoredMapping(stored) {
  return Boolean(stored?.approved) || stored?.action === 'reuse' || stored?.action === 'exclude';
}

function findStoredConceptTarget(concepts, stored) {
  const targetById = concepts.find((concept) => concept.id === stored.targetId);
  if (targetById) {
    return targetById;
  }

  const storedName = normalizeConceptLabel(stored.targetName);
  if (!storedName) {
    return null;
  }

  return concepts.find((concept) => normalizeConceptLabel(concept.name) === storedName) ?? null;
}

function normalizeConceptLabel(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function findStoredHistoricalMapping(memory, namespace, decision, mappingScope) {
  const namespaceMemory = memory[namespace] ?? {};
  const conceptsMemory = memory.concepts ?? memory.conceptos ?? {};
  const mappingKey = getMappingKey(namespace, decision, mappingScope.key);
  const direct = namespaceMemory[mappingKey] ?? findLegacyScopedMapping(namespaceMemory, decision, mappingScope);

  if (direct) {
    return direct;
  }

  const conceptKey = getMappingKey('concepts', decision, mappingScope.key);
  if (conceptKey && conceptsMemory[conceptKey]) {
    return conceptsMemory[conceptKey];
  }

  const sourceCode = normalizeMappingValue(decision.sourceCode);
  const sourceName = normalizeMappingSource(decision.sourceName);
  const sourceKey = normalizeMappingSource(decision.sourceKey);

  return Object.entries(conceptsMemory).find(([key, entry]) => {
    if (!isMappingEntryInScope(entry, mappingScope)) {
      return false;
    }

    const keyValue = normalizeMappingValue(key.replace(/^[^:]+:/, ''));
    const entryCode = normalizeMappingValue(entry?.sourceCode);
    const entryName = normalizeMappingSource(entry?.sourceName);
    const entryKey = normalizeMappingSource(entry?.sourceKey);

    return (
      (sourceCode && (keyValue === sourceCode || entryCode === sourceCode)) ||
      (sourceName && (entryName === sourceName || keyValue === sourceName)) ||
      (sourceKey && (entryKey === sourceKey || keyValue === sourceKey))
    );
  })?.[1];
}

function findStoredMapping(memory, namespace, decision, mappingScope) {
  const namespaceMemory = memory[namespace] ?? {};
  return namespaceMemory[getMappingKey(namespace, decision, mappingScope.key)]
    ?? findLegacyScopedMapping(namespaceMemory, decision, mappingScope);
}

function findLegacyScopedMapping(namespaceMemory, decision, mappingScope) {
  if (mappingScope.key !== LEGACY_MAPPING_SCOPE_KEY) {
    return null;
  }

  const sourceCode = normalizeMappingValue(decision.sourceCode);
  const sourceName = normalizeMappingSource(decision.sourceName);
  const sourceKey = normalizeMappingSource(decision.sourceKey);

  return Object.entries(namespaceMemory).find(([key, entry]) => {
    if (entry?.scopeKey || !isMappingEntryInScope(entry, mappingScope)) {
      return false;
    }

    return mappingEntryMatches([key, entry], sourceCode, sourceName, sourceKey);
  })?.[1] ?? null;
}

function mappingEntryMatches([key, entry], sourceCode, sourceName, sourceKey) {
  const keyValue = normalizeMappingValue(key.replace(/^[^:]+:/, ''));
  const entryCode = normalizeMappingValue(entry?.sourceCode);
  const entryName = normalizeMappingSource(entry?.sourceName);
  const entryKey = normalizeMappingSource(entry?.sourceKey);

  return (
    (sourceCode && (keyValue === sourceCode || entryCode === sourceCode)) ||
    (sourceName && (entryName === sourceName || keyValue === sourceName)) ||
    (sourceKey && (entryKey === sourceKey || keyValue === sourceKey))
  );
}

function isMappingEntryInScope(entry, mappingScope) {
  return entry?.scopeKey ? entry.scopeKey === mappingScope.key : mappingScope.key === LEGACY_MAPPING_SCOPE_KEY;
}

export function normalizeMappingScope({ origin = 'meta4', destination = 'rex', company = 'FINNING' } = {}) {
  const normalizedOrigin = normalizeScopePart(origin).replace(/-historico$/, '') || 'meta4';
  const normalizedDestination = normalizeScopePart(destination) || 'rex';
  const normalizedCompany = normalizeScopePart(company) || 'finning';

  return {
    origin: normalizedOrigin,
    destination: normalizedDestination,
    company: normalizedCompany,
    key: `${normalizedOrigin}:${normalizedDestination}:${normalizedCompany}`,
  };
}

function normalizeScopePart(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeMappingValue(value) {
  const normalized = normalizeText(value);
  return ['-', '—', 'n/a', 'na', 'null', 'undefined'].includes(normalized) ? '' : normalized;
}

function normalizeMappingSource(value) {
  return normalizeConceptLabel(
    cleanMappingSource(value)
      .replace(/\b(?:original|orig)\b/g, ' ')
      .replace(/\b\d+\s*\/\s*\d+\b/g, ' '),
  );
}

function cleanMappingSource(value) {
  return normalizeText(value).replace(/([a-z])\?([a-z])/g, '$1n$2');
}

function getMappingKey(namespace, decision, scopeKey = '') {
  const sourceCode = normalizeMappingValue(decision.sourceCode);
  const sourceKey = normalizeMappingValue(decision.sourceKey);
  const sourceName = normalizeMappingValue(decision.sourceName);
  const stableValue = sourceCode || sourceKey || sourceName;

  return stableValue ? `${namespace}:${scopeKey ? `${scopeKey}:` : ''}${stableValue}` : '';
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
