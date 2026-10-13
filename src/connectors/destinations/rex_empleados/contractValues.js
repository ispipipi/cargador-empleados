import * as XLSX from 'xlsx';
import { cleanCell, extractValidEmail } from '../../../lib/utils';
import { SEDE_NAME_ALIASES } from './catalogs';
import { buildPendingItem, isIntentionalBlankCorrection } from './pending';
import { normalizeLooseText, normalizeSedeName } from './normalizers';

export function resolveVacationStartDate(sourceRow) {
  const seniorityDate = toDateOnly(sourceRow['FECHA ANTIGUEDAD']);
  const entryDate = toDateOnly(sourceRow['FECHA INGRESO']);
  return formatDateAsDmy(seniorityDate && entryDate && seniorityDate < entryDate ? seniorityDate : entryDate);
}

export function hasRecognizedAntiquity(sourceRow) {
  const seniorityDate = toDateOnly(sourceRow['FECHA ANTIGUEDAD']);
  const entryDate = toDateOnly(sourceRow['FECHA INGRESO']);
  return Boolean(seniorityDate && entryDate && seniorityDate < entryDate);
}

export function calculateMonthDifference(startValue, endValue) {
  const startDate = toDateOnly(startValue);
  const endDate = toDateOnly(endValue);
  if (!startDate || !endDate || startDate >= endDate) return 0;

  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
  months += endDate.getMonth() - startDate.getMonth();
  if (endDate.getDate() < startDate.getDate()) months -= 1;
  return Math.max(months, 0);
}

export function inferContractTypeId({ sourceValue, endDateValue }) {
  const normalizedSource = normalizeLooseText(sourceValue);
  if (normalizedSource.includes('indef') || normalizedSource.includes('indefinido')) return 'I';
  if (normalizedSource.includes('plazo') || normalizedSource.includes('fijo') || normalizedSource.includes('pf')) return 'F';
  if (cleanCell(endDateValue)) return 'F';
  return normalizedSource ? 'I' : '';
}

export function buildSedeCandidates({ sourceValue, sourceCompanyValue, resolvedCompanyId }) {
  const rawValue = cleanCell(sourceValue);
  const branchName = rawValue.replace(/^(sucursal|oficina|agencia)\s+/i, '').trim();
  const candidates = [rawValue];
  candidates.push(...(SEDE_NAME_ALIASES[normalizeSedeName(rawValue)] ?? []));

  if (branchName && branchName !== rawValue) {
    candidates.push(branchName);
    const prefix = getCompanySedePrefix(sourceCompanyValue, resolvedCompanyId);
    if (prefix) candidates.push(`${prefix} ${branchName}`);
  }

  return [...new Set(candidates.map(cleanCell).filter(Boolean))];
}

function getCompanySedePrefix(sourceCompanyValue, resolvedCompanyId) {
  if (cleanCell(resolvedCompanyId) === '4') return 'Diperk';
  if (cleanCell(resolvedCompanyId) === '5') return 'Sitech';
  const normalizedCompany = normalizeLooseText(sourceCompanyValue);
  if (normalizedCompany.includes('distribuidora perkins chilena') || normalizedCompany.includes('diperk')) return 'Diperk';
  return normalizedCompany.includes('sitech') ? 'Sitech' : '';
}

export function isNoCotiza(sourceRow) {
  const hasAfpNoCotizaSignal =
    normalizeLooseText(sourceRow.AFP) === 'no definida' || cleanCell(sourceRow['CODIGO AFP']) === '9999';
  if (!hasAfpNoCotizaSignal) return false;

  const normalizedHealth = normalizeLooseText(sourceRow.ISAPRE);
  return !cleanCell(sourceRow.ISAPRE) || ['no definida', 'sin definir', 'no cotiza', 'sindefinir'].includes(normalizedHealth);
}

export function normalizePhone(value) {
  const digits = cleanCell(value).replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return '';
  if (digits.length === 11 && digits.startsWith('56')) return `+${digits}`;
  if (digits.length === 9 && (digits.startsWith('9') || digits.startsWith('2'))) return `+56${digits}`;
  if (digits.length === 8 && digits.startsWith('2')) return `+562${digits.slice(1)}`;
  return '';
}

export function normalizeEmailValue(value) {
  const normalizedValue = extractValidEmail(value);
  return isValidEmailFormat(normalizedValue) ? normalizedValue : '';
}

function isValidEmailFormat(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCell(value));
}

export function resolveContractStartField({ sourceRow, correctionValue, pendingItems, rowNumber, employeeId, employeeName }) {
  const normalizedCorrection = cleanCell(correctionValue);
  if (normalizedCorrection && !isIntentionalBlankCorrection(normalizedCorrection)) {
    return formatRexDate(normalizedCorrection) || normalizedCorrection;
  }

  const sourceFormattedDate = formatRexDate(sourceRow['FECHA INGRESO']);
  if (isContractStartBeforeLegalAge(sourceRow)) {
    pendingItems.push(buildPendingItem({
      key: 'contractStartDate',
      label: 'Fecha de inicio del contrato',
      type: 'text',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: sourceFormattedDate,
    }));
  }
  return sourceFormattedDate;
}

function isContractStartBeforeLegalAge(sourceRow) {
  const entryDate = toDateOnly(sourceRow['FECHA INGRESO']);
  const birthDate = toDateOnly(sourceRow['FECHA NACIMIENTO']);
  if (!entryDate || !birthDate) return false;

  const earliestLegalDate = new Date(birthDate.getFullYear() + 15, birthDate.getMonth(), birthDate.getDate());
  return entryDate < earliestLegalDate;
}

export function formatIntegerValue(value) {
  const numericValue = Number(cleanCell(value));
  return Number.isFinite(numericValue) ? String(Math.trunc(numericValue)) : '';
}

export function formatRut(value) {
  const rawValue = cleanCell(value).replace(/\./g, '').toUpperCase();
  if (!rawValue) return '';

  const [body, verifier = ''] = rawValue.split('-');
  const numericBody = body.replace(/\D/g, '');
  return !numericBody || !verifier ? rawValue : `${numericBody}-${verifier}`;
}

export function formatRexDate(value) {
  return formatDateAsDmy(toDateOnly(value));
}

export function toDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedDate = XLSX.SSF.parse_date_code(value);
    return parsedDate ? new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d) : null;
  }

  const rawValue = cleanCell(value);
  if (!rawValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [year, month, day] = rawValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const normalizedYear = year.length === 2 ? Number(`20${year}`) : Number(year);
    return new Date(normalizedYear, Number(month) - 1, Number(day));
  }

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime())
    ? null
    : new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
}

export function formatDateAsDmy(dateValue) {
  if (!dateValue || Number.isNaN(dateValue.getTime())) return '';
  const day = String(dateValue.getDate()).padStart(2, '0');
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${dateValue.getFullYear()}`;
}
