import * as XLSX from 'xlsx';
import { getMeta4HistoricalFormatIssues, getMeta4MissingColumns, meta4Origin } from '../connectors/origins/meta4';
import { extractVismaPeriod, getVismaHeaderRow, getVismaHistoricalFormatIssues } from '../connectors/origins/visma';
import { getTalanaMissingColumns } from '../connectors/origins/talana';
import { cleanCell } from '../lib/utils';

self.onmessage = (event) => {
  try {
    const { arrayBuffer, originId = 'talana' } = event.data;
    const workbook = XLSX.read(arrayBuffer, {
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
  const missingColumns = getTalanaMissingColumns(headers);
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
    formatIssues: [],
    formatName: 'Talana',
    rows: filteredRows,
  };
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
    rows: dataRows,
  };
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
