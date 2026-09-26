import * as XLSX from 'xlsx';
import { getMeta4HistoricalFormatIssues, getMeta4MissingColumns, meta4Origin } from '../connectors/origins/meta4';
import { extractVismaPeriod, getVismaHeaderRow, getVismaHistoricalFormatIssues } from '../connectors/origins/visma';
import { getTalanaFormatIssues, getTalanaHistoricalMissingColumns, getTalanaMissingColumns } from '../connectors/origins/talana';
import { cleanCell } from '../lib/utils';
import { Buffer } from 'buffer';
import process from 'process';

globalThis.Buffer = Buffer;
globalThis.process = process;

const workbookCryptoPromise = import('../lib/workbookCrypto');

self.onmessage = async (event) => {
  try {
    const { arrayBuffer, originId = 'talana', password = '' } = event.data;
    const { decryptWorkbook } = await workbookCryptoPromise;
    const readableArrayBuffer = await decryptWorkbook(arrayBuffer, password);
    const workbook = XLSX.read(readableArrayBuffer, {
      type: 'array',
      raw: false,
    });
    const parsedSource =
      originId === 'meta4'
        ? parseMeta4Workbook(workbook)
        : originId === 'meta4-historico'
          ? parseMeta4Workbook(workbook, { preserveDuplicateHeaders: true })
          : originId === 'visma-historico'
            ? parseVismaWorkbook(workbook)
          : originId === 'talana-historico'
            ? parseTalanaHistoricalWorkbook(workbook)
          : parseTalanaWorkbook(workbook);

    self.postMessage({
      ok: true,
      workbookName: parsedSource.workbookName,
      headers: parsedSource.headers,
      missingColumns: parsedSource.missingColumns,
      formatIssues: parsedSource.formatIssues,
      formatName: parsedSource.formatName,
      period: parsedSource.period ?? '',
      rows: parsedSource.rows,
      previewRows: parsedSource.rows.slice(0, 3),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error?.code || '',
      error: error instanceof Error ? error.message : 'No se pudo leer el archivo.',
    });
  }
};

function parseTalanaWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    defval: '',
    raw: false,
  });
  const headers = Object.keys(rows[0] ?? {}).map(cleanCell);
  const formatIssues = getTalanaFormatIssues(headers);
  const missingColumns = formatIssues.length > 0 ? [] : getTalanaMissingColumns(headers);
  const filteredRows = rows
    .filter((row) => Object.values(row).some((value) => cleanCell(value)))
    .map((row, index) => ({
      ...row,
      __sourceRowNumber: index + 2,
      __sheetName: firstSheetName,
    }));

  return {
    workbookName: firstSheetName,
    headers,
    missingColumns,
    formatIssues,
    formatName: 'Talana',
    rows: filteredRows,
  };
}

function parseTalanaHistoricalWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    defval: '',
    raw: false,
  });
  const headers = Object.keys(rows[0] ?? {}).map(cleanCell);
  const missingColumns = getTalanaHistoricalMissingColumns(headers);
  const filteredRows = rows
    .filter((row) => isTalanaHistoricalEmployeeRow(row))
    .map((row, index) => ({
      ...row,
      __sourceRowNumber: index + 2,
      __sheetName: firstSheetName,
    }));

  return {
    workbookName: firstSheetName,
    headers,
    missingColumns,
    formatIssues: [],
    formatName: 'Talana libro histórico',
    period: buildTalanaPeriod(rows[0]),
    rows: filteredRows,
  };
}

function isTalanaHistoricalEmployeeRow(row) {
  const rut = cleanCell(row['Rut del Trabajador']);
  return /^\d{6,9}-[\dkK]$/.test(rut.replace(/\./g, ''));
}

function buildTalanaPeriod(row) {
  const year = cleanCell(row?.Año);
  const month = cleanCell(row?.Mes);
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    return '';
  }

  return `${year}-${month.padStart(2, '0')}`;
}

function parseVismaWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  const headerRowIndex = getVismaHeaderRow(rows);
  const rawHeaders = (rows[headerRowIndex] ?? []).map(cleanCell);
  const headers = makeUniqueHeaders(rawHeaders);
  const missingColumns = getVismaHistoricalFormatIssues(rawHeaders);
  const identityColumnIndexes = ['RUT', 'EMPLEADO', 'APELLIDO Y NOMBRE']
    .map((header) => rawHeaders.indexOf(header))
    .filter((index) => index >= 0);
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .map((row, rowIndex) => ({ row, sourceRowNumber: headerRowIndex + rowIndex + 2 }))
    .filter(({ row }) => identityColumnIndexes.some((index) => cleanCell(row[index])))
    .map(({ row, sourceRowNumber }) => headers.reduce(
      (entry, header, headerIndex) => {
        if (!header) {
          return entry;
        }

        entry[header] = row[headerIndex] ?? '';
        return entry;
      },
      {
        __sourceRowNumber: sourceRowNumber,
        __sheetName: firstSheetName,
      },
    ));

  return {
    workbookName: firstSheetName,
    headers,
    missingColumns,
    formatIssues: [],
    formatName: 'Visma',
    period: extractVismaPeriod(rows, headerRowIndex),
    rows: dataRows,
  };
}

