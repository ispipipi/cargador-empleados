import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVismaEmployeeImportCsv,
  buildVismaMissingEmployeeDraft,
  REX_REQUIRED_EMPLOYEE_FIELDS,
} from '../src/lib/vismaEmployeeDraft.js';
import { getVismaSourceValue } from '../src/lib/vismaSourceValues.js';

test('lee encabezados Visma sin depender de mayúsculas ni tildes', () => {
  assert.equal(
    getVismaSourceValue({ 'Apellido y Nombre': 'Salgado Uribe, Bastian Nicolas' }, 'APELLIDO Y NOMBRE'),
    'Salgado Uribe, Bastian Nicolas',
  );
});

const employeeHeaders = [...REX_REQUIRED_EMPLOYEE_FIELDS, 'Apellido materno', 'Email institucional', 'Email personal', 'Id AFP', 'Cuenta del banco', '¿Jornada parcial?'];
const templateResource = {
  employeeHeaders,
  catalogs: {
    Comuna: [{ id: '13101', name: 'Santiago' }],
    Ciudad: [{ id: '13-gran_santiago', name: 'Gran Santiago' }],
    Region: [{ id: '13', name: 'Metropolitana' }],
    'Nivel de estudio': [{ id: '5', name: 'Postgraduado' }, { id: '0', name: 'Ninguno' }],
    'Id banco': [{ id: 'estado', name: 'Banco del Estado de Chile' }],
    'Id forma de pago': [{ id: 'actacorr', name: 'Abono en Cuenta Corriente' }],
    'Id institución de salud': [{ id: 'fonasa', name: 'FONASA' }],
    'Tipo del contrato': [{ id: 'I', name: 'Indefinido' }],
    Cargo: [{ id: 'obrero_agricola', name: 'Obrero Agricola' }],
    'Id centro de costo': [
      { id: '75MAWA', name: '75MAWA' },
      { id: '75MAWC', name: '75MAWC' },
      { id: '75MAWT', name: '75MAWT' },
    ],
    'Id sede donde se desempeña': [
      { id: '401', name: 'Sede 401' },
      { id: '701', name: 'Sede 701' },
      { id: '801', name: 'Sede 801' },
    ],
    'Id sindicato': [{ id: 'nosindicato', name: 'No sindicalizado' }],
    'Id empresa': [{ id: '1', name: 'Fruticola' }],
    'Id plantilla grupal': [{ id: 'GRUPO01', name: 'Grupo 01' }],
    'Agrupación de seguridad': [{ id: 'noagrupar', name: 'Sin agrupar' }],
    Área: [{ id: 'areadefault', name: 'Area por defecto' }],
    'Modalidad del contrato': [{ id: 'C', name: 'Con horario' }],
    'Categoría INE': [{ id: 'ine_nocal', name: 'No calificados' }],
    'Id Distribución Jornada': [{ id: '5', name: '5 días x semana' }],
    'Id AFP': [{ id: 'provid', name: 'Provida' }],
    'Id nación': [{ id: 'chile', name: 'Chile' }],
  },
};

const completeSourceEmployee = {
  id: '11765260-2',
  fullName: 'MORA FUENTEALBA, JORGE CRISTIAN',
  nameParts: { firstName: 'Jorge Cristian', middleName: '', lastName: 'Mora', familyName: 'Fuentealba' },
  birthDate: '30/08/1971',
  nationality: 'Chilena',
  sex: 'Masculino',
  phone: '+56912345678',
  comuna: '13101',
  city: '13-gran_santiago',
  region: '13',
  street: 'Avenida Central',
  streetNumber: '123',
  education: '5',
  email: 'jorge@example.cl',
  bank: 'BANCO DEL ESTADO',
  accountNumber: '123456',
  paymentMethod: 'Cuenta corriente',
  afp: 'PROVIDA',
  health: 'FONASA',
  contractType: 'INDEFINIDO',
  startDate: '01/09/2025',
  salary: 539000,
  position: 'OBRERO AGRICOLA',
  costCenter: '75MAWC',
  worksite: '401',
  union: 'nosindicato',
  weeklyHours: 42,
  workSchedule: '5',
  unemploymentInsurance: 'Sí',
  area: 'areadefault',
  contractModality: 'C',
  ineCategory: 'ine_nocal',
};

