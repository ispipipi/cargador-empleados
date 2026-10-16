import * as XLSX from 'xlsx/xlsx.mjs';
import { cleanCell, normalizeText } from './utils.js';
import { decryptWorkbook } from './workbookCrypto.js';

export const MONTHLY_URL_SCOPES = [
  { id: 'finning', label: 'Finning' },
  { id: 'fruticola', label: 'Frutícola' },
  { id: 'ola-1', label: 'Ola 1' },
  { id: 'enaco', label: 'Enaco' },
  { id: 'consorcio', label: 'Consorcio' },
  { id: 'patria', label: 'Patria' },
];

export const MONTHLY_DETAIL_HEADERS = [
  'Plantilla',
  'Contrato',
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

const CONTRACTUAL_MONTHLY_CONCEPTS = new Set([
  'sueldo ganado',
  'sueldo base',
  'a f p',
  'afp',
  'salud',
]);

const OLA_ONE_MONTHLY_VARIABLES = new Set([
  'aguinaldo',
  'colacion',
  'movilizacion',
]);

const SUMITOMO_MONTHLY_VARIABLES = new Set([
  'horas extras normales al 50',
  'colacion mes',
  'apv t',
]);

const SUMITOMO_CONCEPT_ALIASES = new Map([
  ['horas extras normales al 50', { targetId: 'horasEx50', targetName: 'Horas Extras 50%' }],
  ['colacion mes', { targetId: 'colacion', targetName: 'Colacion' }],
]);

const UNILODE_CONCEPT_ALIASES = new Map([
  ['bono back up grua elevadora', { targetId: 'bonoBackUpGruaElevad', targetName: 'Bono Back Up Grua Elevadora' }],
  ['cuota sindical', { targetId: 'cuotaSindical', targetName: 'Cuota Sindical' }],
  ['prestamo empresa', { targetId: 'prestamoEmpresa', targetName: 'Prestamo Empresa' }],
  ['horas extras normales al 50', { targetId: 'horasEx50', targetName: 'Horas Extras 50%' }],
  ['horas extras al 100', { targetId: 'horasEx100', targetName: 'Horas Extras 100%' }],
  ['horas no trabajadas', { targetId: 'minatrasos', targetName: 'Min Atrasos' }],
  ['asignacion telefono', { targetId: 'asigtelefono', targetName: 'ASIGNACIÓN TELÉFONO' }],
  ['colacion mes', { targetId: 'colacion', targetName: 'Colacion' }],
  ['movilizacion', { targetId: 'movilizacion', targetName: 'Movilizacion' }],
  ['ret jud utm', { targetId: 'retencionJudicial', targetName: 'Retencion Judicial' }],
  ['prestamo ccaf los andes', { targetId: 'cajaCred', targetName: 'Creditos personales CCAF' }],
  ['full ahorro ccaf los andes', { targetId: 'cajaAhor', targetName: 'Ahorro en CCAF' }],
]);

const GREENVIC_CONCEPT_ALIASES = new Map([
  ['apv t', { targetId: 'apvi', targetName: 'APV' }],
  ['colacion mes', { targetId: 'colacion', targetName: 'Colacion' }],
  ['movilizacion', { targetId: 'movilizacion', targetName: 'Movilizacion' }],
  ['seguro ccaf los andes', { targetId: 'cajaSegu', targetName: 'Seguro en CCAF' }],
  ['prestamo ccaf los andes', { targetId: 'cajaCred', targetName: 'Crédito en CCAF' }],
  ['anticipo de sueldo', { targetId: 'anticipo', targetName: 'Anticipo' }],
  ['ahorro cuenta 2', { targetId: 'cajaAhor', targetName: 'Ahorro Cuenta 2' }],
  ['descto varios bienestar', { targetId: 'descuentosVarios', targetName: 'Descuentos Varios' }],
  ['fundacion arturo lopez', { targetId: 'fundacionArturoLopez', targetName: 'FUNDACION ARTURO LOPEZ' }],
  ['otros descuentos', { targetId: 'descuentosVarios', targetName: 'Descuentos Varios' }],
  ['descuento telefonico', { targetId: 'descuentosVarios', targetName: 'Descuentos Varios' }],
  ['seguro salud metlife', { targetId: 'seguromet', targetName: 'Seguro Salud MetLife' }],
  ['prestamo empresa', { targetId: 'prestamoEmpresa', targetName: 'Préstamo Empresa' }],
]);

const GREENVIC_EXCLUDED_CONCEPTS = new Set([
  'anticipo gratificacion',
  'a f p',
  'salud',
  'adicional salud',
  'seguro de cesantia',
  'impuesto unico',
]);

const EMPLOYER_MONTHLY_CONCEPT_PATTERNS = [
  /^sis aporte empleador$/,
  /^(?:\* )?ley sanna$/,
  /^aporte patronal mutual$/,
  /^fdo solidario/,
  /^prov\b/,
  /^aporte isl mutual$/,
  /^afp cap ind/,
  /^ss expect/,
  /^ss rent protegida$/,
];

const SOURCE_METADATA_HEADERS = new Set([
  'periodo', 'empleado', 'apellidoynombre', 'rut', 'fechadealta', 'fechadebaja',
  'afp', 'isapre', 'idcentrodecosto', 'nombrec.costo', 'categoria', 'tipodeempleado',
  'departamento', 'diastrabajados', 'sueldo', 'planuf', 'totalhaberes',
  'totaldescuentos', 'liquido', 'tributable', 'imponibletopeado',
]);

export async function parseMonthlyConceptMatrix(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array' });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }),
  }));
  const mappingSheet = sheets.map((sheet) => ({
    ...sheet,
    headerIndex: sheet.rows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('nombreconceptovisma')
        && headers.includes('nombreconceptorex')
        && headers.includes('idconceptorex');
    }),
  })).find((sheet) => sheet.headerIndex >= 0);

  if (mappingSheet) return parseMonthlyConceptMapping(mappingSheet);

  const sheet = sheets.find(({ rows }) => rows.some((row) => (
    normalizeHeader(row[0]) === 'concepto'
    && normalizeHeader(row[1]) === 'nombre'
    && normalizeHeader(row[5]) === 'idcarga'
  )));

  if (!sheet) {
    throw new Error('El archivo debe contener el mapeo Visma → REX+ o las columnas de matriz Concepto, Nombre e ID-CARGA.');
  }

  const headerIndex = sheet.rows.findIndex((row) => (
    normalizeHeader(row[0]) === 'concepto'
    && normalizeHeader(row[1]) === 'nombre'
    && normalizeHeader(row[5]) === 'idcarga'
  ));
  const attributeRow = sheet.rows[Math.max(0, headerIndex - 1)] ?? [];
  const attributeHeaders = attributeRow.map(normalizeHeader);
  const institutionRequiredIndex = attributeHeaders.indexOf('sedebeagregarunainstitucion');
  const concepts = sheet.rows.slice(headerIndex + 1)
    .map((row) => ({
      sourceCode: normalizeCode(row[0]),
      sourceName: cleanCell(row[1]),
      classification: cleanCell(row[2]),
      formulation: cleanCell(row[3]),
      lreName: cleanCell(row[4]),
      targetId: cleanCell(row[5]),
      targetName: cleanCell(row[6]),
      institutionRequired: institutionRequiredIndex >= 0
        && normalizeText(row[institutionRequiredIndex]) === 'si',
      createdStatus: cleanCell(row[22]),
    }))
    .filter((concept) => concept.sourceName);

  if (!concepts.length) {
    throw new Error('La matriz no contiene conceptos para mapear.');
  }

  return { concepts, fileName: sheet.name };
}

