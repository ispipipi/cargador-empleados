import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
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
} from './visma-rex-mapping.mjs';

const geovictoriaApiKey = defineSecret('GEOVICTORIA_API_KEY');
const geovictoriaApiSecret = defineSecret('GEOVICTORIA_API_SECRET');
const vismaUsername = defineSecret('VISMA_USERNAME');
const vismaPassword = defineSecret('VISMA_PASSWORD');
const vismaSubscriptionKey = defineSecret('VISMA_SUBSCRIPTION_KEY');
const BASE_URL = globalThis.process?.env?.GEOVICTORIA_BASE_URL || 'https://customerapi.geovictoria.com/api/v1';
const VISMA_BASE_URL = globalThis.process?.env?.VISMA_BASE_URL || 'https://apim.vismalatam.com';
const MAX_REQUESTED_RECORDS = 1500;
const MAX_USERS_PER_REQUEST = 200;
const MAX_USER_DETAILS_PER_REQUEST = 500;
const VISMA_MAX_EMPLOYEES = 500;
const VISMA_EMPLOYEE_PAGE_SIZE = 500;
const VISMA_MAX_EMPLOYEE_PAGES = 100;
const VISMA_DEFAULT_EMPLOYEES = 50;
const VISMA_DEFAULT_PAYROLL_PROCESSES = 50;
const VISMA_CONCURRENCY = 8;
const ALLOWED_TRADE_NAMES = new Map([
  ['22893', 'COMERCIAL PROGRESO SPA'],
  ['22924', 'SANTIAGO FBO SPA'],
  ['22925', 'KAIPOKI SPA'],
]);
const ALLOWED_COMPANY_IDENTIFIERS = new Map([
  ['772789416', 'COMERCIAL PROGRESO SPA'],
  ['761048929', 'SANTIAGO FBO SPA'],
  ['773243921', 'KAIPOKI SPA'],
]);
const ALLOWED_COMPANY_NAMES = new Map(
  [...ALLOWED_TRADE_NAMES.values()].map((name) => [normalizeLookupText(name), name]),
);
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
      const activeIdentifiers = activeUsers.map((user) => user.Identifier).filter(Boolean);
      const detailedUsers = await fetchUserDetails({ token, identifiers: activeIdentifiers });
      const scopedUsers = buildAllowedCompanyUsers(activeUsers, detailedUsers);
      const identifiers = scopedUsers.map((user) => user.Identifier).filter(Boolean);
      const identifiersSet = new Set(identifiers);
      const attendanceBook = filterAttendanceBookByIdentifiers(
        await fetchAttendanceBook({ token, identifiers, startDate, endDate }),
        identifiersSet,
        detailedUsers,
      );
      const overtime = filterOvertimeByIdentifiers(
        await fetchOvertimeSafely({ token, identifiers, startDate, endDate }),
        identifiersSet,
      );

      response.status(200).json({
        ok: true,
        users: scopedUsers,
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

export const vismaProxy = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [vismaUsername, vismaPassword, vismaSubscriptionKey],
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
      const action = String(body.action || 'employees-preview').trim();
      const supportedActions = new Set(['connection-context', 'employees-preview', 'payroll-processes-preview', 'organization-lists-preview']);

      if (!supportedActions.has(action)) {
        response.status(400).json({ ok: false, message: 'Accion VISMA no soportada.' });
        return;
      }

      const username = String(getSecretValue(vismaUsername) || '').trim();
      const password = String(getSecretValue(vismaPassword) || '').trim();
      const subscriptionKey = String(getSecretValue(vismaSubscriptionKey) || '').trim();
      const requestedLimit = Number(body.limit);
      const limit = Math.max(
        1,
        Math.min(
          VISMA_MAX_EMPLOYEES,
          Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.trunc(requestedLimit) : VISMA_DEFAULT_EMPLOYEES,
        ),
      );

      if (!username || !password) {
        response.status(400).json({ ok: false, message: 'Faltan credenciales VISMA guardadas en el backend.' });
        return;
      }

      const auth = await loginToVisma({ username, password });
      const token = auth.access_token;

      if (!token) {
        response.status(502).json({ ok: false, message: 'VISMA no retorno token de autenticacion.' });
        return;
      }

      const tenants = normalizeVismaTenants(
        await getVismaAdminJson({ token, path: '/vlwebapiadmin/account/tenants?onlyWithAdminAccess=false' }),
      );
      const tenant = selectVismaTenant(tenants, body.tenantId);

      if (!tenant?.id) {
        response.status(502).json({ ok: false, message: 'No se encontro tenant VISMA habilitado para Web API.' });
        return;
      }

      const tenantId = String(tenant.id);
      const organizationGroups = subscriptionKey
        ? await discoverVismaOrganizationGroups({ token, tenantId, subscriptionKey, tenant }).catch(() => [tenantToOrganizationGroup(tenant)])
        : [tenantToOrganizationGroup(tenant)];
      const selectedOrganizationGroup = selectPreferredOrganizationGroup(organizationGroups);
      const companies = selectedOrganizationGroup?.options?.length
        ? selectedOrganizationGroup.options
        : [tenantToCompanyOption(tenant)];

      if (action === 'connection-context') {
        response.status(200).json({
          ok: true,
          tenants,
          selectedTenantId: tenantId,
          organizationGroups,
          selectedCompanyTypeId: selectedOrganizationGroup?.id || '',
          companies,
          selectedCompanyId: '',
          credentials: {
            username: true,
            password: true,
            subscriptionKey: Boolean(subscriptionKey),
          },
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          capabilities: {
            employees: true,
            payrollProcesses: Boolean(subscriptionKey),
            historicalBooksDetail: false,
          },
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (action === 'payroll-processes-preview') {
        if (!subscriptionKey) {
          response.status(400).json({ ok: false, message: 'Falta VISMA_SUBSCRIPTION_KEY guardada en el backend para consultar Payroll.' });
          return;
        }

        const processLimit = Math.max(1, Math.min(200, Number.isFinite(requestedLimit) && requestedLimit > 0
          ? Math.trunc(requestedLimit)
          : VISMA_DEFAULT_PAYROLL_PROCESSES));
        const payrollProcesses = await getVismaTenantJson({
          token,
          tenantId,
          subscriptionKey,
          path: `/Payroll/api/payroll-processes?Page=1&PageSize=${processLimit}`,
        });

        response.status(200).json({
          ok: true,
          tenant,
          payrollProcesses: normalizeVismaPayrollProcesses(payrollProcesses),
          detailStatus: {
            available: false,
            message: 'VISMA permite listar procesos payroll, pero el detalle de conceptos/liquidaciones requiere permisos Payroll adicionales.',
          },
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (action === 'organization-lists-preview') {
        if (!subscriptionKey) {
          response.status(400).json({ ok: false, message: 'Falta VISMA_SUBSCRIPTION_KEY guardada en el backend para consultar los maestros VISMA.' });
          return;
        }

        const lists = await fetchOrganizationMasterLists({ token, tenantId, subscriptionKey });
        response.status(200).json({
          ok: true,
          tenant,
          lists,
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      const requestedCompanyId = cleanValue(body.companyId);
      const requestedCompanyTypeId = cleanValue(body.companyTypeId);
      const [employeesPayload, searchEmployeesPayload, structureTypes, positions, paymentMethods, paymentTypes, banks] = await Promise.all([
        fetchAllVismaPages(({ page, pageSize }) => getVismaRaetJson({
          token,
          tenantId,
          path: `/vlwebapi/employees?page=${page}&pageSize=${pageSize}&active=true`,
        }), VISMA_EMPLOYEE_PAGE_SIZE),
        subscriptionKey
          ? fetchAllVismaPages(({ page, pageSize }) => getVismaTenantJson({
            token,
            tenantId,
            subscriptionKey,
            path: `/search/api/search-engines/employees?Page=${page}&PageSize=${pageSize}`,
          }).catch(() => null), VISMA_EMPLOYEE_PAGE_SIZE)
          : { values: [], totalCount: null },
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/structure-types?HasManager=false' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/position' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/payment-methods' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/payment-types' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/structures/41/Structures' }).catch(() => [])
          : [],
      ]);

      const baseEmployees = employeesPayload.values;
      const searchByEmployeeId = buildSearchEmployeeLookup({ paginationList: searchEmployeesPayload.values });
      const enrichedEmployees = await mapWithConcurrency(baseEmployees, VISMA_CONCURRENCY, async (employee, index) => {
        const employeeRef = employee.externalId || `rh-${employee.id}`;
        const searchEmployee = searchByEmployeeId.get(String(employee.id)) ?? null;
        const detail = await getVismaRaetJson({
          token,
          tenantId,
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}`,
        }).catch(() => employee);

        const [addresses, phones, phases, structures, bankAccounts, emails] = await Promise.all([
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/addresses?page=1&pageSize=5`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phones?page=1&pageSize=5`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phases?page=1&pageSize=5&active=true`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/structures?page=1&pageSize=80`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/bank-accounts?active=true`,
          }).catch(() => null),
          subscriptionKey && employee.id
            ? getVismaTenantJson({
                token,
                tenantId,
                subscriptionKey,
                path: `/contact/api/emails?idEntity=${encodeURIComponent(employee.id)}&idEntityType=1`,
              }).catch(() => [])
            : [],
        ]);

        return normalizeVismaEmployee({
          rowNumber: index + 2,
          employee: { ...employee, ...detail },
          tenant,
          searchEmployee,
          address: firstItem(addresses),
          phones: arrayValues(phones),
          phase: firstItem(phases),
          structures: arrayValues(structures),
          bankAccount: firstItem(bankAccounts),
          emails: Array.isArray(emails) ? emails : [],
          catalogs: { structureTypes, positions, paymentMethods, paymentTypes, banks },
        });
      });

      const filteredEmployees = filterVismaEmployeesByCompany(enrichedEmployees, requestedCompanyId, requestedCompanyTypeId);
      const scopedEmployees = filteredEmployees;

      response.status(200).json({
        ok: true,
        tenant,
        tenants,
        organizationGroups,
        selectedCompanyTypeId: requestedCompanyTypeId || selectedOrganizationGroup?.id || '',
        companies,
        selectedCompanyId: requestedCompanyId,
        employees: scopedEmployees,
        catalogs: {
          structureTypes: safeCatalog(structureTypes),
          positions: safeCatalog(positions),
          paymentMethods: safeCatalog(paymentMethods),
          paymentTypes: safeCatalog(paymentTypes),
          banks: safeCatalog(banks),
        },
        mappingProfile: VISMA_REX_MAPPING_PROFILE,
        summary: summarizeVismaEmployees(scopedEmployees, requestedCompanyId ? filteredEmployees.length : employeesPayload.totalCount),
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      response.status(error.status || 502).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar VISMA.',
      });
    }
  },
);

function normalizeVismaTenants(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((tenant) => ({
      id: cleanValue(tenant.Id ?? tenant.id),
      name: cleanValue(tenant.TenantName ?? tenant.ClientName ?? tenant.name),
      country: cleanValue(tenant.Country ?? tenant.country),
      webApiEnabled: tenant.WebApiEnabled !== false,
    }))
    .filter((tenant) => tenant.id);
}

function selectVismaTenant(tenants, requestedTenantId) {
  const requestedId = cleanValue(requestedTenantId);

  if (requestedId) {
    const requestedTenant = tenants.find((tenant) => String(tenant.id) === requestedId);
    if (requestedTenant) {
      return requestedTenant;
    }
  }

  return tenants.find((tenant) => tenant.webApiEnabled) ?? tenants[0] ?? null;
}

function normalizeVismaPayrollProcesses(payload) {
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

async function discoverVismaOrganizationGroups({ token, tenantId, subscriptionKey, tenant }) {
  const structureTypes = await getVismaTenantJson({
    token,
    tenantId,
    subscriptionKey,
    path: '/organization/api/structure-types?HasManager=false',
  });
  const groups = await mapWithConcurrency(Array.isArray(structureTypes) ? structureTypes : [], 6, async (type) => {
    const typeId = cleanValue(type.id ?? type.structureTypeId);
    if (!typeId) {
      return null;
    }

    const structures = await getVismaTenantJson({
      token,
      tenantId,
      subscriptionKey,
      path: `/organization/api/structures/${encodeURIComponent(typeId)}/Structures`,
    }).catch(() => []);

    const options = uniqueCompanyOptions(normalizeVismaCompanyStructures(structures, type));

    return {
      id: typeId,
      name: cleanValue(type.description ?? type.name ?? type.externalCode ?? `Estructura ${typeId}`),
      externalCode: cleanValue(type.externalCode),
      count: options.length,
      options,
    };
  });

  const validGroups = groups.filter((group) => group?.id && group.options.length);
  return validGroups.length ? sortOrganizationGroups(validGroups) : [tenantToOrganizationGroup(tenant)];
}

async function fetchOrganizationMasterLists({ token, tenantId, subscriptionKey }) {
  const structureTypesPayload = await getVismaTenantJson({
    token,
    tenantId,
    subscriptionKey,
    path: '/organization/api/structure-types?HasManager=false',
  });
  const structureTypes = Array.isArray(structureTypesPayload) ? structureTypesPayload : [];

  return mapWithConcurrency(VISMA_REX_MASTER_LISTS, 5, async (definition) => {
    const matchingTypes = selectVismaMasterTypes(structureTypes, definition);
    const typeResults = await mapWithConcurrency(matchingTypes, 5, async (type) => {
      const typeId = cleanValue(type.id ?? type.structureTypeId);
      const structures = typeId
        ? await getVismaTenantJson({
            token,
            tenantId,
            subscriptionKey,
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
        id: cleanValue(type.id ?? type.structureTypeId),
        name: cleanValue(type.description ?? type.name ?? type.externalCode),
      })),
    };
  });
}

function normalizeMasterListItems(payload, type) {
  return (Array.isArray(payload) ? payload : [])
    .map((structure) => ({
      id: cleanValue(structure.id ?? structure.structureId ?? structure.externalId ?? structure.description),
      code: cleanValue(structure.externalId ?? structure.externalCode),
      name: cleanValue(structure.description ?? structure.name ?? structure.externalDescription),
      rate: cleanValue(
        structure.rate
        ?? structure.tasa
        ?? structure.percentage
        ?? structure.additionalRate
        ?? structure.additionalPercentage,
      ),
      typeId: cleanValue(type.id ?? type.structureTypeId),
      typeName: cleanValue(type.description ?? type.name ?? type.externalCode),
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

function normalizeVismaCompanyStructures(payload, type) {
  return (Array.isArray(payload) ? payload : [])
    .map((structure) => ({
      id: cleanValue(structure.id ?? structure.structureId ?? structure.externalId ?? structure.description),
      name: cleanValue(structure.description ?? structure.name ?? structure.externalDescription),
      externalId: cleanValue(structure.externalId ?? structure.externalCode),
      typeId: cleanValue(type.id ?? type.structureTypeId),
      typeName: cleanValue(type.description ?? type.name),
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
    id: cleanValue(tenant?.id),
    name: cleanValue(tenant?.name || tenant?.id),
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

function filterVismaEmployeesByCompany(employees, companyId, companyTypeId) {
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

function vismaLabel(value) {
  if (value && typeof value === 'object') {
    return cleanValue(
      value.description ??
      value.name ??
      value.code ??
      value.id ??
      value.value ??
      value.period ??
      '',
    );
  }

  return cleanValue(value);
}

async function loginToVisma({ username, password }) {
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

async function getVismaAdminJson({ token, path }) {
  return getVismaJson({ token, path });
}

async function getVismaRaetJson({ token, tenantId, path }) {
  return getVismaJson({
    token,
    path,
    tenantHeaderName: 'X-RAET-Tenant-Id',
    tenantId,
  });
}

async function getVismaTenantJson({ token, tenantId, subscriptionKey, path }) {
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

function normalizeVismaEmployee({
  rowNumber,
  employee,
  tenant,
  searchEmployee,
  address,
  phones,
  phase,
  structures,
  bankAccount,
  emails,
  catalogs,
}) {
  const documentNumber = findMainDocument(employee) || cleanValue(searchEmployee?.document);
  const organization = inferOrganizationFields(structures, catalogs);
  const structureKeys = normalizeVismaEmployeeStructureKeys(structures);
  const positionName = resolvePositionName(organization.position, catalogs.positions);
  const bankName = resolveBankName(bankAccount, catalogs.banks);
  const paymentMethodName = resolvePaymentLabel(bankAccount?.paymentMethod, catalogs.paymentMethods);
  const paymentTypeName = resolvePaymentLabel(bankAccount?.paymentType, catalogs.paymentTypes);
  const primaryEmail = cleanValue(employee.email) || cleanValue(emails.find((item) => item?.description)?.description);
  const primaryPhone = cleanValue(phones.find((item) => item?.number || item?.phoneNumber)?.number ?? phones.find((item) => item?.phoneNumber)?.phoneNumber);
  const street = cleanValue(address?.street);
  const houseNumber = cleanValue(address?.houseNumber);
  const streetAddress = [street, houseNumber].filter(Boolean).join(' ');
  const firstName = cleanNamePart(employee.firstName || searchEmployee?.name);
  const middleName = cleanNamePart(employee.middleName || searchEmployee?.secondName);
  const lastName = cleanNamePart(employee.lastName || searchEmployee?.lastName);
  const familyName = cleanNamePart(employee.familyName || searchEmployee?.secondLastName);
  const sex = extractVismaSex(employee, searchEmployee);
  const healthAmount = extractVismaHealthAmount({
    employee,
    phase,
    healthStructure: organization.healthStructure,
  });
  const names = [firstName, middleName].filter(Boolean).join(' ');
  const lastNames = [lastName, familyName].filter(Boolean).join(' ');

  return {
    __sourceRowNumber: rowNumber,
    'ID EMPLEADO': cleanValue(employee.externalId || searchEmployee?.fileNumber || employee.id),
    CI: documentNumber,
    NOMBRE: [names, lastNames].filter(Boolean).join(' '),
    SEXO: sex,
    EMPRESA: organization.company || cleanValue(tenant?.name || tenant?.id),
    POSICION: positionName || organization.position,
    'JOB CODE': organization.positionExternalId,
    'FECHA INGRESO': employee.hiringDate || searchEmployee?.hireDate || phase?.startDate || '',
    ESTADO: employee.isActive === false || searchEmployee?.active === false ? 'inactivo' : 'activo',
    'ESTADO CIVIL': employee.maritalStatus?.description || '',
    NACIONALIDAD: findDefaultNationality(employee),
    CELULAR: primaryPhone,
    TELEFONO: primaryPhone,
    DIRECCION: streetAddress,
    COMUNA: cleanValue(address?.city),
    UBICACION: organization.location || cleanValue(address?.city),
    'UBICACION WORKDAY': organization.location,
    'FORMA DE PAGO': paymentMethodName || paymentTypeName,
    BANCO: bankName || bankAccount?.bankCode || '',
    'N° CTA CTE': cleanValue(bankAccount?.accountNumber || bankAccount?.cbuNumber),
    AFP: organization.afp,
    ISAPRE: organization.health,
    'MONTO SALUD UF': healthAmount,
    'CODIGO AFP': '',
    'CENTRO COSTO': organization.costCenter,
    'UNIDAD DE NEGOCIOS': organization.area || organization.department,
    SINDICATO: organization.union,
    'MOTIVO RETIRO': phase?.decouplingCause?.description || phase?.decouplingCause || '',
    'TIPO REBAJA ZONA': '',
    JUBILADO: '',
    'FECHA NACIMIENTO': employee.dateOfBirth || '',
    'NOMBRE CONTRATO': phase?.status?.description || phase?.status || 'Contrato VISMA',
    'FEC FIN CONTRATO': phase?.endDate || '',
    'SUELDO BASE': extractSalaryValue(phase?.salary),
    'HORAS JORNADA': extractWeeklyHours(phase),
    'FECHA SEGURO CESANTIA': '',
    'FECHA ANTIGUEDAD': phase?.recognizedStartDate || employee.hiringDate || '',
    EMAIL: primaryEmail,
    __visma: {
      employeeId: employee.id,
      fileNumber: employee.externalId || searchEmployee?.fileNumber || '',
      companyId: organization.companyId || cleanValue(tenant?.id),
      companyExternalId: organization.companyExternalId,
      paymentMethod: paymentMethodName,
      paymentType: paymentTypeName,
      structures: structures.length,
      structureKeys,
      nameParts: {
        firstName,
        middleName,
        lastName,
        familyName,
      },
      sex,
      healthAmount,
    },
  };
}

function normalizeVismaEmployeeStructureKeys(structures) {
  return structures
    .map((structure) => ({
      typeId: getVismaStructureTypeId(structure),
      typeName: getVismaStructureTypeName(structure),
      id: cleanValue(structure.structureId ?? structure.id ?? structure.description),
      externalId: cleanValue(structure.externalId ?? structure.externalCode),
      name: getVismaStructureName(structure),
    }))
    .filter((structure) => structure.typeId || structure.id || structure.externalId || structure.name);
}

function inferOrganizationFields(structures, catalogs) {
  const activeStructures = getActiveVismaStructures(structures);
  const findByKeywords = (keywords) => findVismaStructureByKeywords(activeStructures, keywords);
  const byType = (typeIds, keywords = []) => findVismaStructureByType(activeStructures, typeIds, keywords);
  const company = byType(VISMA_REX_STRUCTURE_TYPES.company, ['empresa', 'razon social', 'compania', 'sociedad']);
  const location = byType(VISMA_REX_STRUCTURE_TYPES.location, ['sede', 'ubicacion', 'sucursal', 'localidad', 'lugar']);
  const costCenter = byType(VISMA_REX_STRUCTURE_TYPES.costCenter, ['centro costo', 'centro de costo', 'cost center', 'ceco']);
  const area = byType(VISMA_REX_STRUCTURE_TYPES.area, ['area', 'unidad negocio', 'unidad de negocios', 'business unit']);
  const department = byType(VISMA_REX_STRUCTURE_TYPES.department, ['departamento', 'gerencia', 'division']);
  const union = byType(VISMA_REX_STRUCTURE_TYPES.union, ['sindicato']);
  const afp = byType(VISMA_REX_STRUCTURE_TYPES.afp, ['fondos pension', 'afp']);
  const health = byType(VISMA_REX_STRUCTURE_TYPES.health, ['institucion de salud', 'salud']);
  const position = byType(VISMA_REX_STRUCTURE_TYPES.position, ['cargo', 'posicion', 'puesto']) ||
    activeStructures.find((structure) => catalogs.positions.some((item) => String(item.structureId) === String(structure.structureId)));

  return {
    company: getVismaStructureName(company),
    companyId: cleanValue(company?.structureId || company?.id || company?.description),
    companyExternalId: cleanValue(company?.externalId),
    location: getVismaStructureName(location),
    costCenter: getVismaStructureName(costCenter),
    area: getVismaStructureName(area),
    department: getVismaStructureName(department),
    union: getVismaStructureName(union),
    afp: getVismaStructureName(afp),
    health: getVismaStructureName(health),
    healthStructure: health,
    position: getVismaStructureName(position),
    positionExternalId: cleanValue(position?.externalId),
  };
}

function resolvePositionName(positionValue, positions) {
  const normalizedValue = normalizeLookupText(positionValue);
  if (!normalizedValue) {
    return '';
  }

  return cleanValue(
    positions.find((item) => normalizeLookupText(item.description) === normalizedValue || normalizeLookupText(item.structureId) === normalizedValue)?.description,
  );
}

function resolveBankName(bankAccount, banks) {
  const candidates = [
    bankAccount?.bankCode,
    bankAccount?.branchCode,
    bankAccount?.branch,
    bankAccount?.debitAccountCompany,
  ].map(cleanValue).filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeLookupText(candidate);
    const bank = banks.find((item) =>
      [item.id, item.externalCode, item.description, item.abbreviated, item.branchName]
        .map(normalizeLookupText)
        .some((value) => value && value === normalizedCandidate),
    );

    if (bank) {
      return cleanValue(bank.description || bank.abbreviated || bank.branchName);
    }
  }

  return '';
}

function resolvePaymentLabel(value, catalog) {
  const normalizedValue = normalizeLookupText(value);
  if (!normalizedValue) {
    return '';
  }

  return cleanValue(
    catalog.find((item) =>
      [item.id, item.description, item.initials]
        .map(normalizeLookupText)
        .some((candidate) => candidate && candidate === normalizedValue),
    )?.description || value,
  );
}

function findMainDocument(employee) {
  const documents = Array.isArray(employee.nationalIdentificationNumbers) ? employee.nationalIdentificationNumbers : [];
  return cleanValue((documents.find((item) => item.mainDocument) ?? documents[0])?.number);
}

function findDefaultNationality(employee) {
  const nationalities = Array.isArray(employee.nationalities) ? employee.nationalities : [];
  const nationality = nationalities.find((item) => item.isDefault) ?? nationalities[0];
  return cleanValue(nationality?.description || nationality?.externalDescription);
}

function extractSalaryValue(salary) {
  if (salary && typeof salary === 'object') {
    return cleanValue(salary.amount || salary.value || salary.baseSalary || salary.salary);
  }

  return typeof salary === 'string' || typeof salary === 'number' ? cleanValue(salary) : '';
}

function extractWeeklyHours(phase) {
  const candidates = [
    phase?.real?.hoursPerWeek,
    phase?.real?.weeklyHours,
    phase?.holidays?.weeklyHours,
    phase?.weeklyHours,
  ];

  return cleanValue(candidates.find((value) => value !== undefined && value !== null) ?? '');
}

function buildSearchEmployeeLookup(payload) {
  const employees = Array.isArray(payload?.paginationList) ? payload.paginationList : [];
  return new Map(
    employees
      .map((employee) => [String(employee.additionalAttributes?.IdEmployee || employee.idEmployee || employee.idPerson || ''), employee])
      .filter(([key]) => key),
  );
}

function firstItem(payload) {
  return arrayValues(payload)[0] ?? null;
}

function arrayValues(payload) {
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

  return [];
}

function safeCatalog(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((item) => ({
      id: item.id ?? '',
      description: item.description ?? item.name ?? '',
      externalCode: item.externalCode ?? '',
      initials: item.initials ?? '',
    }))
    .slice(0, 1000);
}

function summarizeVismaEmployees(employees, totalAvailable) {
  return {
    totalAvailable: Number(totalAvailable) || employees.length,
    returned: employees.length,
    withDocument: employees.filter((item) => cleanValue(item.CI)).length,
    withAddress: employees.filter((item) => cleanValue(item.DIRECCION) || cleanValue(item.COMUNA)).length,
    withBank: employees.filter((item) => cleanValue(item.BANCO) || cleanValue(item['N° CTA CTE'])).length,
    withStructures: employees.filter((item) => Number(item.__visma?.structures) > 0).length,
    withEmail: employees.filter((item) => cleanValue(item.EMAIL)).length,
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

async function fetchUserDetails({ token, identifiers }) {
  const chunks = chunkArray(identifiers, MAX_USER_DETAILS_PER_REQUEST);
  const responses = [];

  for (const chunk of chunks) {
    const payload = await postToGeovictoria('/User/Get', {
      Identifiers: chunk.join(','),
    }, token);

    responses.push(...(Array.isArray(payload?.Response) ? payload.Response : []));
  }

  return responses;
}

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

function buildAllowedCompanyUsers(activeUsers, detailedUsers) {
  const detailsByIdentifier = buildDetailsByIdentifier(detailedUsers);

  return activeUsers
    .map((user) => ({ ...user, ...detailsByIdentifier.get(user.Identifier) }))
    .map(decorateAllowedCompanyFields)
    .filter(Boolean);
}

function filterAttendanceBookByIdentifiers(attendanceBook, identifiersSet, detailedUsers) {
  const detailsByIdentifier = buildDetailsByIdentifier(detailedUsers);

  return {
    Users: (Array.isArray(attendanceBook?.Users) ? attendanceBook.Users : [])
      .filter((user) => identifiersSet.has(user.Identifier))
      .map((user) => decorateAllowedCompanyFields({ ...detailsByIdentifier.get(user.Identifier), ...user }))
      .filter(Boolean),
    ExtraTimeValues: (Array.isArray(attendanceBook?.ExtraTimeValues) ? attendanceBook.ExtraTimeValues : [])
      .filter((row) => identifiersSet.has(row.UserIdentifier ?? row.Identifier)),
  };
}

function filterOvertimeByIdentifiers(overtime, identifiersSet) {
  if (!Array.isArray(overtime?.Response)) {
    return overtime;
  }

  return {
    ...overtime,
    Response: overtime.Response.filter((row) => identifiersSet.has(row.UserIdentifier ?? row.Identifier)),
  };
}

function buildDetailsByIdentifier(detailedUsers) {
  return new Map(
    detailedUsers
      .filter((user) => cleanValue(user.Identifier))
      .map((user) => [cleanValue(user.Identifier), user]),
  );
}

function decorateAllowedCompanyFields(user) {
  const companyName = getAllowedCompanyName(user);

  if (!companyName) {
    return null;
  }

  return {
    ...user,
    CompanyName: companyName,
    Company: companyName,
    EnterpriseName: companyName,
    BusinessName: companyName,
    TradeNameDescription: companyName,
  };
}

function getAllowedCompanyName(user) {
  const tradeName = cleanValue(user?.TradeName);
  const companyIdentifier = cleanValue(user?.UserCompanyIdentifier ?? user?.ExternalIdentifier);
  const companyName = cleanValue(
    user?.TradeNameDescription ??
    user?.CompanyName ??
    user?.Company ??
    user?.EnterpriseName ??
    user?.BusinessName,
  );

  return ALLOWED_TRADE_NAMES.get(tradeName) ||
    ALLOWED_COMPANY_IDENTIFIERS.get(companyIdentifier) ||
    ALLOWED_COMPANY_NAMES.get(normalizeLookupText(companyName)) ||
    '';
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

function buildVismaErrorMessage(path, status, data, text) {
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

function cleanValue(value) {
  return String(value ?? '').trim();
}

function cleanNamePart(value) {
  const cleaned = cleanValue(value);
  return /^[.\-_]+$/.test(cleaned) ? '' : cleaned;
}

function extractVismaSex(employee, searchEmployee) {
  const candidates = [
    employee?.sex,
    employee?.sexo,
    employee?.gender,
    employee?.genderName,
    employee?.genderType,
    employee?.sexDescription,
    employee?.genderDescription,
    employee?.sexCode,
    employee?.genderCode,
    employee?.personalData?.sex,
    employee?.personalData?.sexo,
    employee?.personalData?.gender,
    searchEmployee?.sex,
    searchEmployee?.sexo,
    searchEmployee?.gender,
    searchEmployee?.genderName,
    searchEmployee?.sexDescription,
    searchEmployee?.genderDescription,
    searchEmployee?.additionalAttributes?.Sex,
    searchEmployee?.additionalAttributes?.Gender,
  ];

  for (const candidate of candidates) {
    const value = extractVismaText(candidate);
    if (value) {
      return value;
    }
  }

  return '';
}

function extractVismaHealthAmount({ employee, phase, healthStructure }) {
  const candidates = [
    healthStructure?.amountUf,
    healthStructure?.amountUF,
    healthStructure?.ufAmount,
    healthStructure?.planAmountUf,
    healthStructure?.planAmountUF,
    healthStructure?.contributionUf,
    healthStructure?.contributionUF,
    healthStructure?.montoUf,
    healthStructure?.montoUF,
    healthStructure?.pactadoUf,
    healthStructure?.pactadoUF,
    healthStructure?.planUf,
    healthStructure?.planUF,
    healthStructure?.amount,
    healthStructure?.monto,
    healthStructure?.pactado,
    healthStructure?.valueUf,
    healthStructure?.valueUF,
    healthStructure?.valorUf,
    healthStructure?.valorUF,
    healthStructure?.value,
    healthStructure?.healthAmount,
    healthStructure?.healthPlanAmount,
    healthStructure?.healthContribution,
    phase?.health?.amountUf,
    phase?.health?.amountUF,
    phase?.health?.montoUf,
    phase?.health?.montoUF,
    phase?.health?.amount,
    phase?.health?.monto,
    phase?.healthInsurance?.amountUf,
    phase?.healthInsurance?.amountUF,
    phase?.healthInsurance?.montoUf,
    phase?.healthInsurance?.montoUF,
    phase?.healthInsurance?.amount,
    phase?.healthInsurance?.monto,
    phase?.healthPlan?.amountUf,
    phase?.healthPlan?.amountUF,
    phase?.healthPlan?.montoUf,
    phase?.healthPlan?.montoUF,
    phase?.healthPlan?.amount,
    phase?.healthPlan?.monto,
    employee?.health?.amountUf,
    employee?.health?.amountUF,
    employee?.health?.montoUf,
    employee?.health?.montoUF,
    employee?.health?.amount,
    employee?.health?.monto,
    employee?.healthInsurance?.amountUf,
    employee?.healthInsurance?.amountUF,
    employee?.healthInsurance?.montoUf,
    employee?.healthInsurance?.montoUF,
    employee?.healthInsurance?.amount,
    employee?.healthInsurance?.monto,
    employee?.healthPlan?.amountUf,
    employee?.healthPlan?.amountUF,
    employee?.healthPlan?.montoUf,
    employee?.healthPlan?.montoUF,
    employee?.healthPlan?.amount,
    employee?.healthPlan?.monto,
  ];

  for (const candidate of candidates) {
    const amount = extractVismaAmount(candidate);
    if (amount) {
      return amount;
    }
  }

  const descriptiveValues = [
    healthStructure?.description,
    healthStructure?.name,
    phase?.health?.description,
    phase?.healthInsurance?.description,
    phase?.healthPlan?.description,
    employee?.health?.description,
    employee?.healthInsurance?.description,
    employee?.healthPlan?.description,
  ];

  for (const value of descriptiveValues) {
    const amount = extractUfAmountFromText(value);
    if (amount) {
      return amount;
    }
  }

  return '';
}

function extractVismaAmount(value) {
  if (value && typeof value === 'object') {
    return extractVismaAmount(value.amount ?? value.value ?? value.description);
  }

  return extractUfAmountFromText(value);
}

function extractUfAmountFromText(value) {
  const cleaned = cleanValue(value).replace(',', '.');
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:uf|u\.f\.)?/i);
  return match ? match[1] : '';
}

function extractVismaText(value) {
  if (value && typeof value === 'object') {
    return cleanValue(value.description || value.name || value.label || value.code || value.id);
  }

  return cleanValue(value);
}

function normalizeLookupText(value) {
  return cleanValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
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
