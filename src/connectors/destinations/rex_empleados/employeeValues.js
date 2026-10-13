import { cleanCell } from '../../../lib/utils';
import { STATUS_ALIASES } from './catalogs';
import { buildPendingItem } from './pending';
import { normalizeLooseText } from './normalizers';

export function splitEmployeeName(value, vismaNameParts = null) {
  if (vismaNameParts && Object.values(vismaNameParts).some(Boolean)) {
    return {
      names: [vismaNameParts.firstName, vismaNameParts.middleName].map(cleanNamePart).filter(Boolean).join(' '),
      lastName: cleanNamePart(vismaNameParts.lastName),
      middleName: cleanNamePart(vismaNameParts.familyName),
    };
  }

  const rawValue = cleanCell(value);
  const [lastNames = '', names = ''] = rawValue.split(/\s*,\s*/);
  const lastNameParts = lastNames.split(/\s+/).filter(Boolean);

  return {
    names: cleanCell(names),
    lastName: cleanNamePart(lastNameParts[0]),
    middleName: cleanNamePart(lastNameParts.slice(1).join(' ')),
  };
}

function cleanNamePart(value) {
  const cleaned = cleanCell(value);
  return /^[.\-_]+$/.test(cleaned) ? '' : cleaned;
}

export function resolveStatusValue(value) {
  return STATUS_ALIASES[normalizeLooseText(value)] ?? 'A';
}

export function resolveSexValue(value) {
  const normalizedValue = normalizeLooseText(value);
  if (['f', 'female', 'fem', 'femenino', 'mujer', 'woman'].includes(normalizedValue) || normalizedValue.startsWith('fem')) {
    return 'F';
  }

  if (['m', 'male', 'mas', 'masculino', 'hombre', 'man'].includes(normalizedValue) || normalizedValue.startsWith('mas')) {
    return 'M';
  }

  return '';
}

export function resolveRetirementStatus(value) {
  const normalizedValue = cleanCell(value).toUpperCase();
  if (normalizedValue === 'S') return '1';
  if (normalizedValue === 'X') return '2';
  return '0';
}

export function resolvePensionSystem() {
  return 'N';
}

export function resolveUnemploymentInsuranceValue(sourceRow) {
  const normalizedStatus = normalizeLooseText(sourceRow['SEGURO CESANTIA']);
  if (['s', 'si', 'yes', 'true', '1', 'afecto', 'afecta', 'cotiza'].includes(normalizedStatus)) return 'S';
  if (['n', 'no', 'no aplica', 'no cotiza', 'false', '0', 'exento'].includes(normalizedStatus)) return 'N';

  // VISMA records without an explicit mark default to unemployment insurance coverage.
  return 'S';
}

export function resolveHealthAmount({ healthValue, sourceValue, correctionValue, pendingItems, rowNumber, employeeId, employeeName }) {
  const normalizedHealth = normalizeLooseText(healthValue);
  if (!healthValue || normalizedHealth === 'fonasa') return { value: '' };

  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: normalizeUfAmount(directCorrection) };

  const sourceAmount = normalizeUfAmount(sourceValue);
  if (sourceAmount) return { value: sourceAmount };

  pendingItems.push(buildPendingItem({
    key: 'healthAmount',
    label: 'Monto cotizado en la Isapre en UF',
    type: 'value',
    rowNumber,
    employeeId,
    employeeName,
    sourceValue: cleanCell(sourceValue),
  }));

  return { value: '' };
}

function normalizeUfAmount(value) {
  const cleaned = cleanCell(value).replace(',', '.');
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : '';
}

export function resolveHealthCurrency(healthValue) {
  if (!healthValue) return '';
  return healthValue === 'fonasa' ? '%' : 'U';
}

export function resolveWeeklyHours(value) {
  const numericValue = Number(cleanCell(value));
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '40';
  return String(Math.round(numericValue / 4));
}

export function resolvePartialShift(value) {
  const weeklyHours = Number(resolveWeeklyHours(value));
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) return '';
  return weeklyHours <= 30 ? 'S' : 'N';
}

export function resolveHeavyWorkFlag(sourceRow) {
  const heavyWorkFields = [
    'APORTE EMPRESA TRABAJO PESADO',
    'TRAB. PESADO RELIQ EMPLEADOR',
    'TRABAJO PESADO RELIQUIDADO',
    'TRABAJO PESADO DESC. TRABAJADOR',
  ];

  return heavyWorkFields.some((field) => Number(cleanCell(sourceRow[field])) > 0) ? 'S' : 'N';
}

export function resolveHeavyWorkField({
  sourceRow,
  correctionValue,
  retirementStatus,
  pendingItems,
  alerts,
  rowNumber,
  employeeId,
  employeeName,
}) {
  const directCorrection = normalizeYesNoCorrection(correctionValue);
  const sourceHeavyWork = resolveHeavyWorkFlag(sourceRow);
  const resolvedHeavyWork = directCorrection || sourceHeavyWork;
  const isRetired = cleanCell(retirementStatus) !== '0';

  if (isRetired && resolvedHeavyWork === 'S') {
    pendingItems.push(buildPendingItem({
      key: 'heavyWorkFlag',
      label: '¿Realiza trabajo pesado?',
      type: 'text',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: sourceHeavyWork,
    }));

    alerts.push({
      row: rowNumber,
      field: '¿Realiza trabajo pesado?',
      appliedValue: resolvedHeavyWork,
      message: 'Si el empleado esta jubilado no puede tener trabajo pesado. Requiere correccion manual.',
    });
  }

  return resolvedHeavyWork;
}

function normalizeYesNoCorrection(value) {
  const normalizedValue = cleanCell(value).toUpperCase();
  return normalizedValue === 'S' || normalizedValue === 'N' ? normalizedValue : '';
}

export function resolveContributionFlag({ noCotiza, afpValue, healthValue }) {
  if (noCotiza) return 'N';
  return afpValue && healthValue ? 'S' : '';
}