function parseMonthlyConceptMapping(sheet) {
  const headers = sheet.rows[sheet.headerIndex].map(normalizeHeader);
  const sourceIndex = headers.indexOf('nombreconceptovisma');
  const targetNameIndex = headers.indexOf('nombreconceptorex');
  const targetIdIndex = headers.indexOf('idconceptorex');
  const similarityIndex = headers.indexOf('similitud');
  const grouped = new Map();

  sheet.rows.slice(sheet.headerIndex + 1).forEach((row) => {
    const sourceName = cleanCell(row[sourceIndex]);
    if (!sourceName) return;

    const rawTargetId = cleanCell(row[targetIdIndex]);
    const rawTargetName = cleanCell(row[targetNameIndex]);
    const noMatch = normalizeConceptName(rawTargetId) === 'sin coincidencia'
      || normalizeConceptName(rawTargetName) === 'sin coincidencia';
    const similarity = parseSimilarity(row[similarityIndex]);
    const entry = {
      sourceCode: '',
      sourceName,
      classification: '',
      formulation: '',
      lreName: noMatch ? '' : rawTargetName,
      targetId: noMatch ? '' : rawTargetId,
      targetName: noMatch ? '' : rawTargetName,
      institutionRequired: false,
      createdStatus: '',
      similarity,
      mappingSource: true,
      mappingConflict: false,
    };
    const key = normalizeConceptName(sourceName);
    const entries = grouped.get(key) ?? [];
    entries.push(entry);
    grouped.set(key, entries);
  });

  const concepts = [...grouped.values()].map((entries) => {
    const usable = entries.filter((entry) => entry.targetId);
    const distinctTargets = new Set(usable.map((entry) => normalizeText(entry.targetId)));
    const best = [...(usable.length ? usable : entries)]
      .sort((left, right) => right.similarity - left.similarity)[0];
    return {
      ...best,
      targetId: distinctTargets.size > 1 ? '' : best.targetId,
      targetName: distinctTargets.size > 1 ? '' : best.targetName,
      lreName: distinctTargets.size > 1 ? 'Mapeo duplicado con destinos distintos' : best.lreName,
      mappingConflict: distinctTargets.size > 1,
    };
  });

  if (!concepts.length) throw new Error('El mapeo no contiene conceptos Visma.');
  return { concepts, fileName: sheet.name, format: 'visma-rex-mapping' };
}

