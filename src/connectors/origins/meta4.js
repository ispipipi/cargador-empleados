import { cleanCell } from '../../lib/utils';

export const meta4Origin = {
  id: 'meta4',
  nombre: 'Meta 4',
  hojaDatos: 0,
  headerRowIndex: 4,
  dataRowStartIndex: 5,
  columnasClave: [
    'ID EMPLEADO',
    'CI',
    'NOMBRE',
    'EMPRESA',
    'POSICION',
    'FECHA INGRESO',
    'ESTADO',
  ],
};

const HISTORICAL_REQUIRED_COLUMNS = ['NOMBRE', 'EMPRESA', 'POSICION', 'FECHA INGRESO', 'ESTADO'];
const HISTORICAL_PAYROLL_COLUMNS = ['TOTAL_HABERES', 'TOTAL_DESCUENTOS', 'LIQUIDO'];

export function getMeta4MissingColumns(headers) {
  const normalizedHeaders = headers.map(cleanCell);
  return meta4Origin.columnasClave.filter((requiredColumn) => !normalizedHeaders.includes(requiredColumn));
}

export function getMeta4HistoricalFormatIssues(headers) {
  const normalizedHeaders = headers.map(cleanCell);
  const issues = HISTORICAL_REQUIRED_COLUMNS
    .filter((requiredColumn) => !normalizedHeaders.includes(requiredColumn))
    .map((requiredColumn) => `Falta la columna obligatoria ${requiredColumn}.`);

  if (!normalizedHeaders.includes('CI') && !normalizedHeaders.includes('ID EMPLEADO')) {
    issues.push('Falta una columna de identificación: CI o ID EMPLEADO.');
  }

  const hasHistoricalPayrollStart = normalizedHeaders.some((header) => header.startsWith('SUELDO BASE ORIGINAL'));
  const hasPayrollTotals = HISTORICAL_PAYROLL_COLUMNS.some((column) => normalizedHeaders.includes(column));

  if (!hasHistoricalPayrollStart && !hasPayrollTotals) {
    issues.push('No se encontraron columnas de remuneraciones del libro Meta 4 (por ejemplo, SUELDO BASE ORIGINAL, TOTAL_HABERES, TOTAL_DESCUENTOS o LIQUIDO).');
  }

  return issues;
}
