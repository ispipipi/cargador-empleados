import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';

export const LIQUIDATION_HEADERS = [
  'Fecha de proceso',
  'Id empleado',
  'Número de contrato',
  'Id del concepto',
  'Monto del concepto',
  'Afecto',
  'Id de institución',
  'Cotización de jubilación',
  'Días de licencias',
  'Días trabajados',
  'Fecha de aplicación',
  'Empresa',
  'Total de rebajas por LLSS',
  'Rentas no gravadas',
  'Rebaja por zona extrema',
  'Jornada',
  'Días de vacaciones',
  'Monto Init',
];

const VISMA_TEMPLATE_PATH = `${import.meta.env.BASE_URL}templates/rex-liquidaciones-detalle-template.xlsx`;
const FIXED_SOURCE_HEADERS = new Set([
  'PERÍODO',
  'EMPLEADO',
  'APELLIDO Y NOMBRE',
  'RUT',
  'FECHA DE ALTA',
  'FECHA DE BAJA',
  'AFP',
  'ISAPRE',
  'ID CENTRO DE COSTO',
  'NOMBRE C. COSTO',
  'CARGO',
  'CATEGORÍA',
  'TIPO DE EMPLEADO',
  'DEPARTAMENTO',
  'SAP',
  'DÍAS TRABAJADOS',
  'SUELDO',
  'PLAN UF',
]);

const EXCLUDED_SOURCE_PATTERNS = [
  /^TOTAL HABERES$/,
  /^TOTAL DESCUENTOS$/,
  /^LIQUIDO(?: FINIQUITO)?$/,
  /^TRIBUTABLE$/,
  /^IMPONIBLE/,
  /^\*/,
  /^A\.F\.P\.?$/,
  /^PENSION(?: |$)/,
  /^SALUD(?: |$)/,
  /^ADICIONAL SALUD$/,
  /^SEGURO DE CESANTIA$/,
  /^PLAN AUGE$/,
  /^SALUD EMPART/,
  /^SALUD INP$/,
  /^AFP RELIQ/,
  /^ISAPRE RELIQ/,
  /^CESANTIA RELIQ/,
  /^TRABAJO PESADO/,
  /^LEY SANNA/,
  /^SIS(?: |$)/,
  /^FDO\.?\s*SOLIDARIO/,
  /^PROV\.?IDEM/,
  /^PROV\.? /,
  /^APORTE (?:PATRONAL|EMPLEADOR)/,
  /^COSTO EMPRESA/,
  /^MUTUAL/,
  /^IMPUESTO/,
];

const CONTRACTUAL_SOURCE_PATTERNS = [
  /^SUELDO(?: BASE| GANADO)?$/,
  /^GRATIFICACION/,
  /^ASIG\.?\s*COLACION CONTRACTUAL$/,
  /^ASIG\.?\s*MOVILIZACION CONTRACTUAL$/,
  /^ASIGNACION COLACION$/,
  /^ISAPRE$/,
];

const CONTRACTUAL_TARGET_IDS = new Set([
  'sueldobase',
  'gratificacion',
  'asigcolacioncontract',
  'asigmovcontractual',
  'asignacioncolacion',
  'isapre',
]);

const LOS_ANDES_CONCEPT_IDS = new Set(['cajaahor', 'cajacred', 'cajasegu']);