export async function parseMonthlyDetailTemplate(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array' });
  const matchingSheet = workbook.SheetNames
    .map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }) }))
    .flatMap(({ name, rows }) => rows.map((row, rowIndex) => ({ name, row, rowIndex })))
    .find(({ row }) => normalizeHeader(row[0]) === 'plantilla');

  if (!matchingSheet) {
    throw new Error('El template no contiene el encabezado "Plantilla".');
  }

  const headers = matchingSheet.row.slice(0, MONTHLY_DETAIL_HEADERS.length).map(cleanCell);
  const expected = MONTHLY_DETAIL_HEADERS.map(normalizeHeader);
  const actual = headers.map(normalizeHeader);
  const differs = expected.findIndex((header, index) => header !== actual[index]);

  if (headers.length !== MONTHLY_DETAIL_HEADERS.length || differs >= 0) {
    const column = differs >= 0 ? differs + 1 : headers.length + 1;
    const expectedHeader = MONTHLY_DETAIL_HEADERS[column - 1] ?? 'ninguna';
    throw new Error(`El template no conserva las 16 columnas en orden. Revisa la columna ${column}; se esperaba "${expectedHeader}".`);
  }

  return { headers, sheetName: matchingSheet.name, rowIndex: matchingSheet.rowIndex };
}

