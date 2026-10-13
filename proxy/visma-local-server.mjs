import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import {
  VISMA_REX_MAPPING_PROFILE,
  VISMA_REX_MASTER_LISTS,
  selectVismaMasterTypes,
} from '../functions/visma-rex-mapping.mjs';
import {
  arrayValues,
  fetchAllVismaPages,
  filterEmployeesByCompany,
  mapWithConcurrency,
  normalizeCompanyStructures,
  normalizeEmployee,
  normalizeMasterListItems,
  normalizePayrollProcesses,
  normalizeTenants,
  selectPreferredOrganizationGroup,
  selectTenant,
  sortOrganizationGroups,
  summarizeEmployees,
  tenantToCompanyOption,
  tenantToOrganizationGroup,
  uniqueCompanyOptions,
  uniqueMasterListItems,
  vismaLabel,
} from './visma-local/normalizers.mjs';

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';
const DIST_ROOT = resolve('dist');
const VISMA_BASE_URL = process.env.VISMA_BASE_URL || 'https://apim.vismalatam.com';
const VISMA_EMPLOYEE_PAGE_SIZE = 500;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const secrets = await loadSecrets();

createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/visma')) {
      await handleVismaRequest(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    response.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : 'Error local inesperado.',
    }));
  }
}).listen(PORT, HOST, () => {
  console.log(`VISMA local preview http://${HOST}:${PORT}/cargador-empleados/`);
});

async function loadSecrets() {
  const envSecrets = {
    username: String(process.env.VISMA_USERNAME || '').trim(),
    password: String(process.env.VISMA_PASSWORD || '').trim(),
    subscriptionKey: String(process.env.VISMA_SUBSCRIPTION_KEY || '').trim(),
  };

  if (envSecrets.username && envSecrets.password) {
    return envSecrets;
  }

  return {
    username: (await readMaskedLine('VISMA username: ')).trim(),
    password: (await readMaskedLine('VISMA password: ')).trim(),
    subscriptionKey: (await readMaskedLine('VISMA subscription key: ')).trim(),
  };
}

function readMaskedLine(prompt) {
  if (!input.isTTY) {
    throw new Error('Configura VISMA_USERNAME, VISMA_PASSWORD y VISMA_SUBSCRIPTION_KEY o ejecuta en terminal TTY.');
  }

  return new Promise((resolveLine, rejectLine) => {
    let value = '';

    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          cleanup();
          output.write('\n');
          rejectLine(new Error('Ingreso cancelado.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          output.write('\n');
          resolveLine(value);
          return;
        }

        if (character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }

        value += character;
        output.write('*');
      }
    };

    input.on('data', onData);
  });
}

