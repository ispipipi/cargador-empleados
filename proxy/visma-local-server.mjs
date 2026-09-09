import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import {
  VISMA_REX_MAPPING_PROFILE,
  VISMA_REX_MASTER_LISTS,
  VISMA_REX_STRUCTURE_TYPES,
  findVismaStructureByKeywords,
  findVismaStructureByType,
  getActiveVismaStructures,
  getVismaStructureName,
  getVismaStructureTypeId,
  getVismaStructureTypeName,
  selectVismaMasterTypes,
} from '../functions/visma-rex-mapping.mjs';

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';
const DIST_ROOT = resolve('dist');
const VISMA_BASE_URL = process.env.VISMA_BASE_URL || 'https://apim.vismalatam.com';
const VISMA_EMPLOYEE_PAGE_SIZE = 500;
const VISMA_MAX_EMPLOYEE_PAGES = 100;
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

function normalizeMasterListItems(payload, type) {
  return (Array.isArray(payload) ? payload : [])
    .map((structure) => ({
      id: clean(structure.id ?? structure.structureId ?? structure.externalId ?? structure.description),
      code: clean(structure.externalId ?? structure.externalCode),
      name: clean(structure.description ?? structure.name ?? structure.externalDescription),
      typeId: clean(type.id ?? type.structureTypeId),
      typeName: clean(type.description ?? type.name ?? type.externalCode),
    }))
    .filter((item) => item.id || item.code || item.name);
}

function uniqueMasterListItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeLookupText(`${item.typeId}|${item.id}|${item.code}|${item.name}`);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeCompanyStructures(payload, type) {
  return (Array.isArray(payload) ? payload : [])
    .map((structure) => ({
      id: clean(structure.id ?? structure.structureId ?? structure.externalId ?? structure.description),
      name: clean(structure.description ?? structure.name ?? structure.externalDescription),
      externalId: clean(structure.externalId ?? structure.externalCode),
      typeId: clean(type.id ?? type.structureTypeId),
      typeName: clean(type.description ?? type.name),
    }))
    .filter((company) => company.id || company.name);
}

function uniqueCompanyOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    const key = normalizeLookupText(`${option.id}|${option.name}`);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function tenantToCompanyOption(tenant) {
  return {
    id: clean(tenant?.id),
    name: clean(tenant?.name || tenant?.id),
    externalId: '',
    typeId: '',
    typeName: 'Tenant VISMA',
  };
}

function tenantToOrganizationGroup(tenant) {
  const option = tenantToCompanyOption(tenant);
  return {
    id: '',
    name: 'Tenant VISMA',
    externalCode: '',
    count: 1,
    options: [option],
  };
}

function selectPreferredOrganizationGroup(groups) {
  return sortOrganizationGroups(groups)[0] ?? null;
}

function sortOrganizationGroups(groups) {
  return [...groups].sort((left, right) => {
    const leftScore = organizationGroupScore(left);
    const rightScore = organizationGroupScore(right);

    return leftScore - rightScore || right.count - left.count || left.name.localeCompare(right.name);
  });
}

function organizationGroupScore(group) {
  const label = normalizeLookupText([group.name, group.externalCode].filter(Boolean).join(' '));
  const hasMultipleOptions = Number(group.count) > 1;

  if (['empresa', 'compania', 'compañia', 'sociedad', 'razon social', 'razón social', 'company']
    .some((keyword) => label.includes(normalizeLookupText(keyword)))) {
    return 0;
  }

  if (hasMultipleOptions && ['centro costo', 'centro de costo', 'division', 'departamento', 'unidad', 'area', 'sucursal']
    .some((keyword) => label.includes(normalizeLookupText(keyword)))) {
    return 1;
  }

  return 3;
}