export async function parseMonthlyVismaBook(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array', cellDates: true });
  let parsedSheet;

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
    const headerIndex = rows.findIndex((row) => {
      const headers = new Set(row.map(normalizeHeader));
      return headers.has('rut') && headers.has('periodo') && headers.has('apellidoynombre');
    });
    if (headerIndex < 0) continue;

    parsedSheet = { sheetName, rows, headerIndex };
    break;
  }

  if (!parsedSheet) {
    throw new Error('No encontré una hoja con las columnas Período, Apellido y Nombre y RUT.');
  }

  const headers = makeUniqueHeaders(parsedSheet.rows[parsedSheet.headerIndex]);
  const headerIndexes = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const rutIndex = headerIndexes.get('rut');
  const nameIndex = headerIndexes.get('apellidoynombre');
  const periodIndex = headerIndexes.get('periodo');
  const rows = parsedSheet.rows.slice(parsedSheet.headerIndex + 1)
    .map((rawRow, offset) => ({
      raw: rawRow,
      sourceRow: parsedSheet.headerIndex + offset + 2,
      rut: normalizeRut(rawRow[rutIndex]),
      employeeName: cleanCell(rawRow[nameIndex]),
      period: rawRow[periodIndex],
    }))
    .filter((row) => row.rut && row.employeeName);

  if (!rows.length) {
    throw new Error('La hoja del libro no contiene trabajadores con RUT y nombre.');
  }

  const conceptColumns = headers
    .map((header, index) => ({ header, index, normalizedHeader: normalizeHeader(header) }))
    .filter(({ header }) => !SOURCE_METADATA_HEADERS.has(normalizeText(header).replace(/\s+/g, '')))
    .map((column) => ({
      ...column,
      nonZeroCount: rows.filter((row) => {
        const amount = parseMonthlyAmount(row.raw[column.index]);
        return amount !== null && amount !== 0;
      }).length,
      invalidRows: rows.filter((row) => {
        const value = row.raw[column.index];
        return cleanCell(value) && parseMonthlyAmount(value) === null;
      }).map((row) => row.sourceRow),
    }))
    .filter((column) => column.nonZeroCount > 0 || column.invalidRows.length > 0);

  const duplicateRutGroups = findDuplicateRuts(rows);
  const period = derivePeriod(rows.map((row) => row.period).find(Boolean));
  const sourceRows = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row.raw[index]])));

  return {
    fileName: '',
    sheetName: parsedSheet.sheetName,
    headers,
    rows: sourceRows,
    rowNumbers: rows.map((row) => row.sourceRow),
    workerCount: new Set(rows.map((row) => normalizeEmployeeKey(row.rut))).size,
    period,
    conceptColumns,
    duplicateRutGroups,
  };
}

export function excludeMonthlyFiniquitoRows(source, company = '') {
  if (!source || !normalizeConceptName(company).includes('greenvic')) return source;

  const rutHeader = source.headers.find((header) => normalizeHeader(header) === 'rut');
  const terminationHeader = source.headers.find((header) => normalizeHeader(header) === 'fechadebaja');
  const finiquitoConcepts = new Set([
    'indemnizacionvoluntaria',
    'vacacionesproporcionales',
    'anticipofiniquito',
    'impuestoindemafecta',
  ]);
  const finiquitoHeaders = source.headers.filter((header) => finiquitoConcepts.has(normalizeHeader(header)));
  if (!rutHeader || !terminationHeader || !finiquitoHeaders.length) return source;

  const rowsWithNumbers = source.rows.map((row, index) => ({
    row,
    sourceRow: source.rowNumbers[index] ?? index + 1,
  }));
  const isFiniquitoRow = ({ row }) => (
    hasDateValue(row[terminationHeader])
    && finiquitoHeaders.some((header) => isNonZeroMonthlyAmount(row[header]))
  );
  const excludedRows = rowsWithNumbers.filter(isFiniquitoRow);
  if (!excludedRows.length) return source;

  const excludedSourceRows = new Set(excludedRows.map(({ sourceRow }) => sourceRow));
  const includedRows = rowsWithNumbers.filter(({ sourceRow }) => !excludedSourceRows.has(sourceRow));
  const conceptColumns = source.conceptColumns
    .map((column) => ({
      ...column,
      nonZeroCount: includedRows.filter(({ row }) => isNonZeroMonthlyAmount(row[column.header])).length,
      invalidRows: includedRows.filter(({ row }) => (
        cleanCell(row[column.header]) && parseMonthlyAmount(row[column.header]) === null
      )).map(({ sourceRow }) => sourceRow),
    }))
    .filter((column) => column.nonZeroCount > 0 || column.invalidRows.length > 0);
  const duplicateRutGroups = findDuplicateRuts(includedRows.map(({ row, sourceRow }) => ({
    rut: row[rutHeader],
    sourceRow,
  })));

  return {
    ...source,
    rows: includedRows.map(({ row }) => row),
    rowNumbers: includedRows.map(({ sourceRow }) => sourceRow),
    workerCount: new Set(includedRows.map(({ row }) => normalizeEmployeeKey(row[rutHeader]))).size,
    conceptColumns,
    duplicateRutGroups,
    excludedFiniquitoRows: (source.excludedFiniquitoRows ?? 0) + excludedRows.length,
  };
}