test('genera una alta completa con la plantilla, valida IDs y usa correlativo C', () => {
  const result = buildVismaMissingEmployeeDraft({
    issues: [{ id: '11765260-2', issue: 'No aparece en el maestro REX+.' }],
    sourceEmployeeMaster: [completeSourceEmployee],
    templateResource,
    companyId: '1',
  });

  assert.equal(result.rowEntries.length, 1);
  assert.equal(result.incomplete.length, 0);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.rowEntries[0]['Número del contrato'], 'C');
  assert.equal(result.rowEntries[0]['Id banco'], 'estado');
  assert.equal(result.rowEntries[0]['Id forma de pago'], 'actacorr');
  assert.equal(result.rowEntries[0]['Fecha de inicio de vacaciones'], '01/09/2025');
  assert.equal(result.rowEntries[0]['Id empresa'], '1');
  assert.equal(result.rowEntries[0]['¿Jornada parcial?'], 'N');

  const csv = buildVismaEmployeeImportCsv({ templateResource, rowEntries: result.rowEntries });
  assert.ok(csv.startsWith('\uFEFFId empleado;Nombres;'));
  assert.ok(csv.includes(';C;'));
  assert.ok(csv.includes('Jorge Cristian'));
  assert.ok(csv.includes(';Mora;'));
  assert.ok(csv.includes('Fuentealba'));
});

test('marca jornada completa solo cuando supera 30 horas semanales', () => {
  const employees = [
    { ...completeSourceEmployee, id: '11765260-2', weeklyHours: 30 },
    { ...completeSourceEmployee, id: '11765261-0', weeklyHours: 30.01 },
  ];
  const result = buildVismaMissingEmployeeDraft({
    issues: employees.map(({ id }) => ({ id, issue: 'No aparece en el maestro REX+.' })),
    sourceEmployeeMaster: employees,
    templateResource,
    companyId: '1',
  });

  assert.deepEqual(result.rowEntries.map((row) => row['¿Jornada parcial?']), ['S', 'N']);
});

test('aplica defaults seguros existentes y deja pendientes los datos que no puede inferir', () => {
  const result = buildVismaMissingEmployeeDraft({
    issues: [{ id: '11765260-2', issue: 'No aparece en el maestro REX+.' }],
    sourceEmployeeMaster: [{
      ...completeSourceEmployee,
      phone: '',
      city: '',
      region: '',
      street: '',
      streetNumber: '',
      education: '',
      workSchedule: '',
      contractModality: '',
      paymentMethod: '',
      union: '',
    }],
    templateResource,
    companyId: '1',
  });

  assert.equal(result.rowEntries.length, 1);
  assert.equal(result.rowEntries[0]['Numero de teléfono 1'], '+56999999999');
  assert.equal(result.rowEntries[0].Comuna, '13101');
  assert.equal(result.rowEntries[0].Ciudad, '13-gran_santiago');
  assert.equal(result.rowEntries[0].Region, '13');
  assert.equal(result.rowEntries[0]['Nombre Calle'], 'XXX');
  assert.equal(result.rowEntries[0]['Numero Calle'], '0');
  assert.equal(result.rowEntries[0]['Nivel de estudio'], '0');
  assert.equal(result.rowEntries[0]['Distribución de jornada'], '5');
  assert.equal(result.rowEntries[0]['Modalidad del contrato'], 'C');
  assert.equal(result.rowEntries[0]['Fecha de inicio de vacaciones'], '01/09/2025');
  assert.equal(result.incomplete.length, 1);
  assert.ok(result.incomplete[0].fields.includes('Id forma de pago'));
  assert.ok(result.incomplete[0].fields.includes('Id sindicato'));
  assert.ok(!result.incomplete[0].fields.includes('Comuna'));
  assert.ok(!result.incomplete[0].fields.includes('Nombre Calle'));
  assert.throws(
    () => buildVismaEmployeeImportCsv({ templateResource, rowEntries: result.rowEntries }),
    /campos obligatorios vacíos/,
  );
});

