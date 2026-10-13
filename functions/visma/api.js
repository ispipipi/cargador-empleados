import { parseJsonSafe, buildVismaErrorMessage } from './shared.js';

const VISMA_BASE_URL = globalThis.process?.env?.VISMA_BASE_URL || 'https://apim.vismalatam.com';

export async function loginToVisma({ username, password }) {
  const body = new URLSearchParams();
  body.set('grant_type', 'password');
  body.set('username', username);
  body.set('password', password);

  const vismaResponse = await fetch(`${VISMA_BASE_URL}/vlwebapiadmin/authentication/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await vismaResponse.text();
  const payload = parseJsonSafe(text);

  if (!vismaResponse.ok) {
    const error = new Error(buildVismaErrorMessage('/vlwebapiadmin/authentication/login', vismaResponse.status, payload, text));
    error.status = vismaResponse.status;
    throw error;
  }

  return payload || {};
}

export async function getVismaAdminJson({ token, path }) {
  return getVismaJson({ token, path });
}

export async function getVismaRaetJson({ token, tenantId, subscriptionKey, path }) {
  return getVismaJson({
    token,
    path,
    tenantHeaderName: 'X-RAET-Tenant-Id',
    tenantId,
    subscriptionKey,
  });
}

export async function getVismaTenantJson({ token, tenantId, subscriptionKey, path }) {
  return getVismaJson({
    token,
    path,
    tenantHeaderName: 'X-Tenant-Id',
    tenantId,
    subscriptionKey,
  });
}

export async function getVismaLeavesJson({ token, tenantId, subscriptionKey, path }) {
  return getVismaJson({
    token,
    path,
    tenantHeaderName: 'X-Tenant-Id',
    tenantId,
    subscriptionKey,
  });
}

async function getVismaJson({ token, path, tenantHeaderName, tenantId, subscriptionKey }) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (tenantHeaderName && tenantId) {
    headers[tenantHeaderName] = tenantId;
  }

  if (subscriptionKey) {
    headers['Ocp-Apim-Subscription-Key'] = subscriptionKey;
  }

  const vismaResponse = await fetch(`${VISMA_BASE_URL}${path}`, { headers });
  const text = await vismaResponse.text();
  const payload = parseJsonSafe(text);

  if (!vismaResponse.ok) {
    const error = new Error(buildVismaErrorMessage(path, vismaResponse.status, payload, text));
    error.status = vismaResponse.status;
    throw error;
  }

  return payload;
}