export function buildMonthlyConceptDecisions({ sourceConcepts = [], matrixConcepts = [], catalog = [], scope = 'ola-1', company = '' }) {
  const matrixByName = new Map(matrixConcepts.map((concept) => [normalizeConceptName(concept.sourceName), concept]));
  const catalogById = new Map(catalog.map((concept) => [normalizeText(concept.id), concept]));

  return sourceConcepts.map((source, index) => {
    const matrixEntry = matrixByName.get(normalizeConceptName(source.header));
    const companyAlias = getCompanyConceptAlias(source.header, company, matrixConcepts);
    const matrixConcept = companyAlias
      ? {
        ...matrixEntry,
        ...companyAlias,
        classification: matrixEntry?.classification || companyAlias.classification,
        formulation: matrixEntry?.formulation || companyAlias.formulation,
        institutionRequired: matrixEntry?.institutionRequired ?? companyAlias.institutionRequired,
      }
      : matrixEntry;
    const matrixTarget = matrixConcept?.targetId ? catalogById.get(normalizeText(matrixConcept.targetId)) : null;
    const targetId = matrixConcept?.targetId ?? '';
    const targetName = matrixConcept?.targetName || matrixTarget?.name || '';
    const targetExistsInCatalog = !catalog.length || !targetId || Boolean(matrixTarget) || Boolean(matrixConcept?.companyAlias);
    const mappingNeedsReview = Boolean(matrixConcept?.mappingSource)
      && (matrixConcept.similarity < 100 || matrixConcept.mappingConflict);
    const approved = Boolean(targetId && targetExistsInCatalog && !mappingNeedsReview);
    const loadability = classifyMonthlyConcept(source.header, matrixConcept, scope, company);

    return {
      id: `${index + 1}-${normalizeConceptName(source.header)}`,
      sourceKey: source.header,
      sourceName: cleanCell(source.header),
      sourceCode: matrixConcept?.sourceCode ?? '',
      sourceColumn: source.index,
      nonZeroCount: source.nonZeroCount,
      invalidRows: source.invalidRows ?? [],
      matrixConcept,
      targetId,
      targetName,
      targetConcept: matrixTarget,
      suggestedMatches: getMonthlyConceptSuggestions(source.header, catalog),
      approved,
      excluded: false,
      action: approved ? 'reuse' : 'pending',
      matchStatus: approved ? (matrixConcept?.mappingSource ? 'mapping' : 'matrix') : matrixConcept ? 'pending' : 'unmapped',
      institutionRequired: Boolean(matrixConcept?.institutionRequired),
      classification: matrixConcept?.classification ?? '',
      formulation: matrixConcept?.formulation ?? '',
      lreName: matrixConcept?.lreName ?? '',
      similarity: matrixConcept?.similarity,
      mappingSource: Boolean(matrixConcept?.mappingSource),
      mappingConflict: Boolean(matrixConcept?.mappingConflict),
      loadable: loadability.loadable,
      exclusionReason: loadability.reason,
      selected: loadability.loadable,
    };
  });
}

