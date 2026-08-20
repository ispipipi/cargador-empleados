import http from 'node:http';

const PORT = Number(process.env.GEOVICTORIA_PROXY_PORT || process.env.PORT || 8787);
const BASE_URL = process.env.GEOVICTORIA_BASE_URL || 'https://customerapi.geovictoria.com/api/v1';
const MAX_OVERTIME_RECORDS = 1500;

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/geovictoria/payroll-preview') {
    sendJson(response, 404, { ok: false, message: 'Ruta no disponible.' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const apiKey = String(body.apiKey || '').trim();
    const apiSecret = String(body.apiSecret || '');
    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();

    if (!apiKey || !apiSecret || !isIsoDate(startDate) || !isIsoDate(endDate)) {
      sendJson(response, 400, { ok: false, message: 'Debes enviar clave API, secreto, fecha inicio y fecha termino validas.' });
      return;
    }

    const tokenResponse = await postToGeovictoria('/Login', {
      User: apiKey,
      Password: apiSecret,
    });
    const token = tokenResponse?.token;

    if (!token) {
      sendJson(response, 502, { ok: false, message: 'GeoVictoria no retorno token de autenticacion.' });
      return;
    }

    const users = await postToGeovictoria('/User/ActiveUsers', {}, token);
    const activeUsers = Array.isArray(users) ? users : [];
    const identifiers = activeUsers.map((user) => user.Identifier).filter(Boolean);
    const attendanceBook = await fetchAttendanceBook({ token, identifiers, startDate, endDate });
    const overtime = await fetchOvertimeSafely({ token, identifiers, startDate, endDate });

    sendJson(response, 200, {
      ok: true,
      users: activeUsers,
      attendanceBook,
      overtime,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendJson(response, error.status || 502, {
      ok: false,
      message: error instanceof Error ? error.message : 'No se pudo consultar GeoVictoria.',
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`GeoVictoria proxy escuchando en http://127.0.0.1:${PORT}`);
});

async function fetchAttendanceBook({ token, identifiers, startDate, endDate }) {
  const chunks = chunkArray(identifiers, 120);
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
  const chunkSize = Math.max(1, Math.floor(MAX_OVERTIME_RECORDS / Math.max(1, days)));
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
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = parseJsonSafe(text);

  if (!response.ok) {
    const error = new Error(buildGeovictoriaErrorMessage(path, response.status, data, text));
    error.status = response.status;
    throw error;
  }

  return data;
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

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let contents = '';

    request.on('data', (chunk) => {
      contents += chunk;
      if (contents.length > 1024 * 1024) {
        request.destroy();
        reject(new Error('Request demasiado grande.'));
      }
    });

    request.on('end', () => {
      try {
        resolve(contents ? JSON.parse(contents) : {});
      } catch {
        reject(new Error('JSON invalido.'));
      }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.GEOVICTORIA_ALLOWED_ORIGIN || 'http://localhost:5173');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
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
