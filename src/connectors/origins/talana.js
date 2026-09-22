import { cleanCell } from '../../lib/utils';

export const talanaOrigin = {
  id: 'talana',
  nombre: 'Talana',
  hojaDatos: 0,
  columnasClave: ['RUT', 'Nombre', 'Apellido Paterno', 'Apellido Materno', 'Fecha de Ingreso'],
  campos: {
    rut: 'RUT',
    apellidoPaterno: 'Apellido Paterno',
    apellidoMaterno: 'Apellido Materno',
    nombre: 'Nombre',
    sexo: 'Sexo',
    nacionalidad: 'Nacionalidad',
    fechaNacimiento: 'Fecha nacimiento',
    estadoCivil: 'Estado Civíl',
    calle: 'Calle',
    numero: 'Número',
    region: 'Región',
    comuna: 'Comuna',
    ciudad: 'Ciudad',
    celular: 'Celular',
    email: 'Email',
    emailPersonal: 'Email Personal',
    departamento: 'Departamento',
    fechaIngreso: 'Fecha de Ingreso',
    formaPago: 'Forma de Pago',
    banco: 'Sueldo - Banco',
    cuentaCorriente: 'Sueldo - Cuenta Corriente',
    afp: 'AFP',
    isapre: 'Isapre',
    monedaIsapre: 'Moneda Isapre',
    montoPactadoIsapre: 'Monto Pactado Isapre',
    antiguedad: 'Antigüedad',
    pensionado: '¿es pensionado?',
    tramoAsignacion: 'Tramo de Asignación Familiar',
    tipoFuero: 'Tipo de Fuero',
  },
};

export function getTalanaMissingColumns(headers) {
  const normalizedHeaders = headers.map(cleanCell);
  return talanaOrigin.columnasClave.filter((requiredColumn) => !normalizedHeaders.includes(requiredColumn));
}

export const talanaHistoricalOrigin = {
  id: 'talana-historico',
  nombre: 'Talana libro histórico',
  columnasClave: ['Año', 'Mes', 'Rut de la Empresa', 'Rut del Trabajador', 'Días Trabajados', 'Remuneración Total'],
};

export function getTalanaHistoricalMissingColumns(headers) {
  const normalizedHeaders = headers.map(cleanCell);
  return talanaHistoricalOrigin.columnasClave.filter((requiredColumn) => !normalizedHeaders.includes(requiredColumn));
}