function filterEmployeesByCompany(employees, companyId, companyTypeId) {
  const normalizedCompanyId = normalizeLookupText(companyId);
  const normalizedCompanyTypeId = normalizeLookupText(companyTypeId);

  if (!normalizedCompanyId) {
    return employees;
  }

  return employees.filter((employee) => {
    const structureKeys = Array.isArray(employee.__visma?.structureKeys) ? employee.__visma.structureKeys : [];
    const structureMatches = structureKeys.some((structure) => {
      const typeMatches = !normalizedCompanyTypeId || normalizeLookupText(structure.typeId) === normalizedCompanyTypeId;
      const candidates = [structure.id, structure.externalId, structure.name].map(normalizeLookupText);

      return typeMatches && candidates.some((candidate) => candidate && candidate === normalizedCompanyId);
    });

    if (structureMatches) {
      return true;
    }

    const companyCandidates = [
      employee.__visma?.companyId,
      employee.__visma?.companyExternalId,
      employee.EMPRESA,
    ].map(normalizeLookupText);

    return companyCandidates.some((candidate) => candidate && candidate === normalizedCompanyId);
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

function normalizeTenants(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((tenant) => ({
      id: clean(tenant.Id ?? tenant.id),
      name: clean(tenant.TenantName ?? tenant.ClientName ?? tenant.name),
      country: clean(tenant.Country ?? tenant.country),
      webApiEnabled: tenant.WebApiEnabled !== false,
    }))
    .filter((tenant) => tenant.id);
}

function selectTenant(tenants, requestedTenantId) {
  const requestedId = clean(requestedTenantId);
  return tenants.find((tenant) => tenant.id === requestedId) ||
    tenants.find((tenant) => tenant.webApiEnabled) ||
    tenants[0] ||
    null;
}

function normalizePayrollProcesses(payload) {
  return arrayValues(payload)
    .map((process) => ({
      id: vismaLabel(process.id ?? process.idPayrollProcess ?? process.payrollProcessId),
      name: vismaLabel(process.description ?? process.name ?? process.payrollModelDescription),
      period: vismaLabel(process.period ?? process.periodDescription ?? process.liquidationPeriod),
      model: vismaLabel(process.payrollModelDescription ?? process.payrollModel ?? process.model),
      status: vismaLabel(process.status ?? process.processStatus),
      dateFrom: vismaLabel(process.dateFrom ?? process.startDate ?? process.periodFrom),
      dateTo: vismaLabel(process.dateTo ?? process.endDate ?? process.periodTo),
      employeeCount: Number(process.employeeCount ?? process.employeesCount ?? process.quantityEmployees ?? 0) || 0,
    }))
    .filter((process) => process.id || process.name || process.period);
}

function vismaLabel(value) {
  if (value && typeof value === 'object') {
    return clean(
      value.description ??
      value.name ??
      value.code ??
      value.id ??
      value.value ??
      value.period ??
      '',
    );
  }

  return clean(value);
}

function normalizeEmployee({
  employee,
  rowNumber,
  tenant,
  structures = [],
  address = null,
  phones = [],
  phase = null,
  bankAccount = null,
}) {
  const document = Array.isArray(employee.nationalIdentificationNumbers)
    ? clean((employee.nationalIdentificationNumbers.find((item) => item.mainDocument) ?? employee.nationalIdentificationNumbers[0])?.number)
    : '';
  const names = [employee.firstName, employee.middleName, employee.lastName, employee.familyName]
    .map(clean)
    .filter(Boolean)
    .join(' ');
  const activeStructures = getActiveVismaStructures(structures);
  const structureKeys = normalizeEmployeeStructureKeys(activeStructures);
  const findStructure = (keywords) => findVismaStructureByKeywords(activeStructures, keywords);
  const company = findStructure(['empresa', 'razon social', 'compania', 'sociedad']);
  const costCenter = findStructure(['centro costo', 'centro de costo', 'cost center', 'ceco']);
  const department = findStructure(['departamento', 'gerencia', 'division', 'unidad negocio', 'unidad de negocios']);
  const location = findStructure(['sede', 'ubicacion', 'sucursal', 'localidad', 'lugar']);
  const position = findStructure(['cargo', 'posicion', 'puesto']);
  const afp = findVismaStructureByType(activeStructures, VISMA_REX_STRUCTURE_TYPES.afp, ['fondos pension', 'afp']);
  const health = findVismaStructureByType(activeStructures, VISMA_REX_STRUCTURE_TYPES.health, ['institucion de salud', 'salud']);
  const union = findVismaStructureByType(activeStructures, VISMA_REX_STRUCTURE_TYPES.union, ['sindicato']);
  const streetAddress = [address?.street, address?.houseNumber].map(clean).filter(Boolean).join(' ');
  const primaryPhone = phones.find((item) => item?.number || item?.phoneNumber || item?.value);
  const paymentMethod = vismaLabel(bankAccount?.paymentMethod);
  const paymentType = vismaLabel(bankAccount?.paymentType);
  const bank = vismaLabel(
    bankAccount?.bankName ||
    bankAccount?.bankDescription ||
    bankAccount?.bank ||
    bankAccount?.bankCode,
  );

  return {
    __sourceRowNumber: rowNumber,
    'ID EMPLEADO': clean(employee.externalId || employee.id),
    CI: document,
    NOMBRE: names,
    EMPRESA: clean(getVismaStructureName(company)) || tenant.name || tenant.id,
    POSICION: clean(position?.description),
    'FECHA INGRESO': clean(employee.hiringDate),
    ESTADO: employee.isActive === false ? 'inactivo' : 'activo',
    'ESTADO CIVIL': clean(employee.maritalStatus?.description),
    NACIONALIDAD: findDefaultNationality(employee),
    CELULAR: clean(primaryPhone?.number || primaryPhone?.phoneNumber || primaryPhone?.value),
    TELEFONO: clean(primaryPhone?.number || primaryPhone?.phoneNumber || primaryPhone?.value),
    DIRECCION: streetAddress,
    COMUNA: clean(address?.city),
    UBICACION: clean(location?.description || location?.name || location?.externalId),
    'FORMA DE PAGO': paymentMethod || paymentType,
    BANCO: bank,
    'N° CTA CTE': clean(bankAccount?.accountNumber || bankAccount?.cbuNumber),
    AFP: clean(getVismaStructureName(afp)),
    ISAPRE: clean(getVismaStructureName(health)),
    'CENTRO COSTO': clean(getVismaStructureName(costCenter)),
    'UNIDAD DE NEGOCIOS': clean(getVismaStructureName(department)),
    SINDICATO: clean(getVismaStructureName(union)),
    'FECHA NACIMIENTO': clean(employee.dateOfBirth),
    'NOMBRE CONTRATO': vismaLabel(phase?.status) || 'Contrato VISMA',
    'FEC FIN CONTRATO': clean(phase?.endDate),
    'SUELDO BASE': extractSalaryValue(phase?.salary),
    'HORAS JORNADA': extractWeeklyHours(phase),
    'FECHA ANTIGUEDAD': clean(phase?.recognizedStartDate || employee.hiringDate),
    EMAIL: clean(employee.email),
    __visma: {
      employeeId: employee.id,
      fileNumber: employee.externalId || '',
      companyId: clean(company?.structureId || company?.id || company?.description) || clean(tenant?.id),
      companyExternalId: clean(company?.externalId),
      structures: activeStructures.length,
      structureKeys,
    },
  };
}

function extractSalaryValue(salary) {
  if (salary && typeof salary === 'object') {
    return clean(salary.amount || salary.value || salary.baseSalary || salary.salary);
  }

  return typeof salary === 'string' || typeof salary === 'number' ? clean(salary) : '';
}

function extractWeeklyHours(phase) {
  const candidates = [
    phase?.real?.hoursPerWeek,
    phase?.real?.weeklyHours,
    phase?.holidays?.weeklyHours,
    phase?.weeklyHours,
  ];

  return clean(candidates.find((value) => value !== undefined && value !== null) ?? '');
}

function normalizeEmployeeStructureKeys(structures) {
  return structures
    .map((structure) => ({
      typeId: clean(getVismaStructureTypeId(structure)),
      typeName: clean(getVismaStructureTypeName(structure)),
      id: clean(structure.structureId ?? structure.id ?? structure.description),
      externalId: clean(structure.externalId ?? structure.externalCode),
      name: clean(getVismaStructureName(structure)),
    }))
    .filter((structure) => structure.typeId || structure.id || structure.externalId || structure.name);
}

function summarizeEmployees(employees, totalAvailable) {
  return {
    totalAvailable: Number(totalAvailable) || employees.length,
    returned: employees.length,
    withDocument: employees.filter((employee) => employee.CI).length,
    withAddress: employees.filter((employee) => employee.DIRECCION || employee.COMUNA).length,
    withBank: employees.filter((employee) => employee.BANCO || employee['N° CTA CTE']).length,
    withStructures: employees.filter((employee) => Number(employee.__visma?.structures) > 0).length,
    withEmail: employees.filter((employee) => employee.EMAIL).length,
  };
}

async function fetchAllVismaPages(fetchPage, pageSize) {
  const values = [];
  let totalCount = null;
  let previousPageKey = '';

  for (let page = 1; page <= VISMA_MAX_EMPLOYEE_PAGES; page += 1) {
    const payload = await fetchPage({ page, pageSize });
    const pageValues = arrayValues(payload);

    if (!pageValues.length) {
      break;
    }

    values.push(...pageValues);
    totalCount = readVismaTotalCount(payload) ?? totalCount;

    const first = pageValues[0];
    const last = pageValues[pageValues.length - 1];
    const pageKey = `${first?.id ?? first?.externalId ?? ''}|${last?.id ?? last?.externalId ?? ''}|${pageValues.length}`;
    if (pageKey === previousPageKey || pageValues.length < pageSize || (totalCount !== null && values.length >= totalCount)) {
      break;
    }

    previousPageKey = pageKey;
  }

  return { values, totalCount };
}

function readVismaTotalCount(payload) {
  const total = [payload?.totalCount, payload?.totalItems, payload?.total, payload?.count]
    .map(Number)
    .find((value) => Number.isFinite(value));

  return total ?? null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function arrayValues(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.values)) return payload.values;
  if (Array.isArray(payload?.paginationList)) return payload.paginationList;
  if (Array.isArray(payload?.paginatedList)) return payload.paginatedList;
  return [];
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

function findDefaultNationality(employee) {
  const nationalities = Array.isArray(employee.nationalities) ? employee.nationalities : [];
  const nationality = nationalities.find((item) => item.isDefault) ?? nationalities[0];
  return clean(nationality?.description || nationality?.externalDescription);
}

function normalizeLookupText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
