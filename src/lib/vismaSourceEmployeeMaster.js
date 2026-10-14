import * as XLSX from 'xlsx/xlsx.mjs';
import { cleanCell, normalizeText } from './utils.js';
import { decryptWorkbook } from './workbookCrypto.js';

const FIELD_ALIASES = {
  employeeCode: ['empleado', 'sap code', 'codigo empleado'],
  id: ['rut', 'run', 'ci', 'numero documento'],
  fullName: ['nombre completo', 'nombre y apellido', 'nombre'],
  birthDate: ['fec nac', 'fecha nac', 'fecha nacimiento', 'fecha de nacimiento'],
  nationality: ['nacionalidad'],
  sex: ['sexo'],
  address: ['direccion', 'direccion particular'],
  bank: ['banco'],
  accountNumber: ['nro cuenta', 'numero cuenta', 'cuenta bancaria'],
  startDate: ['fec alta', 'fecha alta', 'fecha de alta', 'fecha ingreso', 'fecha de ingreso'],
  endDate: ['fecha baja', 'fecha de baja', 'fecha termino', 'fecha de termino'],
  health: ['institucion de salud', 'institucion salud', 'isapre'],
  healthPlan: ['plan isapre', 'plan salud'],
  email: ['correo electronico', 'email', 'correo'],
  afp: ['afp'],
  contractType: ['c trab', 'tipo contrato', 'tipo de contrato'],
  costCenter: ['centro costo', 'centro de costo'],
  department: ['departamento'],
  position: ['puesto cargo', 'puesto', 'cargo', 'posicion'],
  salary: ['sueldo contrato', 'sueldo base', 'sueldo'],
};

export async function parseVismaSourceEmployeeMaster(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), {
    type: 'array',
    cellDates: true,
  });
  const parsedRows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const firstSheetRow = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1').s.r + 1;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });
    const headerIndex = rows.findIndex((row) => findHeaderIndex(row, 'id') >= 0 && findHeaderIndex(row, 'fullName') >= 0);
    if (headerIndex < 0) return [];

    const headerIndexes = Object.fromEntries(Object.keys(FIELD_ALIASES).map((key) => [key, findHeaderIndex(rows[headerIndex], key)]));
    return rows.slice(headerIndex + 1).map((row, index) => {
      const employee = Object.fromEntries(Object.entries(headerIndexes).map(([key, columnIndex]) => [
        key,
        columnIndex >= 0 ? row[columnIndex] : '',
      ]));
      const id = normalizeEmployeeId(employee.id);
      if (!id) return null;
      const fullName = cleanCell(employee.fullName);
      return {
        ...employee,
        id,
        employeeCode: cleanCell(employee.employeeCode),
        fullName,
        nameParts: splitVismaMasterName(fullName),
        sourceSheet: sheetName,
        sourceRow: firstSheetRow + headerIndex + index + 1,
      };
    }).filter(Boolean);
  });

  if (!parsedRows.length) {
    throw new Error('No se encontró una tabla con columnas RUT y Nombre Completo en el maestro VISMA.');
  }

  return parsedRows;
}

function findHeaderIndex(row, field) {
  const aliases = FIELD_ALIASES[field].map(normalizeHeader);
  return row.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeEmployeeId(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}

function splitVismaMasterName(value) {
  const rawName = cleanCell(value);
  if (rawName.includes(',')) {
    const [surnames = '', givenNames = ''] = rawName.split(/\s*,\s*/, 2);
    const surnameParts = surnames.split(/\s+/).filter(Boolean);
    return {
      firstName: givenNames.split(/\s+/).filter(Boolean)[0] ?? '',
      middleName: givenNames.split(/\s+/).filter(Boolean).slice(1).join(' '),
      lastName: surnameParts[0] ?? '',
      familyName: surnameParts.slice(1).join(' '),
    };
  }

  const parts = rawName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { firstName: parts[0] ?? '', middleName: '', lastName: '', familyName: '' };
  }

  return {
    firstName: parts.slice(0, -2).join(' ') || parts[0],
    middleName: '',
    lastName: parts.length > 2 ? parts.at(-2) : parts.at(-1),
    familyName: parts.length > 2 ? parts.at(-1) : '',
  };
}
