import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';

import {
  AUTO_EXCLUDED_PATTERNS,
  BUK_CONCEPT_CATALOG,
  BUK_HISTORICAL_DETAIL_HEADERS,
  BUK_HISTORICAL_LIQUIDATIONS_HEADERS,
  BUK_HISTORICAL_SHEET_NAMES,
  SOURCE_ALIASES,
  TALANA_FIXED_HEADERS,
  TALANA_HISTORICAL_RULES,
  TALANA_IDENTITY_HEADERS,
  catalogById,
} from './talanaHistorical/catalog';

export function getTalanaHistoricalCatalog() {
  return BUK_CONCEPT_CATALOG;
}

export function buildTalanaHistoricalAnalysis({ decisions = [], reconciliation, mappingScope } = {}) {
  const unresolvedConcepts = decisions.filter((decision) => !decision.approved && !decision.excluded).length;
  const hasReconciliation = Boolean(reconciliation);
  const reconciliationReady = hasReconciliation && reconciliation.isBalanced;
  const scopeLabel = [mappingScope?.origin, mappingScope?.destination, mappingScope?.company]
    .filter(Boolean)
    .join(' → ');
  const checks = [
    {
      id: 'mapping',
      title: 'Mapeo de conceptos',
      status: unresolvedConcepts === 0 ? 'ok' : 'blocked',
      detail: unresolvedConcepts === 0
        ? 'Todos los conceptos con monto tienen un pareo o una exclusión confirmada.'
        : `${unresolvedConcepts.toLocaleString('es-CL')} conceptos requieren una decisión antes de descargar.`,
    },
    {
      id: 'reconciliation',
      title: 'Cuadratura del líquido',
      status: reconciliationReady ? 'ok' : 'blocked',
      detail: !hasReconciliation
        ? 'Aún no se ha podido calcular la conciliación.'
        : reconciliationReady
          ? 'Líquidos, haberes y descuentos cuadran por trabajador.'
          : `${reconciliation.liquidDifferences} diferencias de líquido, ${reconciliation.totalDifferences} de haberes y ${reconciliation.discountDifferences} de descuentos.`,
    },
    {
      id: 'details',
      title: 'Detalles de carga',
      status: 'applied',
      detail: 'Se excluyen los conceptos automáticos y se consolidan los códigos BUK repetidos por trabajador.',
    },
    {
      id: 'buk-rules',
      title: 'Validaciones BUK',
      status: 'applied',
      detail: 'La base tributable y los descuentos tributables se preparan dentro de los límites aceptados por BUK.',
    },
  ];

  return {
    scopeLabel,
    rules: TALANA_HISTORICAL_RULES,
    checks,
    blockers: checks.filter((check) => check.status === 'blocked'),
    isReady: unresolvedConcepts === 0 && reconciliationReady,
  };
}

export function getTalanaHistoricalEmployeeIds(sourceRows) {
  return consolidateTalanaEmployeeRows(sourceRows)
    .map((row) => normalizeTalanaEmployeeId(row['Rut del Trabajador']))
    .filter(Boolean);
}

export function buildTalanaHistoricalRuleReportRows(analysis) {
  const ruleRows = (analysis?.rules ?? TALANA_HISTORICAL_RULES).map((rule) => ({
    Tipo: 'Regla aplicada',
    Regla: rule.title,
    Descripción: rule.description,
    Ámbito: rule.scope,
    Estado: 'Aplicada',
  }));
  const checkRows = (analysis?.checks ?? []).map((check) => ({
    Tipo: 'Control antes de descargar',
    Regla: check.title,
    Descripción: check.detail,
    Ámbito: 'Análisis actual',
    Estado: check.status === 'ok' || check.status === 'applied' ? 'OK' : 'Bloquea descarga',
  }));

  return [...ruleRows, ...checkRows];
}

export function buildTalanaHistoricalModel({ sourceRows, sourceHeaders }) {
  const conceptColumns = sourceHeaders
    .map((sourceKey) => ({
      sourceKey,
      sourceName: stripDuplicateSuffix(sourceKey),
    }))
    .filter(({ sourceKey }) => !TALANA_FIXED_HEADERS.has(sourceKey))
    .filter(({ sourceName }) => sourceName);

  const decisions = conceptColumns.map((column, index) => buildDecision(column, sourceRows, index));

  return {
    decisions,
    catalog: BUK_CONCEPT_CATALOG,
    sourceRows: sourceRows.length,
    sourceConcepts: decisions.length,
  };
}

