import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVismaMissingEmployeeDraft } from '../src/lib/vismaEmployeeDraft.js';
import { getVismaSourceValue } from '../src/lib/vismaSourceValues.js';

test('lee encabezados Visma sin depender de mayúsculas ni tildes', () => {
  assert.equal(
    getVismaSourceValue({ 'Apellido y Nombre': 'Salgado Uribe, Bastian Nicolas' }, 'APELLIDO Y NOMBRE'),
    'Salgado Uribe, Bastian Nicolas',
  );
});

const employeeHeaders = [
  'Id empleado', 'Situación', 'Nombres', 'Apellido paterno', 'Apellido materno', 'Sexo',
  'Fecha de nacimiento', 'Id nación', 'Email personal', 'Id banco', 'Cuenta del banco',
  'Id AFP', 'Estado de jubilación', 'Sistema de pensiones', 'Id institución de salud',
  'Moneda de la cotización', 'Nombre del contrato', 'Tipo del contrato',
  'Fecha de inicio del contrato', 'Fecha de término del contrato', 'Sueldo base',
  'Cargo', 'Id centro de costo', 'Número del contrato', 'Id empresa',
];

test('prepara altas desde el maestro VISMA y deja fuera RUT ausentes o ambiguos', () => {
  const result = buildVismaMissingEmployeeDraft({
    issues: [
      { id: '11765260-2', issue: 'No aparece en el maestro REX+.' },
      { id: '22222222-2', issue: 'No aparece en el maestro REX+.' },
      { id: '33333333-3', issue: 'No aparece en el maestro REX+.' },
    ],
    sourceEmployeeMaster: [
      {
        id: '11765260-2',
        fullName: 'JORGE CRISTIAN MORA FUENTEALBA',
        nameParts: { firstName: 'JORGE CRISTIAN', middleName: '', lastName: 'MORA', familyName: 'FUENTEALBA' },
        birthDate: '30/08/1971',
        nationality: 'Chilena',
        sex: 'Masculino',
        email: 'jorge@example.cl',
        bank: 'BANCO DEL ESTADO',
        accountNumber: '11765260',
        afp: 'PROVIDA',
        health: 'FONASA',
        contractType: 'PLAZO FIJO',
        startDate: '01/09/2025',
        salary: 539000,
        position: 'OBRERO AGRICOLA',
        costCenter: '75MAWC',
      },
      { id: '33333333-3', fullName: 'PERSONA UNO', position: 'A' },
      { id: '33333333-3', fullName: 'PERSONA DOS', position: 'B' },
    ],
    templateResource: {
      employeeHeaders,
      catalogs: {
        'Id nación': [{ id: 'chile', name: 'Chile' }],
        'Id banco': [{ id: 'estado', name: 'Banco del Estado' }],
        'Id AFP': [{ id: 'provid', name: 'Provida' }],
        'Id institución de salud': [{ id: 'fonasa', name: 'FONASA' }],
        Cargo: [{ id: 'obrero_agricola', name: 'Obrero Agricola' }],
        'Id centro de costo': [{ id: '75MAWC', name: '75MAWC' }],
      },
    },
    companyId: '1',
  });

  assert.equal(result.rowEntries.length, 1);
  assert.equal(result.rowEntries[0]['Id empleado'], '11765260-2');
  assert.equal(result.rowEntries[0].Nombres, 'JORGE CRISTIAN');
  assert.equal(result.rowEntries[0]['Apellido paterno'], 'MORA');
  assert.equal(result.rowEntries[0]['Apellido materno'], 'FUENTEALBA');
  assert.equal(result.rowEntries[0]['Fecha de nacimiento'], '30/08/1971');
  assert.equal(result.rowEntries[0]['Fecha de inicio del contrato'], '01/09/2025');
  assert.equal(result.rowEntries[0]['Tipo del contrato'], 'F');
  assert.equal(result.rowEntries[0]['Sueldo base'], '539000');
  assert.equal(result.rowEntries[0]['Id nación'], 'chile');
  assert.equal(result.rowEntries[0]['Id empresa'], '1');
  assert.equal(result.skipped.length, 2);
  assert.match(result.skipped[0].reason, /no aparece/);
  assert.match(result.skipped[1].reason, /más de un registro/);
});

test('omite RUT inválidos y problemas del maestro de contratos', () => {
  const result = buildVismaMissingEmployeeDraft({
    issues: [
      { id: '11111111-1', issue: 'El maestro no tiene contratoActi.' },
      { id: 'bad-rut', issue: 'No aparece en el maestro REX+.' },
    ],
    sourceEmployeeMaster: [{ id: 'bad-rut', fullName: 'NO VALIDO' }],
    templateResource: { employeeHeaders: ['Id empleado'], catalogs: {} },
    companyId: '1',
  });

  assert.deepEqual(result.rowEntries, []);
  assert.deepEqual(result.skipped, [{ id: 'bad-rut', reason: 'RUT inválido.' }]);
});