async function handleVismaRequest(request, response) {
  if (request.method === 'OPTIONS') {
    writeJson(response, 204, '');
    return;
  }

  if (request.method !== 'POST') {
    writeJson(response, 405, { ok: false, message: 'Método no permitido.' });
    return;
  }

  const body = await readRequestJson(request);
  const action = String(body.action || 'connection-context');
  const tokenPayload = await loginToVisma();
  const token = tokenPayload.access_token;

  if (!token) {
    writeJson(response, 502, { ok: false, message: 'VISMA no retornó token de autenticación.' });
    return;
  }

  const tenants = normalizeTenants(await getVismaJson({ token, path: '/vlwebapiadmin/account/tenants?onlyWithAdminAccess=false' }));
  const tenant = selectTenant(tenants, body.tenantId);

  if (!tenant?.id) {
    writeJson(response, 502, { ok: false, message: 'No se encontró empresa VISMA habilitada para Web API.' });
    return;
  }

  const organizationGroups = secrets.subscriptionKey
    ? await discoverOrganizationGroups({ token, tenantId: tenant.id, tenant }).catch(() => [tenantToOrganizationGroup(tenant)])
    : [tenantToOrganizationGroup(tenant)];
  const selectedOrganizationGroup = selectPreferredOrganizationGroup(organizationGroups);
  const companies = selectedOrganizationGroup?.options?.length
    ? selectedOrganizationGroup.options
    : [tenantToCompanyOption(tenant)];

  if (action === 'connection-context') {
    writeJson(response, 200, {
      ok: true,
      tenants,
      selectedTenantId: tenant.id,
      organizationGroups,
      selectedCompanyTypeId: selectedOrganizationGroup?.id || '',
      companies,
      selectedCompanyId: '',
      credentials: {
        username: true,
        password: true,
        subscriptionKey: Boolean(secrets.subscriptionKey),
      },
      mappingProfile: VISMA_REX_MAPPING_PROFILE,
      capabilities: {
        employees: true,
        payrollProcesses: Boolean(secrets.subscriptionKey),
        historicalBooksDetail: false,
      },
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  if (action === 'organization-discovery') {
    if (!secrets.subscriptionKey) {
      writeJson(response, 400, { ok: false, message: 'Falta subscription key para consultar Organization.' });
      return;
    }

    const structureTypes = await getVismaJson({
      token,
      tenantId: tenant.id,
      tenantHeaderName: 'X-Tenant-Id',
      subscriptionKey: secrets.subscriptionKey,
      path: '/organization/api/structure-types?HasManager=false',
    });
    const types = await mapWithConcurrency(Array.isArray(structureTypes) ? structureTypes : [], 6, async (type) => {
      const typeId = clean(type.id ?? type.structureTypeId);
      const structures = typeId
        ? await getVismaJson({
            token,
            tenantId: tenant.id,
            tenantHeaderName: 'X-Tenant-Id',
            subscriptionKey: secrets.subscriptionKey,
            path: `/organization/api/structures/${encodeURIComponent(typeId)}/Structures`,
          }).catch(() => [])
        : [];

      return {
        id: typeId,
        name: clean(type.description ?? type.name),
        externalCode: clean(type.externalCode),
        count: Array.isArray(structures) ? structures.length : 0,
        sample: (Array.isArray(structures) ? structures : []).slice(0, 10).map((structure) => ({
          id: clean(structure.id ?? structure.structureId),
          externalId: clean(structure.externalId ?? structure.externalCode),
          name: clean(structure.description ?? structure.name ?? structure.externalDescription),
        })),
      };
    });

    writeJson(response, 200, {
      ok: true,
      tenant,
      types: types
        .filter((type) => type.id)
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
      mappingProfile: VISMA_REX_MAPPING_PROFILE,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  if (action === 'organization-lists-preview') {
    if (!secrets.subscriptionKey) {
      writeJson(response, 400, { ok: false, message: 'Falta subscription key para consultar los maestros VISMA.' });
      return;
    }

    const lists = await fetchOrganizationMasterLists({ token, tenantId: tenant.id });
    writeJson(response, 200, {
      ok: true,
      tenant,
      lists,
      mappingProfile: VISMA_REX_MAPPING_PROFILE,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  if (action === 'payroll-processes-preview') {
    if (!secrets.subscriptionKey) {
      writeJson(response, 400, { ok: false, message: 'Falta subscription key para consultar Payroll.' });
      return;
    }

    const limit = clamp(Number(body.limit) || 50, 1, 200);
    const payrollProcesses = await getVismaJson({
      token,
      path: `/Payroll/api/payroll-processes?Page=1&PageSize=${limit}`,
      tenantHeaderName: 'X-Tenant-Id',
      tenantId: tenant.id,
      subscriptionKey: secrets.subscriptionKey,
    });

    writeJson(response, 200, {
      ok: true,
      tenant,
      payrollProcesses: normalizePayrollProcesses(payrollProcesses),
      detailStatus: {
        available: false,
        message: 'VISMA permite listar procesos payroll, pero el detalle de conceptos/liquidaciones requiere permisos Payroll adicionales.',
      },
      mappingProfile: VISMA_REX_MAPPING_PROFILE,
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  if (action === 'employees-preview') {
    const requestedCompanyId = clean(body.companyId);
    const requestedCompanyTypeId = clean(body.companyTypeId);
    const employeesPayload = await fetchAllVismaPages(({ page, pageSize }) => getVismaJson({
      token,
      tenantId: tenant.id,
      tenantHeaderName: 'X-RAET-Tenant-Id',
      path: `/vlwebapi/employees?page=${page}&pageSize=${pageSize}&active=true`,
    }), VISMA_EMPLOYEE_PAGE_SIZE);
    const baseEmployees = employeesPayload.values;
    const employees = await mapWithConcurrency(baseEmployees, 8, async (employee, index) => {
      const employeeRef = employee.externalId || `rh-${employee.id}`;
      const detail = await getVismaJson({
        token,
        tenantId: tenant.id,
        tenantHeaderName: 'X-RAET-Tenant-Id',
        path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}`,
      }).catch(() => ({}));
      const [addresses, phones, phases, structures, bankAccounts] = await Promise.all([
        getVismaJson({
          token,
          tenantId: tenant.id,
          tenantHeaderName: 'X-RAET-Tenant-Id',
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/addresses?page=1&pageSize=5`,
        }).catch(() => null),
        getVismaJson({
          token,
          tenantId: tenant.id,
          tenantHeaderName: 'X-RAET-Tenant-Id',
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phones?page=1&pageSize=5`,
        }).catch(() => null),
        getVismaJson({
          token,
          tenantId: tenant.id,
          tenantHeaderName: 'X-RAET-Tenant-Id',
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phases?page=1&pageSize=5&active=true`,
        }).catch(() => null),
        getVismaJson({
          token,
          tenantId: tenant.id,
          tenantHeaderName: 'X-RAET-Tenant-Id',
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/structures?page=1&pageSize=80`,
        }).catch(() => null),
        getVismaJson({
          token,
          tenantId: tenant.id,
          tenantHeaderName: 'X-RAET-Tenant-Id',
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/bank-accounts?active=true`,
        }).catch(() => null),
      ]);

      return normalizeEmployee(
        {
          employee: { ...employee, ...detail },
          rowNumber: index + 2,
          tenant,
          structures: arrayValues(structures),
          address: arrayValues(addresses)[0] ?? null,
          phones: arrayValues(phones),
          phase: arrayValues(phases)[0] ?? null,
          bankAccount: arrayValues(bankAccounts)[0] ?? null,
        },
      );
    });
    const filteredEmployees = filterEmployeesByCompany(employees, requestedCompanyId, requestedCompanyTypeId);
    const scopedEmployees = filteredEmployees;

    writeJson(response, 200, {
      ok: true,
      tenant,
      tenants,
      organizationGroups,
      selectedCompanyTypeId: requestedCompanyTypeId || selectedOrganizationGroup?.id || '',
      companies,
      selectedCompanyId: requestedCompanyId,
      employees: scopedEmployees,
      catalogs: {},
      mappingProfile: VISMA_REX_MAPPING_PROFILE,
      summary: summarizeEmployees(scopedEmployees, requestedCompanyId ? filteredEmployees.length : employeesPayload.totalCount),
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  writeJson(response, 400, { ok: false, message: 'Acción VISMA no soportada.' });
}

async function serveStatic(request, response) {
  let pathname = decodeURI(String(request.url || '/').split('?')[0]);
  if (pathname === '/' || pathname === '/cargador-empleados' || pathname === '/cargador-empleados/') {
    pathname = '/index.html';
  }
  if (pathname.startsWith('/cargador-empleados/')) {
    pathname = pathname.replace('/cargador-empleados', '');
  }

  let filePath = join(DIST_ROOT, pathname);
  if (!filePath.startsWith(DIST_ROOT)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      filePath = join(DIST_ROOT, 'index.html');
    }
  } catch {
    filePath = join(DIST_ROOT, 'index.html');
  }

  const data = await readFile(filePath);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(data);
}

async function loginToVisma() {
  const form = new URLSearchParams();
  form.set('grant_type', 'password');
  form.set('username', secrets.username);
  form.set('password', secrets.password);

  const response = await fetch(`${VISMA_BASE_URL}/vlwebapiadmin/authentication/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  return parseVismaResponse(response, '/vlwebapiadmin/authentication/login');
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

  const response = await fetch(`${VISMA_BASE_URL}${path}`, { headers });
  return parseVismaResponse(response, path);
}

async function discoverOrganizationGroups({ token, tenantId, tenant }) {
  const structureTypes = await getVismaJson({
    token,
    tenantId,
    tenantHeaderName: 'X-Tenant-Id',
    subscriptionKey: secrets.subscriptionKey,
    path: '/organization/api/structure-types?HasManager=false',
  });
  const groups = await mapWithConcurrency(Array.isArray(structureTypes) ? structureTypes : [], 6, async (type) => {
    const typeId = clean(type.id ?? type.structureTypeId);
    if (!typeId) {
      return null;
    }

    const structures = await getVismaJson({
      token,
      tenantId,
      tenantHeaderName: 'X-Tenant-Id',
      subscriptionKey: secrets.subscriptionKey,
      path: `/organization/api/structures/${encodeURIComponent(typeId)}/Structures`,
    }).catch(() => []);

    const options = uniqueCompanyOptions(normalizeCompanyStructures(structures, type));

    return {
      id: typeId,
      name: clean(type.description ?? type.name ?? type.externalCode ?? `Estructura ${typeId}`),
      externalCode: clean(type.externalCode),
      count: options.length,
      options,
    };
  });

  const validGroups = groups.filter((group) => group?.id && group.options.length);
  return validGroups.length ? sortOrganizationGroups(validGroups) : [tenantToOrganizationGroup(tenant)];
}

async function fetchOrganizationMasterLists({ token, tenantId }) {
  const structureTypesPayload = await getVismaJson({
    token,
    tenantId,
    tenantHeaderName: 'X-Tenant-Id',
    subscriptionKey: secrets.subscriptionKey,
    path: '/organization/api/structure-types?HasManager=false',
  });
  const structureTypes = Array.isArray(structureTypesPayload) ? structureTypesPayload : [];

  return mapWithConcurrency(VISMA_REX_MASTER_LISTS, 5, async (definition) => {
    const matchingTypes = selectVismaMasterTypes(structureTypes, definition);
    const typeResults = await mapWithConcurrency(matchingTypes, 5, async (type) => {
      const typeId = clean(type.id ?? type.structureTypeId);
      const structures = typeId
        ? await getVismaJson({
            token,
            tenantId,
            tenantHeaderName: 'X-Tenant-Id',
            subscriptionKey: secrets.subscriptionKey,
            path: `/organization/api/structures/${encodeURIComponent(typeId)}/Structures`,
          }).catch(() => [])
        : [];

      return normalizeMasterListItems(structures, type);
    });

    return {
      key: definition.key,
      label: definition.label,
      items: uniqueMasterListItems(typeResults.flat()),
      types: matchingTypes.map((type) => ({
        id: clean(type.id ?? type.structureTypeId),
        name: clean(type.description ?? type.name ?? type.externalCode),
      })),
    };
  });
}


async function parseVismaResponse(response, path) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message || payload?.Message || payload?.error_description || payload?.error || text.slice(0, 240);
    const error = new Error(`${path}: VISMA respondió HTTP ${response.status}${message ? `. ${message}` : ''}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}


async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(status === 204 ? '' : JSON.stringify(payload));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clean(value) {
  return String(value ?? '').trim();
}