export function buildTalanaHistoricalWorkbook({ sourceRows, decisions, fichaCode = 'F1', employeeIds = null }) {
  const selectedEmployeeIds = Array.isArray(employeeIds)
    ? new Set(employeeIds.map(normalizeTalanaEmployeeId).filter(Boolean))
    : null;
  const employeeRows = consolidateTalanaEmployeeRows(sourceRows)
    .filter((row) => !selectedEmployeeIds || selectedEmployeeIds.has(normalizeTalanaEmployeeId(row['Rut del Trabajador'])));
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);
  const detailRowsBySheet = new Map(BUK_HISTORICAL_SHEET_NAMES.slice(1, 4).map((sheet) => [sheet, []]));

  approvedDecisions.forEach((decision) => {
    employeeRows.forEach((row) => {
      const amount = parseAmount(row[decision.sourceKey]);
      if (!amount) {
        return;
      }

      const rut = cleanCell(row['Rut del Trabajador']);
      const detailRow = [
        rut,
        fichaCode,
        cleanCell(row['Rut de la Empresa']),
        decision.targetName,
        amount,
        decision.targetId,
      ];
      detailRowsBySheet.get(decision.sheet)?.push(detailRow);
    });
  });

  employeeRows.forEach((row) => {
    const detailDiscounts = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Descuentos');
    const totalBukOtherDiscounts = parseAmount(row['Otros Descuentos']) + parseAmount(row['Impuestos']);
    const residualDiscount = totalBukOtherDiscounts - detailDiscounts;
    if (residualDiscount > 0) {
      detailRowsBySheet.get('Descuentos')?.push([
        cleanCell(row['Rut del Trabajador']),
        fichaCode,
        cleanCell(row['Rut de la Empresa']),
        catalogById.get('otro_descuento').name,
        residualDiscount,
        'otro_descuento',
      ]);
    }
  });

  // REX+ rejects more than one detail row with the same employee and item code.
  // Different source concepts can intentionally reuse one REX+ concept, so
  // consolidate those rows while preserving their combined amount.
  detailRowsBySheet.forEach((detailRows, sheet) => {
    const consolidatedRows = new Map();

    detailRows.forEach((detailRow) => {
      const key = [detailRow[0], detailRow[1], detailRow[2], detailRow[5]].join('|');
      const existingRow = consolidatedRows.get(key);

      if (existingRow) {
        existingRow[4] += detailRow[4];
        return;
      }

      consolidatedRows.set(key, [...detailRow]);
    });

    detailRowsBySheet.set(sheet, [...consolidatedRows.values()]);
  });

  const liquidationRows = employeeRows.map((row) => {
    const employerContributions = sumFields(row, [
      'Capitalización Individual AFP',
      'Expectativa de Vida',
      'Seguro accidentes del Trabajo',
      'Seguro Cesantia Empleador',
      'Seguro Cesantia (Fondo Solidario)',
      'Seguro Invalidez y Supervivencia (SIS)',
    ]);
    const imponible = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes Imponibles');
    const noTaxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && !decision.taxable);
    const taxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && decision.taxable);
    const legalDiscounts = parseAmount(row['Descuentos Legales']);
    const otherDiscounts = parseAmount(row['Otros Descuentos']) + parseAmount(row['Impuestos']);
    const saldoSobregiro = resolveBukOverdraftBalance(row);
    const liquid = imponible + noTaxable + taxable - legalDiscounts - otherDiscounts + saldoSobregiro;
    // BUK derives taxable discounts as taxable earnings minus taxable base.
    // Keep that derived value between zero and total legal discounts.
    const minimumBaseTributable = Math.max(0, imponible - legalDiscounts);
    const baseTributable = Math.min(
      imponible,
      Math.max(minimumBaseTributable, parseAmount(row['Renta Tributable'])),
    );

    return [
      cleanCell(row['Rut del Trabajador']),
      fichaCode,
      cleanCell(row['Rut de la Empresa']),
      parseAmount(row['Sueldo Base']),
      parseAmount(row['Días Laborales']) || 30,
      parseAmount(row['Días Trabajados']),
      parseAmount(row['Días Licencia']),
      0,
      parseAmount(row['Días Ausencia']),
      0,
      0,
      sumFields(row, ['HHs. Extra 50%', 'HHs. Extra 100%', 'Horas a pago por días compensatorios vencidos']),
      imponible + noTaxable + taxable + employerContributions,
      imponible,
      noTaxable,
      taxable,
      legalDiscounts,
      otherDiscounts,
      liquid,
      baseTributable,
      0,
      parseAmount(row['Impuestos']),
      parseAmount(row.AFP) || parseAmount(row.IPS),
      parseAmount(row['Salud 7% (Fonasa)']) || parseAmount(row.Isapre),
      parseAmount(row['Isapre sobre 7%']),
      sumFields(row, ['APV (Régimen A)', 'APV', 'APV 2']),
      parseAmount(row['Seguro Cesantia Trabajador']),
      0,
      parseAmount(row['Seguro Cesantia Empleador']),
      parseAmount(row['Seguro accidentes del Trabajo']),
      parseAmount(row['Seguro Invalidez y Supervivencia (SIS)']),
      0,
      parseAmount(row['Capitalización Individual AFP']),
      parseAmount(row['Expectativa de Vida']),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      employerContributions,
      resolveBukOverdraftBalance(row),
    ];
  });

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, 'Liquidaciones', BUK_HISTORICAL_LIQUIDATIONS_HEADERS, liquidationRows);
  appendSheet(workbook, 'Haberes Imponibles', BUK_HISTORICAL_DETAIL_HEADERS, detailRowsBySheet.get('Haberes Imponibles'));
  appendSheet(workbook, 'Haberes No Imponibles', BUK_HISTORICAL_DETAIL_HEADERS, detailRowsBySheet.get('Haberes No Imponibles'));
  appendSheet(workbook, 'Descuentos', BUK_HISTORICAL_DETAIL_HEADERS, detailRowsBySheet.get('Descuentos'));
  appendSheet(workbook, 'Líneas de Finiquito', BUK_HISTORICAL_DETAIL_HEADERS, []);

  return workbook;
}

