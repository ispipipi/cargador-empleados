import * as XLSX from 'xlsx/xlsx.mjs';
import { cleanCell, normalizeText } from './utils.js';
import {
  AFP_NAME_ALIASES,
  BANK_NAME_ALIASES,
  CONTRACT_TYPE_ALIASES,
  HEALTH_NAME_ALIASES,
  NATION_ALIASES,
  PAYMENT_METHOD_ALIASES,
  REX_DEFAULT_PRIMARY_PHONE,
  REX_FIXED_DEFAULTS,
} from '../connectors/destinations/rex_empleados/catalogs.js';
import {
  normalizeEmailValue,
  resolveVacationStartDate,
} from '../connectors/destinations/rex_empleados/contractValues.js';
import {
  resolveCargoField,
  resolvePhone,
  resolveSedeField,
} from '../connectors/destinations/rex_empleados/fieldResolvers.js';
import {
  enrichGeographyFromSede,
  ensureRequiredGeography,
  resolveAddress,
  resolveComuna,
} from '../connectors/destinations/rex_empleados/geographyResolvers.js';

const MISSING_EMPLOYEE_ISSUE = 'No aparece en el maestro REX+.';
const REQUIRED_EMPLOYEE_FIELDS = [
  'Id empleado',
  'Nombres',
  'Apellido paterno',
  'Fecha de nacimiento',
  'Numero de teléfono 1',
  'Comuna',
  'Ciudad',
  'Region',
  'Nombre Calle',
  'Numero Calle',
  'Nivel de estudio',
  'Id banco',
  'Id forma de pago',
  'Id institución de salud',
  'Número del contrato',
  'Tipo del contrato',
  'Fecha de inicio del contrato',
  'Sueldo base',
  'Cargo',
  'Id centro de costo',
  'Id sede donde se desempeña',
  'Id sindicato',
  'Horas de trabajo semanales',
  'Distribución de jornada',
  '¿Cotiza seguro de cesantía?',
  'Id empresa',
  'Id plantilla grupal',
  'Agrupación de seguridad',
  'Área',
  'Modalidad del contrato',
  'Categoría INE',
  'Fecha de inicio de vacaciones',
];

const REQUIRED_FIELD_CATALOGS = {
  Comuna: 'Comuna',
  Ciudad: 'Ciudad',
  Region: 'Region',
  'Nivel de estudio': 'Nivel de estudio',
  'Id banco': 'Id banco',
  'Id forma de pago': 'Id forma de pago',
  'Id institución de salud': 'Id institución de salud',
  'Tipo del contrato': 'Tipo del contrato',
  Cargo: 'Cargo',
  'Id centro de costo': 'Id centro de costo',
  'Id sede donde se desempeña': 'Id sede donde se desempeña',
  'Id sindicato': 'Id sindicato',
  'Id empresa': 'Id empresa',
  'Id plantilla grupal': 'Id plantilla grupal',
  'Agrupación de seguridad': 'Agrupación de seguridad',
  Área: 'Área',
  'Modalidad del contrato': 'Modalidad del contrato',
  'Categoría INE': 'Categoría INE',
  'Distribución de jornada': 'Id Distribución Jornada',
};

export const REX_REQUIRED_EMPLOYEE_FIELDS = REQUIRED_EMPLOYEE_FIELDS;

