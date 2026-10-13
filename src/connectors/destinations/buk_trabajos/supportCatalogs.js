import { cleanCell, normalizeText } from '../../../lib/utils';

const PLAN_CONTABLE_OPTIONS = ['-', 'Administrativos', 'Manipuladoras', 'Supervisores'];
const LOCATION_STOPWORDS = new Set(['lr23', 'lr24', 'lr22', 'lr21', 'pae']);

export const CARGO_ALIASES = {
  manipuladora: 'MANIPULADOR (A) DE ALIMENTOS',
  'tecnico multifuncional': 'SUPERVISOR TECNICO',
  'tecnico multifuncional sec': 'SUPERVISOR TECNICO',
  'jefe de mantencion': 'JEFE DE MANTENCION E INFRAESTRUCTURA',
};

export function cleanPlaceholder(value) {
  const cleanedValue = cleanCell(value);
  return /^-+$/.test(cleanedValue) ? '' : cleanedValue;
}

export function normalizeDigits(value) {
  return cleanCell(value).replace(/\D+/g, '');
}

export function normalizeEstablishmentName(value) {
  return normalizeText(
    cleanCell(value)
      .replace(/^junji\s+/i, '')
      .replace(/^j\s*\.?\s*i\s*\.?\s*/i, '')
      .replace(/^s\s*\.?\s*c\s*\.?\s*/i, '')
      .replace(/\b\d{7,9}\b/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function inferEstablishmentVariant(value) {
  const cleanedValue = cleanCell(value);

  if (/^j\s*\.?\s*i/i.test(cleanedValue) || /^junji\s+j\s*\.?\s*i/i.test(cleanedValue)) {
    return 'ji';
  }

  if (/^s\s*\.?\s*c/i.test(cleanedValue) || /^junji\s+s\s*\.?\s*c/i.test(cleanedValue)) {
    return 'sc';
  }

  return '';
}

function extractCatalogRbd(value) {
  const digitGroups = cleanCell(value).match(/\d[\d.-]*/g) ?? [];
  const prioritizedGroup = digitGroups.find((group) => normalizeDigits(group).length >= 7) ?? digitGroups[0] ?? '';
  return normalizeDigits(prioritizedGroup);
}

export function buildSubAreaSearchCandidates(row) {
  const rawCandidates = [
    cleanCell(row['Nombre Centro Costo 1']),
    cleanCell(row.Comuna),
    cleanCell(row.Ciudad),
    cleanCell(row.Sucursal),
    cleanCell(row.ESTABLECIMIENTO),
  ];

  return rawCandidates
    .flatMap((value) => [extractLocationToken(value), normalizeText(value)])
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function extractLocationToken(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return '';
  }

  return normalizedValue
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => Number.isNaN(Number(token)))
    .filter((token) => !LOCATION_STOPWORDS.has(token))
    .slice(0, 3)
    .join(' ');
}

export function inferSubAreaDepartment(row) {
  const cargo = normalizeText(row.Cargo);
  const establishment = cleanCell(row.ESTABLECIMIENTO);
  const institution = cleanCell(row.INSTITUCIÓN);

  if (establishment || institution || cleanCell(row['RBD Establecimiento'])) {
    return 'pae';
  }

  if (/(bodega|grua|grúa|peoneta|chofer)/.test(cargo)) {
    return 'bodega';
  }

  if (/(mantencion|mantención|tecnico|técnico)/.test(cargo)) {
    return cargo.includes('monitor') ? 'tecnica' : 'mantencion';
  }

  return 'operaciones';
}

export function resolvePactedGratification(cargoValue) {
  return isManipuladoraCargo(cargoValue)
    ? 'Artículo 50 del Código del Trabajo'
    : 'Artículo 47 del Código del Trabajo';
}

export function buildEstablecimientoPaeCatalog(options) {
  return (options ?? []).map((rawValue) => {
    const [rbd = '', name = '', address = '', commune = ''] = rawValue.split(/\s*\/\s*/g);

    return {
      raw: rawValue,
      rbd: extractCatalogRbd(rbd || rawValue),
      normalizedName: normalizeText(name),
      normalizedSimplifiedName: normalizeEstablishmentName(name),
      normalizedCommune: normalizeText(commune),
      normalizedRaw: normalizeText(rawValue),
      normalizedNameAndCommune: normalizeText([name, commune].filter(Boolean).join(' ')),
      normalizedAddress: normalizeText(address),
      variant: inferEstablishmentVariant(name),
    };
  });
}

export function buildNombreRbdCatalog(options) {
  return (options ?? []).map((rawValue) => {
    const normalizedRaw = normalizeText(rawValue);
    const rbd = extractCatalogRbd(rawValue);
    const nameWithoutRbd = cleanCell(rawValue).replace(/\b\d{7,9}\b/g, ' ').replace(/\s+/g, ' ');

    return {
      raw: rawValue,
      rbd,
      normalizedRaw,
      normalizedName: normalizeText(nameWithoutRbd),
      normalizedSimplifiedName: normalizeEstablishmentName(nameWithoutRbd),
      variant: inferEstablishmentVariant(rawValue),
    };
  });
}

export function findEstablecimientoPaeValue(row, catalog) {
  const sourceName = cleanPlaceholder(row.ESTABLECIMIENTO);
  const normalizedName = normalizeText(sourceName);
  const normalizedSimplifiedName = normalizeEstablishmentName(sourceName);
  const normalizedRbd = normalizeDigits(row['RBD Establecimiento']);
  const normalizedCommune = normalizeText(cleanPlaceholder(row['Comuna RBD']) || cleanPlaceholder(row.Comuna));
  const preferredVariant = inferEstablishmentVariant(sourceName);

  if (!normalizedName && !normalizedSimplifiedName && !normalizedRbd) {
    return '';
  }

  let bestMatch = null;

  catalog.forEach((entry) => {
    let score = 0;

    if (normalizedRbd && entry.rbd === normalizedRbd) score += 140;
    if (normalizedName && entry.normalizedName === normalizedName) score += 110;
    else if (normalizedName && (entry.normalizedName.includes(normalizedName) || normalizedName.includes(entry.normalizedName))) score += 70;

    if (normalizedSimplifiedName && entry.normalizedSimplifiedName === normalizedSimplifiedName) score += 95;
    else if (
      normalizedSimplifiedName && entry.normalizedSimplifiedName &&
      (entry.normalizedSimplifiedName.includes(normalizedSimplifiedName) || normalizedSimplifiedName.includes(entry.normalizedSimplifiedName))
    ) score += 55;

    if (normalizedCommune && entry.normalizedCommune === normalizedCommune) score += 25;
    if (preferredVariant && entry.variant === preferredVariant) score += 20;
    if (
      normalizedName && normalizedCommune &&
      entry.normalizedNameAndCommune === normalizeText(`${cleanPlaceholder(row.ESTABLECIMIENTO)} ${cleanPlaceholder(row['Comuna RBD']) || cleanPlaceholder(row.Comuna)}`)
    ) score += 15;

    if (!bestMatch || score > bestMatch.score) bestMatch = { score, value: entry.raw };
  });

  return bestMatch?.score > 0 ? bestMatch.value : '';
}

export function findNombreRbdValue(row, catalog) {
  const sourceName = cleanPlaceholder(row.ESTABLECIMIENTO);
  const normalizedName = normalizeText(sourceName);
  const normalizedSimplifiedName = normalizeEstablishmentName(sourceName);
  const normalizedRbd = normalizeDigits(row['RBD Establecimiento']);
  const preferredVariant = inferEstablishmentVariant(sourceName);

  if (!normalizedName && !normalizedSimplifiedName && !normalizedRbd) {
    return '';
  }

  let bestMatch = null;

  catalog.forEach((entry) => {
    let score = 0;

    if (normalizedRbd && entry.rbd === normalizedRbd) score += 120;
    if (normalizedName && entry.normalizedName === normalizedName) score += 100;
    else if (normalizedName && entry.normalizedRaw === normalizedName) score += 90;
    else if (normalizedName && (entry.normalizedName.includes(normalizedName) || normalizedName.includes(entry.normalizedName))) score += 65;

    if (normalizedSimplifiedName && entry.normalizedSimplifiedName === normalizedSimplifiedName) score += 110;
    else if (
      normalizedSimplifiedName && entry.normalizedSimplifiedName &&
      (entry.normalizedSimplifiedName.includes(normalizedSimplifiedName) || normalizedSimplifiedName.includes(entry.normalizedSimplifiedName))
    ) score += 70;

    if (preferredVariant && entry.variant === preferredVariant) score += 25;
    if (!bestMatch || score > bestMatch.score) bestMatch = { score, value: entry.raw };
  });

  return bestMatch?.score > 0 ? bestMatch.value : '';
}

export function findAllowedLiteralValue(inputValue, allowedValues) {
  const cleanedInput = cleanPlaceholder(inputValue);
  const normalizedInput = normalizeText(cleanedInput);

  if (!normalizedInput) return '';

  return allowedValues.find((allowedValue) => normalizeText(allowedValue) === normalizedInput) ?? '';
}

export function resolvePlanContableValue(row) {
  const directValue = findAllowedLiteralValue(row['Categoría Contable'], PLAN_CONTABLE_OPTIONS);
  if (directValue) return directValue;
  if (isManipuladoraCargo(row.Cargo)) return 'Manipuladoras';

  const normalizedCargo = normalizeText(row.Cargo);
  if (normalizedCargo.includes('supervisor')) return 'Supervisores';
  if (/(administrativ|asistente|analista|coordinador|contador|rrhh)/.test(normalizedCargo)) return 'Administrativos';
  return '';
}

function isManipuladoraCargo(cargoValue) {
  return /(manipulador|manipuladora)/.test(normalizeText(cargoValue));
}

export function truncateText(value, maxLength) {
  const cleanedValue = cleanCell(value);
  return cleanedValue.length > maxLength ? cleanedValue.slice(0, maxLength) : cleanedValue;
}
