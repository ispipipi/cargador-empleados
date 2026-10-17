import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInstitutionId } from '../src/lib/historicalConcepts/support.js';

test('FAPP life-expectancy contribution uses the REX+ social-security institution', () => {
  assert.equal(resolveInstitutionId('aporteFAPPCEV', {}), 'seguridadsocial');
});