export function buildVismaMissingEmployeeDraft({ issues, sourceEmployeeMaster = [], templateResource, companyId }) {
  if (!templateResource?.employeeHeaders?.length) {
    return { rowEntries: [], skipped: [], incomplete: [], missingHeaders: REQUIRED_EMPLOYEE_FIELDS };
  }

  const sourceByRut = new Map();
  sourceEmployeeMaster.forEach((employee) => {
    const rut = normalizeEmployeeKey(employee.id);
    if (!rut) return;
    if (!sourceByRut.has(rut)) sourceByRut.set(rut, []);
    sourceByRut.get(rut).push(employee);
  });

  const rowEntries = [];
  const skipped = [];
  const incomplete = [];
  const seen = new Set();
  issues.filter((issue) => issue.issue === MISSING_EMPLOYEE_ISSUE).forEach((issue) => {
    const rutKey = normalizeEmployeeKey(issue.id);
    if (!rutKey || seen.has(rutKey)) return;
    seen.add(rutKey);

    if (!/^\d{6,9}[0-9K]$/i.test(rutKey)) {
      skipped.push({ id: issue.id, reason: 'RUT inválido.' });
      return;
    }

    const candidates = sourceByRut.get(rutKey) ?? [];
    const employee = selectMasterRecord(candidates);
    if (!employee) {
      skipped.push({
        id: issue.id,
        reason: candidates.length ? 'Hay más de un registro VISMA distinto para el mismo RUT.' : 'El RUT no aparece en el maestro VISMA.',
      });
      return;
    }
    if (!cleanCell(employee.fullName)) {
      skipped.push({ id: issue.id, reason: 'El registro del maestro VISMA no tiene Nombre Completo.' });
      return;
    }

    const row = buildEmployeeRow({ employee, templateResource, companyId });
    const missingFields = getMissingRequiredFields(row, templateResource);
    rowEntries.push(row);
    if (missingFields.length) {
      incomplete.push({
        id: row['Id empleado'],
        name: [row.Nombres, row['Apellido paterno'], row['Apellido materno']].filter(Boolean).join(' '),
        fields: missingFields,
      });
    }
  });

  const missingHeaders = REQUIRED_EMPLOYEE_FIELDS.filter((header) => !templateResource?.employeeHeaders?.includes(header));
  return { rowEntries, skipped, incomplete, missingHeaders };
}

export function buildVismaEmployeeImportCsv({ templateResource, rowEntries }) {
  const missingHeaders = REQUIRED_EMPLOYEE_FIELDS.filter((header) => !templateResource?.employeeHeaders?.includes(header));
  if (missingHeaders.length) {
    throw new Error(`La plantilla no contiene campos obligatorios: ${missingHeaders.join(', ')}.`);
  }

  const invalidRows = rowEntries.filter((row) => getMissingRequiredFields(row, templateResource).length);
  if (invalidRows.length) {
    throw new Error('No se puede generar el CSV: hay campos obligatorios vacíos o con un ID que no existe en el catálogo REX+.');
  }

  const rows = [
    templateResource.employeeHeaders,
    ...rowEntries.map((entry) => templateResource.employeeHeaders.map((header) => entry[header] ?? '')),
  ];
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows), {
    FS: ';',
    RS: '\r\n',
    blankrows: false,
  });

  return `\uFEFF${csv}`;
}

export function buildVismaEmployeeRequiredFieldsReportCsv(incomplete) {
  const rows = [
    ['RUT', 'Trabajador', 'Campos obligatorios por resolver'],
    ...incomplete.map((item) => [item.id, item.name, item.fields.join(' | ')]),
  ];
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows), {
    FS: ';',
    RS: '\r\n',
    blankrows: false,
  });

  return `\uFEFF${csv}`;
}

