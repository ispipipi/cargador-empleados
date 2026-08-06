import * as XLSX from 'xlsx';
import { getMeta4MissingColumns, meta4Origin } from '../connectors/origins/meta4';
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
          : parseTalanaWorkbook(workbook);

    self.postMessage({
      ok: true,
      workbookName: parsedSource.workbookName,
      headers: parsedSource.headers,
      missingColumns: parsedSource.missingColumns,
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
    rows: filteredRows,
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
  const rawHeaders = (rows[meta4Origin.headerRowIndex] ?? []).map(cleanCell);
  const headers = preserveDuplicateHeaders ? makeUniqueHeaders(rawHeaders) : rawHeaders;
  const missingColumns = getMeta4MissingColumns(headers);
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
    .slice(meta4Origin.dataRowStartIndex)
    .filter((row) => row.some((value) => cleanCell(value)))
    .filter((row) => identityColumnIndexes.some((index) => cleanCell(row[index])))
    .map((row, rowIndex) =>
      headers.reduce(
        (entry, header, headerIndex) => {
          if (!header) {
            return entry;
          }

          entry[header] = row[headerIndex] ?? '';
          return entry;
        },
        {
          __sourceRowNumber: meta4Origin.dataRowStartIndex + rowIndex + 1,
          __sheetName: firstSheetName,
        },
      ),
    );

  return {
    workbookName: firstSheetName,
    headers,
    missingColumns,
    rows: dataRows,
  };
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
