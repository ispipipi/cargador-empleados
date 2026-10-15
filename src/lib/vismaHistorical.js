import * as XLSX from 'xlsx/xlsx.mjs';
import { cleanCell, normalizeText } from './utils.js';
import { decryptWorkbook } from './workbookCrypto.js';
import { getVismaInstitutionKind, getVismaInstitutionMappingKey, resolveVismaInstitution } from './vismaInstitutions.js';
import { extractVismaHistoricalConceptColumns, isLegacyAutoExcludedVismaConcept } from './vismaHistoricalRules.js';
import { getVismaSourceValue } from './vismaSourceValues.js';

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
  'Parcial 7',
  'Parcial 8',
];
const LEGACY_LIQUIDATION_HEADERS = LIQUIDATION_HEADERS.slice(0, 18);
const LIQUIDO_HEADERS = new Set(['liquido', 'liquido a pago', 'sueldo liquido']);

const VISMA_TEMPLATE_PATH = `${import.meta.env?.BASE_URL ?? '/'}templates/rex-liquidaciones-detalle-template.xlsx`;
export const VISMA_CATALOG_SCOPES = [
  { id: 'ola-1', label: 'Ola 1' },
  { id: 'enaco', label: 'Enaco' },
  { id: 'consorcio', label: 'Consorcio' },
  { id: 'patria', label: 'Patria' },
  { id: 'fruticola', label: 'Frutícola' },
];
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
  return parseVismaHistoricalTemplate(arrayBuffer);
}

export async function parseVismaHistoricalTemplate(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array', cellDates: false });
  const sheetNames = {
    example: findSheetName(workbook, ['Ejemplo']),
    concepts: findSheetName(workbook, ['Concepto', 'Conceptos']),
    institutions: findSheetName(workbook, ['Instituciones', 'Institucion']),
    companies: findSheetName(workbook, ['Empresa', 'Empresas']),
    journeys: findSheetName(workbook, ['Jornada', 'Jornadas']),
  };
  const missingSheets = Object.entries(sheetNames).filter(([, sheetName]) => !sheetName).map(([key]) => key);
  if (missingSheets.length) {
    throw new Error(`El template de Liquidación Detalle no contiene las hojas requeridas: ${missingSheets.join(', ')}.`);
  }

  const exampleRows = readTwoColumnSheet(workbook, sheetNames.example);
  const headers = exampleRows[0]?.map(cleanCell) ?? [];
  const isCurrentFormat = matchesHeaders(headers, LIQUIDATION_HEADERS);
  const isLegacyFormat = matchesHeaders(headers, LEGACY_LIQUIDATION_HEADERS);
  if (!isCurrentFormat && !isLegacyFormat) {
    throw new Error('La hoja Ejemplo debe conservar el orden oficial de las 18 o 20 columnas de Liquidación Detalle.');
  }

  const companies = readCatalogSheet(workbook, sheetNames.companies);
  if (!companies.length) {
    throw new Error('La hoja Empresa del template no contiene empresas con ID. Carga un template REX+ con su catálogo de empresas.');
  }

  return {
    arrayBuffer,
    headers,
    conceptCatalog: readCatalogSheet(workbook, sheetNames.concepts),
    institutions: readCatalogSheet(workbook, sheetNames.institutions),
    companies,
    journeys: readCatalogSheet(workbook, sheetNames.journeys),
  };
}

export function buildVismaHistoricalModel({ sourceRows, sourceHeaders, resource, employeeCatalog = [] }) {
  const catalog = resource?.conceptCatalog ?? [];
  const conceptColumns = extractVismaHistoricalConceptColumns(sourceRows, sourceHeaders);
  const decisions = conceptColumns.map((column, index) => buildDecision(column, index, catalog));
  const employeeValidation = validateVismaHistoricalEmployees(sourceRows, employeeCatalog);

  return {
    decisions,
    catalog,
    sourceRows: sourceRows.length,
    sourceConcepts: decisions.length,
    employeeValidation,
  };
}