function buildEmployeeRow({ employee, templateResource, companyId }) {
  const row = Object.fromEntries(templateResource.employeeHeaders.map((header) => [header, REX_FIXED_DEFAULTS[header] ?? '']));

  const nameParts = employee.nameParts ?? splitVismaName(employee.fullName);
  const afpId = findCatalogId(templateResource, 'Id AFP', employee.afp, AFP_NAME_ALIASES);
  const healthId = findCatalogId(templateResource, 'Id institución de salud', employee.health, HEALTH_NAME_ALIASES);
  const healthName = getCatalogName(templateResource, 'Id institución de salud', healthId);
  const startDate = formatRexDate(employee.startDate);
  const address = resolveAddress({
    sourceValue: employee.address,
    corrections: { streetName: employee.street, streetNumber: employee.streetNumber },
  });
  const contractType = resolveContractType(employee.contractType, templateResource);
  const healthCurrency = normalizeText(healthName) === 'fonasa' ? '%' : 'U';
  const resolverContext = {
    rowNumber: employee.sourceRow ?? 0,
    employeeId: employee.id,
    employeeName: employee.fullName,
  };
  const pendingItems = [];
  const phone = resolvePhone({
    key: 'phoneOne',
    label: 'Numero de teléfono 1',
    sourceValue: employee.phone,
    corrections: {},
    pendingItems,
    ...resolverContext,
  });
  const comunaResolution = resolveComuna({
    sourceValue: employee.comuna,
    locationValue: employee.worksite,
    secondaryLocationValue: employee.city,
    addressValue: employee.address,
    correctionValue: '',
    templateResource,
    pendingItems,
    ...resolverContext,
  });
  const worksite = resolveSedeField({
    sourceValue: employee.worksite,
    secondarySourceValue: employee.department,
    correctionValue: '',
    sourceCompanyValue: employee.company,
    resolvedCompanyId: companyId,
    templateResource,
    pendingItems,
    ...resolverContext,
  });
  const explicitGeography = {
    comunaId: findCatalogId(templateResource, 'Comuna', employee.comuna) || comunaResolution.comunaId,
    cityId: findCatalogId(templateResource, 'Ciudad', employee.city) || comunaResolution.cityId,
    regionId: findCatalogId(templateResource, 'Region', employee.region) || comunaResolution.regionId,
  };
  const geographyFromSede = enrichGeographyFromSede({
    comunaResolution: explicitGeography,
    sedeValue: worksite.value || employee.worksite,
    templateResource,
  });
  const geography = ensureRequiredGeography({
    geographyResolution: geographyFromSede,
    templateResource,
    sourceComunaValue: employee.comuna,
    sourceLocationValue: employee.worksite,
    secondaryLocationValue: employee.city,
    addressValue: employee.address,
    pendingItems,
    ...resolverContext,
  });
  const cargo = resolveCargoField({
    sourceRow: { POSICION: employee.position, 'JOB CODE': employee.employeeCode },
    templateResource,
    pendingItems,
    ...resolverContext,
  });
  const email = normalizeEmailValue(employee.email).toLowerCase() || 'sincorreo@gmail.com';

  setIfHeader(row, 'Id empleado', cleanCell(employee.id).replace(/\./g, '').toUpperCase());
  setIfHeader(row, 'Situación', 'A');
  setIfHeader(row, 'Nombres', sanitizeText([nameParts.firstName, nameParts.middleName].filter(Boolean).join(' ')));
  setIfHeader(row, 'Apellido paterno', sanitizeText(nameParts.lastName));
  setIfHeader(row, 'Apellido materno', sanitizeText(nameParts.familyName));
  setIfHeader(row, 'Sexo', resolveSex(employee.sex));
  setIfHeader(row, 'Fecha de nacimiento', formatRexDate(employee.birthDate));
  setIfHeader(row, 'Id nación', findCatalogId(templateResource, 'Id nación', employee.nationality, NATION_ALIASES));
  setIfHeader(row, 'Email institucional', email);
  setIfHeader(row, 'Email personal', email);
  setIfHeader(row, 'Numero de teléfono 1', phone || REX_DEFAULT_PRIMARY_PHONE);
  setIfHeader(row, 'Comuna', geography.comunaId);
  setIfHeader(row, 'Ciudad', geography.cityId);
  setIfHeader(row, 'Region', geography.regionId);
  setIfHeader(row, 'Nombre Calle', sanitizeText(address.streetName));
  setIfHeader(row, 'Numero Calle', cleanCell(address.streetNumber));
  setIfHeader(row, 'Nivel de estudio', findCatalogId(templateResource, 'Nivel de estudio', employee.education || REX_FIXED_DEFAULTS['Nivel de estudio']));
  setIfHeader(row, 'Id banco', findCatalogId(templateResource, 'Id banco', employee.bank, BANK_NAME_ALIASES));
  setIfHeader(row, 'Cuenta del banco', cleanCell(employee.accountNumber));
  setIfHeader(row, 'Id forma de pago', findCatalogId(templateResource, 'Id forma de pago', employee.paymentMethod, PAYMENT_METHOD_ALIASES));
  setIfHeader(row, 'Id AFP', afpId);
  setIfHeader(row, 'Estado de jubilación', '0');
  setIfHeader(row, 'Sistema de pensiones', 'N');
  setIfHeader(row, 'Id institución de salud', healthId);
  setIfHeader(row, 'Monto cotizado en la Isapre en UF', normalizeText(healthName) === 'fonasa' ? '' : formatAmount(employee.healthPlan));
  setIfHeader(row, 'Moneda de la cotización', healthId ? healthCurrency : '');
  setIfHeader(row, 'Nombre del contrato', sanitizeText(employee.contractType));
  setIfHeader(row, 'Número del contrato', 'C');
  setIfHeader(row, 'Tipo del contrato', contractType);
  setIfHeader(row, 'Fecha de inicio del contrato', startDate);
  setIfHeader(row, 'Fecha de término del contrato', formatRexDate(employee.endDate));
  setIfHeader(row, 'Sueldo base', formatAmount(employee.salary));
  setIfHeader(row, 'Cargo', cargo.value);
  setIfHeader(row, 'Id centro de costo', findCatalogId(templateResource, 'Id centro de costo', employee.costCenter));
  setIfHeader(row, 'Id sede donde se desempeña', worksite.value);
  setIfHeader(row, 'Id sindicato', findCatalogId(templateResource, 'Id sindicato', employee.union));
  setIfHeader(row, 'Horas de trabajo semanales', formatAmount(employee.weeklyHours));
  setIfHeader(row, '¿Jornada parcial?', resolvePartialShiftFromWeeklyHours(employee.weeklyHours));
  setIfHeader(row, 'Distribución de jornada', resolveWorkSchedule(employee.workSchedule || REX_FIXED_DEFAULTS['Distribución de jornada'], templateResource));
  setIfHeader(row, '¿Cotiza seguro de cesantía?', resolveYesNo(employee.unemploymentInsurance));
  setIfHeader(row, 'Fecha de incorporación al seguro de cesantía', startDate);
  setIfHeader(row, 'Fecha de afiliación a AFP', startDate);
  setIfHeader(row, 'Id empresa', findCatalogId(templateResource, 'Id empresa', companyId));
  setIfHeader(row, 'Id plantilla grupal', findCatalogId(templateResource, 'Id plantilla grupal', employee.templateGroup || (contractType === 'H' ? 'HONORARIOS' : 'GRUPO01')));
  setIfHeader(row, 'Agrupación de seguridad', findCatalogId(templateResource, 'Agrupación de seguridad', employee.securityGroup || 'noagrupar'));
  setIfHeader(row, 'Área', findCatalogId(templateResource, 'Área', employee.area || 'areadefault'));
  setIfHeader(row, 'Modalidad del contrato', findCatalogId(templateResource, 'Modalidad del contrato', employee.contractModality || REX_FIXED_DEFAULTS['Modalidad del contrato']));
  setIfHeader(row, 'Categoría INE', findCatalogId(templateResource, 'Categoría INE', employee.ineCategory));
  setIfHeader(row, 'Fecha de inicio de vacaciones', employee.vacationStartDate
    ? formatRexDate(employee.vacationStartDate)
    : resolveVacationStartDate({
      'FECHA ANTIGUEDAD': employee.seniorityDate,
      'FECHA INGRESO': employee.startDate,
    }));
  setIfHeader(row, '¿Cotiza previsión y salud?', afpId && healthId ? 'S' : '');

  return row;
}

