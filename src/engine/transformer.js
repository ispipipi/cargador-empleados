import { matchControlledValue } from './matcher';

export function transformWorkbookRows({
  sourceRows,
  fieldDefinitions,
  employeeHeaders,
  listsCatalog,
  parameters,
}) {
  const transformedRows = sourceRows.map((row, rowIndex) => {
    const exportedRow = employeeHeaders.reduce((accumulator, header) => {
      accumulator[header] = '';
      return accumulator;
    }, {});
    const rowErrors = [];
    const context = {
      row,
      rowNumber: rowIndex + 2,
      parameters,
    };

    fieldDefinitions.forEach((fieldDefinition) => {
      const resolvedValue = fieldDefinition.resolve ? fieldDefinition.resolve(context) : '';

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

        return;
      }

      exportedRow[fieldDefinition.target] = resolvedValue ?? '';
    });

    return {
      rowNumber: context.rowNumber,
      exportedRow,
      hasErrors: rowErrors.length > 0,
      errors: rowErrors,
    };
  });

  const allErrors = transformedRows.flatMap((row) => row.errors);
  const cleanRows = transformedRows.filter((row) => !row.hasErrors).map((row) => row.exportedRow);

  return {
    transformedRows,
    allErrors,
    allExportedRows: transformedRows.map((row) => row.exportedRow),
    cleanExportedRows: cleanRows,
    summary: {
      totalRows: transformedRows.length,
      cleanRows: cleanRows.length,
      warningRows: transformedRows.length - cleanRows.length,
    },
  };
}