export function validateVismaHistoricalEmployees(sourceRows, employeeCatalog = []) {
  const employeeMap = new Map(employeeCatalog.map((employee) => [normalizeEmployeeKey(employee.id), employee]));
  const workers = new Map();

  sourceRows.forEach((row) => {
    const key = normalizeEmployeeKey(row.RUT);
    const workerKey = key || `${cleanCell(row.__sourceFileName)}:${cleanCell(row.__sourceRowNumber)}`;
    if (workers.has(workerKey)) return;
    const employee = employeeMap.get(key);
    const hasValidRut = /^\d{6,9}[0-9K]$/i.test(key);
    workers.set(workerKey, {
      id: cleanCell(row.RUT),
      name: getVismaSourceValue(row, 'Apellido y Nombre'),
      sourceFile: cleanCell(row.__sourceFileName),
      sourceRow: row.__sourceRowNumber ?? '',
      contract: employee?.contract ?? '',
      issue: !hasValidRut ? 'RUT vacío o con formato inválido.' : !employee ? 'No aparece en el maestro REX+.' : !employee.contract ? 'El maestro no tiene contratoActi.' : '',
    });
  });

  const allWorkers = [...workers.values()];
  const issues = allWorkers.filter((worker) => worker.issue);
  return {
    total: allWorkers.length,
    matched: allWorkers.length - issues.length,
    issues,
  };
}

export function getVismaHistoricalEmployeeIds({ sourceRows, decisions, employeeCatalog = [] }) {
  const employeeKeys = new Set(employeeCatalog.map((employee) => normalizeEmployeeKey(employee.id)));
  const approved = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);
  const ids = new Set();

  sourceRows.forEach((row) => {
    const key = normalizeEmployeeKey(row.RUT);
    if (!key || !employeeKeys.has(key)) return;
    if (approved.some((decision) => parseVismaAmount(row[decision.sourceKey]) !== 0 && parseVismaAmount(row[decision.sourceKey]) !== null)) {
      ids.add(cleanCell(row.RUT).replace(/[.\s]/g, '').toUpperCase());
    }
  });

  return [...ids];
}

export function validateVismaHistoricalNetPay({ sourceRows = [], employeeIds = null }) {
  const selectedEmployeeKeys = employeeIds ? new Set(employeeIds.map(normalizeEmployeeKey)) : null;
  const workers = new Map();

  sourceRows.forEach((sourceRow) => {
    const employeeKey = normalizeEmployeeKey(sourceRow.RUT);
    if (!employeeKey || (selectedEmployeeKeys && !selectedEmployeeKeys.has(employeeKey))) return;

    let worker = workers.get(employeeKey);
    if (!worker) {
      worker = {
        employeeId: cleanCell(sourceRow.RUT),
        employeeName: getVismaSourceValue(sourceRow, 'Apellido y Nombre'),
        sourceFile: cleanCell(sourceRow.__sourceFileName),
        sourceRow: sourceRow.__sourceRowNumber ?? '',
        found: false,
        amount: 0,
      };
      workers.set(employeeKey, worker);
    }

    const liquidEntry = Object.entries(sourceRow).find(([header, value]) => (
      LIQUIDO_HEADERS.has(normalizeText(stripDuplicateHeaderSuffix(header)))
      && parseVismaAmount(value) !== null
    ));
    if (!liquidEntry) return;

    worker.found = true;
    worker.amount += parseVismaAmount(liquidEntry[1]);
  });

  const issues = [...workers.values()]
    .filter((worker) => !worker.found)
    .map(({ found, amount, ...worker }) => ({
      ...worker,
      issue: 'No se encontró un valor de líquido para generar el concepto obligatorio totalesEmpl.',
    }));

  return { checked: workers.size, valid: issues.length === 0, issues };
}