function getMissingRequiredFields(row, templateResource) {
  return REQUIRED_EMPLOYEE_FIELDS.filter((header) => {
    const value = cleanCell(row[header]);
    if (!value) return true;

    const catalogName = REQUIRED_FIELD_CATALOGS[header];
    if (!catalogName) return false;
    const catalog = templateResource?.catalogs?.[catalogName];
    return !Array.isArray(catalog) || !catalog.length || !catalog.some((item) => cleanCell(item.id) === value);
  });
}

function resolveContractType(value, templateResource) {
  const normalized = normalizeCatalogText(value);
  const knownId = CONTRACT_TYPE_ALIASES[normalized];
  return findCatalogId(templateResource, 'Tipo del contrato', knownId || value);
}

function resolveWorkSchedule(value, templateResource) {
  const id = findCatalogId(templateResource, 'Id Distribución Jornada', value);
  if (id) return id;
  const days = cleanCell(value);
  return ['4', '5', '6'].includes(days) ? days : '';
}

function resolveYesNo(value) {
  const normalized = normalizeText(value);
  if (['s', 'si', 'yes', 'true', '1'].includes(normalized)) return 'S';
  if (['n', 'no', 'false', '0'].includes(normalized)) return 'N';
  return '';
}

function resolvePartialShiftFromWeeklyHours(value) {
  const normalized = cleanCell(value).replace(/\s/g, '').replace(',', '.');
  const weeklyHours = Number(normalized);
  if (!normalized || !Number.isFinite(weeklyHours) || weeklyHours <= 0) return '';
  return weeklyHours > 30 ? 'N' : 'S';
}

