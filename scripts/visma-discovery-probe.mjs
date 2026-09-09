const BASE_URL = 'https://apim.vismalatam.com';
const ENTITY_EMPLOYEE_TYPE = 1;

const input = await readStdinJson();
const username = String(input.username || '').trim();
const password = String(input.password || '').trim();
const subscriptionKey = String(input.subscriptionKey || '').trim();

if (!username || !password) {
  throw new Error('Debes enviar JSON por stdin con username y password.');
}

const result = {
  fetchedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  auth: {},
  tenants: [],
  selectedTenant: null,
  endpoints: [],
  candidateMapping: buildCandidateMapping(),
};

try {
  const login = await loginWithPassword({ username, password });
  const token = login.access_token || login.accessToken || login.token;
  result.auth = {
    ok: Boolean(token),
    tokenType: login.token_type || login.tokenType || 'Bearer',
    expiresInSeconds: login.expires_in || login.expiresIn || null,
    keys: Object.keys(login),
  };

  if (!token) {
    throw new Error('VISMA no retorno access_token.');
  }

  await inspectTenantlessEndpoint({
    token,
    label: 'account/user-info',
    path: '/vlwebapiadmin/account/user-info',
  });

  const tenantsPayload = await requestJson({
    token,
    path: '/vlwebapiadmin/account/tenants?onlyWithAdminAccess=false',
    accept: 'application/json',
  });
  const tenants = asArray(tenantsPayload.body);
  result.tenants = tenants.map((tenant) => ({
    id: tenant.Id ?? tenant.id ?? tenant.ID ?? null,
    name: tenant.TenantName ?? tenant.tenantName ?? tenant.Name ?? tenant.name ?? '',
    webApiEnabled: tenant.WebApiEnabled ?? tenant.webApiEnabled ?? null,
    keys: Object.keys(tenant),
  }));

  const selectedTenant = result.tenants.find((tenant) => tenant.webApiEnabled !== false && tenant.id != null) ??
    result.tenants.find((tenant) => tenant.id != null) ??
    null;
  result.selectedTenant = selectedTenant;

  if (!selectedTenant?.id) {
    throw new Error('No se encontro tenant habilitado para probar endpoints.');
  }

  const tenantId = String(selectedTenant.id);
  await inspectRaetEndpoint({
    token,
    tenantId,
    label: 'account/roles',
    path: '/vlwebapiadmin/account/roles',
  });
  await inspectRaetEndpoint({
    token,
    tenantId,
    label: 'account/tenants/dbinfo',
    path: '/vlwebapiadmin/account/tenants/dbinfo',
  });

  const employees = await inspectRaetEndpoint({
    token,
    tenantId,
    label: 'vlwebapi/employees',
    path: '/vlwebapi/employees?page=1&pageSize=5&active=true',
  });
  const employeeSample = firstArrayItem(employees?.body);
  const fileNumber = employeeSample?.fileNumber ??
    employeeSample?.FileNumber ??
    employeeSample?.externalId ??
    employeeSample?.ExternalId ??
    employeeSample?.number ??
    employeeSample?.Number;
  const internalId = employeeSample?.id ?? employeeSample?.Id ?? employeeSample?.idEmployee ?? employeeSample?.IdEmployee;

  const searchEmployees = await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'search/employees',
    path: '/search/api/search-engines/employees?Page=1&PageSize=5',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/structure-types',
    path: '/organization/api/structure-types?HasManager=false',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/models',
    path: '/organization/api/organization-models',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/positions',
    path: '/organization/api/position',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/grades',
    path: '/organization/api/grade',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/payment-methods',
    path: '/organization/api/payment-methods',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/payment-types',
    path: '/organization/api/payment-types',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'organization/banks-structure-41',
    path: '/organization/api/structures/41/Structures',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'payroll/settings-concepts',
    path: '/PayrollOperationSettings/api/payroll-concepts?PageNumber=1&PageSize=10&OrderBy=id',
  });
  const payrollProcesses = await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'payroll/processes',
    path: '/Payroll/api/payroll-processes?PageNumber=1&PageSize=5&OrderBy=id',
  });
  await inspectTenantEndpoint({
    token,
    tenantId,
    subscriptionKey,
    label: 'payroll/banking-exports',
    path: '/Payroll/api/banking-exports?PageNumber=1&PageSize=5',
  });

  if (fileNumber) {
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/fileNumber/detail',
      path: `/vlwebapi/employees/${encodeURIComponent(fileNumber)}`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/fileNumber/addresses',
      path: `/vlwebapi/employees/${encodeURIComponent(fileNumber)}/addresses`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/fileNumber/phones',
      path: `/vlwebapi/employees/${encodeURIComponent(fileNumber)}/phones`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/fileNumber/phases',
      path: `/vlwebapi/employees/${encodeURIComponent(fileNumber)}/phases?page=1&pageSize=5&active=true`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/fileNumber/structures',
      path: `/vlwebapi/employees/${encodeURIComponent(fileNumber)}/structures?page=1&pageSize=10`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/fileNumber/bank-accounts',
      path: `/vlwebapi/employees/${encodeURIComponent(fileNumber)}/bank-accounts?active=true`,
    });
  }

  const payrollProcessSample = firstArrayItem(payrollProcesses?.body);
  const searchEmployeeSample = firstArrayItem(searchEmployees?.body);
  const payrollProcessId = payrollProcessSample?.id ?? payrollProcessSample?.Id;
  const searchEmployeeId = searchEmployeeSample?.idEmployee ??
    searchEmployeeSample?.IdEmployee ??
    searchEmployeeSample?.idPerson ??
    searchEmployeeSample?.IdPerson ??
    internalId;

  if (payrollProcessId) {
    await inspectTenantEndpoint({
      token,
      tenantId,
      subscriptionKey,
      label: 'payroll/process/detail',
      path: `/Payroll/api/payroll-processes/${encodeURIComponent(payrollProcessId)}`,
    });
    await inspectTenantEndpoint({
      token,
      tenantId,
      subscriptionKey,
      label: 'payroll/process/employees',
      path: `/Payroll/api/payroll-processes/${encodeURIComponent(payrollProcessId)}/employees?PageNumber=1&PageSize=5`,
    });
  }

  if (payrollProcessId && searchEmployeeId) {
    await inspectTenantEndpoint({
      token,
      tenantId,
      subscriptionKey,
      label: 'payroll/process/employee/concepts',
      path: `/Payroll/api/payroll-processes/${encodeURIComponent(payrollProcessId)}/employees/${encodeURIComponent(searchEmployeeId)}/concepts`,
    });
  }

  if (internalId) {
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/internalId/detail',
      path: `/vlwebapi/employees/rh-${encodeURIComponent(internalId)}`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/internalId/phases',
      path: `/vlwebapi/employees/rh-${encodeURIComponent(internalId)}/phases?page=1&pageSize=5&active=true`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/internalId/structures',
      path: `/vlwebapi/employees/rh-${encodeURIComponent(internalId)}/structures?page=1&pageSize=10`,
    });
    await inspectRaetEndpoint({
      token,
      tenantId,
      label: 'employee/internalId/bank-accounts',
      path: `/vlwebapi/employees/rh-${encodeURIComponent(internalId)}/bank-accounts?active=true`,
    });
    await inspectTenantEndpoint({
      token,
      tenantId,
      subscriptionKey,
      label: 'contact/emails',
      path: `/contact/api/emails?idEntity=${encodeURIComponent(internalId)}&idEntityType=${ENTITY_EMPLOYEE_TYPE}`,
    });
    await inspectTenantEndpoint({
      token,
      tenantId,
      subscriptionKey,
      label: 'contact/phones',
      path: `/contact/api/phones?idEntity=${encodeURIComponent(internalId)}&idEntityType=${ENTITY_EMPLOYEE_TYPE}`,
    });
  }
} catch (error) {
  result.error = describeError(error);
}

