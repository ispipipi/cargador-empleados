import {
  cleanCell,
  formatIsoDate,
  formatRutWithDots,
  normalizeText,
  parseIntegerCurrency,
} from '../../lib/utils';

const CONTRACT_TYPE_ALIASES = {
  indefinido: 'Indefinido',
  'plazo fijo': 'Plazo fijo',
  plazofijo: 'Plazo fijo',
  fijo: 'Plazo fijo',
  'por obra o faena': 'Por obra o faena',
  'obra o faena': 'Por obra o faena',
  'por obra': 'Por obra o faena',
  obra: 'Por obra o faena',
  faena: 'Por obra o faena',
};

export function buildBukTrabajosSupportSheets({ sourceRows, templateResource }) {
  const cargosEntries = buildUniqueEntries({
    sourceRows,
    valueKey: 'Cargo',
    codeKey: 'Código',
    labelKey: 'Cargo',
    fallbackPrefix: 'cargo',
    codeFactory: ({ row, value }) => sanitizeCode(value) || sanitizeCode(row.INE),
  });
  const subAreasEntries = buildUniqueEntries({
    sourceRows,
    valueKey: 'Nombre Centro Costo 1',
    codeKey: 'Código Sub-área',
    labelKey: 'Nombre',
    fallbackPrefix: 'subarea',
    codeFactory: ({ row }) => sanitizeCode(row['Código Centro Costo 1']),
  });
  const empresasEntries = buildEmpresaEntries({
    sourceRows,
    templateCatalog: templateResource.empresasCatalog,
  });

  return {
    cargosRows: [
      ['Código', 'Cargo'],
      ...cargosEntries.map((entry) => [entry.Código, entry.Cargo]),
    ],
    subAreasRows: [
      ['Código Sub-área', 'Nombre'],
      ...subAreasEntries.map((entry) => [entry['Código Sub-área'], entry.Nombre]),
    ],
    empresasRows: [
      ['Nombre', 'Rut'],
      ...empresasEntries.map((entry) => [entry.Nombre, entry.Rut]),
    ],
    recintosRows: templateResource.recintosRows,
    cargosCatalog: cargosEntries,
    subAreasCatalog: subAreasEntries,
    empresasCatalog: empresasEntries,
  };
}

