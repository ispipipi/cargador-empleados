import { cleanCell, normalizeText } from '../utils';

export const CONCEPT_START_HEADER_PREFIX = 'SUELDO BASE ORIGINAL';

export const EXCLUDED_SOURCE_HEADERS = new Set([
  'BASE TRIBUTABLE',
  'COSTO EMPRESA',
  'TOTAL IMPONIBLE',
  'TOTAL IMPONIBLE TOPADO',
  'TOTAL DE HABERES SC',
  'TOTAL_HABERES',
  'TOTAL_DESCUENTOS',
  'LIQUIDO',
  'PROMEDIO REMUNERACION VARIABLE',
]);

export const HISTORICAL_LIQUIDO_PATTERNS = [
  /^LIQUIDO$/i,
  /^LIQUIDO A PAGO$/i,
  /^SUELDO LIQUIDO$/i,
];

export const HISTORICAL_ALIASES = new Map([
  ['RETROACTIVO SOBRETIEMPO', 'sobretiempoRetrG1KVT'],
  ['SOBRETIEMPO RETROACTIVO', 'sobretiempoRetrG1KVT'],
  ['PAGO ANTICIPADO PRESTAMO TASA CERO', 'solidarioremu'],
  ['CUOTA MORTUORIA S6', 'cuotaMortuoriaSJK2N6'],
  ['ASIGNACION DE ALIMENTACION ORIG.', 'asignacionAlimeXOWDI'],
  ['BONO PROD/SEG LOS BRONCES', 'bonoProduccion'],
  ['BONO PERMANENCIA', 'bonoPermanenciaHaber'],
  ['BONO PERMANENCIA 5/36', 'bonoPermanenciaHaber'],
  ['ASIGNACION DE MOVILIZACION', 'movilizacion'],
  ['ASIGNACIONES FAMILIAR LEGAL', 'cargasSimp'],
  ['ASIG. FAMILIAR RETROACTIVAS', 'cargasRetr'],
  ['ASIGNACION SALA CUNA', 'salaCMi'],
  ['ASIGNACION TELETRABAJO', 'AsigTeletrabajoMi'],
  ['COTIZACION FONDO RETIRO', 'afp'],
  ['COMISION AFP', 'afp'],
  ['COTIZACION SALUD OBLIGATORIA', 'isapre'],
  ['SEGURO CESANTIA', 'cesEmpleado'],
  ['SEGURO EMPRESA APORTE EMPLEADOR', 'cesAporteCi'],
  ['LEY SANNA', 'ley21227_mutual'],
  ['EXPECTATIVA DE VIDA', 'aporteFAPPCEV'],
  ['EXPECTATIVA DE VIDA RELIQ.', 'reliquidaAporteCEV'],
  ['APORTE EMPRESA MUTUAL', 'mutual'],
  ['APORTE EMPRESA BIENESTAR', 'aporteBienestar'],
  ['COTIZACION VOLUNTARIA AFP', 'apvi'],
  ['AHORRO VOLUNTARIO', 'apvi'],
  ['APV PESOS', 'apvi'],
  ['APV UF', 'apvi'],
  ['NUMERO SOBRETIEMPO', 'sobretiempo'],
  ['ASIG. DE PROYECTO ORIG.', 'asignacionDeProyecto'],
  ['ASIG. CASA ORIG.', 'asignacionCasa'],
  ['EXTENSION SINDICATO 2 RENTAL', 'extensionSindicatoN2'],
  ['EXTENSION SINDICATO N?2', 'extensionSindicatoN2'],
  ['HORAS EXTRAS 50%', 'horasEx50'],
  ['SEMANA CORRIDA', 'semanaCorr'],
  ['GRATIFICACION', 'gratificacion'],
  ['SUELDO BASE', 'sueldoBase'],
  ['SUELDO PAGADO', 'sueldoBase'],
  ['IMPUESTO', 'impuesto'],
  ['IMPUESTO RELIQUIDADO', 'reliquidaImpuesto'],
  ['SOBREGIRO LIQUIDACION SUELDO', 'compensaSobre'],
  ['LIQUIDO', 'totalesEmpl'],
]);

export const FINNING_APPROVED_CREATIONS = new Map([
  [
    'subsidios por reembolsar',
    {
      targetId: 'subsidiosPorReePPZYM',
      targetName: 'SUBSIDIOS POR REEMBOLSAR',
    },
  ],
]);

export const NON_LOADABLE_HISTORICAL_PATTERNS = [
  /^PROVIS/,
  /^PROV\b/,
  /^RENTA IMPONIBLE RIMA/,
];

export function parseHistoricalAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const rawValue = cleanCell(value);
  if (!rawValue || /^[-–—]?\s*$/.test(rawValue) || /^0+(?:[.,]0+)?$/.test(rawValue)) {
    return null;
  }

  const isNegative = rawValue.includes('-');
  const digits = rawValue.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  const amount = Number(digits);
  return Number.isFinite(amount) ? (isNegative ? -amount : amount) : null;
}

export function parseHistoricalTotal(value) {
  const rawValue = cleanCell(value);
  if (!rawValue) {
    return null;
  }

  if (/^-?(?:0+)(?:[.,]0+)?$/.test(rawValue)) {
    return 0;
  }

  return parseHistoricalAmount(value);
}

export function historicalHeaderKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

export function resolveHistoricalHeader(headersByKey, aliases) {
  for (const alias of aliases) {
    const header = headersByKey.get(historicalHeaderKey(alias));
    if (header) {
      return header;
    }
  }

  return '';
}