export function buildTalanaHistoricalReportRows(decisions) {
  return decisions.map((decision, index) => ({
    Fila: index + 2,
    'Columna Talana': decision.sourceKey,
    'Concepto Talana': decision.sourceName,
    'Colaboradores con monto': decision.nonZeroCount,
    'Valor de muestra': decision.sampleValue,
    Estado: decision.autoExcluded
      ? 'Excluido automático'
      : decision.excluded
        ? 'Excluido'
        : decision.matchStatus === 'exact'
          ? 'Match exacto'
          : decision.approved
            ? 'Pareado manual'
            : decision.suggestedMatches.length
              ? 'Propuesta pendiente'
              : 'Sin propuesta',
    'Motivo exclusión': decision.exclusionReason ?? '',
    'Hoja BUK': decision.sheet ?? '',
    'Id BUK': decision.targetId,
    'Nombre BUK': decision.targetName,
    'Id propuesto': decision.proposedId,
  }));
}

export function buildTalanaHistoricalReconciliation({ sourceRows, decisions, fichaCode = 'F1' }) {
  const employeeRows = consolidateTalanaEmployeeRows(sourceRows);
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);

  return employeeRows.map((row) => {
    const imponible = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes Imponibles');
    const noTaxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && !decision.taxable);
    const taxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && decision.taxable);
    const discounts = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Descuentos');
    const legalDiscounts = parseAmount(row['Descuentos Legales']);
    const otherDiscounts = parseAmount(row['Otros Descuentos']);
    const tax = parseAmount(row['Impuestos']);
    const voluntaryPension = sumFields(row, ['APV (Régimen A)', 'APV', 'APV 2']);
    const voluntaryHealth = parseAmount(row['Isapre sobre 7%']);
    const bukOtherDiscounts = otherDiscounts + tax;
    const expectedDetailDiscounts = bukOtherDiscounts;
    const sourceLiquid = parseAmount(row['Sueldo Liquido A Pago']);
    const saldoSobregiro = resolveBukOverdraftBalance(row);
    const bukLiquid = imponible + noTaxable + taxable - legalDiscounts - bukOtherDiscounts + saldoSobregiro;
    const detailTotal = imponible + noTaxable + taxable;
    const sourceTotal = parseAmount(row['Remuneración Total']);
    const loadedDiscounts = discounts + Math.max(0, expectedDetailDiscounts - discounts);

    return {
      'Número de Documento': cleanCell(row['Rut del Trabajador']),
      'RUT Empresa': cleanCell(row['Rut de la Empresa']),
      'Código de Ficha': fichaCode,
      'Haberes imponibles BUK': imponible,
      'Haberes no imponibles no tributables BUK': noTaxable,
      'Haberes no imponibles tributables BUK': taxable,
      'Total haberes BUK': detailTotal,
      'Total haberes Talana': sourceTotal,
      'Descuentos legales': legalDiscounts,
      'Otros descuentos Talana': otherDiscounts,
      Impuesto: tax,
      'APV / previsión voluntaria': voluntaryPension,
      'Salud voluntaria': voluntaryHealth,
      'Otros descuentos BUK': bukOtherDiscounts,
      'Líquido a pago Talana': sourceLiquid,
      'Líquido a pago BUK': bukLiquid,
      'Diferencia líquido': bukLiquid - sourceLiquid,
      'Diferencia haberes': detailTotal - sourceTotal,
      'Descuentos detallados BUK': loadedDiscounts,
      'Otros descuentos BUK a detallar': expectedDetailDiscounts,
      'Sobregiro Talana como haber': parseAmount(row.Sobregiro),
      'Saldo Sobregiro BUK': saldoSobregiro,
      'Diferencia descuentos': loadedDiscounts - expectedDetailDiscounts,
      Estado: bukLiquid === sourceLiquid && detailTotal === sourceTotal && loadedDiscounts === expectedDetailDiscounts ? 'Cuadrado' : 'Revisar',
    };
  });
}