export function validateVismaHistoricalInstitutions({ sourceRows, decisions, institutions = [], employeeCatalog = [], employeeIds = null, manualInstitutionMappings = {} }) {
  const employees = new Map(employeeCatalog.map((employee) => [normalizeEmployeeKey(employee.id), employee]));
  const selectedEmployeeKeys = employeeIds ? new Set(employeeIds.map(normalizeEmployeeKey)) : null;
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);
  const issues = [];
  const institutionsByEmployeeConcept = new Map();
  let checked = 0;

  approvedDecisions.forEach((decision) => {
    if (!getVismaInstitutionKind(decision.targetId)) return;

    sourceRows.forEach((sourceRow) => {
      const amount = parseVismaAmount(sourceRow[decision.sourceKey]);
      if (amount === null || amount === 0) return;

      const employeeKey = normalizeEmployeeKey(sourceRow.RUT);
      if (selectedEmployeeKeys && !selectedEmployeeKeys.has(employeeKey)) return;
      checked += 1;

      const resolution = resolveVismaInstitution(decision.targetId, sourceRow, institutions, manualInstitutionMappings);
      const employee = employees.get(employeeKey);
      const issueBase = {
        employeeId: cleanCell(sourceRow.RUT),
        employeeName: cleanCell(sourceRow['APELLIDO Y NOMBRE']) || cleanCell(employee?.name),
        conceptId: decision.targetId,
        conceptName: decision.targetName || decision.sourceName,
        sourceFile: cleanCell(sourceRow.__sourceFileName),
        sourceRow: sourceRow.__sourceRowNumber ?? '',
        rawInstitution: resolution.rawValue,
        institutionKind: getVismaInstitutionKind(decision.targetId),
        institutionMappingKey: getVismaInstitutionMappingKey(getVismaInstitutionKind(decision.targetId), resolution.rawValue),
        institutionMappingRequired: !resolution.id && Boolean(resolution.rawValue),
      };

      if (!resolution.id) {
        issues.push({ ...issueBase, issue: resolution.issue });
        return;
      }

      const rowKey = `${employeeKey}::${decision.targetId}`;
      const previousInstitutionId = institutionsByEmployeeConcept.get(rowKey);
      if (previousInstitutionId && previousInstitutionId !== resolution.id) {
        issues.push({
          ...issueBase,
          issue: `El mismo trabajador y concepto tienen instituciones distintas (${previousInstitutionId} y ${resolution.id}) en los libros cargados.`,
        });
        return;
      }
      institutionsByEmployeeConcept.set(rowKey, resolution.id);
    });
  });

  return { checked, valid: issues.length === 0, issues };
}

export function buildVismaHistoricalCsv({ sourceRows, decisions, period, resource, employeeCatalog = [], employeeIds = null, manualInstitutionMappings = {} }) {
  const rowsByKey = new Map();
  const companies = resource?.companies ?? [];
  const [company] = companies;
  if (!company?.id || companies.length !== 1) {
    throw new Error('Selecciona exactamente una empresa del template REX+ antes de generar el CSV.');
  }
  const companyId = company.id;
  const employeeMap = new Map(employeeCatalog.map((employee) => [normalizeEmployeeKey(employee.id), employee]));
  const selectedEmployeeKeys = employeeIds ? new Set(employeeIds.map(normalizeEmployeeKey)) : null;
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);

  approvedDecisions.forEach((decision) => {
    sourceRows.forEach((sourceRow) => {
      const employeeKey = normalizeEmployeeKey(sourceRow.RUT);
      const employee = employeeMap.get(employeeKey);
      if (!employeeKey) {
        throw new Error('Hay una fila de libro sin RUT; revisa el informe de diferencias antes de generar el CSV.');
      }
      if (selectedEmployeeKeys && !selectedEmployeeKeys.has(employeeKey)) return;
      if (!employee?.contract) {
        throw new Error('Hay trabajadores sin contratoActi válido en el maestro; no se puede generar el archivo con seguridad.');
      }

      const amount = parseVismaAmount(sourceRow[decision.sourceKey]);
      if (amount === null || amount === 0) {
        return;
      }

      const institution = resolveVismaInstitution(decision.targetId, sourceRow, resource?.institutions ?? [], manualInstitutionMappings);
      if (institution.issue) {
        const sourceRowLabel = sourceRow.__sourceRowNumber ? `, fila ${sourceRow.__sourceRowNumber}` : '';
        throw new Error(`No se puede generar la carga: ${institution.issue} RUT ${cleanCell(sourceRow.RUT)}${sourceRowLabel}.`);
      }

      const employeeId = normalizeEmployeeId(employee.id);
      const rowKey = `${employeeKey}::${decision.targetId}`;
      const current = rowsByKey.get(rowKey);
      if (current) {
        if (current[6] !== institution.id) {
          throw new Error(`No se puede consolidar ${decision.targetId} para el RUT ${cleanCell(sourceRow.RUT)}: los libros contienen instituciones distintas (${current[6] || 'vacío'} y ${institution.id || 'vacío'}).`);
        }
        current[4] = Number(current[4]) + amount;
        return;
      }

      rowsByKey.set(rowKey, [
        period || extractPeriodFromRow(sourceRow) || '',
        employeeId,
        employee.contract,
        decision.targetId,
        amount,
        0,
        institution.id,
        resolveVismaRetirementContributionRate(decision.targetId, sourceRow),
        0,
        parseDays(sourceRow['Días Trabajados']),
        'x',
        companyId,
        0,
        0,
        0,
        'C',
        0,
        0,
        0,
        0,
      ]);
    });
  });

  const netPayValidation = validateVismaHistoricalNetPay({ sourceRows, employeeIds });
  if (netPayValidation.issues.length) {
    throw new Error(`Falta el líquido de pago para ${netPayValidation.issues.length} trabajador(es); no se puede generar totalesEmpl.`);
  }

  const netPayByEmployee = new Map();
  sourceRows.forEach((sourceRow) => {
    const employeeKey = normalizeEmployeeKey(sourceRow.RUT);
    if (!employeeKey || (selectedEmployeeKeys && !selectedEmployeeKeys.has(employeeKey))) return;

    const liquidEntry = Object.entries(sourceRow).find(([header, value]) => (
      LIQUIDO_HEADERS.has(normalizeText(stripDuplicateHeaderSuffix(header)))
      && parseVismaAmount(value) !== null
    ));
    if (!liquidEntry) return;

    const employee = employeeMap.get(employeeKey);
    if (!employee?.contract) {
      throw new Error('Hay trabajadores sin contratoActi válido en el maestro; no se puede generar el archivo con seguridad.');
    }

    const existing = netPayByEmployee.get(employeeKey);
    if (existing) {
      existing.amount += parseVismaAmount(liquidEntry[1]);
      return;
    }
    netPayByEmployee.set(employeeKey, { sourceRow, employee, amount: parseVismaAmount(liquidEntry[1]) });
  });

  netPayByEmployee.forEach(({ sourceRow, employee, amount }, employeeKey) => {
    rowsByKey.set(`${employeeKey}::totalesempl`, [
      period || extractPeriodFromRow(sourceRow) || '',
      normalizeEmployeeId(employee.id),
      employee.contract,
      'totalesEmpl',
      amount,
      0,
      '',
      0,
      0,
      parseDays(sourceRow['Días Trabajados']),
      'x',
      companyId,
      0,
      0,
      0,
      'C',
      0,
      0,
      0,
      0,
    ]);
  });

  const headers = resource?.headers?.length === LIQUIDATION_HEADERS.length || resource?.headers?.length === LEGACY_LIQUIDATION_HEADERS.length
    ? resource.headers
    : LIQUIDATION_HEADERS;
  const outputRows = [...rowsByKey.values()].map((row) => row.slice(0, headers.length));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...outputRows]);
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', RS: '\r\n', blankrows: false });
  return `\uFEFF${csv}`;
}

