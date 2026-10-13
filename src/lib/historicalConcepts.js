import * as XLSX from 'xlsx';
import { buildConceptDecisions, buildConceptId, inferConceptType, resolveNewSequence } from './concepts';
import { cleanCell, normalizeText } from './utils';
import {
  buildUniqueConceptIndex,
  buildUniqueDecisionIndex,
  buildUniqueMappingIndex,
  conceptKey,
  extractConceptColumns,
  findExactMatch,
  findSuggestedMatches,
  FINNING_APPROVED_CREATIONS,
  getExcludedHistoricalEmployeeIds,
  historicalConceptKey,
  historicalHeaderKey,
  isFinningMappingScope,
  isNonLoadableHistoricalConcept,
  parseHistoricalAmount,
  parseHistoricalTotal,
  resolveHistoricalHeader,
  sourceSectionForColumn,
  stripDuplicateHeaderSuffix,
} from './historicalConcepts/matching';
import {
  getSourceEmployeeId,
  normalizeEmployeeId,
  resolveInstitutionId,
  REX_LIQUIDATION_HEADERS,
} from './historicalConcepts/support';
import {
  buildHistoricalRexLiquidationCsv,
  buildHistoricalRexLiquidationRows,
  buildHistoricalRexLiquidationWorkbook,
  isEmployerContributionDecision,
  isTaxDecision,
  loadHistoricalRexLiquidationTemplate,
  validateHistoricalRexLiquidationRows,
} from './historicalConcepts/rexLiquidation';

export {
  buildHistoricalRexLiquidationCsv,
  buildHistoricalRexLiquidationRows,
  buildHistoricalRexLiquidationWorkbook,
  loadHistoricalRexLiquidationTemplate,
  validateHistoricalRexLiquidationRows,
};

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

export { REX_LIQUIDATION_HEADERS };

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
    const type = exactMatch?.type ?? inferConceptType(classification || sourceSectionForColumn(column.index), lreField);
    const isEmployerContribution = normalizeText(type).replace(/[^a-z0-9]+/g, '') === '5a';
    const excluded = isNonLoadableHistoricalConcept(sourceName);
    return {
      id: `${index + 1}-${sourceKey}`,
      sourceKey,
      sourceName,
      // The Concepts module persists many decisions using the Meta4 code.
      // Carry it into the historical flow so the same decision can be reused.
      sourceCode: sourceMapping?.sourceCode ?? configuredDecision?.sourceCode ?? '',
      sourceColumnIndex: column.index,
      sourceSection: isEmployerContribution
        ? 'Aporte patronal'
        : column.index >= 255 ? 'Descuento' : 'Haber / remuneración',
      nonZeroCount: column.nonZeroCount,
      sampleValue: column.sampleValue,
      exactMatch: Boolean(exactMatch || approvedCreation),
      matchStatus: excluded ? 'excluded' : exactMatch || approvedCreation ? 'exact' : suggestedConcept ? 'proposal' : 'pending',
      action: excluded ? 'exclude' : exactMatch ? 'reuse' : approvedCreation ? 'create' : 'pending',
      suggestedMatches,
      targetConcept: exactMatch,
      targetId: exactMatch?.id ?? approvedCreation?.targetId ?? '',
      targetName: exactMatch?.name ?? approvedCreation?.targetName ?? '',
      proposedId,
      proposedSequence: resolveNewSequence(sourceMapping?.sourceCode, index),
      sequence: exactMatch?.sequence ?? approvedCreation?.sequence ?? resolveNewSequence(sourceMapping?.sourceCode, index),
      type,
      lreField,
      classification,
      approved: Boolean(excluded || exactMatch || approvedCreation),
      excluded,
      exclusionReason: excluded
        ? 'Regla FINNING: se excluyen provisiones y Renta Imponible RIMA del detalle histórico.'
        : '',
      matchOrigin: (configuredDecision || configuredCreation) && (excluded || exactMatch || approvedCreation)
        ? 'concepts-module'
        : undefined,
    };
  });

  const reconciliation = buildHistoricalReconciliation({
    sourceRows,
    sourceHeaders,
    decisions,
    employeeCatalog,
    mappingScope,
  });

  return {
    decisions,
    catalog,
    sourceConcepts: conceptColumns.length,
    sourceRows: sourceRows.length,
    excludedConcepts: excludedColumns,
    employeeValidation,
    reconciliation,
  };
}

/**
 * Validates the arithmetic already present in the source book. This is not a
 * prediction of REX+'s final payroll calculation: REX+ may recalculate
 * contractual, statutory and tax concepts from the employee contract.
 */
