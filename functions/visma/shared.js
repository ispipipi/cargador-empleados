const ALLOWED_ORIGINS = new Set([
  'https://ispipipi.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8088',
]);

export function firstItem(payload) {
  return arrayValues(payload)[0] ?? null;
}

export function arrayValues(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.values)) {
    return payload.values;
  }

  if (Array.isArray(payload?.paginationList)) {
    return payload.paginationList;
  }

  if (Array.isArray(payload?.paginatedList)) {
    return payload.paginatedList;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.result)) {
    return payload.result;
  }

  if (Array.isArray(payload?.payElements)) {
    return payload.payElements;
  }

  return [];
}

export function findMainDocument(employee) {
  const documents = Array.isArray(employee.nationalIdentificationNumbers) ? employee.nationalIdentificationNumbers : [];
  return cleanValue((documents.find((item) => item.mainDocument) ?? documents[0])?.number);
}

export function setCorsHeaders(request, response) {
  const origin = String(request.headers.origin || '');
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://ispipipi.github.io';

  response.set('Access-Control-Allow-Origin', allowedOrigin);
  response.set('Vary', 'Origin');
  response.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export function parseJsonSafe(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function buildVismaErrorMessage(path, status, data, text) {
  const message =
    data?.Message ||
    data?.message ||
    data?.error_description ||
    data?.error ||
    (typeof data === 'string' ? data : '') ||
    String(text || '').slice(0, 240);

  return message
    ? `${path}: VISMA respondio HTTP ${status}. ${message}`
    : `${path}: VISMA respondio HTTP ${status}.`;
}

export function cleanValue(value) {
  return String(value ?? '').trim();
}

export function cleanNamePart(value) {
  const cleaned = cleanValue(value);
  return /^[.\-_]+$/.test(cleaned) ? '' : cleaned;
}

export function extractVismaText(value) {
  if (value && typeof value === 'object') {
    return cleanValue(value.description || value.name || value.label || value.code || value.id);
  }

  return cleanValue(value);
}

export function normalizeLookupText(value) {
  return cleanValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function getSecretValue(secret) {
  try {
    return secret.value();
  } catch {
    return '';
  }
}