function resolveVismaRetirementContributionRate(conceptId, sourceRow) {
  const normalizedId = normalizeText(conceptId).replace(/[^a-z0-9]+/g, '');
  const explicitRate = Object.entries(sourceRow ?? {}).find(([key]) => (
    /porcentaje.*afp|cotizacion.*afp.*%|afp coti/.test(normalizeText(key))
  ));
  const parsedRate = explicitRate ? parseVismaAmount(explicitRate[1]) : null;
  if (parsedRate !== null) return parsedRate;
  if (['afp', 'comisionafp', 'reliquidaafp'].includes(normalizedId)) return 10;
  return 0;
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
  const exact = column.isDuplicateHeader ? null : findExactConcept(sourceName, catalog);
  const suggestedMatches = findSuggestedMatches(sourceName, catalog);
  const target = exact ?? null;
  const restoreLegacyExclusion = isLegacyAutoExcludedVismaConcept(sourceName, target?.id);

  return {
    id: `${index + 1}-${column.sourceKey}`,
    sourceKey: column.sourceKey,
    sourceName,
    sourceColumn: column.sourceColumn,
    isDuplicateHeader: column.isDuplicateHeader,
    sourceSection: column.index >= 150 ? 'Descuento' : 'Haber',
    nonZeroCount: column.nonZeroCount,
    sampleValue: column.sampleValue,
    targetId: target?.id ?? '',
    targetName: target?.name ?? '',
    targetConcept: target,
    proposedId: buildProposedId(sourceName, index),
    suggestedMatches,
    matchStatus: target ? 'exact' : suggestedMatches.length ? 'proposal' : 'pending',
    action: target ? 'reuse' : 'pending',
    approved: Boolean(target),
    excluded: false,
    autoExcluded: false,
    ignoreLegacyStoredExclusion: restoreLegacyExclusion,
    exclusionReason: '',
  };
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

function normalizeEmployeeKey(value) {
  return normalizeEmployeeId(value).replace(/-/g, '');
}

function matchesHeaders(headers, expectedHeaders) {
  return expectedHeaders.every((header, index) => normalizeText(headers[index]) === normalizeText(header));
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

function findSheetName(workbook, candidates) {
  return workbook.SheetNames.find((sheetName) => candidates.some((candidate) => normalizeText(sheetName) === normalizeText(candidate))) ?? '';
}