export function summarizeTalanaHistoricalReconciliation(rows) {
  const liquidDifferences = rows.filter((row) => row['Diferencia líquido'] !== 0);
  const totalDifferences = rows.filter((row) => row['Diferencia haberes'] !== 0);
  const discountDifferences = rows.filter((row) => row['Diferencia descuentos'] !== 0);

  return {
    employees: rows.length,
    liquidMatched: rows.length - liquidDifferences.length,
    liquidDifferences: liquidDifferences.length,
    liquidDifferenceTotal: liquidDifferences.reduce((total, row) => total + row['Diferencia líquido'], 0),
    totalMatched: rows.length - totalDifferences.length,
    totalDifferences: totalDifferences.length,
    totalDifferenceTotal: totalDifferences.reduce((total, row) => total + row['Diferencia haberes'], 0),
    discountsMatched: rows.length - discountDifferences.length,
    discountDifferences: discountDifferences.length,
    discountDifferenceTotal: discountDifferences.reduce((total, row) => total + row['Diferencia descuentos'], 0),
    isBalanced: liquidDifferences.length === 0 && totalDifferences.length === 0 && discountDifferences.length === 0,
  };
}

export function summarizeTalanaHistoricalDecisions(decisions) {
  return {
    total: decisions.length,
    exact: decisions.filter((decision) => decision.matchStatus === 'exact').length,
    proposals: decisions.filter((decision) => !decision.approved && decision.suggestedMatches.length > 0).length,
    pending: decisions.filter((decision) => !decision.approved && decision.suggestedMatches.length === 0).length,
    approved: decisions.filter((decision) => decision.approved && !decision.excluded).length,
    excluded: decisions.filter((decision) => decision.excluded).length,
    autoExcluded: decisions.filter((decision) => decision.autoExcluded).length,
  };
}

function buildDecision(column, sourceRows, index) {
  const sourceName = column.sourceName;
  const nonZeroRows = sourceRows.filter((row) => isValidRut(row['Rut del Trabajador']) && parseAmount(row[column.sourceKey]) !== 0);
  const normalizedSourceName = normalizeSourceName(sourceName);
  const autoExcluded = AUTO_EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalizedSourceName));

  if (autoExcluded) {
    return {
      id: `talana-historical-${index}`,
      sourceKey: column.sourceKey,
      sourceName,
      nonZeroCount: nonZeroRows.length,
      sampleValue: nonZeroRows[0]?.[column.sourceKey] ?? '',
      targetId: '',
      targetName: '',
      targetConcept: null,
      suggestedMatches: [],
      proposedId: '',
      sheet: '',
      taxable: false,
      approved: true,
      excluded: true,
      autoExcluded: true,
      matchStatus: 'excluded',
      exclusionReason: 'Total, impuesto, ley social o aporte patronal. No se carga como haber o descuento detallado.',
      action: 'exclude',
    };
  }

  const targetId = SOURCE_ALIASES.get(normalizedSourceName) ?? findCatalogByName(normalizedSourceName)?.id ?? '';
  const target = catalogById.get(targetId);
  const suggestedMatches = target ? [] : findSuggestedMatches(normalizedSourceName);
  const taxable = getTaxability(sourceName, target);

  return {
    id: `talana-historical-${index}`,
    sourceKey: column.sourceKey,
    sourceName,
    nonZeroCount: nonZeroRows.length,
    sampleValue: nonZeroRows[0]?.[column.sourceKey] ?? '',
    targetId: target?.id ?? '',
    targetName: target?.name ?? '',
    targetConcept: target ?? null,
    suggestedMatches,
    proposedId: suggestedMatches[0]?.id ?? '',
    sheet: target?.sheet ?? '',
    taxable,
    approved: Boolean(target),
    excluded: false,
    autoExcluded: false,
    matchStatus: target ? 'exact' : '',
    exclusionReason: '',
    action: target ? 'reuse' : '',
  };
}