console.log(JSON.stringify(result, null, 2));

async function inspectTenantlessEndpoint({ token, label, path }) {
  const response = await requestJson({ token, path, accept: 'application/json' });
  pushEndpoint(label, path, response);
  return response;
}

async function inspectRaetEndpoint({ token, tenantId, label, path }) {
  const response = await requestJson({
    token,
    path,
    tenantHeaderName: 'X-RAET-Tenant-Id',
    tenantId,
    accept: 'application/json',
  });
  pushEndpoint(label, path, response);
  return response;
}

async function inspectTenantEndpoint({ token, tenantId, subscriptionKey, label, path }) {
  const response = await requestJson({
    token,
    path,
    tenantHeaderName: 'X-Tenant-Id',
    tenantId,
    subscriptionKey,
    accept: 'text/plain',
  });
  pushEndpoint(label, path, response);
  return response;
}

function pushEndpoint(label, path, response) {
  result.endpoints.push({
    label,
    path: redactPath(path),
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    summary: summarizePayload(response.body),
    error: response.ok ? '' : summarizeError(response.body, response.text),
  });
}

async function loginWithPassword({ username, password }) {
  const body = new URLSearchParams();
  body.set('grant_type', 'password');
  body.set('username', username);
  body.set('password', password);

  const response = await fetchWithRetry(`${BASE_URL}/vlwebapiadmin/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text = await response.text();
  const data = parseJsonSafe(text) ?? {};

  if (!response.ok) {
    throw new Error(`Login VISMA HTTP ${response.status}: ${summarizeError(data, text)}`);
  }

  return data;
}

async function requestJson({ token, path, tenantHeaderName, tenantId, subscriptionKey, accept }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: accept || 'application/json',
  };

  if (subscriptionKey) {
    headers['Ocp-Apim-Subscription-Key'] = subscriptionKey;
  }

  if (tenantHeaderName && tenantId) {
    headers[tenantHeaderName] = tenantId;
  }

  const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers });
  const text = await response.text();
  const body = parseJsonSafe(text);

  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    text,
    body,
  };
}

function summarizePayload(payload) {
  if (payload == null) {
    return { type: 'empty', itemCount: 0, sampleKeys: [] };
  }

  const items = asArray(payload);
  const sample = items[0] ?? payload;
  const objectSample = sample && typeof sample === 'object' && !Array.isArray(sample) ? sample : {};

  return {
    type: Array.isArray(payload) ? 'array' : typeof payload,
    itemCount: items.length,
    totalCount: payload && typeof payload === 'object' ? payload.totalCount ?? payload.TotalCount ?? null : null,
    topLevelKeys: payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).slice(0, 40) : [],
    sampleKeys: Object.keys(objectSample).slice(0, 60),
    nestedKeys: summarizeNestedKeys(objectSample),
  };
}

function summarizeNestedKeys(objectSample) {
  return Object.entries(objectSample)
    .filter(([, value]) => value && typeof value === 'object')
    .slice(0, 12)
    .map(([key, value]) => ({
      key,
      type: Array.isArray(value) ? 'array' : 'object',
      keys: Object.keys(Array.isArray(value) ? value[0] ?? {} : value).slice(0, 20),
    }));
}

function summarizeError(body, text) {
  const raw = body?.message || body?.Message || body?.error || body?.error_description || text || '';
  return String(raw).replace(/\s+/g, ' ').slice(0, 280);
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [
    payload.items,
    payload.Items,
    payload.data,
    payload.Data,
    payload.results,
    payload.Results,
    payload.paginationList,
    payload.PaginationList,
    payload.paginatedList,
    payload.PaginatedList,
    payload.values,
    payload.Values,
    payload.value,
    payload.Value,
    payload.content,
    payload.Content,
  ];
  return candidates.find(Array.isArray) ?? [];
}

function firstArrayItem(payload) {
  return asArray(payload)[0] ?? null;
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function redactPath(path) {
  return String(path)
    .replace(/employees\/[^/?]+/g, 'employees/{employee}')
    .replace(/idEntity=\d+/g, 'idEntity={id}');
}

function buildCandidateMapping() {
  return [
    {
      rexFile: 'Empleados',
      vismaSources: [
        'vlwebapi/employees',
        'employees/{fileNumber}/addresses',
        'employees/{fileNumber}/phones',
        'employees/{fileNumber}/phases',
        'employees/{fileNumber}/structures',
        'employees/{fileNumber}/bank-accounts',
      ],
      rexCriticalFields: [
        'Id empleado',
        'Nombres',
        'Apellidos',
        'Sexo',
        'Fecha de nacimiento',
        'Comuna/Ciudad/Region',
        'Id banco',
        'Cuenta del banco',
        'Id forma de pago',
        'Id AFP',
        'Id institucion de salud',
        'Tipo del contrato',
        'Fecha de inicio del contrato',
        'Sueldo base',
        'Cargo',
        'Id centro de costo',
        'Id sede donde se desempena',
        'Id empresa',
        'Area',
      ],
    },
    {
      rexFile: 'Conceptos',
      vismaSources: [
        'PayrollOperationSettings/api/payroll-concepts',
        'Payroll/api/payroll-concepts/{id}/parameters',
      ],
      rexCriticalFields: [
        'concepto_id',
        'Nombre',
        'Tipo',
        'Secuencia',
        'Comportamiento',
        'Codigo LRE',
      ],
    },
    {
      rexFile: 'Liquidaciones historicas',
      vismaSources: [
        'Payroll/api/payroll-processes',
        'Payroll/api/payroll-processes/{idProcess}/employees/{idEmployee}/concepts',
      ],
      rexCriticalFields: [
        'Fecha de proceso',
        'Id empleado',
        'Numero de contrato',
        'Id del concepto',
        'Monto del concepto',
        'Dias trabajados',
        'Empresa',
        'Jornada',
      ],
    },
  ];
}

async function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  throw lastError;
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause instanceof Error
    ? ` (${error.cause.name}: ${error.cause.message})`
    : error.cause
      ? ` (${String(error.cause)})`
      : '';

  return `${error.message}${cause}`;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  return JSON.parse(text || '{}');
}
