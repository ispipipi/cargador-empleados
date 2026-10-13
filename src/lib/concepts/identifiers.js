import { cleanCell, normalizeText } from '../utils';

export const MAX_CONCEPT_ID_LENGTH = 20;

export function buildConceptId(value, index) {
  const id = normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part, partIndex) => (partIndex === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join('');

  if (!id) {
    return `concepto${index + 1}`;
  }

  if (id.length <= MAX_CONCEPT_ID_LENGTH) {
    return id;
  }

  const suffix = stableHash(value);
  return `${id.slice(0, MAX_CONCEPT_ID_LENGTH - suffix.length)}${suffix}`;
}

export function resolveNewSequence(sourceCode, index) {
  const numericSourceCode = Number(sourceCode);
  return Number.isInteger(numericSourceCode) && numericSourceCode > 0 && numericSourceCode <= 9999
    ? numericSourceCode
    : 9000 + index;
}

export function sanitizeConceptName(value) {
  return cleanCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\?/g, 'N')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactConceptId(value, seed = value) {
  const id = cleanCell(value);
  return id.length <= 20 ? id : `${id.slice(0, 15)}${stableHash(normalizeText(seed))}`;
}

function stableHash(value) {
  let hash = 0;

  for (const character of cleanCell(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36).toUpperCase().padStart(5, '0').slice(-5);
}

export function typeIdFromLabel(value) {
  const normalized = normalizeText(value);
  if (normalized.startsWith('haber afecto')) return '1H';
  if (normalized.includes('solo imponible')) return '1I';
  if (normalized.includes('solo tributable')) return '1R';
  if (normalized.startsWith('haber exento')) return '2E';
  if (normalized.startsWith('descuento legal')) return '3L';
  if (normalized.startsWith('descuento')) return '4D';
  if (normalized.startsWith('aporte empleador')) return '5A';
  return '';
}

export function behaviorIdFromLabel(value) {
  return normalizeText(value).includes('variable') ? 'V' : 'F';
}

export function categoryInternalIdFromLabel(value) {
  const normalized = normalizeText(value);
  return normalized === 'sin categoria' || !normalized ? 'NO' : cleanCell(value);
}

export function booleanId(value) {
  return normalizeText(value) === 'si' || normalizeText(value) === 'verdadero' ? 'V' : 'F';
}

export function extractLreCode(value) {
  const raw = cleanCell(value);
  return raw.match(/^\s*(\d+)/)?.[1] ?? '';
}

export function normalizeLreOutput(value) {
  const raw = cleanCell(value);
  return raw === '-' || normalizeText(raw) === 'no aplica' || normalizeText(raw) === '0' ? '' : raw;
}
