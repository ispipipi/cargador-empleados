import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVismaInstitution } from '../src/lib/vismaInstitutions.js';

const institutions = [
  { id: 'capital', name: 'AFP Capital' },
  { id: 'cuprum', name: 'AFP Cuprum' },
  { id: 'sss', name: 'Servicio Seguro Social' },
  { id: 'losandes', name: 'Caja Los Andes' },
  { id: 'bancoestado', name: 'ISAPRE Banco Estado' },
  { id: 'isalud', name: 'ISALUD ISAPRE de Codelco LTDA' },
  { id: 'banmedica', name: 'ISAPRE Banmedica' },
];

test('AFP codes resolve to canonical IDs from the loaded REX+ catalog', () => {
  assert.equal(resolveVismaInstitution('apvi', { AFP: '03' }, institutions).id, 'cuprum');
  assert.equal(resolveVismaInstitution('apvi', { AFP: '3' }, institutions).id, 'cuprum');
  assert.equal(resolveVismaInstitution('apvi', { AFP: '0901' }, institutions).id, 'sss');
  assert.equal(resolveVismaInstitution('apvi', { AFP: 'AFP Capital' }, institutions).id, 'capital');
});

test('health institution names and known Visma variants resolve to exact catalog IDs', () => {
  assert.equal(resolveVismaInstitution('isapre', { ISAPRE: 'ISAPRE Banmedica' }, institutions).id, 'banmedica');
  assert.equal(resolveVismaInstitution('isapre', { ISAPRE: 'Fund Salud Trabaj. Bco Estado' }, institutions).id, 'bancoestado');
  assert.equal(resolveVismaInstitution('isapre', { ISAPRE: 'Isapre de Codelco Ltda.' }, institutions).id, 'isalud');
});

test('fixed CCAF institution uses the canonical template ID', () => {
  assert.equal(resolveVismaInstitution('cajaCred', {}, institutions).id, 'losandes');
  assert.ok(resolveVismaInstitution('cajaCred', {}, []).issue);
});

test('unknown or underspecified institutions are rejected instead of exported as names', () => {
  assert.ok(resolveVismaInstitution('isapre', { ISAPRE: 'Isapre regional desconocida' }, institutions).issue);
  assert.ok(resolveVismaInstitution('isapre', { ISAPRE: 'ISAPRE' }, institutions).issue);
  assert.ok(resolveVismaInstitution('apvi', { AFP: 'AFP' }, institutions).issue);
});

test('non-institution concepts remain blank', () => {
  assert.deepEqual(resolveVismaInstitution('bonoEspecial', {}, institutions), { id: '', rawValue: '', issue: '' });
});
