import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStoredHistoricalMapping } from '../src/lib/sessionPersistence.js';
import { extractVismaHistoricalConceptColumns, isLegacyAutoExcludedVismaConcept } from '../src/lib/vismaHistoricalRules.js';

const conceptHeaders = [
  'SUELDO BASE',
  'GRATIFICACION',
  'AFP',
  'ISAPRE',
  'SIS',
  'IMPUESTO UNICO',
  'APORTE PATRONAL',
  'PROVISION VACACIONES',
  'TOTAL HABERES',
  'LIQUIDO',
  'IMPONIBLE',
];
const sourceHeaders = [...Array.from({ length: 18 }, (_, index) => `META_${index + 1}`), ...conceptHeaders];
const sourceRow = {
  RUT: '12345678-5',
  'APELLIDO Y NOMBRE': 'Persona Ejemplo',
  'Días Trabajados': 30,
  'SUELDO BASE': 500000,
  GRATIFICACION: 100000,
  AFP: 50000,
  ISAPRE: 40000,
  SIS: 3000,
  'IMPUESTO UNICO': 20000,
  'APORTE PATRONAL': 10000,
  'PROVISION VACACIONES': 5000,
  'TOTAL HABERES': 605000,
  LIQUIDO: 492000,
  IMPONIBLE: 600000,
};

test('keeps contractual, statutory, health, tax, employer, and provision concepts in the map', () => {
  const concepts = extractVismaHistoricalConceptColumns([sourceRow], sourceHeaders);

  assert.deepEqual(concepts.map((concept) => concept.sourceName), conceptHeaders.slice(0, 8));
  assert.ok(concepts.every((concept) => concept.nonZeroCount === 1));
});

test('does not bring forward the old automatic exclusions, but preserves explicit user exclusions', () => {
  const originalWindow = globalThis.window;
  const entries = {
    'visma-historical:visma:rex:fruticola:sueldo base': {
      sourceName: 'SUELDO BASE', sourceKey: 'SUELDO BASE', targetId: 'sueldo base',
      targetName: 'SUELDO BASE', action: 'exclude', excluded: true, approved: true,
      scopeKey: 'visma:rex:fruticola',
    },
    'visma-historical:visma:rex:fruticola:bono especial': {
      sourceName: 'BONO ESPECIAL', sourceKey: 'BONO ESPECIAL', targetId: '',
      action: 'exclude', excluded: true, approved: true,
      scopeKey: 'visma:rex:fruticola',
    },
  };
  globalThis.window = {
    localStorage: { getItem: () => JSON.stringify({ 'visma-historical': entries }) },
  };

  try {
    const salaryDecision = {
      id: 'salary', sourceName: 'SUELDO BASE', sourceKey: 'SUELDO BASE', targetId: 'sueldoBase',
      approved: true, excluded: false,
      ignoreLegacyStoredExclusion: isLegacyAutoExcludedVismaConcept('SUELDO BASE', 'sueldoBase'),
    };
    const salary = applyStoredHistoricalMapping('visma-historical', salaryDecision, {
      concepts: [],
      scope: { origin: 'visma', destination: 'rex', company: 'fruticola' },
    });

    assert.equal(salary.excluded, false);
    assert.equal(salary.approved, true);

    const manualExclusion = applyStoredHistoricalMapping('visma-historical', {
      id: 'manual', sourceName: 'BONO ESPECIAL', sourceKey: 'BONO ESPECIAL',
      approved: false, excluded: false, targetId: '',
    }, {
      concepts: [],
      scope: { origin: 'visma', destination: 'rex', company: 'fruticola' },
    });
    assert.equal(manualExclusion.excluded, true);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
