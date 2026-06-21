import * as XLSX from 'xlsx';
import { getTalanaMissingColumns } from '../connectors/origins/talana';
import { cleanCell } from '../lib/utils';

self.onmessage = (event) => {
  try {
    const { arrayBuffer } = event.data;
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      raw: false,
    });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(firstSheet, {
      defval: '',
      raw: false,
    });
    const headers = Object.keys(rows[0] ?? {}).map(cleanCell);
    const missingColumns = getTalanaMissingColumns(headers);
    const filteredRows = rows.filter((row) =>
      Object.values(row).some((value) => cleanCell(value)),
    );

    self.postMessage({
      ok: true,
      workbookName: firstSheetName,
      headers,
      missingColumns,
      rows: filteredRows,
      previewRows: filteredRows.slice(0, 3),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo leer el archivo.',
    });
  }
};
