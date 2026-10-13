import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';
import { decryptWorkbook } from './workbookCrypto';

export async function parseVismaHistoricalEmployeeMaster(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array' });
  const sheet = workbook.SheetNames
    .map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }) }))
    .find(({ rows }) => rows.some((row) => {
      const headers = new Set(row.map(normalizeText));
      return headers.has('empleado') && headers.has('contratoacti');
    }));

  if (!sheet) {
    throw new Error('El maestro debe incluir las columnas empleado y contratoActi.');
  }

  const headerIndex = sheet.rows.findIndex((row) => {
    const headers = new Set(row.map(normalizeText));
    return headers.has('empleado') && headers.has('contratoacti');
  });
  const headers = sheet.rows[headerIndex].map(normalizeText);
  const employeeIndex = headers.indexOf('empleado');
  const contractIndex = headers.indexOf('contratoacti');
  const nameIndex = headers.indexOf('nombre completo');
  const statusIndex = headers.indexOf('estado');
  const employees = new Map();
  let missingContractCount = 0;

  sheet.rows.slice(headerIndex + 1).forEach((row) => {
    const id = cleanCell(row[employeeIndex]);
    const contract = cleanCell(row[contractIndex]);
    const key = normalizeEmployeeKey(id);
    if (!key) {
      return;
    }
    if (!contract) {
      missingContractCount += 1;
      return;
    }

    const current = employees.get(key);
    if (current && current.contract !== contract) {
      throw new Error('El maestro tiene más de un contratoActi para un mismo trabajador. Corrige el maestro antes de continuar.');
    }

    employees.set(key, {
      id: normalizeEmployeeId(id),
      name: cleanCell(row[nameIndex]),
      contract,
      status: cleanCell(row[statusIndex]),
    });
  });

  if (missingContractCount > 0) {
    throw new Error(`El maestro tiene ${missingContractCount.toLocaleString('es-CL')} filas sin contratoActi.`);
  }
  if (!employees.size) {
    throw new Error('No se encontraron trabajadores con contratoActi en el maestro.');
  }

  return [...employees.values()];
}

function normalizeEmployeeKey(value) {
  return cleanCell(value).replace(/[.\s-]/g, '').toUpperCase();
}

function normalizeEmployeeId(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}