function getTaxability(sourceName, target) {
  if (!target) {
    return false;
  }

  if (target.id === 'otro_haber_no_imponible' && normalizeSourceName(sourceName) === 'bono aguinaldo') {
    return true;
  }

  return target.taxable;
}

function findCatalogByName(sourceName) {
  return BUK_CONCEPT_CATALOG.find((concept) => normalizeSourceName(concept.name) === sourceName);
}

function findSuggestedMatches(sourceName) {
  const sourceTokens = normalizeSourceName(sourceName).split(' ').filter((token) => token.length > 2);
  return BUK_CONCEPT_CATALOG
    .map((concept) => {
      const targetTokens = normalizeSourceName(concept.name).split(' ');
      const score = sourceTokens.filter((token) => targetTokens.includes(token)).length;
      return { concept, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.concept.name.localeCompare(right.concept.name))
    .slice(0, 5)
    .map(({ concept }) => concept);
}

function sumApprovedDetails(row, decisions, predicate) {
  return decisions
    .filter(predicate)
    .reduce((total, decision) => total + parseAmount(row[decision.sourceKey]), 0);
}

function sumFields(row, fields) {
  return fields.reduce((total, field) => total + parseAmount(row[field]), 0);
}

function resolveBukOverdraftBalance(row) {
  // Talana's Sobregiro is a liquidation detail and is exported as a haber.
  // BUK's Saldo Sobregiro is only the remaining negative balance, which is
  // zero when the source liquid is already zero or positive.
  const sourceLiquid = parseAmount(row['Sueldo Liquido A Pago']);
  return Math.max(0, -sourceLiquid);
}

function consolidateTalanaEmployeeRows(sourceRows) {
  const groupedRows = new Map();

  sourceRows
    .filter((row) => isValidRut(row['Rut del Trabajador']))
    .forEach((row) => {
      const rut = cleanCell(row['Rut del Trabajador']).replace(/\./g, '');
      const rows = groupedRows.get(rut) ?? [];
      rows.push(row);
      groupedRows.set(rut, rows);
    });

  return [...groupedRows.values()].map((rows) => {
    const primaryRow = rows[0];
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    const consolidatedRow = { ...primaryRow };

    keys.forEach((key) => {
      if (TALANA_IDENTITY_HEADERS.has(key)) {
        return;
      }

      const numericValues = rows.map((row) => parseAmount(row[key]));
      if (numericValues.some((value) => value !== 0) || rows.some((row) => cleanCell(row[key]) !== '')) {
        consolidatedRow[key] = numericValues.reduce((total, value) => total + value, 0);
      }
    });

    return consolidatedRow;
  });
}

function normalizeTalanaEmployeeId(value) {
  const normalized = cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
  return isValidRut(normalized) ? normalized : '';
}

function appendSheet(workbook, sheetName, headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...(rows ?? [])]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function normalizeSourceName(value) {
  return normalizeText(stripDuplicateSuffix(value));
}

function stripDuplicateSuffix(value) {
  return cleanCell(value).replace(/_\d+$/, '');
}

function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const rawValue = cleanCell(value);
  if (!rawValue || rawValue === '-') {
    return 0;
  }

  const normalized = rawValue.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').replace(/\s+/g, '');
  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : 0;
}

function isValidRut(value) {
  return /^\d{6,9}-[\dkK]$/.test(cleanCell(value).replace(/\./g, ''));
}
