import * as XLSX from 'xlsx';
import { DETAIL_HEADERS } from './historicalConcepts';
import { cleanCell, normalizeText, sanitizeFilenameSegment } from './utils';

const PROXY_ENDPOINT = '/api/visma';
const VISMA_API_BASE_URL = String(import.meta.env.VITE_VISMA_API_BASE_URL ?? '').replace(/\/+$/, '');
export const vismaEmployeesEndpoint = VISMA_API_BASE_URL
  ? VISMA_API_BASE_URL
  : PROXY_ENDPOINT;
export const VISMA_REX_MAPPING_PROFILE_ID = 'VISMA_REX_BASE_V1';
export const VISMA_PAYROLL_PAGE_SIZE = 500;

export const VISMA_EMPLOYEE_HEADERS = [
  'ID EMPLEADO',
  'CI',
  'NOMBRE',
  'EMPRESA',
  'POSICION',
  'SEXO',
  'FECHA INGRESO',
  'ESTADO',
  'ESTADO CIVIL',
  'NACIONALIDAD',
  'CELULAR',
  'TELEFONO',
  'DIRECCION',
  'COMUNA',
  'UBICACION',
  'FORMA DE PAGO',
  'BANCO',
  'N° CTA CTE',
  'AFP',
  'ISAPRE',
  'MONTO SALUD UF',
  'SEGURO CESANTIA',
  'CENTRO COSTO',
  'UNIDAD DE NEGOCIOS',
  'SINDICATO',
  'FECHA NACIMIENTO',
  'NOMBRE CONTRATO',
  'FEC FIN CONTRATO',
  'SUELDO BASE',
  'HORAS JORNADA',
  'FECHA ANTIGUEDAD',
  'EMAIL',
];

async function postToVismaProxy(body) {
  const response = await fetch(vismaEmployeesEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    if (response.status === 405) {
      throw new Error(
        'La URL actual no tiene backend VISMA. En GitHub Pages debes configurar VITE_VISMA_API_BASE_URL con la Function desplegada.',
      );
    }

    throw new Error(payload?.message || 'No se pudo consultar VISMA.');
  }

  return payload;
}

export function fetchVismaConnectionContext({ tenantId } = {}) {
  return postToVismaProxy({
    action: 'connection-context',
    tenantId: cleanCell(tenantId),
  });
}

export function fetchVismaEmployeesPreview({ tenantId, companyId, companyTypeId, includeInactive = false }) {
  return postToVismaProxy({
    action: 'employees-preview',
    allEmployees: true,
    includeInactive: Boolean(includeInactive),
    tenantId: cleanCell(tenantId),
    companyId: cleanCell(companyId),
    companyTypeId: cleanCell(companyTypeId),
  });
}

export function fetchVismaPayrollProcessesPreview({ tenantId, year, month, periodId, pageSize = VISMA_PAYROLL_PAGE_SIZE }) {
  return postToVismaProxy({
    action: 'payroll-processes-preview',
    tenantId: cleanCell(tenantId),
    year: Number(year),
    month: Number(month),
    periodId: cleanCell(periodId),
    limit: Number(pageSize) || VISMA_PAYROLL_PAGE_SIZE,
  });
}

export function fetchVismaPayrollBookPreview({ tenantId, periodId, processId, printable = false, pageSize = VISMA_PAYROLL_PAGE_SIZE }) {
  return postToVismaProxy({
    action: 'payroll-book-preview',
    tenantId: cleanCell(tenantId),
    periodId: cleanCell(periodId),
    processId: cleanCell(processId),
    printable: Boolean(printable),
    limit: Number(pageSize) || VISMA_PAYROLL_PAGE_SIZE,
  });
}