export function transformBukTrabajosRows({ sourceRows, trabajosHeaders, supportSheets }) {
  const transformedRows = sourceRows.map((row, rowIndex) => {
    const exportedRow = trabajosHeaders.reduce((accumulator, header) => {
      accumulator[header] = '';
      return accumulator;
    }, {});
    const rowErrors = [];
    const rowNumber = rowIndex + 2;
    const contractType = normalizeContractType(row['Tipo de Contrato']);
    const companyName = findCatalogMatch({
      inputValue: row['Razón Social'],
      catalog: supportSheets.empresasCatalog,
      compareKey: 'Nombre',
      returnKey: 'Nombre',
    });

    exportedRow['Número de Documento*'] = formatRutWithDots(row.RUT);
    exportedRow['Código de Ficha'] = 'F1';
    exportedRow['Sueldo Base*'] = parseIntegerCurrency(row['Sueldo Base']);
    exportedRow['Moneda*'] = 'CLP';
    exportedRow['Fecha de Inicio*'] = formatIsoDate(row['Fecha de Ingreso']);
    exportedRow['Horario Semanal*'] = cleanCell(row['Horas de la Jornada']);
    exportedRow['Código Cargo*'] = findCatalogMatch({
      inputValue: row.Cargo,
      catalog: supportSheets.cargosCatalog,
      compareKey: 'Cargo',
      returnKey: 'Código',
    });
    exportedRow['Código Sub-área*'] = findCatalogMatch({
      inputValue: row['Nombre Centro Costo 1'],
      catalog: supportSheets.subAreasCatalog,
      compareKey: 'Nombre',
      returnKey: 'Código Sub-área',
    });
    exportedRow['Número de Documento Supervisor*'] = formatRutWithDots(row['Rut Jefe']);
    exportedRow['Código de Ficha Supervisor'] = cleanCell(row['Rut Jefe']) ? 'F1' : '';
    exportedRow['Tipo de Contrato*'] = contractType;
    exportedRow.Obra = '';
    exportedRow['Término de Contrato'] =
      contractType === 'Plazo fijo' ? formatIsoDate(row['Contrato hasta']) : '';
    exportedRow['Término de Contrato 2'] = '';
    exportedRow['Empresa*'] = companyName;
    exportedRow['Recibe Gratificaciones*'] = '1';
    exportedRow['Jornada Laboral'] = 'mensual';
    exportedRow['Días de la Jornada'] = '["l","m","w","j","v"]';
    exportedRow['Tipo de Jornada'] = 'Ordinaria ART 22';
    exportedRow['Fecha de Suscripción de Contrato'] = '';
    exportedRow['Gratificación Pactada'] = cleanCell(row['Gratificación Pactada']);
    exportedRow['Periodo de Pago de la Gratificación'] = 'Mensual';
    exportedRow['Descripción de la Gratificación'] = '';
    exportedRow['Con Liquidaciones'] = '';
    exportedRow.Recinto = 'casamatriz';
    exportedRow['Recintos Secundarios'] = '';
    exportedRow['Fecha De Resolución'] = formatIsoDate(row['Fecha de resolución']);
    exportedRow['Nº De Resolución'] = cleanCell(row['N° de resolución']);
    exportedRow['Turnos de Trabajo Especificados en Reglamento Interno'] = 'No';
    exportedRow['Distribución De Jornada'] = cleanCell(row['Detalle distribución']) || cleanCell(row['Sistema de distribución']);
    exportedRow['Prestación de servicios*'] = 'same_company';
    exportedRow['RUT Empresa Usuaria'] = formatRutWithDots(row['RUT empresa usuaria']);
    exportedRow['RUT Empresa Principal'] = formatRutWithDots(row['RUT empresa principal']);
    exportedRow['Establecimiento PAE'] = cleanPlaceholder(row.ESTABLECIMIENTO);
    exportedRow['N° RBD'] = cleanPlaceholder(row['RBD Establecimiento']);
    exportedRow['Nombre RBD'] = cleanPlaceholder(row.ESTABLECIMIENTO);
    exportedRow['Dirección RBD'] = cleanPlaceholder(row['Dirección colegio']);
    exportedRow['Comuna RBD'] = cleanPlaceholder(row['Comuna RBD']);
    exportedRow['Institución'] = cleanPlaceholder(row.INSTITUCIÓN);
    exportedRow['Nivel'] = cleanPlaceholder(row.Nivel);
    exportedRow['Licitación'] = cleanPlaceholder(row.Licitación);
    exportedRow['Tipo de Contratación'] = cleanPlaceholder(row['Tipo Servicio']);
    exportedRow['Tipo PMA'] = cleanPlaceholder(row['Tipo PMA']);
    exportedRow['Plan Contable'] = cleanPlaceholder(row['Categoría Contable']);
    exportedRow.Sucursal = cleanPlaceholder(row.Sucursal);
    exportedRow['Sindicato 2'] = cleanPlaceholder(row['Sindicato 2']);

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

function buildEmpresaEntries({ sourceRows, templateCatalog }) {
  const templateLookup = templateCatalog.reduce((lookup, entry) => {
    lookup.set(normalizeIdentifier(entry.Nombre), entry);
    return lookup;
  }, new Map());

  return [...new Set(sourceRows.map((row) => cleanCell(row['Razón Social'])).filter(Boolean))]
    .map((companyName) => {
      const templateMatch = templateLookup.get(normalizeIdentifier(companyName));

      if (templateMatch) {
        return {
          Nombre: companyName,
          Rut: cleanCell(templateMatch.Rut),
        };
      }

      return {
        Nombre: companyName,
        Rut: '',
      };
    });
}

function buildUniqueEntries({
  sourceRows,
  valueKey,
  codeKey,
  labelKey,
  fallbackPrefix,
  codeFactory,
}) {
  const usedCodes = new Set();
  const seenValues = new Set();

  return sourceRows.reduce((entries, row) => {
    const label = cleanCell(row[valueKey]);
    const normalizedLabel = normalizeText(label);

    if (!normalizedLabel || seenValues.has(normalizedLabel)) {
      return entries;
    }

    seenValues.add(normalizedLabel);
    const baseCode = sanitizeCode(codeFactory({ row, value: label })) || sanitizeCode(label) || fallbackPrefix;
    const code = ensureUniqueCode(baseCode, usedCodes, fallbackPrefix);

    entries.push({
      [codeKey]: code,
      [labelKey]: label,
    });

    return entries;
  }, []);
}

function ensureUniqueCode(baseCode, usedCodes, fallbackPrefix) {
  const safeBaseCode = baseCode || fallbackPrefix;
  let candidate = safeBaseCode;
  let suffix = 2;

  while (usedCodes.has(candidate)) {
    candidate = `${safeBaseCode}_${suffix}`;
    suffix += 1;
  }

  usedCodes.add(candidate);
  return candidate;
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

function sanitizeCode(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanPlaceholder(value) {
  const cleanedValue = cleanCell(value);
  return /^-+$/.test(cleanedValue) ? '' : cleanedValue;
}

function normalizeIdentifier(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}
