import assert from 'node:assert/strict';
import test from 'node:test';
import { findExactMatch } from '../src/lib/historicalConcepts/matching.js';
import { applyStoredHistoricalMapping } from '../src/lib/sessionPersistence.js';
import { normalizeText } from '../src/lib/utils.js';

test('Finning employer unemployment insurance reuses the REX+ catalog match over a stale creation', () => {
  const originalWindow = globalThis.window;
  const scope = { origin: 'meta4', destination: 'rex', company: 'FINNING' };
  const catalogConcept = {
    id: 'aporteEmpleadorMOLDR',
    name: 'APORTE EMPLEADOR SEG CESANTIA',
    type: '5A',
  };
  const sourceName = 'SEGURO EMPRESA APORTE EMPLEADOR';
  const sourceKey = `historical-concepts:meta4:rex:finning:${sourceName.toLowerCase()}`;

  globalThis.window = {
    localStorage: {
      getItem: () => JSON.stringify({
        'historical-concepts': {
          [sourceKey]: {
            sourceName,
            sourceKey: sourceName,
            targetId: 'seguroEmpresaAp13V8K',
            targetName: sourceName,
            action: 'create',
            approved: true,
            scopeKey: 'meta4:rex:finning',
          },
        },
      }),
    },
  };

  try {
    const catalogById = new Map([[normalizeText(catalogConcept.id), catalogConcept]]);
    const exactMatch = findExactMatch({
      sourceName,
      catalogById,
      catalogByName: new Map(),
      catalogByCanonicalName: new Map(),
      mappingScope: { ...scope, key: 'meta4:rex:finning' },
    });
    assert.equal(exactMatch?.id, 'aporteEmpleadorMOLDR');

    const sourceDecision = {
      id: 'insurance',
      sourceName,
      sourceKey: sourceName,
      targetId: exactMatch.id,
      targetName: exactMatch.name,
      targetConcept: exactMatch,
      action: 'reuse',
      exactMatch: true,
      approved: true,
      excluded: false,
    };
    const decision = applyStoredHistoricalMapping('historical-concepts', sourceDecision, {
      concepts: [catalogConcept],
      scope,
      strictCatalog: true,
    });

    assert.equal(decision.action, 'reuse');
    assert.equal(decision.targetId, 'aporteEmpleadorMOLDR');
    assert.equal(decision.targetName, catalogConcept.name);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
