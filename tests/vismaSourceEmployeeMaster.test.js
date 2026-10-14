import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx/xlsx.mjs';
import { parseVismaSourceEmployeeMaster } from '../src/lib/vismaSourceEmployeeMaster.js';

test('lee maestro VISMA con encabezados del archivo Personal 2026', async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Maestro de personal'],
    [],
    [],
    [
      'Empleado', 'Nombre Completo', 'Rut', 'Fec. Nac', 'Nacionalidad', 'Sexo', 'Dirección',
      'SAP CODE', 'PLURIEMPLEO', 'Banco', 'Nro Cuenta', 'Fec. Alta', 'Fecha Baja',
      'Institucion de Salud', 'Plan Isapre', 'Correo Electronico', 'AFP', 'C.Trab',
      'Centro Costo', 'Departamento', 'Puesto(Cargo)', 'Sueldo Contrato',
    ],
    [
      123, 'JORGE CRISTIAN MORA FUENTEALBA', '11765260-2', new Date(1971, 7, 30), 'Chilena',
      'Masculino', 'Calle 1', 'SAP123', '', 'BANCO DEL ESTADO', '123456', new Date(2025, 8, 1),
      '', 'FONASA', '', 'jorge@example.cl', 'PROVIDA', 'PLAZO FIJO', '75MAWC', 'Agrícola',
      'OBRERO AGRICOLA', 539000,
    ],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Personal');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

  const employees = await parseVismaSourceEmployeeMaster(buffer);

  assert.equal(employees.length, 1);
  assert.equal(employees[0].id, '11765260-2');
  assert.equal(employees[0].fullName, 'JORGE CRISTIAN MORA FUENTEALBA');
  assert.equal(employees[0].nameParts.firstName, 'JORGE CRISTIAN');
  assert.equal(employees[0].nameParts.lastName, 'MORA');
  assert.equal(employees[0].nameParts.familyName, 'FUENTEALBA');
  assert.equal(employees[0].position, 'OBRERO AGRICOLA');
  assert.equal(employees[0].sourceRow, 5);
});

test('informa claramente si el maestro no contiene RUT y nombre', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Nombre'], ['Persona']]), 'Personal');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

  await assert.rejects(
    parseVismaSourceEmployeeMaster(buffer),
    /No se encontró una tabla con columnas RUT y Nombre Completo/,
  );
});