export function buildVismaPayrollWorkbook({ book }) {
  const workbook = XLSX.utils.book_new();
  const { employees, definitions, rows, periodLabel, companyName, companyRut } = buildPayrollReportData(book);
  const dynamicDefinitions = definitions.map((definition) => definition.header);
  const mainHeaders = [
    'Período',
    'Empleado',
    'Apellido y Nombre',
    'RUT',
    'Fecha de Alta',
    'Fecha de Baja',
    'AFP',
    'Isapre',
    'Id Centro de Costo',
    'Nombre C. Costo',
    'Cargo',
    'Categoría',
    'Tipo de Empleado',
    'Departamento',
    'SAP',
    'Días Trabajados',
    'Sueldo',
    'Plan UF',
    ...dynamicDefinitions,
  ];
  const markerRow = mainHeaders.map((_, index) => (index >= 18 ? 'VISMA' : ''));
  const printableRow = mainHeaders.map((_, index) => {
    const definition = definitions[index - 18];
    return definition ? Boolean(definition.printable) : '';
  });
  const mainSheetRows = [
    [companyName],
    [`RUT:${companyRut}`],
    ['Libro de Remuneraciones', '', '', '', employees.length, employees.filter((employee) => employee.detail?.ESTADO === 'inactivo').length, employees.filter((employee) => employee.detail?.ESTADO !== 'inactivo').length],
    [`Periodo: ${periodLabel}`],
    markerRow,
    printableRow,
    mainHeaders,
    ...rows.map((row) => row.main),
  ];
  const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetRows);
  stylePayrollSheet(mainSheet, mainHeaders.length, 7, rows.length + 7, { metadataRows: 4 });
  XLSX.utils.book_append_sheet(workbook, mainSheet, buildPayrollSheetName(periodLabel, book?.period));

  const conceptDefinitions = definitions.filter((definition) => definition.kind === 'concept');
  const accumulatorDefinitions = definitions.filter((definition) => definition.kind === 'accumulator');
  appendPayrollAuxiliarySheet(workbook, 'Hoja 1', buildAuxiliarySheetRows(rows, conceptDefinitions, companyName, companyRut, book, periodLabel));
  appendPayrollAuxiliarySheet(workbook, 'Hoja 2', buildAuxiliarySheetRows(rows, accumulatorDefinitions, companyName, companyRut, book, periodLabel));
  return workbook;
}

