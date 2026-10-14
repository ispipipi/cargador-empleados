import { cleanCell, normalizeText } from './utils.js';
import {
  AFP_NAME_ALIASES,
  CONTRACT_TYPE_ALIASES,
  HEALTH_NAME_ALIASES,
  NATION_ALIASES,
  REX_FIXED_DEFAULTS,
} from '../connectors/destinations/rex_empleados/catalogs.js';

const MISSING_EMPLOYEE_ISSUE = 'No aparece en el maestro REX+.';

export function buildVismaMissingEmployeeDraft({ issues, sourceEmployeeMaster = [], templateResource, companyId }) {
  const sourceByRut = new Map();
  sourceEmployeeMaster.forEach((employee) => {
    const rut = normalizeEmployeeKey(employee.id);
    if (!rut) return;
    if (!sourceByRut.has(rut)) sourceByRut.set(rut, []);
    sourceByRut.get(rut).push(employee);
  });

  const rowEntries = [];
  const skipped = [];
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

    rowEntries.push(buildEmployeeRow({ employee, templateResource, companyId }));
  });

  return { rowEntries, skipped };
}

function buildEmployeeRow({ employee, templateResource, companyId }) {
  const row = Object.fromEntries(templateResource.employeeHeaders.map((header) => [header, REX_FIXED_DEFAULTS[header] ?? '']));
  const nameParts = employee.nameParts ?? splitVismaName(employee.fullName);
  const afpId = findCatalogId(templateResource, 'Id AFP', employee.afp, AFP_NAME_ALIASES);
  const healthId = findCatalogId(templateResource, 'Id institución de salud', employee.health, HEALTH_NAME_ALIASES);
  const healthName = getCatalogName(templateResource, 'Id institución de salud', healthId);
  const startDate = formatRexDate(employee.startDate);

  setIfHeader(row, 'Id empleado', cleanCell(employee.id).replace(/\./g, '').toUpperCase());
  setIfHeader(row, 'Situación', 'A');
  setIfHeader(row, 'Nombres', [nameParts.firstName, nameParts.middleName].filter(Boolean).join(' '));
  setIfHeader(row, 'Apellido paterno', nameParts.lastName);
  setIfHeader(row, 'Apellido materno', nameParts.familyName);
  setIfHeader(row, 'Sexo', resolveSex(employee.sex));
  setIfHeader(row, 'Fecha de nacimiento', formatRexDate(employee.birthDate));
  setIfHeader(row, 'Id nación', findCatalogId(templateResource, 'Id nación', employee.nationality, NATION_ALIASES));
  setIfHeader(row, 'Email personal', cleanCell(employee.email));
  setIfHeader(row, 'Id banco', findCatalogId(templateResource, 'Id banco', employee.bank));
  setIfHeader(row, 'Cuenta del banco', cleanCell(employee.accountNumber));
  setIfHeader(row, 'Id AFP', afpId);
  setIfHeader(row, 'Estado de jubilación', '0');
  setIfHeader(row, 'Sistema de pensiones', 'N');
  setIfHeader(row, 'Id institución de salud', healthId);
  setIfHeader(row, 'Monto cotizado en la Isapre en UF', normalizeText(healthName) === 'fonasa' ? '' : formatAmount(employee.healthPlan));
  setIfHeader(row, 'Moneda de la cotización', healthId ? (normalizeText(healthName) === 'fonasa' ? '%' : 'U') : '');
  setIfHeader(row, 'Nombre del contrato', cleanCell(employee.contractType));
  setIfHeader(row, 'Tipo del contrato', CONTRACT_TYPE_ALIASES[normalizeCatalogText(employee.contractType)] ?? '');
  setIfHeader(row, 'Fecha de inicio del contrato', startDate);
  setIfHeader(row, 'Fecha de término del contrato', formatRexDate(employee.endDate));
  setIfHeader(row, 'Sueldo base', formatAmount(employee.salary));
  setIfHeader(row, 'Cargo', findCatalogId(templateResource, 'Cargo', employee.position));
  setIfHeader(row, 'Id centro de costo', findCatalogId(templateResource, 'Id centro de costo', employee.costCenter));
  setIfHeader(row, '¿Cotiza seguro de cesantía?', 'S');
  setIfHeader(row, 'Fecha de incorporación al seguro de cesantía', startDate);
  setIfHeader(row, 'Fecha de afiliación a AFP', startDate);
  setIfHeader(row, 'Id empresa', companyId);
  setIfHeader(row, '¿Cotiza previsión y salud?', afpId && healthId ? 'S' : '');

  return row;
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
  const matches = (templateResource.catalogs?.[catalogName] ?? []).filter((item) =>
    [normalized, alias].filter(Boolean).includes(normalizeText(item.id))
      || [normalized, alias].filter(Boolean).includes(normalizeText(item.name)),
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
