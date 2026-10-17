import { cleanCell } from '../utils.js';
import { parseHistoricalAmount } from './matching.js';
import { getSourceEmployeeId } from './support.js';

export function findHistoricalNegativeDiscounts({ sourceRows = [], decisions = [] }) {
  const discountDecisions = decisions.filter((decision) => (
    String(decision.sourceSection ?? '').toLowerCase().includes('descuento')
  ));
  const details = [];
  const employeeIds = new Set();

  sourceRows.forEach((sourceRow, index) => {
    const employeeId = getSourceEmployeeId(sourceRow);
    if (!employeeId) return;

    discountDecisions.forEach((decision) => {
      const amount = parseHistoricalAmount(sourceRow[decision.sourceKey]);
      if (amount === null || amount >= 0) return;

      employeeIds.add(employeeId);
      details.push({
        sourceRowNumber: sourceRow.__sourceRowNumber ?? index + 2,
        employeeId,
        employeeName: cleanCell(sourceRow.NOMBRE),
        sourceConcept: cleanCell(decision.sourceName || decision.sourceKey),
        sourceKey: cleanCell(decision.sourceKey),
        targetId: cleanCell(decision.targetId),
        targetName: cleanCell(decision.targetName),
        amount,
      });
    });
  });

  return {
    details,
    employeeIds: [...employeeIds],
    employeeCount: employeeIds.size,
    negativeRowCount: details.length,
  };
}

export function buildHistoricalNegativeDiscountCsv(review) {
  const headers = [
    'Fila origen',
    'RUT excluido',
    'Nombre trabajador',
    'Concepto Meta4',
    'ID concepto REX+',
    'Concepto REX+',
    'Monto negativo',
    'Acción',
  ];
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = (review?.details ?? []).map((detail) => [
    detail.sourceRowNumber,
    detail.employeeId,
    detail.employeeName,
    detail.sourceConcept,
    detail.targetId,
    detail.targetName,
    detail.amount,
    'RUT completo excluido del archivo de carga',
  ]);

  return `\uFEFF${[headers, ...rows].map((row) => row.map(quote).join(';')).join('\r\n')}`;
}
