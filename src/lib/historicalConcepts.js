import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';

// This order comes from the REX+ Concepto Detalle template supplied for the flow.
export const DETAIL_HEADERS = [
  'Plantilla',
  'Nombre colaborador',
  'Contrato',
  'Nombre de contrato',
  'Concepto',
  'Valor',
  'Origen',
  'Objeto',
  'Periodo de pago',
  'Fecha de inicio',
  'Fecha de término',
  'Institución',
  'Dato adicional',
  'Comentario',
  'Valor Por Defecto',
  'Centro Costo',
  'Acción',
  'Consolidable',
];

export const HISTORICAL_FUNCTIONS = [
  { id: 'bonoextra', name: 'Bono Extra grupo 01', type: 'OT', detail: 'C$sueldoBase * 0.1' },
  { id: 'colacion', name: 'Colacion mensual', type: 'OT', detail: 'P$diasHabi * 5000' },
  { id: 'gratificacion', name: 'Gratificacion mensual', type: 'OT', detail: 'min(P$totalHabe * 0.25, 4.75 * V$ingresoMini/12)' },
  { id: 'horaExtra100', name: 'Horas Extras 100%', type: 'HE', detail: 'D$valor' },
  { id: 'horaExtra30', name: 'Horas Extras 30%', type: 'HE', detail: 'D$valor' },
  { id: 'horaExtra', name: 'Horas Extras 50%', type: 'HE', detail: 'D$valor' },
  { id: 'horaExtra75', name: 'Horas Extras 75%', type: 'HE', detail: 'D$valor' },
  { id: 'prestSolHonorario', name: 'Prestamo Solidario 3% Honorarios', type: 'OT', detail: 'round(C$boletaHonorarios*0.03)' },
  { id: 'prestSolRemuneracion', name: 'Prestamo Solidario Remuneraciones', type: 'OT', detail: 'round((P$totalHabe - P$totalReba)*0.03)' },
  { id: 'valorUF', name: 'Valor UF', type: 'OT', detail: 'round(P$valorUfMes * D$valor)' },
];

const CONCEPT_START_HEADER = 'SUELDO BASE ORIGINAL11/2025';
const EXCLUDED_SOURCE_HEADERS = new Set([
  'BASE TRIBUTABLE',
  'COSTO EMPRESA',
  'TOTAL IMPONIBLE',
  'TOTAL IMPONIBLE TOPADO',
  'TOTAL DE HABERES SC',
  'TOTAL_HABERES',
  'TOTAL_DESCUENTOS',
  'LIQUIDO',
  'SUELDO BASE',
  'SUELDO PAGADO',
  'PROMEDIO REMUNERACION VARIABLE',
]);

const HISTORICAL_ALIASES = new Map([
  ['ASIGNACION DE MOVILIZACION', 'movilizacion'],
  ['ASIGNACIONES FAMILIAR LEGAL', 'cargasSimp'],
  ['ASIG. FAMILIAR RETROACTIVAS', 'cargasRetr'],
  ['ASIGNACION SALA CUNA', 'salaCMi'],
  ['ASIGNACION TELETRABAJO', 'AsigTeletrabajoMi'],
  ['COTIZACION FONDO RETIRO', 'afp'],
  ['COMISION AFP', 'comisionAfp'],
  ['ADICIONAL AL 7%', 'adicionalAl7'],
  ['COTIZACION SALUD OBLIGATORIA', 'isapre'],
  ['SEGURO CESANTIA', 'cesEmpleado'],
  ['APORTE EMPRESA MUTUAL', 'mutual'],
  ['APORTE EMPRESA BIENESTAR', 'aporteBienestar'],
  ['COTIZACION VOLUNTARIA AFP', 'apvi'],
  ['AHORRO VOLUNTARIO', 'apvi'],
  ['APV PESOS', 'apvi'],
  ['APV UF', 'apvi'],
  ['HORAS EXTRAS 50%', 'horasEx50'],
  ['SEMANA CORRIDA', 'semanaCorr'],
  ['GRATIFICACION', 'gratificacion'],
  ['IMPUESTO', 'impuesto'],
  ['IMPUESTO RELIQUIDADO', 'reliquidaImpuesto'],
  ['SOBREGIRO LIQUIDACION SUELDO', 'compensaSobre'],
  ['LIQUIDO', 'totalesEmpl'],
]);

