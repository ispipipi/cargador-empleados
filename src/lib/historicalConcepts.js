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
  ['NUMERO SOBRETIEMPO', 'sobretiempo'],
  ['ASIG. DE PROYECTO ORIG.', 'asignacionDeProyecto'],
  ['ASIG. CASA ORIG.', 'asignacionCasa'],
  ['EXTENSION SINDICATO 2 RENTAL', 'extensionSindicatoN2'],
  ['EXTENSION SINDICATO N?2', 'extensionSindicatoN2'],
  ['HORAS EXTRAS 50%', 'horasEx50'],
  ['SEMANA CORRIDA', 'semanaCorr'],
  ['GRATIFICACION', 'gratificacion'],
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
    'seguro empresa aporte empleador',
    {
      targetId: 'seguroEmpresaAp13V8K',
      targetName: 'SEGURO EMPRESA APORTE EMPLEADOR',
    },
  ],
  [
    'capitalizacion individual reliq',
    {
      targetId: 'capitalizacionIUVQ1P',
      targetName: 'CAPITALIZACION INDIVIDUAL RELIQ',
    },
  ],
  [
    'subsidios por reembolsar',
    {
      targetId: 'subsidiosPorReePPZYM',
      targetName: 'SUBSIDIOS POR REEMBOLSAR',
    },
  ],
]);

// These collaborators are present in the January payroll but are terminated
// and therefore must not block or enter the historical concept load for FINNING.
const FINNING_TERMINATED_EMPLOYEE_IDS = new Set([
  '17133647-3',
  '10734545-0',
  '19467522-4',
  '15025660-7',
  '16249223-3',
  '18941561-3',
  '17861299-9',
  '8552006-7',
  '17366676-4',
  '18456229-4',
  '17074351-2',
  '21009521-7',
  '16468383-4',
  '20739762-8',
  '10142183-K',
  '11719893-6',
  '10883669-5',
  '14271970-3',
  '10632033-0',
  '18482923-1',
  '21133098-8',
  '14058765-6',
]);

export function buildHistoricalConceptModel({ sourceRows, sourceHeaders, concepts, mappingRows = [], employeeCatalog = [], mappingScope }) {
  const catalog = concepts.filter((concept) => normalizeText(concept.type) !== 'dato');
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
  const conceptColumns = extractConceptColumns({ sourceRows, sourceHeaders });
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
    const exactMatch =
      findExactMatch({ sourceName, catalogById, catalogByName, catalogByCanonicalName }) ??
      (configuredDecision?.action === 'reuse' ? configuredDecision.targetConcept : null);
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
    employeeValidation,
  };
}

export function buildHistoricalDetailRows({ sourceRows, decisions, employeeCatalog = [], mappingScope }) {
  const outputRows = [];
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const excludedEmployeeIds = getExcludedHistoricalEmployeeIds(mappingScope);

  decisions
    .filter((decision) => decision.approved && !decision.excluded && decision.targetId)
    .forEach((decision) => {
      sourceRows.forEach((sourceRow) => {
        const sourceEmployeeId = getSourceEmployeeId(sourceRow);
        if (excludedEmployeeIds.has(sourceEmployeeId)) {
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

        outputRows.push(buildDetailRow(sourceRow, decision.targetId, amount, employee));
      });
    });

  return outputRows;
}

export function buildHistoricalDetailCsv({ sourceRows, decisions, employeeCatalog = [], mappingScope }) {
  const detailRows = buildHistoricalDetailRows({ sourceRows, decisions, employeeCatalog, mappingScope });
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

function getExcludedHistoricalEmployeeIds(mappingScope) {
  return isFinningMappingScope(mappingScope) ? FINNING_TERMINATED_EMPLOYEE_IDS : new Set();
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
  row[16] = 'C';

  return row;
}

function getSourceEmployeeId(sourceRow) {
  return normalizeEmployeeId(sourceRow.CI || sourceRow['ID EMPLEADO']);
}

function normalizeEmployeeId(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}
