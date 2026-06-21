import { matchControlledValue } from './matcher';

export function transformWorkbookRows({
  sourceRows,
  fieldDefinitions,
  employeeHeaders,
  listsCatalog,
  parameters,
  sourceMeta,
}) {
  const transformedRows = sourceRows.map((row, rowIndex) => {
    const exportedRow = employeeHeaders.reduce((accumulator, header) => {
      accumulator[header] = '';
      return accumulator;
    }, {});
    const rowErrors = [];
    const rowAlerts = [];
    const context = {
      row,
      rowNumber: rowIndex + 2,
      parameters,
      sourceMeta,
      exportedRow,
    };

    fieldDefinitions.forEach((fieldDefinition) => {
      const resolvedField = normalizeResolvedFieldValue(fieldDefinition.resolve ? fieldDefinition.resolve(context) : '');
      const resolvedValue = resolvedField.value;

      if (fieldDefinition.listName) {
        const { matchedValue, error } = matchControlledValue({
          listName: fieldDefinition.listName,
          value: resolvedValue,
          listsCatalog,
          allowBlank: fieldDefinition.allowBlank,
        });

        exportedRow[fieldDefinition.target] = matchedValue;

        if (error) {
          rowErrors.push({
            row: context.rowNumber,
            field: fieldDefinition.target,
            value: error.originalValue,
          });
        }

        if (resolvedField.alert) {
          rowAlerts.push(buildAlert({
            rowNumber: context.rowNumber,
            field: fieldDefinition.target,
            appliedValue: matchedValue || resolvedValue,
            alert: resolvedField.alert,
          }));
        }

        return;
      }

      exportedRow[fieldDefinition.target] = resolvedValue ?? '';

      if (resolvedField.alert) {
        rowAlerts.push(buildAlert({
          rowNumber: context.rowNumber,
          field: fieldDefinition.target,
          appliedValue: exportedRow[fieldDefinition.target],
          alert: resolvedField.alert,
        }));
      }
    });

    return {
      rowNumber: context.rowNumber,
      exportedRow,
      hasErrors: rowErrors.length > 0,
      errors: rowErrors,
      alerts: rowAlerts,
    };
  });

  const allErrors = transformedRows.flatMap((row) => row.errors);
  const allAlerts = transformedRows.flatMap((row) => row.alerts);
  const cleanTransformedRows = transformedRows.filter((row) => !row.hasErrors);
  const cleanRows = cleanTransformedRows.map((row) => row.exportedRow);

  return {
    transformedRows,
    allErrors,
    allAlerts,
    allExportedRows: transformedRows.map((row) => row.exportedRow),
    cleanTransformedRows,
    cleanExportedRows: cleanRows,
    summary: {
      totalRows: transformedRows.length,
      cleanRows: cleanRows.length,
      warningRows: transformedRows.length - cleanRows.length,
      alertRows: transformedRows.filter((row) => row.alerts.length > 0).length,
      alertCount: allAlerts.length,
    },
  };
}

function normalizeResolvedFieldValue(resolvedValue) {
  if (
    resolvedValue &&
    typeof resolvedValue === 'object' &&
    !Array.isArray(resolvedValue) &&
    ('value' in resolvedValue || 'alert' in resolvedValue)
  ) {
    return {
      value: resolvedValue.value ?? '',
      alert: resolvedValue.alert ?? null,
    };
  }

  return {
    value: resolvedValue ?? '',
    alert: null,
  };
}

function buildAlert({ rowNumber, field, appliedValue, alert }) {
  return {
    row: rowNumber,
    field,
    value: alert.originalValue ?? '',
    appliedValue,
    message: alert.message,
    highlightExport: alert.highlightExport ?? false,
  };
}
