import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const geovictoriaApiKey = defineSecret('GEOVICTORIA_API_KEY');
const geovictoriaApiSecret = defineSecret('GEOVICTORIA_API_SECRET');
const BASE_URL = globalThis.process?.env?.GEOVICTORIA_BASE_URL || 'https://customerapi.geovictoria.com/api/v1';
const MAX_REQUESTED_RECORDS = 1500;
const MAX_USERS_PER_REQUEST = 200;
const ALLOWED_ORIGINS = new Set([
  'https://ispipipi.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8088',
]);

export const geovictoriaProxy = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: [geovictoriaApiKey, geovictoriaApiSecret],
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).json({ ok: false, message: 'Metodo no permitido.' });
      return;
    }

    try {
      const body = typeof request.body === 'object' && request.body ? request.body : {};
      const apiKey = String(body.apiKey || getSecretValue(geovictoriaApiKey) || '').trim();
      const apiSecret = String(body.apiSecret || getSecretValue(geovictoriaApiSecret) || '').trim();
      const startDate = String(body.startDate || '').trim();
      const endDate = String(body.endDate || '').trim();

      if (!apiKey || !apiSecret || !isIsoDate(startDate) || !isIsoDate(endDate)) {
        response.status(400).json({ ok: false, message: 'Debes enviar clave API, secreto, fecha inicio y fecha termino validas.' });
        return;
      }

      const tokenResponse = await postToGeovictoria('/Login', {
        User: apiKey,
        Password: apiSecret,
      });
      const token = tokenResponse?.token;

      if (!token) {
        response.status(502).json({ ok: false, message: 'GeoVictoria no retorno token de autenticacion.' });
        return;
      }

      const users = await postToGeovictoria('/User/ActiveUsers', {}, token);
      const activeUsers = Array.isArray(users) ? users : [];
      const identifiers = activeUsers.map((user) => user.Identifier).filter(Boolean);
      const attendanceBook = await fetchAttendanceBook({ token, identifiers, startDate, endDate });
      const overtime = await fetchOvertimeSafely({ token, identifiers, startDate, endDate });

      response.status(200).json({
        ok: true,
        users: activeUsers,
        attendanceBook,
        overtime,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      response.status(error.status || 502).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar GeoVictoria.',
      });
    }
  },
);

async function fetchAttendanceBook({ token, identifiers, startDate, endDate }) {
  const days = inclusiveDays(startDate, endDate);
  const chunkSize = Math.max(1, Math.min(MAX_USERS_PER_REQUEST, Math.floor(MAX_REQUESTED_RECORDS / Math.max(1, days))));
  const chunks = chunkArray(identifiers, chunkSize);
  const responses = [];

  for (const chunk of chunks) {
    const payload = await postToGeovictoria('/AttendanceBook', {
      StartDate: `${compactDate(startDate)}000000`,
      EndDate: `${compactDate(endDate)}235959`,
      UserIds: chunk.join(','),
    }, token);
    responses.push(payload);
  }

  return {
    Users: responses.flatMap((payload) => Array.isArray(payload?.Users) ? payload.Users : []),
    ExtraTimeValues: responses.flatMap((payload) => Array.isArray(payload?.ExtraTimeValues) ? payload.ExtraTimeValues : []),
  };
}

async function fetchOvertime({ token, identifiers, startDate, endDate }) {
  const days = inclusiveDays(startDate, endDate);
  const chunkSize = Math.max(1, Math.min(MAX_USERS_PER_REQUEST, Math.floor(MAX_REQUESTED_RECORDS / Math.max(1, days))));
  const chunks = chunkArray(identifiers, chunkSize);
  const responses = [];

  for (const chunk of chunks) {
    const payload = await postToGeovictoria('/OverTime/GetOvertime', {
      StartDate: compactDate(startDate),
      EndDate: compactDate(endDate),
      UserIdentifiers: chunk.join(','),
    }, token);
    responses.push(payload);
  }

  return {
    Success: responses.every((payload) => payload?.Success !== false),
    Message: responses.map((payload) => payload?.Message).filter(Boolean).join(' '),
    Response: responses.flatMap((payload) => Array.isArray(payload?.Response) ? payload.Response : []),
  };
}

async function fetchOvertimeSafely({ token, identifiers, startDate, endDate }) {
  try {
    return await fetchOvertime({ token, identifiers, startDate, endDate });
  } catch (error) {
    return {
      Success: false,
      Message: error instanceof Error ? error.message : 'No se pudo consultar OverTime/GetOvertime.',
      Response: [],
    };
  }
}

async function postToGeovictoria(path, payload, token) {
  const geovictoriaResponse = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await geovictoriaResponse.text();
  const data = parseJsonSafe(text);

  if (!geovictoriaResponse.ok) {
    const error = new Error(buildGeovictoriaErrorMessage(path, geovictoriaResponse.status, data, text));
    error.status = geovictoriaResponse.status;
    throw error;
  }

  return data;
}

function setCorsHeaders(request, response) {
  const origin = String(request.headers.origin || '');
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://ispipipi.github.io';

  response.set('Access-Control-Allow-Origin', allowedOrigin);
  response.set('Vary', 'Origin');
  response.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function parseJsonSafe(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildGeovictoriaErrorMessage(path, status, data, text) {
  const message =
    data?.Message ||
    data?.message ||
    data?.error ||
    (typeof data === 'string' ? data : '') ||
    String(text || '').slice(0, 240);

  return message
    ? `${path}: GeoVictoria respondio HTTP ${status}. ${message}`
    : `${path}: GeoVictoria respondio HTTP ${status}.`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function compactDate(value) {
  return String(value).replace(/-/g, '');
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function inclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.floor(diff / 86400000) + 1;
}

function getSecretValue(secret) {
  try {
    return secret.value();
  } catch {
    return '';
  }
}
