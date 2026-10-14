import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVismaMissingEmployeeDraft } from '../src/lib/vismaEmployeeDraft.js';
import { getVismaSourceValue } from '../src/lib/vismaSourceValues.js';

test('reads Visma headers regardless of capitalization and accents', () => {
  assert.equal(
    getVismaSourceValue({ 'Apellido y Nombre': 'Salgado Uribe, Bastian Nicolas' }, 'APELLIDO Y NOMBRE'),
    'Salgado Uribe, Bastian Nicolas',
  );
});

test('builds an official employee row from missing Visma employees and exact catalog matches', () => {
  const sourceRow = {
    RUT: '19546030-2',
    'Apellido y Nombre': 'SALGADO URIBE, BASTIAN NICOLAS',
    Estado: 'Activo',
    'Fecha de Ingreso': '2026-02-10',
    Sueldo: 539000,
    AFP: 'PLANVITAL',
    Isapre: 'FONASA',
    Cargo: 'OBRERO AGRICOLA',
    'Id Centro de Costo': 'X71105010',
    __sourceFileName: 'Libro febrero.xlsx',
    __sourceRowNumber: 18,
  };
  const templateResource = {
    employeeHeaders: [
      'Id empleado', 'Situación', 'Nombres', 'Apellido paterno', 'Apellido materno',
      'Fecha de inicio del contrato', 'Sueldo base', 'Id AFP', 'Id institución de salud',
      'Cargo', 'Id centro de costo', 'Id empresa',
    ],
    catalogs: {
      'Id AFP': [{ id: '12', name: 'PlanVital' }],
      'Id institución de salud': [{ id: '1', name: 'Fonasa' }],
      Cargo: [{ id: 'C7', name: 'Obrero Agricola' }],
      'Id centro de costo': [{ id: 'X71105010', name: 'Centro agrícola' }],
    },
  };
  const { rowEntries, skipped } = buildVismaMissingEmployeeDraft({
    issues: [{ id: '19546030-2', issue: 'No aparece en el maestro REX+.', sourceFile: 'Libro febrero.xlsx', sourceRow: 18 }],
    sourceRows: [sourceRow],
    templateResource,
    companyId: '1',
  });

  assert.deepEqual(skipped, []);
  assert.equal(rowEntries.length, 1);
  assert.equal(rowEntries[0]['Id empleado'], '19546030-2');
  assert.equal(rowEntries[0].Nombres, 'BASTIAN NICOLAS');
  assert.equal(rowEntries[0]['Apellido paterno'], 'SALGADO');
  assert.equal(rowEntries[0]['Apellido materno'], 'URIBE');
  assert.equal(rowEntries[0]['Id AFP'], '12');
  assert.equal(rowEntries[0]['Id institución de salud'], '1');
  assert.equal(rowEntries[0].Cargo, 'C7');
  assert.equal(rowEntries[0]['Id centro de costo'], 'X71105010');
  assert.equal(rowEntries[0]['Id empresa'], '1');
  assert.equal(rowEntries[0]['Número del contrato'], undefined);
});

test('does not produce employee drafts for contract-master issues or invalid RUTs', () => {
  const result = buildVismaMissingEmployeeDraft({
    issues: [
      { id: '11111111-1', issue: 'El maestro no tiene contratoActi.' },
      { id: 'bad-rut', issue: 'No aparece en el maestro REX+.' },
    ],
    sourceRows: [{ RUT: 'bad-rut' }],
    templateResource: { employeeHeaders: ['Id empleado'], catalogs: {} },
    companyId: '1',
  });

  assert.deepEqual(result.rowEntries, []);
  assert.deepEqual(result.skipped, ['bad-rut']);
});