function sanitizeText(value) {
  return cleanCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function selectMasterRecord(candidates) {
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return null;

  const active = candidates.filter((candidate) => !cleanCell(candidate.endDate));
  if (active.length === 1) return active[0];
  const comparable = active.length ? active : candidates;
  const signatures = new Set(comparable.map((candidate) => JSON.stringify({
    fullName: normalizeText(candidate.fullName),
    birthDate: cleanCell(candidate.birthDate),
    sex: normalizeText(candidate.sex),
    phone: cleanCell(candidate.phone),
    comuna: normalizeText(candidate.comuna),
    city: normalizeText(candidate.city),
    region: normalizeText(candidate.region),
    address: normalizeText(candidate.address),
    street: normalizeText(candidate.street),
    streetNumber: cleanCell(candidate.streetNumber),
    education: normalizeText(candidate.education),
    nationality: normalizeText(candidate.nationality),
    bank: normalizeText(candidate.bank),
    accountNumber: cleanCell(candidate.accountNumber),
    endDate: cleanCell(candidate.endDate),
    startDate: cleanCell(candidate.startDate),
    health: normalizeText(candidate.health),
    healthPlan: cleanCell(candidate.healthPlan),
    email: normalizeText(candidate.email),
    afp: normalizeText(candidate.afp),
    contractType: normalizeText(candidate.contractType),
    position: normalizeText(candidate.position),
    costCenter: normalizeText(candidate.costCenter),
    worksite: normalizeText(candidate.worksite),
    union: normalizeText(candidate.union),
    paymentMethod: normalizeText(candidate.paymentMethod),
    weeklyHours: cleanCell(candidate.weeklyHours),
    workSchedule: normalizeText(candidate.workSchedule),
    vacationStartDate: cleanCell(candidate.vacationStartDate),
    seniorityDate: cleanCell(candidate.seniorityDate),
    contractModality: normalizeText(candidate.contractModality),
    ineCategory: normalizeText(candidate.ineCategory),
    salary: cleanCell(candidate.salary),
  })));
  return signatures.size === 1 ? comparable[0] : null;
}

function splitVismaName(value) {
  const [surnames = '', names = ''] = cleanCell(value).split(/\s*,\s*/, 2);
  const surnameParts = surnames.split(/\s+/).filter(Boolean);
  if (!names && surnameParts.length < 2) return { firstName: surnameParts[0] ?? '', middleName: '', lastName: '', familyName: '' };
  return {
    firstName: cleanCell(names).split(/\s+/).filter(Boolean)[0] ?? '',
    middleName: cleanCell(names).split(/\s+/).filter(Boolean).slice(1).join(' '),
    lastName: surnameParts[0] ?? '',
    familyName: surnameParts.slice(1).join(' '),
  };
}

function resolveSex(value) {
  const normalized = normalizeText(value);
  if (['m', 'masculino', 'hombre'].includes(normalized)) return 'M';
  if (['f', 'femenino', 'mujer'].includes(normalized)) return 'F';
  return '';
}

function findCatalogId(templateResource, catalogName, sourceValue, aliases = {}) {
  const normalized = normalizeText(sourceValue);
  if (!normalized) return '';
  const alias = normalizeText(aliases[normalizeCatalogText(sourceValue)]);
  const candidates = [normalized, alias].filter(Boolean);
  const matches = (templateResource.catalogs?.[catalogName] ?? []).filter((item) =>
    candidates.includes(normalizeText(item.id)) || candidates.includes(normalizeText(item.name)),
  );
  const ids = [...new Set(matches.map((item) => cleanCell(item.id)).filter(Boolean))];
  return ids.length === 1 ? ids[0] : '';
}

function getCatalogName(templateResource, catalogName, id) {
  return cleanCell((templateResource.catalogs?.[catalogName] ?? []).find((item) => cleanCell(item.id) === id)?.name);
}

function setIfHeader(row, header, value) {
  if (Object.hasOwn(row, header)) row[header] = cleanCell(value);
}

function formatAmount(value) {
  const normalized = cleanCell(value).replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const amount = Number(normalized);
  return normalized && Number.isFinite(amount) ? String(Math.trunc(amount)) : '';
}

function formatRexDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return Number.isNaN(date.getTime())
      ? ''
      : formatDateParts(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear());
  }

  const raw = cleanCell(value);
  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) return formatDateParts(Number(isoDate[3]), Number(isoDate[2]), Number(isoDate[1]));
  const localDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localDate) return formatDateParts(Number(localDate[1]), Number(localDate[2]), Number(localDate[3]));
  return '';
}

function formatDateParts(day, month, year) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function normalizeEmployeeKey(value) {
  return cleanCell(value).replace(/[.\s-]/g, '').toUpperCase();
}

function normalizeCatalogText(value) {
  return normalizeText(value).replace(/[().,/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
