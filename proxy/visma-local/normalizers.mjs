import {
  VISMA_REX_STRUCTURE_TYPES,
  findVismaStructureByKeywords,
  findVismaStructureByType,
  getActiveVismaStructures,
  getVismaStructureName,
  getVismaStructureTypeId,
  getVismaStructureTypeName,
} from '../../functions/visma-rex-mapping.mjs';

const VISMA_MAX_EMPLOYEE_PAGES = 100;

function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeMasterListItems(payload, type) {
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

export function normalizeCompanyStructures(payload, type) {
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
    id: clean(tenant?.id),
    name: clean(tenant?.name || tenant?.id),
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

export function filterEmployeesByCompany(employees, companyId, companyTypeId) {
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

export function normalizeTenants(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((tenant) => ({
      id: clean(tenant.Id ?? tenant.id),
      name: clean(tenant.TenantName ?? tenant.ClientName ?? tenant.name),
      country: clean(tenant.Country ?? tenant.country),
      webApiEnabled: tenant.WebApiEnabled !== false,
    }))
    .filter((tenant) => tenant.id);
}

export function selectTenant(tenants, requestedTenantId) {
  const requestedId = clean(requestedTenantId);
  return tenants.find((tenant) => tenant.id === requestedId) ||
    tenants.find((tenant) => tenant.webApiEnabled) ||
    tenants[0] ||
    null;
}

export function normalizePayrollProcesses(payload) {
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

export function vismaLabel(value) {
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

export function normalizeEmployee({
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

export function extractSalaryValue(salary) {
  if (salary && typeof salary === 'object') {
    return clean(salary.amount || salary.value || salary.baseSalary || salary.salary);
  }

  return typeof salary === 'string' || typeof salary === 'number' ? clean(salary) : '';
}

export function extractWeeklyHours(phase) {
  const candidates = [
    phase?.real?.hoursPerWeek,
    phase?.real?.weeklyHours,
    phase?.holidays?.weeklyHours,
    phase?.weeklyHours,
  ];

  return clean(candidates.find((value) => value !== undefined && value !== null) ?? '');
}

export function normalizeEmployeeStructureKeys(structures) {
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

export function summarizeEmployees(employees, totalAvailable) {
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

export async function fetchAllVismaPages(fetchPage, pageSize) {
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

export function readVismaTotalCount(payload) {
  const total = [payload?.totalCount, payload?.totalItems, payload?.total, payload?.count]
    .map(Number)
    .find((value) => Number.isFinite(value));

  return total ?? null;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
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

export function arrayValues(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.values)) return payload.values;
  if (Array.isArray(payload?.paginationList)) return payload.paginationList;
  if (Array.isArray(payload?.paginatedList)) return payload.paginatedList;
  return [];
}

export function findDefaultNationality(employee) {
  const nationalities = Array.isArray(employee.nationalities) ? employee.nationalities : [];
  const nationality = nationalities.find((item) => item.isDefault) ?? nationalities[0];
  return clean(nationality?.description || nationality?.externalDescription);
}

export function normalizeLookupText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