const VISMA_ALIASES = new Map([
  ['SUELDO GANADO', 'sueldoBase'],
  ['HORAS EXTRAS NORMALES AL 50', 'horasEx50'],
  ['HORAS EXTRAS NORMALES AL 50 [2]', 'horasEx50'],
  ['BONO RESPONSABILIDAD', 'BONORESPONSABILIDAD'],
  ['BONO VACACIONES', 'BONOVACACIONES'],
  ['BONO APLICACION', 'BONOAPLICACION'],
  ['BONO ASISTENCIA', 'BONOASISTENCIA'],
  ['BONO DESBROZADORA', 'BONODESBROZADORA'],
  ['BONO OP MAQUINARIA', 'BONOOPMAQUINARIA'],
  ['BONO TERMINO DE FAENA', 'BONOTERMINODEFAENA'],
  ['BONO ASISTENCIA CONTRACTUAL', 'BONOASISTCONTRACTUAL'],
  ['BONO EVALUACION', 'BONO_EVALUACION'],
  ['BONO COMPENSACION', 'BONO_COMPENSACION'],
  ['BONO TURNO', 'BONO_TURNO'],
  ['BONO ANTIGUEDAD', 'BONO_ANTIGUEDAD'],
  ['BONO DOMINGOS Y FESTIVOS', 'BONODOMINGOSYFESTIVO'],
  ['BONO TRASLADO', 'BONO_TRASLADO'],
  ['ASIG. COLACION CONTRACTUAL', 'ASIGCOLACIONCONTRACT'],
  ['ASIGNACION DE MOVILIZACION', 'ASIGMOVILIZACION'],
  ['ASIG. MOVILIZACION CONTRACTUAL', 'ASIGMOVCONTRACTUAL'],
  ['ASIG. COLACION', 'ASIGNACIONCOLACION'],
  ['SALA CUNA', 'SALACUNA'],
  ['DEV DESCUENTO ERRONEO', 'DEVDESCUENTOERRONEO'],
  ['DIFERENCIA DE SUELDO', 'difsueldo'],
  ['INDEMNIZACION LEGAL', 'indemnizacionLega'],
  ['VACACIONES', 'vacacionesNorm'],
  ['ASIGNACION FAMILIAR', 'cargasSimp'],
  ['DESC. ANTICIPO DE SUELDO', 'DSCTOANTICIPDESUELDO'],
  ['AHORRO CUENTA 2', 'cajaAhor'],
  ['APV_E', 'apvi'],
  ['PRESTAMO TASA CERO', 'PRESTAMOTASACERO'],
  ['PRESTAMO EMPRESA', 'PRESTAMOEMPRESA'],
  ['PRESTAMO CCAF LOS ANDES', 'cajaCred'],
  ['SEGURO CCAF LOS ANDES', 'cajaSegu'],
  ['PRESTAMO FONASA', 'PRESTAMOFONASA'],
  ['SEGURO CHILENA CONSOLIDADA', 'SEGCHILENACONSOLIDAD'],
  ['FULL AHORRO CCAF LOS ANDES', 'cajaAhor'],
  ['CUOTA SINDICATO SAN SEBASTIAN', 'CUOTASINDICATOSANSEB'],
  ['CUOTA SINDICATO CAMARICO', 'CUOTASINDICAMARICO'],
  ['CUOTA SINDICATO TEMUCO', 'CUOTASINDICATOTEMUCO'],
]);