export function buildVismaRexConceptDetailCsv({ book, conceptsResource }) {
  const { employees } = buildPayrollReportData(book);
  const employeeByKey = new Map();
  employees.forEach((employee) => {
    getPayrollEmployeeKeys(employee).forEach((key) => employeeByKey.set(key, employee));
  });

  const catalog = uniqueConceptCatalog([
    ...(conceptsResource?.concepts ?? []),
    ...(conceptsResource?.historicalConcepts ?? []),
  ]);
  const catalogByName = new Map();
  const catalogByCode = new Map();
  catalog.forEach((concept) => {
    const nameKey = payrollConceptKey(concept.name);
    const codeKey = payrollCodeKey(concept.lreCode);
    if (nameKey && !catalogByName.has(nameKey)) {
      catalogByName.set(nameKey, concept);
    }
    if (codeKey && !catalogByCode.has(codeKey)) {
      catalogByCode.set(codeKey, concept);
    }
  });

  const rows = [];
  const matchedConcepts = new Set();
  const pendingConcepts = new Map();
  const excludedConcepts = new Map();
  const missingEmployees = new Set();

  for (const sourceRow of book?.concepts ?? []) {
    const amount = payrollAmount(sourceRow.amount);
    if (amount === 0) {
      continue;
    }

    const concept = catalogByCode.get(payrollCodeKey(sourceRow.conceptCode))
      ?? catalogByName.get(payrollConceptKey(sourceRow.conceptName));
    const sourceLabel = cleanCell(sourceRow.conceptName || sourceRow.conceptCode || sourceRow.conceptId);

    if (!concept) {
      incrementCount(pendingConcepts, sourceLabel);
      continue;
    }

    if (normalizeText(concept.type) === 'dato') {
      incrementCount(excludedConcepts, sourceLabel);
      continue;
    }

    const employee = employeeByKey.get(payrollCodeKey(sourceRow.employeeId));
    if (!employee) {
      missingEmployees.add(payrollCodeKey(sourceRow.employeeId));
      continue;
    }

    matchedConcepts.add(concept.id);
    const row = Array(DETAIL_HEADERS.length).fill('');
    row[0] = cleanCell(employee.detail?.['ID EMPLEADO'] || employee.person.externalId || employee.person.employeeId || sourceRow.employeeId);
    row[1] = cleanCell(employee.detail?.NOMBRE || employee.person.fullName);
    row[2] = cleanCell(employee.detail?.['CONTRATO'] || '1');
    row[3] = cleanCell(employee.detail?.['NOMBRE CONTRATO'] || 'Contrato VISMA');
    row[4] = cleanCell(concept.id);
    row[5] = String(amount);
    row[6] = 'M';
    row[8] = 'M';
    row[11] = resolvePayrollInstitution(concept.id, employee.detail);
    row[16] = 'C';
    rows.push(row);
  }

  const sheet = XLSX.utils.aoa_to_sheet([DETAIL_HEADERS, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', RS: '\r\n', blankrows: false });

  return {
    csv: `\uFEFF${csv}`,
    summary: {
      rows: rows.length,
      matchedConcepts: matchedConcepts.size,
      pendingConcepts: [...pendingConcepts.entries()].map(([name, count]) => ({ name, count })),
      excludedConcepts: [...excludedConcepts.entries()].map(([name, count]) => ({ name, count })),
      missingEmployees: [...missingEmployees],
    },
  };
}

function buildPayrollReportData(book) {
  const definitions = buildPayrollColumnDefinitions(book);
  const valueMap = buildPayrollValueMap(book);
  const employees = (book?.employees ?? []).map((person) => {
    const detail = findPayrollEmployeeDetail(person, book?.employeeRows ?? []);
    const employee = { person, detail };
    employee.keys = getPayrollEmployeeKeys(employee);
    employee.lookupKey = employee.keys[0] || payrollCodeKey(person.employeeId);
    return employee;
  });
  const rows = employees.map((employee) => ({
    main: buildPayrollMainRow(employee, book, definitions, valueMap),
    auxiliary: buildPayrollAuxiliaryRow(employee, book, definitions, valueMap),
  }));
  const periodLabel = cleanCell(book?.period?.description || book?.periodId || 'Período VISMA');
  const firstDetail = employees.find((employee) => employee.detail)?.detail;

  return {
    employees,
    definitions,
    rows,
    periodLabel,
    companyName: cleanCell(book?.company?.name || firstDetail?.EMPRESA || book?.tenant?.name || book?.tenant?.id || 'Empresa VISMA'),
    companyRut: cleanCell(book?.company?.externalId || firstDetail?.['RUT EMPRESA'] || ''),
  };
}

function buildPayrollColumnDefinitions(book) {
  const definitions = [];
  const usedHeaders = new Set();
  const knownRows = new Set();
  const add = (kind, row) => {
    const id = cleanCell(kind === 'concept' ? row.conceptId : row.acumulatorId || row.accumulatorId);
    const name = cleanCell(kind === 'concept' ? row.conceptName : row.acumulatorName || row.accumulatorName) || `${kind === 'concept' ? 'Concepto' : 'Acumulador'} ${id}`;
    const rowKey = `${kind}|${id}|${name}`;
    if (knownRows.has(rowKey)) {
      return;
    }

    knownRows.add(rowKey);
    let header = name;
    if (usedHeaders.has(header)) {
      header = `${name} [${kind === 'concept' ? row.conceptCode || id : `ACUM ${id}`}]`;
    }
    while (usedHeaders.has(header)) {
      header = `${header}*`;
    }
    usedHeaders.add(header);
    definitions.push({
      kind,
      id,
      name,
      header,
      printable: kind === 'concept' ? row.printable === true : false,
    });
  };

  (book?.concepts ?? []).forEach((row) => add('concept', row));
  (book?.accumulators ?? []).forEach((row) => add('accumulator', row));
  return definitions;
}

function buildPayrollValueMap(book) {
  const values = new Map();
  const add = (kind, row) => {
    const id = cleanCell(kind === 'concept' ? row.conceptId : row.acumulatorId || row.accumulatorId);
    const employeeId = payrollCodeKey(row.employeeId);
    if (!id || !employeeId) {
      return;
    }
    const key = `${kind}|${id}|${employeeId}`;
    values.set(key, (values.get(key) || 0) + payrollAmount(row.amount));
  };
  (book?.concepts ?? []).forEach((row) => add('concept', row));
  (book?.accumulators ?? []).forEach((row) => add('accumulator', row));
  return values;
}

function buildPayrollMainRow(employee, book, definitions, valueMap) {
  const detail = employee.detail ?? {};
  const person = employee.person ?? {};
  const employeeId = employee.lookupKey;
  const daysWorked = findPayrollConceptAmount(book?.concepts, employeeId, [/dias?\s+trabajados/i, /dias?\s+del\s+mes/i]);
  const contractualSalary = findPayrollConceptAmount(book?.concepts, employeeId, [/sueldo\s+contractual/i, /sueldo\s+base/i, /sueldo\s+ganado/i]);
  return [
    excelDate(book?.period?.dateFrom),
    person.employeeId,
    cleanCell(detail.NOMBRE || person.fullName),
    cleanCell(detail.CI || person.documentNumber),
    excelDate(detail['FECHA INGRESO'] || person.hiringDate),
    excelDate(detail['FEC FIN CONTRATO']),
    cleanCell(detail.AFP),
    cleanCell(detail.ISAPRE),
    cleanCell(detail['CENTRO COSTO']),
    cleanCell(detail['NOMBRE CENTRO COSTO'] || detail['CENTRO COSTO']),
    cleanCell(detail.POSICION),
    cleanCell(detail['NOMBRE CONTRATO']),
    cleanCell(detail.ESTADO),
    cleanCell(detail['UNIDAD DE NEGOCIOS'] || detail.DEPARTAMENTO),
    cleanCell(detail.SAP || detail['ID EMPLEADO'] || person.externalId),
    daysWorked ?? 0,
    payrollAmount(detail['SUELDO BASE']) || contractualSalary || 0,
    payrollAmount(detail['MONTO SALUD UF']) || 0,
    ...definitions.map((definition) => valueMap.get(`${definition.kind}|${definition.id}|${employeeId}`) || 0),
  ];
}

function buildPayrollAuxiliaryRow(employee, book, definitions, valueMap) {
  const detail = employee.detail ?? {};
  const person = employee.person ?? {};
  const employeeId = employee.lookupKey;
  return [
    cleanCell(detail['EMPRESA ID'] || 1),
    cleanCell(detail.EMPRESA),
    cleanCell(detail['RUT EMPRESA']),
    cleanCell(book?.processId),
    cleanCell(detail.NOMBRE || person.fullName),
    cleanCell(detail.CI || person.documentNumber),
    cleanCell(detail.CONTRATO || '1'),
    cleanCell(detail.SEDE || detail.UBICACION),
    findPayrollConceptAmount(book?.concepts, employeeId, [/dias?\s+trabajados/i, /dias?\s+del\s+mes/i]) ?? 0,
    cleanCell(detail.POSICION),
    excelDate(detail['FECHA INGRESO'] || person.hiringDate),
    excelDate(detail['FEC FIN CONTRATO']),
    0,
    0,
    payrollAmount(detail['SUELDO BASE']) || findPayrollConceptAmount(book?.concepts, employeeId, [/sueldo\s+contractual/i, /sueldo\s+base/i]) || 0,
    ...definitions.map((definition) => valueMap.get(`${definition.kind}|${definition.id}|${employeeId}`) || 0),
  ];
}

function buildAuxiliarySheetRows(rows, definitions, companyName, companyRut, book, periodLabel) {
  const baseHeaders = ['Empresa', 'Nombre empresa', 'Rut empresa', 'Proceso', 'Nombre', 'Rut', 'Contrato', 'Sede', 'Días Trabajados', 'Cargo', 'Fecha Inicio', 'Fecha Término', 'Dias con Licencia Medica', 'Dias con Licencia por accidente', 'Sueldo Base'];
  const rowIndex = rows.map((row) => row.auxiliary);
  const header = [...baseHeaders, ...definitions.map((definition) => definition.header)];
  const sequence = [...Array(baseHeaders.length).fill(''), ...definitions.map((_, index) => index + 1)];
  return {
    metadata: [[companyName], [`RUT:${companyRut}`], [`Periodo: ${periodLabel}`], [`Proceso: ${book?.processId || ''}`]],
    sequence,
    header,
    rows: rowIndex,
  };
}

function appendPayrollAuxiliarySheet(workbook, name, data) {
  const sheetRows = [...data.metadata, data.sequence, data.header, ...data.rows];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const headerRowNumber = data.metadata.length + 2;
  stylePayrollSheet(sheet, data.header.length, headerRowNumber, data.rows.length + headerRowNumber, { metadataRows: data.metadata.length });
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function stylePayrollSheet(sheet, columnCount, headerRowNumber, lastRowNumber, { metadataRows }) {
  const lastColumn = XLSX.utils.encode_col(Math.max(0, columnCount - 1));
  const headerRange = `A${headerRowNumber}:${lastColumn}${lastRowNumber}`;
  sheet['!autofilter'] = { ref: headerRange };
  sheet['!freeze'] = { xSplit: 4, ySplit: headerRowNumber, topLeftCell: `E${headerRowNumber + 1}`, activePane: 'bottomRight', state: 'frozen' };
  sheet['!cols'] = Array.from({ length: columnCount }, (_, index) => ({ wch: index < 18 ? [12, 12, 30, 15, 13, 13, 15, 15, 18, 18, 28, 22, 16, 20, 16, 14, 14, 10][index] || 14 : 18 }));
  sheet['!rows'] = Array.from({ length: lastRowNumber }, (_, index) => ({ hpt: index < metadataRows ? 20 : 18 }));
  applyRangeStyle(sheet, `A${headerRowNumber}:${lastColumn}${headerRowNumber}`, {
    fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } },
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  });
  applyRangeStyle(sheet, `A1:${lastColumn}${Math.max(1, metadataRows)}`, {
    font: { bold: true, color: { rgb: '1F2937' } },
  });
  if (headerRowNumber > metadataRows) {
    applyRangeStyle(sheet, `A${headerRowNumber - 1}:${lastColumn}${headerRowNumber - 1}`, {
      fill: { patternType: 'solid', fgColor: { rgb: 'E5E7EB' } },
      font: { color: { rgb: '374151' } },
    });
  }
}

function applyRangeStyle(sheet, range, style) {
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (!sheet[address]) {
        sheet[address] = { v: '' };
      }
      sheet[address].s = style;
    }
  }
}

