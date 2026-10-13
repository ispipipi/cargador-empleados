import { VISMA_REX_MASTER_LISTS, selectVismaMasterTypes } from '../visma-rex-mapping.mjs';
import { getVismaTenantJson } from './api.js';
import { mapWithConcurrency } from './paging.js';
import { arrayValues, cleanNamePart, cleanValue, normalizeLookupText } from './shared.js';

function findMainDocument(employee) {
  const documents = Array.isArray(employee.nationalIdentificationNumbers) ? employee.nationalIdentificationNumbers : [];
  return cleanValue((documents.find((item) => item.mainDocument) ?? documents[0])?.number);
}

export function normalizeVismaTenants(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((tenant) => ({
      id: cleanValue(tenant.Id ?? tenant.id),
      name: cleanValue(tenant.TenantName ?? tenant.ClientName ?? tenant.name),
      country: cleanValue(tenant.Country ?? tenant.country),
      webApiEnabled: tenant.WebApiEnabled !== false,
    }))
    .filter((tenant) => tenant.id);
}

export function selectVismaTenant(tenants, requestedTenantId) {
  const requestedId = cleanValue(requestedTenantId);

  if (requestedId) {
    const requestedTenant = tenants.find((tenant) => String(tenant.id) === requestedId);
    if (requestedTenant) {
      return requestedTenant;
    }
  }

  return tenants.find((tenant) => tenant.webApiEnabled) ?? tenants[0] ?? null;
}

export function normalizeVismaPayrollPeriods(payload) {
  return arrayValues(payload)
    .map((period) => ({
      id: vismaLabel(period.id ?? period.periodId),
      description: vismaLabel(period.periodDescription ?? period.description ?? period.name),
      companyId: vismaLabel(period.companyId),
      companyName: vismaLabel(period.companyName),
      dateFrom: vismaLabel(period.startingDate ?? period.dateFrom ?? period.startDate),
      dateTo: vismaLabel(period.endDate ?? period.dateTo ?? period.toDate),
      month: vismaLabel(period.periodMonth ?? period.month),
      year: vismaLabel(period.periodYear ?? period.year),
    }))
    .filter((period) => period.id || period.description);
}

export function normalizeVismaPayrollProcesses(payload, periodId = '') {
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
      periodId: vismaLabel(process.periodId ?? periodId),
      companyName: vismaLabel(process.companyName ?? process.company),
      paymentDate: vismaLabel(process.paymentDate),
    }))
    .filter((process) => process.id || process.name || process.period);
}

export function normalizeVismaPayrollEmployee(employee) {
  const firstName = cleanNamePart(employee.firstName);
  const middleName = cleanNamePart(employee.middleName);
  const lastName = cleanNamePart(employee.lastName);
  const familyName = cleanNamePart(employee.familyName);

  return {
    employeeId: cleanValue(employee.id),
    externalId: cleanValue(employee.externalId || employee.id),
    documentNumber: findMainDocument(employee),
    firstName,
    middleName,
    lastName,
    familyName,
    fullName: [firstName, middleName, lastName, familyName].filter(Boolean).join(' '),
    hiringDate: cleanValue(employee.hiringDate),
    dateOfBirth: cleanValue(employee.dateOfBirth),
    isActive: employee.isActive !== false,
  };
}

export async function discoverVismaOrganizationGroups({ token, tenantId, subscriptionKey, tenant }) {
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

export async function fetchOrganizationMasterLists({ token, tenantId, subscriptionKey }) {
  const structureTypesPayload = await getVismaTenantJson({
    token,
    tenantId,
    subscriptionKey,
    path: '/organization/api/structure-types?HasManager=false',
  });
  const structureTypes = Array.isArray(structureTypesPayload) ? structureTypesPayload : [];

  const loadableDefinitions = VISMA_REX_MASTER_LISTS.filter((definition) => (
    ['positions', 'costCenters', 'areas'].includes(definition.key)
  ));

  return mapWithConcurrency(loadableDefinitions, 5, async (definition) => {
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

export function normalizeMasterListItems(payload, type) {
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

export function uniqueMasterListItems(items) {
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

export function normalizeVismaCompanyStructures(payload, type) {
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

export function uniqueCompanyOptions(options) {
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

export function tenantToCompanyOption(tenant) {
  return {
    id: cleanValue(tenant?.id),
    name: cleanValue(tenant?.name || tenant?.id),
    externalId: '',
    typeId: '',
    typeName: 'Tenant VISMA',
  };
}

export function tenantToOrganizationGroup(tenant) {
  const option = tenantToCompanyOption(tenant);
  return {
    id: '',
    name: 'Tenant VISMA',
    externalCode: '',
    count: 1,
    options: [option],
  };
}

export function selectPreferredOrganizationGroup(groups) {
  return sortOrganizationGroups(groups)[0] ?? null;
}

export function sortOrganizationGroups(groups) {
  return [...groups].sort((left, right) => {
    const leftScore = organizationGroupScore(left);
    const rightScore = organizationGroupScore(right);

    return leftScore - rightScore || right.count - left.count || left.name.localeCompare(right.name);
  });
}

export function organizationGroupScore(group) {
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

export function filterVismaEmployeesByCompany(employees, companyId, companyTypeId) {
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

export function vismaLabel(value) {
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