export async function loadVismaHistoricalResource() {
  const response = await fetch(VISMA_TEMPLATE_PATH);
  if (!response.ok) {
    throw new Error('No fue posible cargar el template de Liquidaciones Detalle de REX+.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });

  return {
    arrayBuffer,
    headers: readTwoColumnSheet(workbook, 'Ejemplo')[0] ?? LIQUIDATION_HEADERS,
    conceptCatalog: readCatalogSheet(workbook, 'Concepto'),
    institutions: readCatalogSheet(workbook, 'Instituciones'),
    companies: readCatalogSheet(workbook, 'Empresa'),
    journeys: readCatalogSheet(workbook, 'Jornada'),
  };
}

export function buildVismaHistoricalModel({ sourceRows, sourceHeaders, resource }) {
  const catalog = resource?.conceptCatalog ?? [];
  const conceptColumns = extractConceptColumns(sourceRows, sourceHeaders);
  const decisions = conceptColumns.map((column, index) => buildDecision(column, index, catalog));

  return {
    decisions,
    catalog,
    sourceRows: sourceRows.length,
    sourceConcepts: decisions.length,
  };
}

export function buildVismaHistoricalCsv({ sourceRows, decisions, period, resource }) {
  const rowsByKey = new Map();
  const companyId = resource?.companies?.[0]?.id ?? '1';
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);

  approvedDecisions.forEach((decision) => {
    sourceRows.forEach((sourceRow) => {
      const employeeId = normalizeEmployeeId(sourceRow.RUT);
      const amount = parseVismaAmount(sourceRow[decision.sourceKey]);
      const institutionId = resolveInstitutionId(decision.targetId, sourceRow);
      if (!employeeId || amount === null || amount === 0) {
        return;
      }

      const rowKey = `${employeeId}::${decision.targetId}`;
      const current = rowsByKey.get(rowKey);
      if (current) {
        current[4] = Number(current[4]) + amount;
        return;
      }

      rowsByKey.set(rowKey, [
        period || extractPeriodFromRow(sourceRow) || '',
        employeeId,
        '1',
        decision.targetId,
        amount,
        0,
        institutionId,
        '',
        0,
        parseDays(sourceRow['Días Trabajados']),
        period || extractPeriodFromRow(sourceRow) || '',
        companyId,
        0,
        0,
        0,
        'C',
        0,
        0,
      ]);
    });
  });

  const sheet = XLSX.utils.aoa_to_sheet([LIQUIDATION_HEADERS, ...rowsByKey.values()]);
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', RS: '\r\n', blankrows: false });
  return `\uFEFF${csv}`;
}

export function buildVismaHistoricalReportRows(decisions) {
  return decisions.map((decision, index) => ({
    Fila: index + 2,
    'Columna Visma': decision.sourceKey,
    'Concepto Visma': decision.sourceName,
    'Colaboradores con monto': decision.nonZeroCount,
    'Valor de muestra': decision.sampleValue,
    Estado: decision.excluded ? 'Excluido' : decision.approved ? decision.matchStatus === 'exact' ? 'Match exacto' : 'Pareado manual' : decision.suggestedMatches.length ? 'Propuesta pendiente' : 'Sin propuesta',
    'Motivo exclusión': decision.exclusionReason ?? '',
    'Id REX+': decision.targetId,
    'Nombre REX+': decision.targetName,
    'Id propuesto': decision.proposedId,
  }));
}

export function summarizeVismaHistoricalDecisions(decisions) {
  return {
    total: decisions.length,
    exact: decisions.filter((decision) => decision.matchStatus === 'exact').length,
    proposals: decisions.filter((decision) => !decision.approved && decision.suggestedMatches.length > 0).length,
    pending: decisions.filter((decision) => !decision.approved && decision.suggestedMatches.length === 0).length,
    approved: decisions.filter((decision) => decision.approved && !decision.excluded).length,
    excluded: decisions.filter((decision) => decision.excluded).length,
  };
}

function buildDecision(column, index, catalog) {
  const sourceName = stripDuplicateHeaderSuffix(column.sourceKey);
  const exact = findExactConcept(sourceName, catalog);
  const suggestedMatches = findSuggestedMatches(sourceName, catalog);
  const target = exact ?? null;
  const isContractual = isContractualSourceHeader(sourceName) || isContractualTargetId(target?.id);

  return {
    id: `${index + 1}-${column.sourceKey}`,
    sourceKey: column.sourceKey,
    sourceName,
    sourceSection: column.index >= 150 ? 'Descuento' : 'Haber',
    nonZeroCount: column.nonZeroCount,
    sampleValue: column.sampleValue,
    targetId: target?.id ?? '',
    targetName: target?.name ?? '',
    targetConcept: target,
    proposedId: buildProposedId(sourceName, index),
    suggestedMatches: isContractual ? [] : suggestedMatches,
    matchStatus: isContractual ? 'excluded' : target ? 'exact' : suggestedMatches.length ? 'proposal' : 'pending',
    action: isContractual ? 'exclude' : target ? 'reuse' : 'pending',
    approved: Boolean(target) || isContractual,
    excluded: isContractual,
    autoExcluded: isContractual,
    exclusionReason: isContractual ? 'Concepto contractual calculado por REX+ desde contrato/días trabajados' : '',
  };
}

function extractConceptColumns(sourceRows, sourceHeaders) {
  return sourceHeaders
    .map((sourceKey, index) => ({ sourceKey, index }))
    .filter(({ sourceKey, index }) => index >= 18 && sourceKey && !FIXED_SOURCE_HEADERS.has(stripDuplicateHeaderSuffix(sourceKey)))
    .map((column) => {
      const values = sourceRows.map((row) => parseVismaAmount(row[column.sourceKey])).filter((value) => value !== null && value !== 0);
      return {
        ...column,
        sourceName: stripDuplicateHeaderSuffix(column.sourceKey),
        nonZeroCount: values.length,
        sampleValue: values[0] ?? '',
      };
    })
    .filter((column) => column.nonZeroCount > 0)
    .filter((column) => !isExcludedSourceHeader(column.sourceName));
}

function findExactConcept(sourceName, catalog) {
  const alias = VISMA_ALIASES.get(sourceName.toUpperCase()) ?? VISMA_ALIASES.get(sourceName.replace(/\s+\[\d+\]$/, '').toUpperCase());
  const byId = catalog.find((concept) => normalizeText(concept.id) === normalizeText(alias ?? sourceName));
  if (byId) {
    return byId;
  }

  return catalog.find((concept) => normalizeLabel(concept.name) === normalizeLabel(sourceName)) ?? null;
}

function findSuggestedMatches(sourceName, catalog) {
  const sourceTokens = conceptTokens(sourceName);
  return catalog
    .map((concept) => ({ concept, score: similarityScore(sourceTokens, conceptTokens(`${concept.id} ${concept.name}`)) }))
    .filter((match) => match.score >= 0.3)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((match) => match.concept);
}

function similarityScore(leftTokens, rightTokens) {
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightSet = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => rightSet.has(token)).length;
  const coverage = intersection / leftTokens.length;
  const left = leftTokens.join('');
  const right = rightTokens.join('');
  return Math.min(1, coverage * 0.7 + (right.includes(left) || left.includes(right) ? 0.3 : 0));
}

