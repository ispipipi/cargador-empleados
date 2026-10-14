import { cleanCell, normalizeText } from './utils.js';

const EXCLUDED_SOURCE_PATTERNS = [
  /^TOTAL HABERES$/,
  /^TOTAL DESCUENTOS$/,
  /^LIQUIDO(?: FINIQUITO)?$/,
  /^TRIBUTABLE$/,
  /^IMPONIBLE/,
  /^\*/,
  /^COSTO EMPRESA/,
];

const LEGACY_AUTO_EXCLUDED_SOURCE_PATTERNS = [
  /^SUELDO(?: BASE| GANADO)?$/,
  /^GRATIFICACION/,
  /^ASIG\.?\s*COLACION CONTRACTUAL$/,
  /^ASIG\.?\s*MOVILIZACION CONTRACTUAL$/,
  /^ASIGNACION COLACION$/,
  /^ISAPRE$/,
];
const LEGACY_AUTO_EXCLUDED_TARGET_IDS = new Set([
  'sueldobase',
  'gratificacion',
  'asigcolacioncontract',
  'asigmovcontractual',
  'asignacioncolacion',
  'isapre',
]);

export function extractVismaHistoricalConceptColumns(sourceRows, sourceHeaders) {
  const headerCounts = new Map();
  sourceHeaders.forEach((sourceKey) => {
    const base = stripDuplicateHeaderSuffix(sourceKey);
    headerCounts.set(base, (headerCounts.get(base) ?? 0) + 1);
  });

  return sourceHeaders
    .map((sourceKey, index) => ({
      sourceKey,
      index,
      sourceColumn: columnLabel(index),
      isDuplicateHeader: (headerCounts.get(stripDuplicateHeaderSuffix(sourceKey)) ?? 0) > 1,
    }))
    .filter(({ sourceKey, index }) => index >= 18 && sourceKey)
    .map((column) => {
      const values = sourceRows.map((row) => parseAmount(row[column.sourceKey])).filter((value) => value !== null && value !== 0);
      return {
        ...column,
        sourceName: stripDuplicateHeaderSuffix(column.sourceKey),
        nonZeroCount: values.length,
        sampleValue: values[0] ?? '',
      };
    })
    .filter((column) => column.nonZeroCount > 0)
    .filter((column) => !isExcludedVismaSummaryHeader(column.sourceName));
}

export function isLegacyAutoExcludedVismaConcept(sourceName, targetId) {
  const normalizedSource = cleanCell(sourceName)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const normalizedTargetId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');

  return LEGACY_AUTO_EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizedSource))
    || LEGACY_AUTO_EXCLUDED_TARGET_IDS.has(normalizedTargetId);
}

function isExcludedVismaSummaryHeader(value) {
  const normalizedValue = cleanCell(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizedValue));
}

function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);

  const rawValue = cleanCell(value).replace(/\$/g, '').replace(/\s/g, '');
  if (!rawValue || /^[-–—]?$/.test(rawValue)) return null;

  const normalized = rawValue.includes(',') && rawValue.includes('.')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue.replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
}

function stripDuplicateHeaderSuffix(value) {
  return cleanCell(value).replace(/\s+\[\d+\]$/, '');
}

function columnLabel(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