export function buildHistoricalConceptModel({ sourceRows, sourceHeaders, concepts }) {
  const catalog = concepts.filter((concept) => normalizeText(concept.type) !== 'dato');
  const catalogById = new Map(catalog.map((concept) => [normalizeText(concept.id), concept]));
  const catalogByName = new Map(catalog.map((concept) => [conceptKey(concept.name), concept]));
  const conceptColumns = extractConceptColumns({ sourceRows, sourceHeaders });

  const decisions = conceptColumns.map((column, index) => {
    const sourceKey = cleanCell(column.header);
    const sourceName = stripDuplicateHeaderSuffix(sourceKey);
    const exactMatch = findExactMatch({ sourceName, catalogById, catalogByName });
    const suggestedMatches = findSuggestedMatches(sourceName, catalog);
    const suggestedConcept = exactMatch ?? suggestedMatches[0]?.concept ?? null;

    return {
      id: `${index + 1}-${sourceKey}`,
      sourceKey,
      sourceName,
      sourceColumnIndex: column.index,
      sourceSection: column.index >= 255 ? 'Descuento' : 'Haber / remuneración',
      nonZeroCount: column.nonZeroCount,
      sampleValue: column.sampleValue,
      exactMatch: Boolean(exactMatch),
      matchStatus: exactMatch ? 'exact' : suggestedConcept ? 'proposal' : 'pending',
      suggestedMatches,
      targetConcept: exactMatch,
      targetId: exactMatch?.id ?? '',
      targetName: exactMatch?.name ?? '',
      approved: Boolean(exactMatch),
      excluded: false,
    };
  });

  return {
    decisions,
    catalog,
    sourceConcepts: conceptColumns.length,
    sourceRows: sourceRows.length,
  };
}

export function buildHistoricalDetailRows({ sourceRows, decisions }) {
  const outputRows = [];

  decisions
    .filter((decision) => decision.approved && !decision.excluded && decision.targetId)
    .forEach((decision) => {
      sourceRows.forEach((sourceRow) => {
        const amount = parseHistoricalAmount(sourceRow[decision.sourceKey]);

        if (amount === null || amount === 0) {
          return;
        }

        outputRows.push(buildDetailRow(sourceRow, decision.targetId, amount));
      });
    });

  return outputRows;
}

export function buildHistoricalDetailCsv({ sourceRows, decisions }) {
  const detailRows = buildHistoricalDetailRows({ sourceRows, decisions });
  const sheet = XLSX.utils.aoa_to_sheet([DETAIL_HEADERS, ...detailRows]);
  const csv = XLSX.utils.sheet_to_csv(sheet, {
    FS: ';',
    RS: '\r\n',
    blankrows: false,
  });

  return `\uFEFF${csv}`;
}

export function buildHistoricalReportRows(decisions) {
  return decisions.map((decision, index) => ({
    Fila: index + 2,
    'Concepto Meta4': decision.sourceName,
    'Columna origen': decision.sourceKey,
    Seccion: decision.sourceSection,
    'Colaboradores con monto': decision.nonZeroCount,
    'Match exacto': decision.exactMatch ? 'Si' : 'No',
    'Concepto REX+': decision.targetId,
    'Nombre REX+': decision.targetName,
    Estado: decision.excluded
      ? 'Excluido'
      : decision.approved
        ? decision.exactMatch
          ? 'Match exacto aprobado'
          : 'Asignado manualmente'
        : 'Pendiente de match',
    'Propuesta principal': decision.suggestedMatches[0]?.concept?.name ?? '',
  }));
}

export function summarizeHistoricalDecisions(decisions) {
  return {
    total: decisions.length,
    exact: decisions.filter((decision) => decision.exactMatch).length,
    approved: decisions.filter((decision) => decision.approved && !decision.excluded).length,
    pending: decisions.filter((decision) => !decision.approved).length,
    excluded: decisions.filter((decision) => decision.excluded).length,
    detailRows: decisions.reduce((total, decision) => total + (decision.approved && !decision.excluded ? decision.nonZeroCount : 0), 0),
  };
}

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

function extractConceptColumns({ sourceRows, sourceHeaders }) {
  const startIndex = Math.max(
    sourceHeaders.findIndex((header) => stripDuplicateHeaderSuffix(header) === CONCEPT_START_HEADER),
    0,
  );

  return sourceHeaders
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
        index,
        nonZeroCount: values.length,
        sampleValue: values[0] ?? '',
      };
    })
    .filter((column) => column.nonZeroCount > 0);
}

function findExactMatch({ sourceName, catalogById, catalogByName }) {
  const aliasId = HISTORICAL_ALIASES.get(sourceName.toUpperCase());
  return (
    (aliasId && catalogById.get(normalizeText(aliasId))) ||
    catalogByName.get(conceptKey(sourceName)) ||
    catalogById.get(normalizeText(sourceName)) ||
    null
  );
}

function findSuggestedMatches(sourceName, catalog) {
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

function conceptKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripDuplicateHeaderSuffix(value) {
  return cleanCell(value).replace(/\s+\[\d+\]$/, '');
}

function isExcludedSourceHeader(value) {
  const normalizedHeader = cleanCell(value).toUpperCase();

  return (
    EXCLUDED_SOURCE_HEADERS.has(normalizedHeader) ||
    normalizedHeader.startsWith('SUELDO BASE ORIGINAL')
  );
}

function buildDetailRow(sourceRow, targetId, amount) {
  const row = Array(DETAIL_HEADERS.length).fill('');
  const get = (header) => cleanCell(sourceRow[header]);

  row[0] = get('CI') || get('ID EMPLEADO');
  row[1] = get('NOMBRE');
  row[2] = '1';
  row[3] = get('NOMBRE CONTRATO') || 'Contrato Indefinido';
  row[4] = targetId;
  row[5] = String(amount);
  row[6] = 'M';
  row[8] = 'M';
  row[16] = 'C';

  return row;
}
