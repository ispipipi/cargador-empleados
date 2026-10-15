import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStoredHistoricalMapping, loadVismaInstitutionMappings, saveVismaInstitutionMappings } from '../src/lib/sessionPersistence.js';
import { extractVismaHistoricalConceptColumns, isLegacyAutoExcludedVismaConcept } from '../src/lib/vismaHistoricalRules.js';
import { buildVismaHistoricalCsv, LIQUIDATION_HEADERS, validateVismaHistoricalInstitutions } from '../src/lib/vismaHistorical.js';

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

test('manual institution matches unblock validation and export the selected catalog ID', () => {
  const row = { RUT: '12345678-5', 'Días Trabajados': 30, ISAPRE: 'Nueva Más Vida', SALUD: 42000 };
  const decision = { sourceKey: 'SALUD', sourceName: 'SALUD', targetId: 'isapre', targetName: 'Isapre', approved: true, excluded: false };
  const employeeCatalog = [{ id: '12345678-5', contract: '1' }];
  const resource = {
    companies: [{ id: '1', name: 'Frutícola' }],
    institutions: [{ id: 'nuevamasvida', name: 'Isapre Nueva Más Vida' }],
    headers: LIQUIDATION_HEADERS,
  };
  const manualInstitutionMappings = {
    'health:nuevamasvida': { id: 'nuevamasvida', kind: 'health', rawValue: 'Nueva Más Vida' },
  };
  const validation = validateVismaHistoricalInstitutions({
    sourceRows: [row], decisions: [decision], institutions: resource.institutions, employeeCatalog,
    manualInstitutionMappings,
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
  const csv = buildVismaHistoricalCsv({
    sourceRows: [row], decisions: [decision], period: '2025-12', resource, employeeCatalog,
    manualInstitutionMappings,
  });
  assert.match(csv, /2025-12;12345678-5;1;isapre;42000;0;nuevamasvida/);
});

test('exports AFP contribution and AFP institution for unemployment concepts', () => {
  const row = {
    RUT: '12345678-5',
    'Días Trabajados': 30,
    AFP: 'PROVIDA',
    'Cotización AFP %': '',
    AFP_OBLIGATORIA: 50000,
    CESANTIA_EMPLEADO: 3000,
    CESANTIA_SOLIDARIA: 5000,
  };
  const decisions = [
    { sourceKey: 'AFP_OBLIGATORIA', sourceName: 'AFP', targetId: 'afp', targetName: 'AFP', approved: true, excluded: false },
    { sourceKey: 'CESANTIA_EMPLEADO', sourceName: 'Seguro cesantía', targetId: 'cesEmpleado', targetName: 'Seguro cesantía', approved: true, excluded: false },
    { sourceKey: 'CESANTIA_SOLIDARIA', sourceName: 'Seguro cesantía solidario', targetId: 'cesAporteSol', targetName: 'Seguro cesantía solidario', approved: true, excluded: false },
  ];
  const employeeCatalog = [{ id: '12345678-5', contract: '1' }];
  const resource = {
    companies: [{ id: '1', name: 'Frutícola' }],
    institutions: [{ id: 'provida', name: 'AFP Provida' }],
    headers: LIQUIDATION_HEADERS,
  };
  const validation = validateVismaHistoricalInstitutions({
    sourceRows: [row], decisions, institutions: resource.institutions, employeeCatalog,
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);

  const records = buildVismaHistoricalCsv({
    sourceRows: [row], decisions, period: '2026-02', resource, employeeCatalog,
  }).replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map((line) => line.split(';'));

  assert.deepEqual(records.map((record) => [record[3], record[6], record[7]]), [
    ['afp', 'provida', '10'],
    ['cesEmpleado', 'provida', '0'],
    ['cesAporteSol', 'provida', '0'],
  ]);
});

test('manual institution matches persist separately for each origin, destination, and company scope', () => {
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const fruticola = { origin: 'visma', destination: 'rex', company: 'fruticola:1' };
  const consorcio = { origin: 'visma', destination: 'rex', company: 'consorcio:1' };

  try {
    saveVismaInstitutionMappings(fruticola, { 'health:nuevamasvida': { id: 'nuevamasvida', rawValue: 'Nueva Más Vida' } });
    assert.equal(loadVismaInstitutionMappings(fruticola)['health:nuevamasvida'].id, 'nuevamasvida');
    assert.deepEqual(loadVismaInstitutionMappings(consorcio), {});
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