function findPayrollEmployeeDetail(person, employeeRows) {
  const keys = new Set([person.employeeId, person.externalId, person.documentNumber].map(payrollCodeKey).filter(Boolean));
  return employeeRows.find((row) => getPayrollEmployeeKeys({ person: { employeeId: row.__visma?.employeeId, externalId: row['ID EMPLEADO'], documentNumber: row.CI } }).some((key) => keys.has(key))) ?? null;
}

function getPayrollEmployeeKeys(employee) {
  const person = employee.person ?? employee;
  const detail = employee.detail ?? employee;
  return [
    person.employeeId,
    person.externalId,
    person.documentNumber,
    detail.__visma?.employeeId,
    detail['ID EMPLEADO'],
    detail.CI,
  ].map(payrollCodeKey).filter(Boolean);
}

function buildPayrollSheetName(periodLabel, period) {
  const year = cleanCell(period?.year) || cleanCell(periodLabel).match(/\b(20\d{2})\b/)?.[1];
  const month = cleanCell(period?.month) || cleanCell(periodLabel).match(/\b(\d{1,2})\b/)?.[1];
  return year && month ? `${year} ${String(month).padStart(2, '0')}_RG`.slice(0, 31) : 'Libro_RG';
}

function findPayrollConceptAmount(rows, employeeKey, patterns) {
  const row = (rows ?? []).find((candidate) => payrollCodeKey(candidate.employeeId) === employeeKey && patterns.some((pattern) => pattern.test(cleanCell(candidate.conceptName))));
  return row ? payrollAmount(row.amount) : null;
}

function payrollAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDate(value) {
  const raw = cleanCell(value);
  if (!raw) {
    return '';
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed;
}

function payrollCodeKey(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}

function payrollConceptKey(value) {
  return cleanCell(value)
    .replace(/^\*+\s*/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function uniqueConceptCatalog(concepts) {
  const seen = new Set();
  return concepts.filter((concept) => {
    const key = payrollCodeKey(concept.id);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolvePayrollInstitution(conceptId, detail) {
  const normalizedId = cleanCell(conceptId).toLowerCase();
  if (normalizedId.includes('isapre') || normalizedId === 'salud') {
    return cleanCell(detail?.ISAPRE);
  }
  if (normalizedId.includes('afp') || normalizedId === 'pension') {
    return cleanCell(detail?.AFP);
  }
  return '';
}

function incrementCount(map, value) {
  const key = cleanCell(value) || 'Sin nombre';
  map.set(key, (map.get(key) || 0) + 1);
}

export function fetchVismaOrganizationLists({ tenantId, companyId, companyTypeId }) {
  return postToVismaProxy({
    action: 'organization-lists-preview',
    tenantId: cleanCell(tenantId),
    companyId: cleanCell(companyId),
    companyTypeId: cleanCell(companyTypeId),
  });
}

export function buildVismaSourceFile(payload, metadata = {}) {
  const rows = Array.isArray(payload?.employees) ? payload.employees.map((row, index) => ({
    __sourceRowNumber: index + 2,
    ...row,
  })) : [];
  const company = metadata.company ?? {};
  const companyName = cleanCell(company.name || payload?.selectedCompanyName);
  const today = new Date().toISOString().slice(0, 10);

  return {
    fileName: `VISMA_API_${sanitizeFilenameSegment(companyName || 'empresa')}_${today}.json`,
    workbookName: 'VISMA API',
    tenantId: cleanCell(metadata.tenant?.id || payload?.selectedTenantId),
    companyId: cleanCell(company.id || payload?.selectedCompanyId),
    companyName,
    mappingProfile: payload?.mappingProfile ?? {
      id: VISMA_REX_MAPPING_PROFILE_ID,
      label: 'VISMA -> REX+ base',
      appliesTo: 'all-companies',
    },
    headers: VISMA_EMPLOYEE_HEADERS,
    rows,
    previewRows: rows.slice(0, 8).map((row) =>
      VISMA_EMPLOYEE_HEADERS.reduce((previewRow, header) => {
        previewRow[header] = cleanCell(row[header]);
        return previewRow;
      }, {}),
    ),
    period: '',
  };
}

export function summarizeVismaSourceFile(sourceFile, apiSummary) {
  const rows = sourceFile?.rows ?? [];

  return {
    totalAvailable: apiSummary?.totalAvailable ?? rows.length,
    returned: rows.length,
    withDocument: apiSummary?.withDocument ?? rows.filter((row) => cleanCell(row.CI)).length,
    withAddress: apiSummary?.withAddress ?? rows.filter((row) => cleanCell(row.DIRECCION) || cleanCell(row.COMUNA)).length,
    withBank: apiSummary?.withBank ?? rows.filter((row) => cleanCell(row.BANCO) || cleanCell(row['N° CTA CTE'])).length,
    withStructures: apiSummary?.withStructures ?? rows.filter((row) => Number(row.__visma?.structures) > 0).length,
    withEmail: apiSummary?.withEmail ?? rows.filter((row) => cleanCell(row.EMAIL)).length,
  };
}