test('prepara las altas Frutícola con centro, sede, área, cargo y correo del maestro', () => {
  const employees = [
    { ...completeSourceEmployee, id: '19546030-2', fullName: 'BASTIAN NICOLAS SALGADO URIBE', position: 'OBRERO AGRICOLA', costCenter: '75MAWA', department: '801', worksite: '', area: '', email: 'Jeremyjesusborquezaguila@gmail.com' },
    { ...completeSourceEmployee, id: '22574110-7', fullName: 'MARTIN ANDRES ILLANES RAMIREZ', position: 'OBRERO AGRICOLA', costCenter: '75MAWC', department: '401', worksite: '', area: '', email: 'martin.illanes.15@gmail.com' },
    { ...completeSourceEmployee, id: '16697082-2', fullName: 'JESUS ALEJANDRO BORQUEZ VENEGAS', position: 'OBRERO AGRICOLA', costCenter: '75MAWT', department: '701', worksite: '', area: '', email: 'Jeremyjesusborquezaguila@gmail.com' },
  ];
  const result = buildVismaMissingEmployeeDraft({
    issues: employees.map(({ id }) => ({ id, issue: 'No aparece en el maestro REX+.' })),
    sourceEmployeeMaster: employees,
    templateResource,
    companyId: '1',
  });

  assert.equal(result.rowEntries.length, 3);
  assert.equal(result.incomplete.length, 0);
  assert.deepEqual(result.rowEntries.map((row) => row['Id centro de costo']), ['75MAWA', '75MAWC', '75MAWT']);
  assert.deepEqual(result.rowEntries.map((row) => row['Id sede donde se desempeña']), ['801', '401', '701']);
  assert.ok(result.rowEntries.every((row) => row['Área'] === 'areadefault'));
  assert.ok(result.rowEntries.every((row) => row.Cargo === 'obrero_agricola'));
  assert.ok(result.rowEntries.every((row) => row['Email institucional'] === row['Email personal']));
  assert.equal(result.rowEntries[0]['Email personal'], 'jeremyjesusborquezaguila@gmail.com');
  assert.equal(result.rowEntries[2]['Email personal'], 'jeremyjesusborquezaguila@gmail.com');
});

test('reporta IDs fuera del catálogo y la falta de encabezados oficiales', () => {
  const invalidTemplate = {
    ...templateResource,
    employeeHeaders: employeeHeaders.filter((header) => header !== 'Id empresa'),
  };
  const result = buildVismaMissingEmployeeDraft({
    issues: [{ id: '11765260-2', issue: 'No aparece en el maestro REX+.' }],
    sourceEmployeeMaster: [{ ...completeSourceEmployee, position: 'CARGO QUE NO EXISTE' }],
    templateResource: invalidTemplate,
    companyId: '1',
  });

  assert.ok(result.missingHeaders.includes('Id empresa'));
  assert.ok(result.incomplete[0].fields.includes('Cargo'));
});

test('bloquea un ID obligatorio si la plantilla no trae su catálogo', () => {
  const incompleteTemplate = {
    ...templateResource,
    catalogs: { ...templateResource.catalogs, 'Id sindicato': [] },
  };
  const result = buildVismaMissingEmployeeDraft({
    issues: [{ id: '11765260-2', issue: 'No aparece en el maestro REX+.' }],
    sourceEmployeeMaster: [completeSourceEmployee],
    templateResource: incompleteTemplate,
    companyId: '1',
  });

  assert.ok(result.incomplete[0].fields.includes('Id sindicato'));
});

test('omite RUT inválidos y conflictos de múltiples registros VISMA', () => {
  const result = buildVismaMissingEmployeeDraft({
    issues: [
      { id: 'bad-rut', issue: 'No aparece en el maestro REX+.' },
      { id: '33333333-3', issue: 'No aparece en el maestro REX+.' },
    ],
    sourceEmployeeMaster: [
      { ...completeSourceEmployee, id: 'bad-rut', fullName: 'PERSONA INVALIDA' },
      { ...completeSourceEmployee, id: '33333333-3', fullName: 'PERSONA UNO', position: 'A' },
      { ...completeSourceEmployee, id: '33333333-3', fullName: 'PERSONA DOS', position: 'B' },
    ],
    templateResource,
    companyId: '1',
  });

  assert.deepEqual(result.rowEntries, []);
  assert.match(result.skipped[0].reason, /RUT inválido/);
  assert.match(result.skipped[1].reason, /más de un registro/);
});