function conceptTokens(value) {
  return normalizeLabel(value).split(' ').filter((token) => token.length > 2);
}

function normalizeLabel(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildProposedId(value, index) {
  const words = normalizeLabel(value).split(' ').filter(Boolean);
  const id = words.map((word, wordIndex) => wordIndex === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`).join('');
  return (id || `concepto${index + 1}`).slice(0, 20);
}

function isExcludedSourceHeader(value) {
  const normalizedValue = cleanCell(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizedValue));
}

function isContractualSourceHeader(value) {
  const normalizedValue = cleanCell(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return CONTRACTUAL_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizedValue));
}

function isContractualTargetId(value) {
  return CONTRACTUAL_TARGET_IDS.has(normalizeText(value).replace(/[^a-z0-9]+/g, ''));
}

function resolveInstitutionId(conceptId, sourceRow) {
  const normalizedConceptId = normalizeText(conceptId).replace(/[^a-z0-9]+/g, '');

  if (LOS_ANDES_CONCEPT_IDS.has(normalizedConceptId)) {
    return 'losandes';
  }

  if (normalizedConceptId === 'apvi') {
    return firstSourceValue(sourceRow, ['CÓDIGO AFP', 'CODIGO AFP', 'ID AFP', 'AFP']);
  }

  if (normalizedConceptId === 'isapre') {
    return firstSourceValue(sourceRow, ['CÓDIGO ISAPRE', 'CODIGO ISAPRE', 'ID ISAPRE', 'ISAPRE']);
  }

  return '';
}

function firstSourceValue(sourceRow, keys) {
  const normalizedEntries = Object.entries(sourceRow ?? {}).map(([key, value]) => [normalizeText(key), value]);

  for (const key of keys) {
    const value = cleanCell(sourceRow?.[key]);
    if (value) {
      return value;
    }

    const normalizedKey = normalizeText(key);
    const entry = normalizedEntries.find(([sourceKey]) => sourceKey === normalizedKey);
    const normalizedValue = cleanCell(entry?.[1]);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
}

function stripDuplicateHeaderSuffix(value) {
  return cleanCell(value).replace(/\s+\[\d+\]$/, '');
}

function parseVismaAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const rawValue = cleanCell(value).replace(/\$/g, '').replace(/\s/g, '');
  if (!rawValue || /^[-–—]?$/.test(rawValue)) {
    return null;
  }

  const normalized = rawValue.includes(',') && rawValue.includes('.')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue.replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
}

function parseDays(value) {
  const parsed = parseVismaAmount(value);
  return parsed === null ? 0 : parsed;
}

function normalizeEmployeeId(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}

function extractPeriodFromRow(row) {
  const value = row?.Período;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  return cleanCell(value);
}

function readTwoColumnSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) : [];
}

function readCatalogSheet(workbook, sheetName) {
  return readTwoColumnSheet(workbook, sheetName)
    .slice(1)
    .map((row) => ({ id: cleanCell(row[0]), name: cleanCell(row[1]) }))
    .filter((entry) => entry.id);
}