export function validateMonthlyConceptLoad({ source, decisions, employeeCatalog, template }) {
  const employeeMap = new Map((employeeCatalog ?? []).map((employee) => [normalizeEmployeeKey(employee.id), employee]));
  const sourceWorkerIds = new Set((source?.rows ?? []).map((row) => normalizeEmployeeKey(row.RUT ?? row.rut)));
  const missingEmployees = [...sourceWorkerIds]
    .filter((id) => !employeeMap.has(id))
    .map((id) => ({ id, name: findEmployeeName(source.rows, id), reason: 'No aparece en el maestro REX+.' }));
  const missingContracts = [...sourceWorkerIds]
    .filter((id) => employeeMap.has(id) && !cleanCell(employeeMap.get(id)?.contract))
    .map((id) => ({ id, name: findEmployeeName(source.rows, id), reason: 'No tiene contratoActi.' }));
  const invalidRuts = [...sourceWorkerIds]
    .filter((id) => !/^\d{6,9}[0-9K]$/i.test(id))
    .map((id) => ({ id, reason: 'RUT vacío o con formato inválido en el libro.' }));
  const selectedConcepts = (decisions ?? []).filter((decision) => decision.loadable && decision.selected && !decision.excluded);
  const pendingConcepts = selectedConcepts.filter((decision) => !decision.approved || !decision.targetId);
  const invalidAmountConcepts = selectedConcepts.filter((decision) => decision.invalidRows?.length);
  const institutionIssues = findMonthlyInstitutionIssues(source, selectedConcepts, employeeMap);
  const duplicateRutGroups = source?.duplicateRutGroups ?? [];
  const issues = [
    ...missingEmployees,
    ...missingContracts,
    ...invalidRuts,
    ...pendingConcepts.map((decision) => ({ id: decision.sourceName, reason: 'Concepto sin ID REX+ confirmado.' })),
    ...invalidAmountConcepts.map((decision) => ({ id: decision.sourceName, reason: `Monto no numérico en fila(s) ${decision.invalidRows.join(', ')}.` })),
    ...institutionIssues,
    ...duplicateRutGroups.map((group) => ({ id: group.id, reason: `RUT repetido en filas ${group.rows.join(', ')}.` })),
  ];

  if (!template) issues.unshift({ id: 'template', reason: 'Carga un template de Conceptos Detalle válido.' });
  if (!source) issues.unshift({ id: 'libro', reason: 'Carga el libro mensual de Visma.' });
  if (!employeeCatalog?.length) issues.unshift({ id: 'maestro', reason: 'Carga el maestro REX+ con empleado y contratoActi.' });
  if (decisions?.length && !selectedConcepts.length) issues.unshift({ id: 'conceptos', reason: 'Selecciona al menos una variable para incluir.' });

  return {
    canDownload: Boolean(source && template && employeeCatalog?.length && decisions?.length && issues.length === 0),
    issues,
    workerCount: sourceWorkerIds.size,
    conceptCount: selectedConcepts.length,
    detailCount: selectedConcepts.reduce((count, decision) => count + decision.nonZeroCount, 0),
  };
}

export function buildMonthlyConceptCsv({ source, decisions, employeeCatalog, templateHeaders = MONTHLY_DETAIL_HEADERS, scope = 'ola-1' }) {
  const validation = validateMonthlyConceptLoad({ source, decisions, employeeCatalog, template: templateHeaders });
  if (!validation.canDownload) {
    throw new Error('Resuelve todas las validaciones antes de generar el CSV.');
  }

  const employeeMap = new Map(employeeCatalog.map((employee) => [normalizeEmployeeKey(employee.id), employee]));
  const rows = [];
  const approvedConcepts = decisions.filter((decision) => (
    decision.loadable && decision.selected && decision.approved && !decision.excluded && decision.targetId
  ));

  source.rows.forEach((sourceRow) => {
    const employee = employeeMap.get(normalizeEmployeeKey(sourceRow.RUT ?? sourceRow.rut));
    if (!employee) return;

    approvedConcepts.forEach((decision) => {
      const amount = parseMonthlyAmount(sourceRow[decision.sourceKey]);
      if (amount === null || amount === 0) return;
      rows.push([
        normalizeRut(sourceRow.RUT ?? sourceRow.rut),
        cleanCell(employee.contract),
        cleanCell(decision.targetId),
        amount,
        'M',
        '',
        'M',
        '',
        '',
        getMonthlyInstitutionId(decision.targetId, employee),
        '',
        '',
        '',
        normalizeMonthlyCostCenter(sourceRow['Id Centro de Costo'] ?? sourceRow['Id Centro de Costo '] ?? ''),
        'C',
        'No',
      ]);
    });
  });

  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([templateHeaders, ...rows]), {
    FS: ';',
    RS: '\r\n',
    blankrows: false,
  });

  return { csv: `\uFEFF${csv}`, rows, fileName: buildMonthlyConceptFileName(source.period, scope) };
}