export function buildHistoricalReconciliation({ sourceRows = [], sourceHeaders = [], decisions = [], employeeCatalog = [], mappingScope, selectedDecisionIds = null }) {
  const sourceHeadersByKey = new Map((sourceHeaders ?? []).map((header) => [historicalHeaderKey(header), header]));
  const totalHaberesHeader = resolveHistoricalHeader(sourceHeadersByKey, ['TOTAL_HABERES', 'TOTAL HABERES', 'TOTAL DE HABERES']);
  const totalDescuentosHeader = resolveHistoricalHeader(sourceHeadersByKey, ['TOTAL_DESCUENTOS', 'TOTAL DESCUENTOS']);
  const liquidoHeader = resolveHistoricalHeader(sourceHeadersByKey, ['LIQUIDO', 'LIQUIDO A PAGO', 'SUELDO LIQUIDO']);
  const selectedIds = selectedDecisionIds ? new Set(selectedDecisionIds) : null;
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const excludedEmployeeIds = getExcludedHistoricalEmployeeIds(mappingScope);
  const includedDecisions = decisions.filter((decision) =>
    decision.approved && !decision.excluded && decision.targetId && (!selectedIds || selectedIds.has(decision.id)),
  );

  const rows = sourceRows
    .map((sourceRow, index) => {
      const employeeId = getSourceEmployeeId(sourceRow);
      const totalHaberes = parseHistoricalTotal(sourceRow[totalHaberesHeader]);
      const totalDescuentos = parseHistoricalTotal(sourceRow[totalDescuentosHeader]);
      const liquido = parseHistoricalTotal(sourceRow[liquidoHeader]);
      const hasAllTotals = [totalHaberes, totalDescuentos, liquido].every((value) => value !== null);
      let includedHaberes = 0;
      let includedDescuentos = 0;

      includedDecisions.forEach((decision) => {
        if (isEmployerContributionDecision(decision)) {
          return;
        }

        const amount = parseHistoricalAmount(sourceRow[decision.sourceKey]);
        if (amount === null || amount === 0) {
          return;
        }

        if (decision.sourceSection === 'Descuento') {
          includedDescuentos += amount;
        } else {
          includedHaberes += amount;
        }
      });

      const sourceCalculatedLiquid = hasAllTotals ? totalHaberes - totalDescuentos : null;
      const sourceLiquidDifference = hasAllTotals ? sourceCalculatedLiquid - liquido : null;
      const includedCalculatedLiquid = hasAllTotals ? includedHaberes - includedDescuentos : null;
      const includedLiquidDifference = hasAllTotals ? includedCalculatedLiquid - liquido : null;

      return {
        sourceRowNumber: sourceRow.__sourceRowNumber ?? index + 2,
        employeeId,
        employeeName: cleanCell(sourceRow.NOMBRE),
        employeeExists: employeeById.has(employeeId),
        excluded: excludedEmployeeIds.has(employeeId),
        totalHaberes,
        totalDescuentos,
        liquido,
        sourceCalculatedLiquid,
        sourceLiquidDifference,
        includedHaberes,
        includedDescuentos,
        includedCalculatedLiquid,
        includedLiquidDifference,
        hasAllTotals,
      };
    })
    .filter((row) => row.employeeId || row.hasAllTotals);

  const rowsWithTotals = rows.filter((row) => row.hasAllTotals);
  const incompleteRows = rows.filter((row) => !row.hasAllTotals);
  const sourceDifferenceRows = rowsWithTotals.filter((row) => row.sourceLiquidDifference !== 0);
  const coverageDifferenceRows = rowsWithTotals.filter((row) => row.includedLiquidDifference !== 0);
  const sum = (field) => rowsWithTotals.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const sourceStatus = rows.length === 0 || rowsWithTotals.length === 0
    ? 'unavailable'
    : incompleteRows.length > 0
      ? 'incomplete'
      : sourceDifferenceRows.length > 0
        ? 'blocked'
        : 'ok';

  return {
    headers: {
      totalHaberes: totalHaberesHeader,
      totalDescuentos: totalDescuentosHeader,
      liquido: liquidoHeader,
    },
    rows,
    source: {
      status: sourceStatus,
      totalRows: rows.length,
      rowsWithTotals: rowsWithTotals.length,
      incompleteRows: incompleteRows.length,
      differenceRows: sourceDifferenceRows.length,
      differenceTotal: sum('sourceLiquidDifference'),
      maxDifference: sourceDifferenceRows.reduce((max, row) => Math.max(max, Math.abs(row.sourceLiquidDifference)), 0),
      totalHaberes: sum('totalHaberes'),
      totalDescuentos: sum('totalDescuentos'),
      totalLiquido: sum('liquido'),
      calculatedLiquido: sum('sourceCalculatedLiquid'),
    },
    coverage: {
      differenceRows: coverageDifferenceRows.length,
      differenceTotal: sum('includedLiquidDifference'),
      includedHaberes: sum('includedHaberes'),
      includedDescuentos: sum('includedDescuentos'),
      includedLiquido: sum('includedCalculatedLiquid'),
    },
  };
}

export function buildHistoricalReconciliationRows(reconciliation) {
  return (reconciliation?.rows ?? []).map((row) => ({
    Fila: row.sourceRowNumber,
    CI: row.employeeId,
    Nombre: row.employeeName,
    'Total haberes Meta4': row.totalHaberes ?? '',
    'Total descuentos Meta4': row.totalDescuentos ?? '',
    'Líquido Meta4': row.liquido ?? '',
    'Líquido calculado Meta4': row.sourceCalculatedLiquid ?? '',
    'Diferencia líquido libro': row.sourceLiquidDifference ?? '',
    'Haberes seleccionados': row.includedHaberes,
    'Descuentos seleccionados': row.includedDescuentos,
    'Líquido referencial seleccionado': row.includedCalculatedLiquid ?? '',
    'Diferencia referencial': row.includedLiquidDifference ?? '',
    Estado: !row.hasAllTotals
      ? 'Faltan totales'
      : row.sourceLiquidDifference === 0
        ? row.includedLiquidDifference === 0 ? 'Cuadrado' : 'Libro cuadrado; revisar cobertura'
        : 'Diferencia en libro Meta4',
  }));
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
