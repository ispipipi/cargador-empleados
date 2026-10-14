import assert from 'node:assert/strict';
import test from 'node:test';
import { isVismaFiniquitoRow, splitVismaHistoricalRows } from '../src/lib/vismaHistoricalRows.js';

test('detects finiquito rows from a termination date', () => {
  assert.equal(isVismaFiniquitoRow({ 'Fecha de Baja': 46054 }), true);
  assert.equal(isVismaFiniquitoRow({ 'Fecha de Baja': '2026-02-01' }), true);
  assert.equal(isVismaFiniquitoRow({ 'Fecha de Baja': new Date('2026-02-01') }), true);
  assert.equal(isVismaFiniquitoRow({ 'Fecha de Baja': '' }), false);
  assert.equal(isVismaFiniquitoRow({ 'Fecha de Baja': 0 }), false);
  assert.equal(isVismaFiniquitoRow({ 'Fecha de Baja': '-' }), false);
});

test('splits monthly and finiquito rows without changing source rows', () => {
  const monthly = { RUT: '11111111-1', 'Fecha de Baja': '' };
  const finiquito = { RUT: '22222222-2', 'Fecha de Baja': '2026-02-01' };
  const result = splitVismaHistoricalRows([monthly, finiquito]);

  assert.deepEqual(result.monthlyRows, [monthly]);
  assert.deepEqual(result.finiquitoRows, [finiquito]);
});
