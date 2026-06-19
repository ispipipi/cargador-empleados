import {
  cleanCell,
  formatIsoDate,
  formatRutWithDots,
  normalizeText,
  parseIntegerCurrency,
} from '../../lib/utils';

const CONTRACT_TYPE_ALIASES = {
  indefinido: 'Indefinido',
  'plazo fijo': 'Plazo Fijo',
  plazofijo: 'Plazo Fijo',
  fijo: 'Plazo Fijo',
  'por obra o faena': 'Por Obra o Faena',
  'obra o faena': 'Por Obra o Faena',
  'por obra': 'Por Obra o Faena',
  obra: 'Por Obra o Faena',
  faena: 'Por Obra o Faena',
};

export const BUK_TRABAJOS_HEADERS = [
  'Número de Documento*',
  'Código de Ficha',
  'Sueldo Base*',
  'Moneda*',
  'Fecha de Inicio*',
  'Horario Semanal*',
  'Código Cargo*',
  'Código Sub-área*',
  'Número de Documento Supervisor*',
  'Código de Ficha Supervisor',
  'Tipo de Contrato*',
  'Término de Contrato',
  'Empresa*',
  'Recibe Gratificaciones*',
  'Jornada Laboral',
  'Días de la Jornada',
  'Tipo de Jornada',
  'Fecha de Suscripción de Contrato',
  'Gratificación Pactada',
  'Periodo de Pago de la Gratificación',
  'Recinto',
  'Turnos de Trabajo Especificados en Reglamento Interno',
  'Prestación de servicios*',
];

export function transformBukTrabajosRows({ sourceRows, listResource }) {
  const transformedRows = sourceRows.map((row, rowIndex) => {
    const exportedRow = BUK_TRABAJOS_HEADERS.reduce((accumulator, header) => {
      accumulator[header] = '';
      return accumulator;
    }, {});
    const rowErrors = [];
    const rowNumber = rowIndex + 2;
    const contractType = normalizeContractType(row['Tipo de Contrato']);

    exportedRow['Número de Documento*'] = formatRutWithDots(row.RUT);
    exportedRow['Código de Ficha'] = 'F1';
    exportedRow['Sueldo Base*'] = parseIntegerCurrency(row['Sueldo Base']);
    exportedRow['Moneda*'] = 'CLP';
    exportedRow['Fecha de Inicio*'] = formatIsoDate(row['Fecha de Ingreso']);
    exportedRow['Horario Semanal*'] = cleanCell(row['Horas de la Jornada']);
    exportedRow['Código de Ficha Supervisor'] = 'F1';
    exportedRow['Tipo de Contrato*'] = contractType;
    exportedRow['Término de Contrato'] =
      contractType === 'Plazo Fijo' ? formatIsoDate(row['Contrato hasta']) : '';
    exportedRow['Recibe Gratificaciones*'] = '1';
    exportedRow['Jornada Laboral'] = 'mensual';
    exportedRow['Días de la Jornada'] = '["l","m","w","j","v"]';
    exportedRow['Tipo de Jornada'] = 'Ordinaria ART 22';
    exportedRow['Fecha de Suscripción de Contrato'] = formatIsoDate(row['Fecha suscripción contratación']);
    exportedRow['Gratificación Pactada'] = cleanCell(row['Gratificación Pactada']);
    exportedRow['Periodo de Pago de la Gratificación'] = 'Mensual';
    exportedRow['Recinto'] = 'casamatriz';
    exportedRow['Turnos de Trabajo Especificados en Reglamento Interno'] = 'No';
    exportedRow['Prestación de servicios*'] = 'same_company';
    exportedRow['Número de Documento Supervisor*'] = formatRutWithDots(row['Rut Jefe']);

    exportedRow['Código Cargo*'] = findCatalogMatch({
      inputValue: row.Cargo,
      catalog: listResource.cargosCatalog,
      compareKey: 'Cargo',
      returnKey: 'Código',
    });
    exportedRow['Código Sub-área*'] = findCatalogMatch({
      inputValue: row['Nombre Centro Costo 1'],
      catalog: listResource.subAreasCatalog,
      compareKey: 'Nombre',
      returnKey: 'Código Sub-área',
    });
    exportedRow['Empresa*'] = findCatalogMatch({
      inputValue: row['Razón Social'],
      catalog: listResource.empresasCatalog,
      compareKey: 'Nombre',
      returnKey: 'Nombre',
    });

    registerMissingValue({
      rowErrors,
      rowNumber,
      field: 'Código Cargo*',
      originalValue: row.Cargo,
      value: exportedRow['Código Cargo*'],
    });
    registerMissingValue({
      rowErrors,
      rowNumber,
      field: 'Código Sub-área*',
      originalValue: row['Nombre Centro Costo 1'],
      value: exportedRow['Código Sub-área*'],
    });
    registerMissingValue({
      rowErrors,
      rowNumber,
      field: 'Empresa*',
      originalValue: row['Razón Social'],
      value: exportedRow['Empresa*'],
    });
    registerMissingValue({
      rowErrors,
      rowNumber,
      field: 'Tipo de Contrato*',
      originalValue: row['Tipo de Contrato'],
      value: exportedRow['Tipo de Contrato*'],
    });

    return {
      rowNumber,
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

function findCatalogMatch({ inputValue, catalog, compareKey, returnKey }) {
  const normalizedInput = normalizeText(inputValue);

  if (!normalizedInput) {
    return '';
  }

  const match = catalog.find((entry) => normalizeText(entry[compareKey]) === normalizedInput);
  return cleanCell(match?.[returnKey]);
}

function normalizeContractType(value) {
  const normalizedValue = normalizeText(value);
  return CONTRACT_TYPE_ALIASES[normalizedValue] ?? '';
}

function registerMissingValue({ rowErrors, rowNumber, field, originalValue, value }) {
  if (cleanCell(originalValue) && !cleanCell(value)) {
    rowErrors.push({
      row: rowNumber,
      field,
      value: cleanCell(originalValue),
    });
  }
}