function parseMeta4Workbook(workbook, { preserveDuplicateHeaders = false } = {}) {
  const firstSheetName = workbook.SheetNames[meta4Origin.hojaDatos];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  const headerRowIndex = findMeta4HeaderRow(rows, preserveDuplicateHeaders);
  const rawHeaders = (rows[headerRowIndex] ?? []).map(cleanCell);
  const headers = preserveDuplicateHeaders ? makeUniqueHeaders(rawHeaders) : rawHeaders;
  const missingColumns = preserveDuplicateHeaders
    ? []
    : getMeta4MissingColumns(headers);
  const formatIssues = preserveDuplicateHeaders ? getMeta4HistoricalFormatIssues(headers) : [];
  const identityColumnIndexes = [
    'ID EMPLEADO',
    'CI',
    'NOMBRE',
    'EMPRESA',
    'POSICION',
    'JOB CODE',
    'UBICACION',
    'CENTRO COSTO',
    'ESTADO',
  ]
    .map((header) => headers.indexOf(header))
    .filter((index) => index >= 0);
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .map((row, rowIndex) => ({
      row,
      sourceRowNumber: headerRowIndex + rowIndex + 2,
    }))
    .filter(({ row }) => row.some((value) => cleanCell(value)))
    .filter(({ row }) => identityColumnIndexes.some((index) => cleanCell(row[index])))
    .map(({ row, sourceRowNumber }) =>
      headers.reduce(
        (entry, header, headerIndex) => {
          if (!header) {
            return entry;
          }

          entry[header] = row[headerIndex] ?? '';
          return entry;
        },
        {
          __sourceRowNumber: sourceRowNumber,
          __sheetName: firstSheetName,
        },
      ),
    );

  return {
    workbookName: firstSheetName,
    headers,
    missingColumns,
    formatIssues,
    formatName: preserveDuplicateHeaders ? 'Meta 4 Finning' : 'Meta 4',
    period: preserveDuplicateHeaders ? buildMeta4Period(rows, headerRowIndex, rawHeaders) : '',
    rows: dataRows,
  };
}

function buildMeta4Period(rows, headerRowIndex, headers) {
  for (let rowIndex = 0; rowIndex < headerRowIndex; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const dateColumn = row.findIndex((value) => cleanCell(value).toUpperCase() === 'FECHA PAGO');
    if (dateColumn < 0) {
      continue;
    }

    const value = row[dateColumn + 1];
    const period = parsePeriodValue(value);
    if (period) {
      return period;
    }
  }

  const sourceHeader = headers.find((header) => /SUELDO BASE ORIGINAL\d{2}\/\d{4}/i.test(header));
  const headerMatch = sourceHeader?.match(/(\d{2})\/(\d{4})/);
  return headerMatch ? `${headerMatch[2]}-${headerMatch[1]}` : '';
}

function parsePeriodValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }

  const rawValue = cleanCell(value);
  const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}`;
  }

  const isoMatch = rawValue.match(/^(\d{4})[/-](\d{1,2})/);
  return isoMatch ? `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}` : '';
}

function findMeta4HeaderRow(rows, preserveDuplicateHeaders) {
  const requiredColumns = preserveDuplicateHeaders
    ? ['NOMBRE', 'CI', 'ID EMPLEADO']
    : meta4Origin.columnasClave;
  const scanLimit = Math.min(rows.length, 20);
  let bestMatch = { index: -1, score: 0 };

  for (let index = 0; index < scanLimit; index += 1) {
    const rowHeaders = (rows[index] ?? []).map(cleanCell);
    const normalizedHeaders = new Set(rowHeaders);
    const score = requiredColumns.filter((column) => normalizedHeaders.has(column)).length;

    if (score > bestMatch.score) {
      bestMatch = { index, score };
    }
  }

  return bestMatch.index >= 0 ? bestMatch.index : meta4Origin.headerRowIndex;
}

function makeUniqueHeaders(headers) {
  const occurrences = new Map();

  return headers.map((header) => {
    if (!header) {
      return header;
    }

    const nextOccurrence = (occurrences.get(header) ?? 0) + 1;
    occurrences.set(header, nextOccurrence);
    return nextOccurrence === 1 ? header : `${header} [${nextOccurrence}]`;
  });
}
