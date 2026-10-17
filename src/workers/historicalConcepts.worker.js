import {
  buildHistoricalConceptModel,
  buildHistoricalReconciliation,
  validateHistoricalEmployees,
  validateHistoricalRexLiquidationRows,
} from '../lib/historicalConcepts.js';
import { findHistoricalNegativeDiscounts } from '../lib/historicalConcepts/negativeDiscounts.js';

let sourceRows = [];
let sourceHeaders = [];

self.onmessage = (event) => {
  try {
    if (event.data.type === 'build') {
      sourceRows = event.data.sourceRows;
      sourceHeaders = event.data.sourceHeaders;
      const model = buildHistoricalConceptModel(event.data);
      self.postMessage({ ok: true, type: 'model', model });
      return;
    }

    if (event.data.type === 'validate') {
      const {
        decisions,
        selectedExportDecisionIds,
        employeeCatalog,
        mappingScope,
        period,
        isFinningCatalog,
        exportKey,
      } = event.data;
      const negativeDiscountReview = isFinningCatalog
        ? findHistoricalNegativeDiscounts({ sourceRows, decisions })
        : { details: [], employeeIds: [], employeeCount: 0, negativeRowCount: 0 };
      const selectedIds = new Set(selectedExportDecisionIds);
      const selectedDecisions = decisions.filter((decision) => selectedIds.has(decision.id));
      const excludedEmployeeIds = negativeDiscountReview.employeeIds;
      const employeeValidation = validateHistoricalEmployees(
        sourceRows,
        employeeCatalog,
        mappingScope,
        excludedEmployeeIds,
      );
      const reconciliation = buildHistoricalReconciliation({
        sourceRows,
        sourceHeaders,
        decisions: selectedDecisions,
        employeeCatalog,
        mappingScope,
        additionalExcludedEmployeeIds: excludedEmployeeIds,
      });
      const rexValidation = validateHistoricalRexLiquidationRows({
        sourceRows,
        decisions: selectedDecisions,
        employeeCatalog,
        mappingScope,
        period,
        excludedEmployeeIds,
      });

      self.postMessage({
        ok: true,
        type: 'analysis',
        analysis: { negativeDiscountReview, employeeValidation, reconciliation, rexValidation, exportKey },
      });
      return;
    }

    self.postMessage({ ok: false, error: 'Solicitud de análisis no reconocida.' });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo analizar el libro histórico.',
    });
  }
};
