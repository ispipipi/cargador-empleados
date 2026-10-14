import { cleanCell } from '../../../lib/utils.js';

export function buildPendingItem({
  key,
  label,
  type,
  catalogName = '',
  rowNumber,
  employeeId,
  employeeName,
  sourceValue,
  sourceContext = [],
  bulkDefaultValue = '',
}) {
  return {
    key,
    label,
    type,
    catalogName,
    rowNumber,
    employeeId,
    employeeName,
    sourceValue,
    sourceContext,
    bulkDefaultValue,
  };
}

export function buildPendingContext(entries) {
  return entries
    .map(([label, value]) => ({ label, value: cleanCell(value) }))
    .filter((entry) => entry.value);
}

export function isIntentionalBlankCorrection(value) {
  return value === '__KEEP_CURRENT__' || value === '__EMPTY__';
}
