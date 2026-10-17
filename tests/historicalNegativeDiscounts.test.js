import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHistoricalNegativeDiscountCsv,
  findHistoricalNegativeDiscounts,
} from '../src/lib/historicalConcepts/negativeDiscounts.js';

test('negative discounts mark the full employee ID and retain each negative concept', () => {
  const decisions = [
    { sourceKey: 'PRESTAMO VACACIONES', sourceName: 'PRESTAMO VACACIONES', targetId: 'descuentoPrestaX99SZ', targetName: 'Descuento préstamo', sourceSection: 'Descuento' },
    { sourceKey: 'CUOTA SINDICAL', sourceName: 'CUOTA SINDICAL', sourceSection: 'Descuento' },
    { sourceKey: 'BONO', sourceName: 'BONO', sourceSection: 'Haber / remuneración' },
  ];
  const sourceRows = [
    { __sourceRowNumber: 18, CI: '12.345.678-9', NOMBRE: 'Persona Uno', 'PRESTAMO VACACIONES': -450000, 'CUOTA SINDICAL': 12000, BONO: -500 },
    { __sourceRowNumber: 24, CI: '12345678-9', NOMBRE: 'Persona Uno', 'PRESTAMO VACACIONES': 0, 'CUOTA SINDICAL': -1000, BONO: 500 },
    { __sourceRowNumber: 25, CI: '98765432-1', NOMBRE: 'Persona Dos', 'PRESTAMO VACACIONES': 10000, 'CUOTA SINDICAL': 1000, BONO: 0 },
  ];

  const review = findHistoricalNegativeDiscounts({ sourceRows, decisions });

  assert.deepEqual(review.employeeIds, ['12345678-9']);
  assert.equal(review.employeeCount, 1);
  assert.equal(review.negativeRowCount, 2);
  assert.deepEqual(review.details.map(({ sourceRowNumber, sourceConcept, amount }) => ({ sourceRowNumber, sourceConcept, amount })), [
    { sourceRowNumber: 18, sourceConcept: 'PRESTAMO VACACIONES', amount: -450000 },
    { sourceRowNumber: 24, sourceConcept: 'CUOTA SINDICAL', amount: -1000 },
  ]);
});

test('negative discount report is a semicolon CSV with escaped values', () => {
  const csv = buildHistoricalNegativeDiscountCsv({
    details: [{
      sourceRowNumber: 8,
      employeeId: '12345678-9',
      employeeName: 'Apellido; "Nombre"',
      sourceConcept: 'PRESTAMO VACACIONES',
      targetId: 'descuentoPrestaX99SZ',
      targetName: 'Descuento préstamo',
      amount: -450000,
    }],
  });

  assert.match(csv, /^\uFEFF"Fila origen";"RUT excluido"/);
  assert.match(csv, /"Apellido; ""Nombre"""/);
  assert.match(csv, /"RUT completo excluido del archivo de carga"/);
});