export function buildMonthlyConceptFileName(period = '', scope = 'ola-1') {
  const safePeriod = /^\d{4}-\d{2}$/.test(period) ? period : 'periodo-pendiente';
  const safeScope = MONTHLY_URL_SCOPES.some((item) => item.id === scope) ? scope : 'ola-1';
  return `REX_conceptos_detalle_${safeScope}_${safePeriod}.csv`;
}

export function getMonthlyConceptSuggestions(sourceName, catalog = []) {
  const tokens = normalizeConceptName(sourceName).split(' ').filter(Boolean);
  if (!tokens.length) return [];

  return catalog
    .map((concept) => ({ concept, score: scoreConcept(tokens, normalizeConceptName(`${concept.id} ${concept.name}`)) }))
    .filter(({ score }) => score >= 0.3)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ concept }) => concept);
}

export function normalizeEmployeeKey(value) {
  return cleanCell(value).replace(/[.\s-]/g, '').toUpperCase();
}

export function parseMonthlyAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date || value === null || value === undefined || !cleanCell(value)) return null;

  const raw = cleanCell(value)
    .replace(/\$/g, '')
    .replace(/\s+/g, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, '')
      : raw;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function findDuplicateRuts(rows) {
  const occurrences = new Map();
  rows.forEach((row) => {
    const key = normalizeEmployeeKey(row.rut);
    const entry = occurrences.get(key) ?? { id: row.rut, rows: [] };
    entry.rows.push(row.sourceRow);
    occurrences.set(key, entry);
  });
  return [...occurrences.values()].filter((entry) => entry.rows.length > 1);
}

function findEmployeeName(rows, employeeKey) {
  const match = rows.find((row) => normalizeEmployeeKey(row.RUT ?? row.rut) === employeeKey);
  return cleanCell(match?.['Apellido y Nombre'] ?? match?.employeeName);
}

