import * as XLSX from 'xlsx/xlsx.mjs';
import { cleanCell, normalizeText } from './utils.js';
import { decryptWorkbook } from './workbookCrypto.js';

export async function parseVismaHistoricalEmployeeMaster(arrayBuffer, password = '', fileName = '') {
  const isCsv = /\.csv$/i.test(fileName);
  const workbookData = isCsv
    ? new TextDecoder('utf-8').decode(arrayBuffer).replace(/^\uFEFF/, '')
    : await decryptWorkbook(arrayBuffer, password);
  const workbook = XLSX.read(workbookData, isCsv ? { type: 'string', FS: ';' } : { type: 'array' });
  const sheet = workbook.SheetNames
    .map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }) }))
    .find(({ rows }) => rows.some(isEmployeeMasterHeader));

  if (!sheet) {
    throw new Error('El maestro debe incluir Empleado y ContratoActi, o Id empleado y Número del contrato.');
  }

  const headerIndex = sheet.rows.findIndex(isEmployeeMasterHeader);
  const headers = sheet.rows[headerIndex].map(normalizeText);
  const employeeIndex = findHeaderIndex(headers, ['empleado', 'id empleado']);
  const contractIndex = findHeaderIndex(headers, ['contratoacti', 'numero del contrato']);
  const nameIndex = findHeaderIndex(headers, ['nombre completo', 'nombres']);
  const afpIndex = findHeaderIndex(headers, ['id afp', 'afp']);
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
      afp: cleanCell(row[afpIndex]),
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

function isEmployeeMasterHeader(row) {
  const headers = new Set(row.map(normalizeText));
  return (headers.has('empleado') && headers.has('contratoacti'))
    || (headers.has('id empleado') && headers.has('numero del contrato'));
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
}
