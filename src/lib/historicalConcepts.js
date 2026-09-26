import * as XLSX from 'xlsx';
import { buildConceptDecisions, buildConceptId, inferConceptType, resolveNewSequence } from './concepts';
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

// The Meta4 -> REX+ historical liquidation template has a different shape
// from the legacy Concepto Detalle CSV used by the other flows.
export const REX_LIQUIDATION_HEADERS = [
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
  'Parcial 7',
  'Parcial 8',
];

const REX_LIQUIDATION_TEMPLATE_PATH = `${import.meta.env.BASE_URL}templates/ejemplo-importacion-liquidaciones-detalle.xlsx`;

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

const CONCEPT_START_HEADER_PREFIX = 'SUELDO BASE ORIGINAL';
const EXCLUDED_SOURCE_HEADERS = new Set([
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

const HISTORICAL_ALIASES = new Map([
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
  ['COMISION AFP', 'comisionAfp'],
  ['COTIZACION SALUD OBLIGATORIA', 'isapre'],
  ['SEGURO CESANTIA', 'cesEmpleado'],
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

// These concepts were explicitly approved as new REX+ concepts for FINNING.
// They are not in the general LRE mapping workbook, so keep them scoped here
// until the refreshed REX+ catalog contains the created IDs.
const FINNING_APPROVED_CREATIONS = new Map([
  [
    'subsidios por reembolsar',
    {
      targetId: 'subsidiosPorReePPZYM',
      targetName: 'SUBSIDIOS POR REEMBOLSAR',
    },
  ],
]);

const NON_LOADABLE_HISTORICAL_PATTERNS = [
  /^PROVIS/,
  /^PROV\b/,
];

const LOS_ANDES_CONCEPT_IDS = new Set(['cajaahor', 'cajacred', 'cajasegu']);

const AFP_INSTITUTION_IDS = [
  ['capital', 'AFP Capital', '33'],
  ['cuprum', 'AFP Cuprum', '03'],
  ['habitat', 'AFP Habitat', '05'],
  ['modelo', 'AFP Modelo', '34'],
  ['planvital', 'AFP Planvital', '29'],
  ['provida', 'AFP Provida', '08'],
  ['uno', 'AFP UNO', '35'],
  ['canaempu', 'Canaemput', '1405'],
  ['capremer', 'Capremer', '0601'],
  ['empart', 'Empart', '0101'],
  ['sss', 'Servicio Seguro Social', '0901'],
  ['afp', 'Sin definir', '00'],
  ['triomar', 'Triomar', '0702'],
];

export function buildHistoricalConceptModel({ sourceRows, sourceHeaders, concepts, historicalConcepts = concepts, mappingRows = [], employeeCatalog = [], mappingScope }) {
  const catalog = historicalConcepts.filter((concept) => normalizeText(concept.type) !== 'dato');
  const catalogById = new Map(catalog.map((concept) => [normalizeText(concept.id), concept]));
  const catalogByName = new Map(catalog.map((concept) => [conceptKey(concept.name), concept]));
  const catalogByCanonicalName = buildUniqueConceptIndex(catalog, historicalConceptKey);
  const mappingByName = new Map(mappingRows.map((mapping) => [conceptKey(mapping.sourceName), mapping]));
  const mappingByCanonicalName = buildUniqueMappingIndex(mappingRows);
  const configuredDecisions = isFinningMappingScope(mappingScope)
    ? buildConceptDecisions({ concepts, mappingRows })
    : [];
  const configuredByName = new Map(configuredDecisions.map((decision) => [conceptKey(decision.sourceName), decision]));
  const configuredByCanonicalName = buildUniqueDecisionIndex(configuredDecisions);
  const { columns: conceptColumns, excludedColumns } = extractConceptColumns({ sourceRows, sourceHeaders });
  const employeeValidation = validateHistoricalEmployees(sourceRows, employeeCatalog, mappingScope);

  const decisions = conceptColumns.map((column, index) => {
    const sourceKey = cleanCell(column.header);
    const sourceName = stripDuplicateHeaderSuffix(sourceKey);
    const sourceMapping =
      mappingByName.get(conceptKey(sourceName)) ??
      mappingByCanonicalName.get(historicalConceptKey(sourceName));
    const configuredDecision =
      configuredByName.get(conceptKey(sourceName)) ??
      configuredByCanonicalName.get(historicalConceptKey(sourceName));
    const configuredCreation = isFinningMappingScope(mappingScope)
      ? FINNING_APPROVED_CREATIONS.get(historicalConceptKey(sourceName))
      : null;
    const configuredTargetConcept = configuredDecision?.action === 'reuse'
      ? catalogById.get(normalizeText(configuredDecision.targetConcept?.id)) ?? null
      : null;
    const exactMatch =
      findExactMatch({ sourceName, catalogById, catalogByName, catalogByCanonicalName }) ??
      configuredTargetConcept;
    const configuredExclusion = configuredDecision?.action === 'exclude' && configuredDecision.excluded;
    const storedCreation =
      configuredDecision?.action === 'create' && configuredDecision.approved && configuredDecision.targetId
        ? {
          targetId: configuredDecision.targetId,
          targetName: configuredDecision.targetName,
          sequence: configuredDecision.sequence,
        }
        : null;
    const approvedCreation = storedCreation ?? configuredCreation;
    const suggestedMatches = findSuggestedMatches(sourceName, catalog);
    const suggestedConcept = exactMatch ?? suggestedMatches[0]?.concept ?? null;
    const proposedId = buildConceptId(sourceName, index);
    const lreField = sourceMapping?.lreField ?? configuredDecision?.lreField ?? '';
    const classification = sourceMapping?.classification ?? configuredDecision?.classification ?? '';
    return {
      id: `${index + 1}-${sourceKey}`,
      sourceKey,
      sourceName,
      // The Concepts module persists many decisions using the Meta4 code.
      // Carry it into the historical flow so the same decision can be reused.
      sourceCode: sourceMapping?.sourceCode ?? configuredDecision?.sourceCode ?? '',
      sourceColumnIndex: column.index,
      sourceSection: column.index >= 255 ? 'Descuento' : 'Haber / remuneración',
      nonZeroCount: column.nonZeroCount,
      sampleValue: column.sampleValue,
      exactMatch: Boolean(exactMatch || approvedCreation),
      matchStatus: configuredExclusion ? 'excluded' : exactMatch || approvedCreation ? 'exact' : suggestedConcept ? 'proposal' : 'pending',
      action: configuredExclusion ? 'exclude' : exactMatch ? 'reuse' : approvedCreation ? 'create' : 'pending',
      suggestedMatches,
      targetConcept: exactMatch,
      targetId: exactMatch?.id ?? approvedCreation?.targetId ?? '',
      targetName: exactMatch?.name ?? approvedCreation?.targetName ?? '',
      proposedId,
      proposedSequence: resolveNewSequence(sourceMapping?.sourceCode, index),
      sequence: exactMatch?.sequence ?? approvedCreation?.sequence ?? resolveNewSequence(sourceMapping?.sourceCode, index),
      type: inferConceptType(classification || sourceSectionForColumn(column.index), lreField),
      lreField,
      classification,
      approved: Boolean(configuredExclusion || exactMatch || approvedCreation),
      excluded: Boolean(configuredExclusion),
      autoExcluded: false,
      exclusionReason: '',
      matchOrigin: (configuredDecision || configuredCreation) && (configuredExclusion || exactMatch || approvedCreation)
        ? 'concepts-module'
        : undefined,
    };
  });

  return {
    decisions,
    catalog,
    sourceConcepts: conceptColumns.length,
    sourceRows: sourceRows.length,
    excludedConcepts: excludedColumns,
    employeeValidation,
  };
}

export function buildHistoricalDetailRecords({ sourceRows, decisions, employeeCatalog = [], mappingScope, employeeIds = null }) {
  const outputRows = [];
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const excludedEmployeeIds = getExcludedHistoricalEmployeeIds(mappingScope);
  const selectedEmployeeIds = employeeIds ? new Set([...employeeIds].map(normalizeEmployeeId)) : null;

  decisions
    .filter((decision) => decision.approved && !decision.excluded && decision.targetId)
    .forEach((decision) => {
      sourceRows.forEach((sourceRow) => {
        const sourceEmployeeId = getSourceEmployeeId(sourceRow);
        if (excludedEmployeeIds.has(sourceEmployeeId) || (selectedEmployeeIds && !selectedEmployeeIds.has(sourceEmployeeId))) {
          return;
        }

        const employee = employeeById.get(sourceEmployeeId);
        if (!employee) {
          return;
        }

        const amount = parseHistoricalAmount(sourceRow[decision.sourceKey]);

        if (amount === null || amount === 0) {
          return;
        }

        outputRows.push({
          key: `${sourceEmployeeId}::${decision.sourceKey}::${decision.targetId}`,
          employeeId: sourceEmployeeId,
          conceptId: decision.targetId,
          row: buildDetailRow(sourceRow, decision.targetId, amount, employee),
        });
      });
    });

  return outputRows;
}

export function buildHistoricalDetailRows({ sourceRows, decisions, employeeCatalog = [], mappingScope, employeeIds = null }) {
  return buildHistoricalDetailRecords({ sourceRows, decisions, employeeCatalog, mappingScope, employeeIds }).map(({ row }) => row);
}

export function buildHistoricalDetailCsv({ sourceRows, decisions, employeeCatalog = [], mappingScope, employeeIds = null }) {
  const detailRows = buildHistoricalDetailRows({ sourceRows, decisions, employeeCatalog, mappingScope, employeeIds });
  const sheet = XLSX.utils.aoa_to_sheet([DETAIL_HEADERS, ...detailRows]);
  const csv = XLSX.utils.sheet_to_csv(sheet, {
    FS: ';',
    RS: '\r\n',
    blankrows: false,
  });

  return `\uFEFF${csv}`;
}

export async function loadHistoricalRexLiquidationTemplate() {
  const response = await fetch(REX_LIQUIDATION_TEMPLATE_PATH);
  if (!response.ok) {
    throw new Error('No se pudo cargar la plantilla de Liquidaciones en Detalle de REX+.');
  }

  return XLSX.read(await response.arrayBuffer(), { type: 'array' });
}

export function buildHistoricalRexLiquidationWorkbook({
  templateWorkbook,
  sourceRows,
  decisions,
  employeeCatalog = [],
  mappingScope,
  period = '',
  employeeIds = null,
}) {
  const rows = buildHistoricalRexLiquidationRows({
    sourceRows,
    decisions,
    employeeCatalog,
    mappingScope,
    period,
    employeeIds,
  });
  const workbook = {
    ...templateWorkbook,
    SheetNames: [...(templateWorkbook?.SheetNames ?? [])],
    Sheets: { ...(templateWorkbook?.Sheets ?? {}) },
  };
  workbook.SheetNames = workbook.SheetNames.filter((name) => name !== 'Ejemplo');
  workbook.SheetNames.unshift('Ejemplo');
  workbook.Sheets.Ejemplo = XLSX.utils.aoa_to_sheet([REX_LIQUIDATION_HEADERS, ...rows]);

  return workbook;
}

export function buildHistoricalRexLiquidationRows({
  sourceRows,
  decisions,
  employeeCatalog = [],
  mappingScope,
  period = '',
  employeeIds = null,
}) {
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const selectedEmployeeIds = employeeIds ? new Set([...employeeIds].map(normalizeEmployeeId)) : null;
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);
  const outputByKey = new Map();

  sourceRows.forEach((sourceRow) => {
    const employeeId = getSourceEmployeeId(sourceRow);
    const employee = employeeById.get(employeeId);
    if (!employee || (selectedEmployeeIds && !selectedEmployeeIds.has(employeeId))) {
      return;
    }

    approvedDecisions.forEach((decision) => {
      const taxDecision = isTaxDecision(decision);
      const parsedAmount = parseHistoricalAmount(sourceRow[decision.sourceKey]);
      const amount = parsedAmount ?? 0;
      if (!taxDecision && amount === 0) {
        return;
      }

      const key = `${employeeId}::${normalizeText(decision.targetId)}`;
      const existing = outputByKey.get(key);
      if (existing) {
        existing[4] += amount;
        return;
      }

      outputByKey.set(key, buildRexLiquidationRow({
        sourceRow,
        employee,
        decision,
        amount,
        period,
        decisions: approvedDecisions,
        mappingScope,
      }));
    });
  });

  return [...outputByKey.values()];
}

export function getHistoricalEmployeeIds({ sourceRows, decisions, employeeCatalog = [], mappingScope }) {
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const excludedEmployeeIds = getExcludedHistoricalEmployeeIds(mappingScope);
  const eligibleIds = new Set();
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);

  sourceRows.forEach((sourceRow) => {
    const sourceEmployeeId = getSourceEmployeeId(sourceRow);
    if (!sourceEmployeeId || excludedEmployeeIds.has(sourceEmployeeId) || !employeeById.has(sourceEmployeeId)) {
      return;
    }

    const hasLoadableAmount = approvedDecisions.some((decision) => {
      const amount = parseHistoricalAmount(sourceRow[decision.sourceKey]);
      return isTaxDecision(decision) || (amount !== null && amount !== 0);
    });

    if (hasLoadableAmount) {
      eligibleIds.add(sourceEmployeeId);
    }
  });

  return [...eligibleIds];
}

export function buildHistoricalReportRows(decisions) {
  return decisions.map((decision, index) => ({
    Fila: index + 2,
    'Concepto Meta4': decision.sourceName,
    'Código Meta4': decision.sourceCode,
    'Columna origen': decision.sourceKey,
    Seccion: decision.sourceSection,
    'Colaboradores con monto': decision.nonZeroCount,
    'Match exacto': decision.exactMatch ? 'Si' : 'No',
    'Concepto REX+': decision.targetId,
    'Nombre REX+': decision.targetName,
    'Origen del match': decision.matchOrigin === 'memory'
      ? 'Memoria de mapeos'
      : decision.matchOrigin === 'concepts-module'
        ? 'Mapeo del módulo Conceptos'
      : decision.exactMatch
        ? 'Catálogo REX+'
        : 'Propuesta',
    Estado: decision.excluded
      ? 'Excluido'
      : decision.action === 'create'
        ? decision.approved ? 'Creación aprobada' : 'Propuesta de creación'
      : decision.approved
        ? decision.exactMatch
          ? 'Match exacto aprobado'
          : 'Asignado manualmente'
        : 'Pendiente de match',
    'Motivo exclusión': decision.exclusionReason ?? '',
    'Propuesta principal': decision.suggestedMatches[0]?.concept?.name ?? '',
  }));
}

export function summarizeHistoricalDecisions(decisions) {
  return {
    total: decisions.length,
    exact: decisions.filter((decision) => decision.exactMatch).length,
    approved: decisions.filter((decision) => decision.approved && !decision.excluded).length,
    pending: decisions.filter((decision) => !decision.approved).length,
    createdApproved: decisions.filter((decision) => decision.action === 'create' && decision.approved && !decision.excluded).length,
    excluded: decisions.filter((decision) => decision.excluded).length,
    detailRows: decisions.reduce((total, decision) => total + (decision.approved && !decision.excluded ? decision.nonZeroCount : 0), 0),
  };
}

export function validateHistoricalEmployees(sourceRows, employeeCatalog = [], mappingScope) {
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const excludedEmployeeIds = getExcludedHistoricalEmployeeIds(mappingScope);
  const missing = [];
  const seen = new Set();
  let excludedCount = 0;

  sourceRows.forEach((sourceRow) => {
    const sourceId = getSourceEmployeeId(sourceRow);
    if (excludedEmployeeIds.has(sourceId)) {
      excludedCount += 1;
      return;
    }

    if (sourceId && !employeeById.has(sourceId) && !seen.has(sourceId)) {
      seen.add(sourceId);
      missing.push({
        id: sourceId,
        name: cleanCell(sourceRow.NOMBRE),
        sourceRowNumber: sourceRow.__sourceRowNumber ?? '',
      });
    }
  });

  return {
    total: sourceRows.length - excludedCount,
    matched: sourceRows.length - excludedCount - missing.length,
    missing,
    excludedCount,
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

function findExactMatch({ sourceName, catalogById, catalogByName, catalogByCanonicalName }) {
  const aliasId = HISTORICAL_ALIASES.get(sourceName.toUpperCase());
  return (
    (aliasId && catalogById.get(normalizeText(aliasId))) ||
    catalogByName.get(conceptKey(sourceName)) ||
    catalogById.get(normalizeText(sourceName)) ||
    catalogByCanonicalName.get(historicalConceptKey(sourceName)) ||
    null
  );
}

function buildUniqueConceptIndex(catalog, keyFn) {
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

function buildUniqueMappingIndex(mappingRows) {
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

function buildUniqueDecisionIndex(decisions) {
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

function isFinningMappingScope(mappingScope) {
  return !mappingScope || mappingScope.key === 'meta4:rex:finning';
}

function getExcludedHistoricalEmployeeIds() {
  // Historical books may legitimately contain people terminated after the
  // payroll period. Only the current REX+ employee master decides whether a
  // row can be exported; no hard-coded employee exclusion is applied here.
  return new Set();
}

function sourceSectionForColumn(index) {
  return index >= 255 ? 'Descuentos' : 'Haberes';
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

function historicalConceptKey(value) {
  return conceptKey(
    cleanCell(value)
      .replace(/([A-Za-z])\?([A-Za-z])/g, '$1n$2')
      .replace(/\b(?:original|orig)\b/gi, ' ')
      .replace(/\b\d+\s*\/\s*\d+\b/g, ' '),
  );
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

function isTaxSourceHeader(value) {
  return /^IMPUESTO(?:\s|$)/i.test(cleanCell(value));
}

function isNonLoadableHistoricalConcept(value) {
  const normalizedHeader = cleanCell(value).toUpperCase();
  return NON_LOADABLE_HISTORICAL_PATTERNS.some((pattern) => pattern.test(normalizedHeader));
}

function buildDetailRow(sourceRow, targetId, amount, employee) {
  const row = Array(DETAIL_HEADERS.length).fill('');
  const get = (header) => cleanCell(sourceRow[header]);

  row[0] = employee.id || get('CI') || get('ID EMPLEADO');
  row[1] = employee.name || get('NOMBRE');
  row[2] = employee.contract || '1';
  row[3] = employee.contractName || 'Contrato Indefinido';
  row[4] = targetId;
  row[5] = String(amount);
  row[6] = 'M';
  row[8] = 'M';
  row[11] = resolveInstitutionId(targetId, sourceRow);
  row[16] = 'C';

  return row;
}

const REX_COMPANY_IDS = [
  ['finning chile', 1],
  ['finning capacitacion', 2],
  ['centro de formacion tecnica finning', 3],
  ['distribuidora perkins chilena', 4],
  ['sitech southern cone', 5],
];

const REX_HEALTH_INSTITUTIONS = [
  ['cruzblanca', 'cruzblanca'],
  ['banmedica', 'banmedica'],
  ['colmena', 'colmena'],
  ['consalud', 'consalud'],
  ['isapre nueva masvida', 'nuevamasvida'],
  ['nueva masvida', 'nuevamasvida'],
  ['vida tres', 'vidatres'],
  ['masvida', 'masvida'],
  ['fonasa', 'fonasa'],
];

function buildRexLiquidationRow({ sourceRow, employee, decision, amount, period, decisions, mappingScope }) {
  const targetId = decision.targetId;
  const row = Array(REX_LIQUIDATION_HEADERS.length).fill(0);
  const isTax = isTaxDecision(decision);

  row[0] = period || inferHistoricalPeriod(sourceRow);
  row[1] = employee.id || getSourceEmployeeId(sourceRow);
  row[2] = employee.contract || '1';
  row[3] = targetId;
  row[4] = amount;
  row[5] = resolveAfecto(targetId, sourceRow);
  row[6] = resolveRexInstitutionId(targetId, sourceRow, employee);
  row[7] = resolveCotizacionJubilacion(targetId, sourceRow, employee);
  row[8] = resolveSourceAmount(sourceRow, [/DIAS .*LICEN/, /LICENCIAS/]);
  row[9] = resolveSourceAmount(sourceRow, [/^DIAS TRABAJADOS$/]);
  row[10] = 'x';
  row[11] = resolveRexCompanyId(sourceRow, mappingScope);
  row[12] = isTax ? resolveLegalDiscountTotal(sourceRow, decisions) : 0;
  row[13] = isTax ? resolveNonTaxableTotal(sourceRow, decisions) : 0;
  row[14] = resolveSourceAmount(sourceRow, [/REBAJA .*ZONA/, /ZONA EXTREMA/]);
  row[15] = resolveRexJornada(sourceRow);
  row[16] = resolveSourceAmount(sourceRow, [/DIAS .*VACACIONES/, /DIAS CORRIDOS VACACIONES/]);
  row[17] = isSalaryBaseDecision(targetId) ? resolveSourceAmount(sourceRow, [/^SUELDO BASE$/]) : 0;
  row[18] = 0;
  row[19] = 0;

  return row;
}

function isTaxDecision(decision) {
  return normalizeText(decision?.targetId).replace(/[^a-z0-9]+/g, '').includes('impuesto');
}

function isSalaryBaseDecision(targetId) {
  return normalizeText(targetId).replace(/[^a-z0-9]+/g, '') === 'sueldobase';
}

function resolveAfecto(targetId, sourceRow) {
  const normalizedTargetId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');
  if (normalizedTargetId.includes('impuesto')) {
    return resolveSourceAmount(sourceRow, [/^BASE TRIBUTABLE$/]);
  }

  const usesImponible = [
    'afp',
    'comisionafp',
    'reliquidaafp',
    'isapre',
    'reliquidaisapre',
    'cesempleado',
    'reliquidacesempleado',
    'sis',
    'sispago',
    'mutual',
    'reliquidamutual',
    'trabajopesa',
    'trabajopesaempl',
  ].includes(normalizedTargetId);

  return usesImponible
    ? resolveSourceAmount(sourceRow, [/^TOTAL IMPONIBLE TOPADO$/, /^TOTAL IMPONIBLE$/])
    : 0;
}

function resolveCotizacionJubilacion(targetId, sourceRow, employee) {
  const normalizedTargetId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');
  const explicit = resolveSourceAmount(sourceRow, [/PORCENTAJE.*AFP/, /COTIZACION.*AFP.*%/, /AFP COTI/]);
  if (explicit) {
    return explicit;
  }

  if (['afp', 'comisionafp', 'reliquidaafp'].includes(normalizedTargetId)) {
    return Number(employee.afpCoti) || 10;
  }

  if (['cesempleado', 'reliquidacesempleado'].includes(normalizedTargetId)) {
    return normalizeText(employee.tipoCont).includes('indef') ? 0.6 : 0;
  }

  if (['sis', 'sispago'].includes(normalizedTargetId)) {
    return 1.54;
  }

  if (normalizedTargetId.includes('trabajopesa')) {
    return 2;
  }

  if (normalizedTargetId.includes('mutual')) {
    return 2.1;
  }

  return 0;
}

function resolveRexInstitutionId(targetId, sourceRow, employee) {
  const normalizedTargetId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');
  if (LOS_ANDES_CONCEPT_IDS.has(normalizedTargetId)) {
    return 'losandes';
  }

  if (['afp', 'comisionafp', 'reliquidaafp', 'sis', 'sispago', 'cesempleado', 'reliquidacesempleado'].includes(normalizedTargetId)) {
    return resolveAfpInstitutionId(employee.afp || firstSourceValue(sourceRow, ['AFP', 'CODIGO AFP']));
  }

  if (normalizedTargetId.includes('isapre') || normalizedTargetId === 'salud') {
    return resolveHealthInstitutionId(firstSourceValue(sourceRow, ['ISAPRE', 'CODIGO ISAPRE']));
  }

  if (normalizedTargetId === 'apvi' || normalizedTargetId.includes('apv')) {
    const sourceInstitution = firstSourceValue(sourceRow, ['INSTITUCION APV', 'ID APV', 'APV INSTITUCION']);
    return sourceInstitution || (employee.afp ? `apv${normalizeText(employee.afp).replace(/[^a-z0-9]/g, '')}` : '');
  }

  if (normalizedTargetId.includes('mutual') || normalizedTargetId.includes('sanna')) {
    return 'mutseg';
  }

  return '';
}

function resolveHealthInstitutionId(value) {
  const normalizedValue = normalizeText(value);
  const match = REX_HEALTH_INSTITUTIONS.find(([label]) => normalizedValue.includes(label));
  return match?.[1] ?? cleanCell(value);
}

function resolveRexCompanyId(sourceRow, mappingScope) {
  const value = normalizeText(firstSourceValue(sourceRow, ['EMPRESA']));
  const match = REX_COMPANY_IDS.find(([label]) => value.includes(label));
  if (match) {
    return match[1];
  }

  return mappingScope?.company === 'finning' ? 1 : 0;
}

function resolveRexJornada(sourceRow) {
  const directValue = normalizeText(firstSourceValue(sourceRow, ['JORNADA', 'MODALIDAD DEL CONTRATO']));
  if (directValue === 'c' || directValue.includes('completa')) {
    return 'C';
  }
  if (directValue === 'p' || directValue.includes('parcial')) {
    return 'P';
  }

  const hours = resolveSourceAmount(sourceRow, [/^HORAS JORNADA$/, /^FACTOR HORAS$/]);
  return hours >= 160 ? 'C' : 'P';
}

function resolveLegalDiscountTotal(sourceRow, decisions) {
  const legalTargets = new Set(['afp', 'isapre', 'cesempleado', 'apvi', 'trabajopesaempl']);
  return decisions.reduce((total, decision) => {
    const targetId = normalizeText(decision.targetId).replace(/[^a-z0-9]+/g, '');
    if (!legalTargets.has(targetId)) {
      return total;
    }
    return total + Math.max(0, parseHistoricalAmount(sourceRow[decision.sourceKey]) ?? 0);
  }, 0);
}

function resolveNonTaxableTotal(sourceRow, decisions) {
  return decisions.reduce((total, decision) => {
    const type = normalizeText(decision.targetConcept?.type || decision.type);
    const name = normalizeText(decision.targetName);
    const isNonTaxable = type === '2e' || name.includes('exento') || name.includes('no gravad');
    if (!isNonTaxable || name.includes('sobregiro')) {
      return total;
    }
    return total + Math.max(0, parseHistoricalAmount(sourceRow[decision.sourceKey]) ?? 0);
  }, 0);
}

function resolveSourceAmount(sourceRow, patterns) {
  const entries = Object.entries(sourceRow ?? {});
  for (const pattern of patterns) {
    const entry = entries.find(([header, value]) => pattern.test(stripDuplicateHeaderSuffix(header)) && parseHistoricalAmount(value) !== null);
    if (entry) {
      return parseHistoricalAmount(entry[1]) ?? 0;
    }
  }

  return 0;
}

function inferHistoricalPeriod(sourceRow) {
  const sourceHeader = Object.keys(sourceRow ?? {}).find((header) => /SUELDO BASE ORIGINAL\d{2}\/\d{4}/i.test(header));
  const match = sourceHeader?.match(/(\d{2})\/(\d{4})/);
  return match ? `${match[2]}-${match[1]}` : '';
}

function resolveInstitutionId(conceptId, sourceRow) {
  const normalizedConceptId = normalizeText(conceptId).replace(/[^a-z0-9]+/g, '');

  if (LOS_ANDES_CONCEPT_IDS.has(normalizedConceptId)) {
    return 'losandes';
  }

  if (normalizedConceptId === 'apvi') {
    return resolveAfpInstitutionId(firstSourceValue(sourceRow, ['CÓDIGO AFP', 'CODIGO AFP', 'ID AFP', 'AFP']));
  }

  if (normalizedConceptId === 'isapre') {
    return firstSourceValue(sourceRow, ['CÓDIGO ISAPRE', 'CODIGO ISAPRE', 'ID ISAPRE', 'ISAPRE']);
  }

  return '';
}

function resolveAfpInstitutionId(value) {
  const rawValue = cleanCell(value);
  const normalizedValue = normalizeText(rawValue).replace(/^afp\s+/, '');
  const normalizedCode = rawValue.replace(/\D/g, '').replace(/^0+/, '') || '0';

  const match = AFP_INSTITUTION_IDS.find(([id, name, code]) => (
    normalizeText(id) === normalizedValue ||
    normalizeText(name).replace(/^afp\s+/, '') === normalizedValue ||
    code.replace(/^0+/, '') === normalizedCode
  ));

  return match?.[0] ?? rawValue;
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

function getSourceEmployeeId(sourceRow) {
  return normalizeEmployeeId(sourceRow.CI || sourceRow['ID EMPLEADO']);
}

function normalizeEmployeeId(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}
