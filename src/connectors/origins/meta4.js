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

export function getMeta4MissingColumns(headers) {
  const normalizedHeaders = headers.map(cleanCell);
  return meta4Origin.columnasClave.filter((requiredColumn) => !normalizedHeaders.includes(requiredColumn));
}
