export const VISMA_REX_MAPPING_PROFILE = Object.freeze({
  id: 'VISMA_REX_BASE_V1',
  label: 'VISMA -> REX+ base',
  appliesTo: 'all-companies',
  source: 'VISMA Latam API',
  destination: 'REX+',
});

export const VISMA_REX_ENDPOINTS = Object.freeze({
  employees: '/vlwebapi/employees',
  employeeDetail: '/vlwebapi/employees/{employeeRef}',
  addresses: '/vlwebapi/employees/{employeeRef}/addresses',
  phones: '/vlwebapi/employees/{employeeRef}/phones',
  phases: '/vlwebapi/employees/{employeeRef}/phases',
  structures: '/vlwebapi/employees/{employeeRef}/structures',
  bankAccounts: '/vlwebapi/employees/{employeeRef}/bank-accounts',
  payrollProcesses: '/Payroll/api/payroll-processes',
});

export const VISMA_REX_STRUCTURE_TYPES = Object.freeze({
  company: Object.freeze(['10', '1']),
  contract: Object.freeze(['18']),
  position: Object.freeze(['4']),
  costCenter: Object.freeze(['5']),
  area: Object.freeze([]),
  department: Object.freeze(['9']),
  location: Object.freeze([]),
  afp: Object.freeze(['15']),
  health: Object.freeze(['17']),
  union: Object.freeze(['16']),
  pensionSystem: Object.freeze(['42']),
  heavyWork: Object.freeze(['301']),
  unemploymentInsurance: Object.freeze(['311']),
  workdayDistribution: Object.freeze(['306', '314']),
  employeeType: Object.freeze(['31']),
  retirementStatus: Object.freeze(['309']),
  expatriate: Object.freeze(['307']),
});

export const VISMA_REX_MASTER_LISTS = Object.freeze([
  Object.freeze({
    key: 'positions',
    label: 'Cargos',
    typeIds: Object.freeze(['4']),
    typeKeywords: Object.freeze(['cargo', 'posicion', 'puesto']),
  }),
  Object.freeze({
    key: 'costCenters',
    label: 'Centros de costo',
    typeIds: Object.freeze(['5']),
    typeKeywords: Object.freeze(['centro costo', 'centro de costo', 'cost center', 'ceco']),
  }),
  Object.freeze({
    key: 'companies',
    label: 'Empresas',
    typeIds: Object.freeze(['10']),
    fallbackTypeIds: Object.freeze(['1']),
    typeKeywords: Object.freeze(['empresa', 'razon social', 'compania', 'sociedad', 'company']),
  }),
  Object.freeze({
    key: 'areas',
    label: 'Areas',
    typeIds: Object.freeze([]),
    typeKeywords: Object.freeze(['area', 'unidad negocio', 'unidad de negocios', 'departamento', 'gerencia', 'division']),
  }),
  Object.freeze({
    key: 'unions',
    label: 'Sindicatos',
    typeIds: Object.freeze(['16']),
    typeKeywords: Object.freeze(['sindicato']),
  }),
]);

export function matchesVismaMasterType(type, definition) {
  const typeId = cleanMappingValue(type?.id ?? type?.structureTypeId);
  const typeName = normalizeMappingText(type?.description ?? type?.name ?? type?.externalCode);
  return definition.typeIds.includes(typeId) || definition.typeKeywords.some((keyword) => typeName.includes(normalizeMappingText(keyword)));
}

export function selectVismaMasterTypes(types, definition) {
  const availableTypes = Array.isArray(types) ? types : [];
  const exactTypes = availableTypes.filter((type) => definition.typeIds.includes(cleanMappingValue(type?.id ?? type?.structureTypeId)));
  if (exactTypes.length) {
    return exactTypes;
  }

  const fallbackTypes = availableTypes.filter((type) => definition.fallbackTypeIds?.includes(cleanMappingValue(type?.id ?? type?.structureTypeId)));
  return fallbackTypes.length ? fallbackTypes : availableTypes.filter((type) => matchesVismaMasterType(type, definition));
}

export function getVismaStructureTypeId(structure) {
  return cleanMappingValue(
    structure?.type?.id ?? structure?.typeId ?? structure?.structureTypeId,
  );
}

export function getVismaStructureTypeName(structure) {
  return cleanMappingValue(
    structure?.type?.description ?? structure?.type?.name ?? structure?.typeName,
  );
}

export function getVismaStructureName(structure) {
  return cleanMappingValue(
    structure?.description ?? structure?.name ?? structure?.externalDescription ?? structure?.externalId,
  );
}

export function getVismaStructureLookupText(structure) {
  return normalizeMappingText([
    getVismaStructureTypeName(structure),
    getVismaStructureName(structure),
    structure?.externalId,
  ].filter(Boolean).join(' '));
}

export function getActiveVismaStructures(structures, now = Date.now()) {
  return (Array.isArray(structures) ? structures : [])
    .filter((structure) => {
      const dateTo = Date.parse(String(structure?.dateTo || ''));
      return !structure?.dateTo || Number.isNaN(dateTo) || dateTo >= now;
    })
    .sort((left, right) => String(right?.dateFrom || '').localeCompare(String(left?.dateFrom || '')));
}

export function findVismaStructureByType(structures, typeIds, keywords = []) {
  const acceptedTypeIds = new Set((Array.isArray(typeIds) ? typeIds : [typeIds]).map(String));
  const normalizedKeywords = keywords.map(normalizeMappingText).filter(Boolean);

  return (Array.isArray(structures) ? structures : []).find((structure) => {
    const typeId = getVismaStructureTypeId(structure);
    const typeName = normalizeMappingText(getVismaStructureTypeName(structure));
    return acceptedTypeIds.has(typeId) || normalizedKeywords.some((keyword) => typeName.includes(keyword));
  }) ?? null;
}

export function findVismaStructureByKeywords(structures, keywords) {
  const normalizedKeywords = (Array.isArray(keywords) ? keywords : [keywords])
    .map(normalizeMappingText)
    .filter(Boolean);

  return (Array.isArray(structures) ? structures : []).find((structure) => {
    const lookupText = getVismaStructureLookupText(structure);
    return normalizedKeywords.some((keyword) => lookupText.includes(keyword));
  }) ?? null;
}

export function normalizeMappingText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMappingValue(value) {
  return String(value ?? '').trim();
}