export function extractConceptColumns({ sourceRows, sourceHeaders }) {
  const startIndex = Math.max(
    sourceHeaders.findIndex((header) => stripDuplicateHeaderSuffix(header).startsWith(CONCEPT_START_HEADER_PREFIX)),
    0,
  );
  const excludedColumns = [];

  const columns = sourceHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => {
      const baseHeader = stripDuplicateHeaderSuffix(header);
      return index >= startIndex && Boolean(baseHeader) && !isExcludedSourceHeader(baseHeader);
    })
    .map(({ header, index }) => {
      const values = sourceRows
        .map((row) => row[header])
        .map(parseHistoricalAmount)
        .filter((value) => value !== null && value !== 0);

      return {
        header,
        baseHeader: stripDuplicateHeaderSuffix(header),
        index,
        nonZeroCount: values.length,
        sampleValue: values[0] ?? '',
      };
    })
    .filter((column) => column.nonZeroCount > 0 || isTaxSourceHeader(column.baseHeader))
    .filter((column) => {
      if (!isNonLoadableHistoricalConcept(column.baseHeader)) {
        return true;
      }

      excludedColumns.push(column);
      return false;
    });

  return { columns, excludedColumns };
}

export function findExactMatch({ sourceName, catalogById, catalogByName, catalogByCanonicalName }) {
  const aliasId =
    HISTORICAL_ALIASES.get(sourceName.toUpperCase()) ??
    HISTORICAL_ALIASES.get(historicalConceptKey(sourceName).toUpperCase());
  return (
    (aliasId && catalogById.get(normalizeText(aliasId))) ||
    catalogByName.get(conceptKey(sourceName)) ||
    catalogById.get(normalizeText(sourceName)) ||
    catalogByCanonicalName.get(historicalConceptKey(sourceName)) ||
    null
  );
}

export function buildUniqueConceptIndex(catalog, keyFn) {
  const index = new Map();
  const ambiguousKeys = new Set();

  catalog.forEach((concept) => {
    const key = keyFn(concept.name);
    if (!key || ambiguousKeys.has(key)) {
      return;
    }

    if (index.has(key)) {
      index.delete(key);
      ambiguousKeys.add(key);
      return;
    }

    index.set(key, concept);
  });

  return index;
}

export function buildUniqueMappingIndex(mappingRows) {
  const index = new Map();
  const ambiguousKeys = new Set();

  mappingRows.forEach((mapping) => {
    const key = historicalConceptKey(mapping.sourceName);
    if (!key || ambiguousKeys.has(key)) {
      return;
    }

    if (index.has(key)) {
      index.delete(key);
      ambiguousKeys.add(key);
      return;
    }

    index.set(key, mapping);
  });

  return index;
}

export function buildUniqueDecisionIndex(decisions) {
  const index = new Map();
  const ambiguousKeys = new Set();

  decisions.forEach((decision) => {
    const key = historicalConceptKey(decision.sourceName);
    if (!key || ambiguousKeys.has(key)) {
      return;
    }

    if (index.has(key)) {
      index.delete(key);
      ambiguousKeys.add(key);
      return;
    }

    index.set(key, decision);
  });

  return index;
}

export function isFinningMappingScope(mappingScope) {
  return !mappingScope || mappingScope.key === 'meta4:rex:finning';
}

export function getExcludedHistoricalEmployeeIds() {
  // Historical books may legitimately contain people terminated after the
  // payroll period. Only the current REX+ employee master decides whether a
  // row can be exported; no hard-coded employee exclusion is applied here.
  return new Set();
}

export function sourceSectionForColumn(index) {
  return index >= 255 ? 'Descuentos' : 'Haberes';
}

export function findSuggestedMatches(sourceName, catalog) {
  const sourceTokens = conceptTokens(sourceName);

  return catalog
    .map((concept) => ({
      concept,
      score: similarityScore(sourceTokens, conceptTokens(`${concept.id} ${concept.name}`)),
    }))
    .filter((item) => item.score >= 0.3)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function similarityScore(leftTokens, rightTokens) {
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightSet = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => rightSet.has(token)).length;
  const coverage = intersection / leftTokens.length;
  const compactLeft = leftTokens.join('');
  const compactRight = rightTokens.join('');
  const compactBonus = compactRight.includes(compactLeft) || compactLeft.includes(compactRight) ? 0.35 : 0;

  return Math.min(1, coverage * 0.65 + compactBonus);
}

function conceptTokens(value) {
  return conceptKey(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

export function conceptKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function historicalConceptKey(value) {
  return conceptKey(
    cleanCell(value)
      .replace(/([A-Za-z])\?([A-Za-z])/g, '$1n$2')
      .replace(/\b(?:original|orig)\b/gi, ' ')
      .replace(/\b\d+\s*\/\s*\d+\b/g, ' '),
  );
}

export function stripDuplicateHeaderSuffix(value) {
  return cleanCell(value).replace(/\s+\[\d+\]$/, '');
}

export function isExcludedSourceHeader(value) {
  const normalizedHeader = cleanCell(value).toUpperCase();

  return (
    EXCLUDED_SOURCE_HEADERS.has(normalizedHeader) ||
    normalizedHeader.startsWith('SUELDO BASE ORIGINAL')
  );
}

export function isTaxSourceHeader(value) {
  return /^IMPUESTO(?:\s|$)/i.test(cleanCell(value));
}

export function isNonLoadableHistoricalConcept(value) {
  const normalizedHeader = normalizeText(value).toUpperCase();
  return NON_LOADABLE_HISTORICAL_PATTERNS.some((pattern) => pattern.test(normalizedHeader));
}
