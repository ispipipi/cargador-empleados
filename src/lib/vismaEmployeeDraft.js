import { cleanCell, normalizeText } from './utils.js';
import { getVismaSourceValue } from './vismaSourceValues.js';

const MISSING_EMPLOYEE_ISSUE = 'No aparece en el maestro REX+.';

export function buildVismaMissingEmployeeDraft({ issues, sourceRows, templateResource, companyId }) {
  const sourceByRut = new Map();
  sourceRows.forEach((row) => {
    const rut = normalizeEmployeeKey(getVismaSourceValue(row, 'RUT'));
    if (rut && !sourceByRut.has(rut)) sourceByRut.set(rut, []);
    if (rut) sourceByRut.get(rut).push(row);
  });

  const rowEntries = [];
  const skipped = [];
  const seen = new Set();
  issues.filter((issue) => issue.issue === MISSING_EMPLOYEE_ISSUE).forEach((issue) => {
    const rutKey = normalizeEmployeeKey(issue.id);
    if (!rutKey || seen.has(rutKey)) return;
    seen.add(rutKey);
    const matchingRows = sourceByRut.get(rutKey) ?? [];
    const sourceRow = matchingRows.find((row) =>
      (!issue.sourceFile || cleanCell(row.__sourceFileName) === issue.sourceFile)
      && (!issue.sourceRow || String(row.__sourceRowNumber ?? '') === String(issue.sourceRow)),
    ) ?? matchingRows[0];

    if (!sourceRow || !/^\d{6,9}[0-9K]$/i.test(rutKey)) {
      skipped.push(issue.id);
      return;
    }

    rowEntries.push(buildEmployeeRow({ sourceRow, templateResource, companyId }));
  });

  return { rowEntries, skipped };
}

function buildEmployeeRow({ sourceRow, templateResource, companyId }) {
  const row = Object.fromEntries(templateResource.employeeHeaders.map((header) => [header, '']));
  const employeeName = getVismaSourceValue(sourceRow, 'Apellido y Nombre');
  const nameParts = parseVismaName(employeeName);
  const status = normalizeText(getVismaSourceValue(sourceRow, 'Estado'));

  setIfHeader(row, 'Id empleado', cleanCell(getVismaSourceValue(sourceRow, 'RUT')));
  setIfHeader(row, 'Situación', ['activo', 'vigente', 'a'].includes(status) ? 'A' : '');
  setIfHeader(row, 'Nombres', nameParts.names);
  setIfHeader(row, 'Apellido paterno', nameParts.lastName);
  setIfHeader(row, 'Apellido materno', nameParts.middleName);
  setIfHeader(row, 'Sexo', resolveSex(getVismaSourceValue(sourceRow, 'Sexo')));
  setIfHeader(row, 'Fecha de nacimiento', formatRexDate(getVismaSourceValue(sourceRow, 'Fecha de Nacimiento')));
  setIfHeader(row, 'Fecha de inicio del contrato', formatRexDate(getVismaSourceValue(sourceRow, 'Fecha de Ingreso')));
  setIfHeader(row, 'Sueldo base', formatAmount(getVismaSourceValue(sourceRow, 'Sueldo')));
  setIfHeader(row, 'Id AFP', findExactCatalogId(templateResource, 'Id AFP', getVismaSourceValue(sourceRow, 'AFP')));
  setIfHeader(row, 'Id institución de salud', findExactCatalogId(templateResource, 'Id institución de salud', getVismaSourceValue(sourceRow, 'Isapre')));
  setIfHeader(row, 'Cargo', findExactCatalogId(templateResource, 'Cargo', getVismaSourceValue(sourceRow, 'Cargo')));
  setIfHeader(row, 'Id centro de costo', findExactCatalogId(templateResource, 'Id centro de costo', getVismaSourceValue(sourceRow, 'Id Centro de Costo')));
  setIfHeader(row, 'Id empresa', companyId);

  return row;
}

function parseVismaName(value) {
  const [surnames = '', names = ''] = cleanCell(value).split(/\s*,\s*/, 2);
  const surnameParts = surnames.split(/\s+/).filter(Boolean);
  if (!names && surnameParts.length < 2) return { names: '', lastName: '', middleName: '' };
  return {
    names: cleanCell(names),
    lastName: surnameParts[0] ?? '',
    middleName: surnameParts.slice(1).join(' '),
  };
}

function resolveSex(value) {
  const normalized = normalizeText(value);
  if (['m', 'masculino', 'hombre'].includes(normalized)) return 'M';
  if (['f', 'femenino', 'mujer'].includes(normalized)) return 'F';
  return '';
}

function findExactCatalogId(templateResource, catalogName, sourceValue) {
  const normalized = normalizeText(sourceValue);
  if (!normalized) return '';
  const matches = (templateResource.catalogs?.[catalogName] ?? []).filter((item) =>
    normalizeText(item.id) === normalized || normalizeText(item.name) === normalized,
  );
  const ids = [...new Set(matches.map((item) => cleanCell(item.id)).filter(Boolean))];
  return ids.length === 1 ? ids[0] : '';
}

function setIfHeader(row, header, value) {
  if (Object.hasOwn(row, header)) row[header] = cleanCell(value);
}

function formatAmount(value) {
  const normalized = cleanCell(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return normalized && Number.isFinite(amount) ? String(Math.trunc(amount)) : '';
}

function formatRexDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return Number.isNaN(date.getTime())
      ? ''
      : formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const raw = cleanCell(value);
  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) return formatDateParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  const localDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localDate) return formatDateParts(Number(localDate[3]), Number(localDate[2]), Number(localDate[1]));
  return '';
}

function formatDateParts(year, month, day) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function normalizeEmployeeKey(value) {
  return cleanCell(value).replace(/[.\s-]/g, '').toUpperCase();
}