function makeUniqueHeaders(values = []) {
  const seen = new Map();
  return values.map((value, index) => {
    const header = cleanCell(value) || `Columna ${index + 1}`;
    const occurrence = seen.get(header) ?? 0;
    seen.set(header, occurrence + 1);
    return occurrence ? `${header} [${occurrence + 1}]` : header;
  });
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function normalizeConceptName(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return cleanCell(value);
}

function parseSimilarity(value) {
  const parsed = parseMonthlyAmount(cleanCell(value).replace(/%/g, ''));
  return parsed === null ? 0 : Math.max(0, Math.min(100, parsed));
}

function hasDateValue(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const text = cleanCell(value);
  return Boolean(text && !/^0+(?:[.,]0+)?$/.test(text) && !/^[-–—]$/.test(text));
}

function isNonZeroMonthlyAmount(value) {
  const amount = parseMonthlyAmount(value);
  return amount !== null && amount !== 0;
}

function findMonthlyInstitutionIssues(source, decisions, employeeMap) {
  return decisions.flatMap((decision) => {
    if (!decision.institutionRequired) return [];
    const missingCount = (source?.rows ?? []).filter((row) => {
      const amount = parseMonthlyAmount(row[decision.sourceKey]);
      if (amount === null || amount === 0) return false;
      const employee = employeeMap.get(normalizeEmployeeKey(row.RUT ?? row.rut));
      return employee && !getMonthlyInstitutionId(decision.targetId, employee);
    }).length;

    return missingCount
      ? [{ id: decision.sourceName, reason: `Falta el ID de institución para ${missingCount} trabajador(es).` }]
      : [];
  });
}

function getMonthlyInstitutionId(targetId, employee) {
  const normalizedId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');
  if (['cajaahor', 'cajacred', 'cajasegu'].includes(normalizedId)) return 'losandes';
  if (normalizedId === 'seguromet') return '121';
  if (['apvuf', 'apvi'].includes(normalizedId)) return cleanCell(employee?.afp);
  return '';
}

function classifyMonthlyConcept(sourceName, matrixConcept, scope, company) {
  const normalizedSource = normalizeConceptName(sourceName);
  const normalizedCompany = normalizeConceptName(company);
  const normalizedClassification = normalizeConceptName(matrixConcept?.classification);
  const normalizedFormulation = normalizeConceptName(matrixConcept?.formulation);
  if (normalizedCompany.includes('greenvic') && GREENVIC_EXCLUDED_CONCEPTS.has(normalizedSource)) {
    return { loadable: false, reason: 'Concepto contractual, legal o excluido para la carga mensual de GREENVIC.' };
  }
  if (scope === 'ola-1' && normalizedCompany === 'rauda') {
    const isVariable = OLA_ONE_MONTHLY_VARIABLES.has(normalizedSource);
    return isVariable
      ? { loadable: true, reason: '' }
      : { loadable: false, reason: 'No es una variable habilitada para la carga mensual de Rauda.' };
  }
  if (scope === 'ola-1' && normalizedCompany.startsWith('sumitomo')) {
    const isVariable = SUMITOMO_MONTHLY_VARIABLES.has(normalizedSource);
    return isVariable
      ? { loadable: true, reason: '' }
      : { loadable: false, reason: 'No es una variable habilitada para la carga mensual de Sumitomo.' };
  }

  const isContractual = CONTRACTUAL_MONTHLY_CONCEPTS.has(normalizedSource);
  if (isContractual) {
    return { loadable: false, reason: 'Concepto contractual; no se informa como variable mensual.' };
  }

  if (normalizedClassification.includes('descuento legal')
    || normalizedClassification === 'impuesto'
    || normalizedFormulation === 'formula legal') {
    return { loadable: false, reason: 'Concepto legal o calculado por fórmula; no se carga como variable mensual.' };
  }

  const isEmployerContribution = normalizedClassification.includes('contribuciones empleador')
    || EMPLOYER_MONTHLY_CONCEPT_PATTERNS.some((pattern) => pattern.test(normalizedSource));
  if (isEmployerContribution) {
    return { loadable: false, reason: 'Aporte patronal o provisión; no es haber ni descuento del trabajador.' };
  }

  return { loadable: true, reason: '' };
}

function getCompanyConceptAlias(sourceName, company, matrixConcepts) {
  const normalizedCompany = normalizeConceptName(company);
  const companyAliases = normalizedCompany.startsWith('sumitomo')
    ? SUMITOMO_CONCEPT_ALIASES
    : normalizedCompany.includes('unilode')
      ? UNILODE_CONCEPT_ALIASES
      : normalizedCompany.includes('greenvic') ? GREENVIC_CONCEPT_ALIASES : null;
  if (!companyAliases) return null;
  const alias = companyAliases.get(normalizeConceptName(sourceName));
  if (!alias) return null;
  const catalogEntry = matrixConcepts.find((concept) => normalizeText(concept.targetId) === normalizeText(alias.targetId));
  return {
    sourceName: cleanCell(sourceName),
    targetId: alias.targetId,
    targetName: catalogEntry?.targetName || alias.targetName,
    lreName: catalogEntry?.lreName || alias.targetName,
    classification: catalogEntry?.classification || '',
    formulation: catalogEntry?.formulation || '',
    institutionRequired: Boolean(catalogEntry?.institutionRequired),
    similarity: 100,
    mappingSource: false,
    mappingConflict: false,
    companyAlias: true,
  };
}

function normalizeRut(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}

function normalizeMonthlyCostCenter(value) {
  const center = cleanCell(value);
  return /^[-–—]$/.test(center) ? '' : center;
}

function derivePeriod(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  const text = cleanCell(value);
  const iso = text.match(/(20\d{2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const chile = text.match(/(\d{1,2})[-/]((?:20)?\d{2})/);
  if (chile) {
    const year = chile[2].length === 2 ? `20${chile[2]}` : chile[2];
    return `${year}-${chile[1].padStart(2, '0')}`;
  }
  return '';
}

function scoreConcept(sourceTokens, targetName) {
  const targetTokens = targetName.split(' ').filter(Boolean);
  const overlap = sourceTokens.filter((token) => targetTokens.includes(token)).length / sourceTokens.length;
  const source = sourceTokens.join('');
  const target = targetTokens.join('');
  return Math.min(1, overlap * 0.7 + (target.includes(source) || source.includes(target) ? 0.3 : 0));
}
