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

const SUCURSAL_OPTIONS = [
  '-',
  'Cañete',
  'Chol Chol',
  'Coyhaique',
  'Frutillar',
  'Lautaro',
  'Los Angeles',
  'Paillaco',
  'Paine',
  'Rancagua',
  'San Fernando',
  'Santiago',
  'Talca',
  'Victoria',
  'Santiago.',
];

const PLAN_CONTABLE_OPTIONS = ['-', 'Administrativos', 'Manipuladoras', 'Supervisores'];

const CUSTOM_FIELDS_TO_CLEAR = [
  'N° RBD',
  'Dirección RBD',
  'Comuna RBD',
  'Institución',
  'Nivel',
  'Licitación',
  'Tipo de Contratación',
  'Tipo PMA',
  'Sindicato 2',
];

export function buildBukTrabajosSupportSheets({ templateResource }) {
  return {
    cargosRows: templateResource.cargosRows,
    subAreasRows: templateResource.subAreasRows,
    empresasRows: templateResource.empresasRows,
    recintosRows: templateResource.recintosRows,
    cargosCatalog: templateResource.cargosCatalog,
    subAreasCatalog: templateResource.subAreasCatalog,
    empresasCatalog: templateResource.empresasCatalog,
    establecimientoPaeCatalog: buildEstablecimientoPaeCatalog(templateResource.establecimientoPaeOptions),
    nombreRbdCatalog: buildNombreRbdCatalog(templateResource.nombreRbdOptions),
    supervisorFichasCatalog: templateResource.supervisorFichasCatalog ?? {},
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
    const companyName = findEmpresaName(row['Razón Social'], supportSheets.empresasCatalog);

    exportedRow['Número de Documento*'] = formatRutWithDots(row.RUT);
    exportedRow['Código de Ficha'] = '';
    exportedRow['Sueldo Base*'] = parseIntegerCurrency(row['Sueldo Base']);
    exportedRow['Moneda*'] = 'CLP';
    exportedRow['Fecha de Inicio*'] = formatIsoDate(row['Fecha de Ingreso']);
    exportedRow['Horario Semanal*'] = cleanCell(row['Horas de la Jornada']) || '40';
    exportedRow['Código Cargo*'] = findCargoCode(row.Cargo, supportSheets.cargosCatalog);
    exportedRow['Código Sub-área*'] = findSubAreaCode(row, supportSheets.subAreasCatalog);
    exportedRow['Número de Documento Supervisor*'] = formatRutWithDots(row['Rut Jefe']);
    exportedRow['Código de Ficha Supervisor'] = findSupervisorFichaCode(
      row['Rut Jefe'],
      supportSheets.supervisorFichasCatalog,
    );
    exportedRow['Tipo de Contrato*'] = contractType;
    exportedRow.Obra = '';
    exportedRow['Término de Contrato'] = formatIsoDate(row['Contrato hasta']);
    exportedRow['Término de Contrato 2'] = '';
    exportedRow['Empresa*'] = companyName;
    exportedRow['Recibe Gratificaciones*'] = 'Sí';
    exportedRow['Jornada Laboral'] = 'mensual';
    exportedRow['Días de la Jornada'] = '["l","m","w","j","v"]';
    exportedRow['Tipo de Jornada'] = 'Ordinaria ART 22';
    exportedRow['Fecha de Suscripción de Contrato'] = '';
    exportedRow['Gratificación Pactada'] = resolvePactedGratification(row.Cargo);
    exportedRow['Periodo de Pago de la Gratificación'] = 'Mensual';
    exportedRow['Descripción de la Gratificación'] = '';
    exportedRow['Con Liquidaciones'] = '';
    exportedRow.Recinto = 'casamatriz';
    exportedRow['Recintos Secundarios'] = '';
    exportedRow['Fecha De Resolución'] = '';
    exportedRow['Nº De Resolución'] = '';
    exportedRow['Turnos de Trabajo Especificados en Reglamento Interno'] = 'No';
    exportedRow['Distribución De Jornada'] = truncateText(
      cleanCell(row['Detalle distribución']) || cleanCell(row['Sistema de distribución']),
      700,
    );
    exportedRow['Prestación de servicios*'] = 'same_company';
    exportedRow['RUT Empresa Usuaria'] = '';
    exportedRow['RUT Empresa Principal'] = '';
    exportedRow['Establecimiento PAE'] = findEstablecimientoPaeValue(row, supportSheets.establecimientoPaeCatalog);
    exportedRow['Nombre RBD'] = findNombreRbdValue(row, supportSheets.nombreRbdCatalog);
    exportedRow['Plan Contable'] = resolvePlanContableValue(row);
    exportedRow.Sucursal = findAllowedLiteralValue(row.Sucursal, SUCURSAL_OPTIONS);

    CUSTOM_FIELDS_TO_CLEAR.forEach((fieldName) => {
      exportedRow[fieldName] = '';
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

function findEmpresaName(inputValue, catalog) {
  const normalizedInput = normalizeIdentifier(inputValue);

  if (!normalizedInput) {
    return '';
  }

  const match = catalog.find((entry) => normalizeIdentifier(entry.Nombre) === normalizedInput);
  return cleanCell(match?.Nombre);
}

function findCargoCode(inputValue, catalog) {
  const directMatch = findCatalogMatch({
    inputValue,
    catalog,
    compareKey: 'Cargo',
    returnKey: 'Código',
  });

  if (directMatch) {
    return directMatch;
  }

  const normalizedInput = normalizeText(inputValue);
  const aliasValue = CARGO_ALIASES[normalizedInput];

  if (aliasValue) {
    return (
      findCatalogMatch({
        inputValue: aliasValue,
        catalog,
        compareKey: 'Cargo',
        returnKey: 'Código',
      }) || ''
    );
  }

  return '';
}

function findSubAreaCode(row, catalog) {
  const rawValue = cleanCell(row['Nombre Centro Costo 1']);

  if (!rawValue) {
    return '';
  }

  const directMatch = findCatalogMatch({
    inputValue: rawValue,
    catalog,
    compareKey: 'Nombre',
    returnKey: 'Código Sub-área',
  });

  if (directMatch) {
    return directMatch;
  }

  const normalizedCandidates = buildSubAreaSearchCandidates(row);
  const preferredArea = inferSubAreaDepartment(row);
  let bestMatch = null;

  catalog.forEach((entry) => {
    const normalizedName = normalizeText(entry.Nombre);
    let score = 0;

    normalizedCandidates.forEach((candidate) => {
      if (!candidate) {
        return;
      }

      if (normalizedName.includes(candidate) || candidate.includes(normalizedName)) {
        score = Math.max(score, 60 + candidate.length);
      }
    });

    if (preferredArea && normalizedName.includes(preferredArea)) {
      score += 25;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        score,
        code: cleanCell(entry['Código Sub-área']),
      };
    }
  });

  return bestMatch?.score > 0 ? bestMatch.code : '';
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

function cleanPlaceholder(value) {
  const cleanedValue = cleanCell(value);
  return /^-+$/.test(cleanedValue) ? '' : cleanedValue;
}

function normalizeIdentifier(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function normalizeDigits(value) {
  return cleanCell(value).replace(/\D+/g, '');
}

function findSupervisorFichaCode(supervisorRut, catalog) {
  const normalizedRut = normalizeDigits(supervisorRut);

  if (!normalizedRut) {
    return '';
  }

  return cleanCell(catalog?.[normalizedRut]);
}

function normalizeEstablishmentName(value) {
  return normalizeText(
    cleanCell(value)
      .replace(/^junji\s+/i, '')
      .replace(/^j\s*\.?\s*i\s*\.?\s*/i, '')
      .replace(/^s\s*\.?\s*c\s*\.?\s*/i, '')
      .replace(/\b\d{7,9}\b/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function inferEstablishmentVariant(value) {
  const cleanedValue = cleanCell(value);

  if (/^j\s*\.?\s*i/i.test(cleanedValue) || /^junji\s+j\s*\.?\s*i/i.test(cleanedValue)) {
    return 'ji';
  }

  if (/^s\s*\.?\s*c/i.test(cleanedValue) || /^junji\s+s\s*\.?\s*c/i.test(cleanedValue)) {
    return 'sc';
  }

  return '';
}

function extractCatalogRbd(value) {
  const digitGroups = cleanCell(value).match(/\d[\d.-]*/g) ?? [];
  const prioritizedGroup = digitGroups.find((group) => normalizeDigits(group).length >= 7) ?? digitGroups[0] ?? '';
  return normalizeDigits(prioritizedGroup);
}

function buildSubAreaSearchCandidates(row) {
  const rawCandidates = [
    cleanCell(row['Nombre Centro Costo 1']),
    cleanCell(row.Comuna),
    cleanCell(row.Ciudad),
    cleanCell(row.Sucursal),
    cleanCell(row.ESTABLECIMIENTO),
  ];

  return rawCandidates
    .flatMap((value) => [extractLocationToken(value), normalizeText(value)])
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function extractLocationToken(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return '';
  }

  return normalizedValue
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => Number.isNaN(Number(token)))
    .filter((token) => !LOCATION_STOPWORDS.has(token))
    .slice(0, 3)
    .join(' ');
}

function inferSubAreaDepartment(row) {
  const cargo = normalizeText(row.Cargo);
  const establishment = cleanCell(row.ESTABLECIMIENTO);
  const institution = cleanCell(row.INSTITUCIÓN);

  if (establishment || institution || cleanCell(row['RBD Establecimiento'])) {
    return 'pae';
  }

  if (/(bodega|grua|grúa|peoneta|chofer)/.test(cargo)) {
    return 'bodega';
  }

  if (/(mantencion|mantención|tecnico|técnico)/.test(cargo)) {
    return cargo.includes('monitor') ? 'tecnica' : 'mantencion';
  }

  return 'operaciones';
}

function resolvePactedGratification(cargoValue) {
  return isManipuladoraCargo(cargoValue)
    ? 'Artículo 50 del Código del Trabajo'
    : 'Artículo 47 del Código del Trabajo';
}

function buildEstablecimientoPaeCatalog(options) {
  return (options ?? []).map((rawValue) => {
    const [rbd = '', name = '', address = '', commune = ''] = rawValue.split(/\s*\/\s*/g);

    return {
      raw: rawValue,
      rbd: extractCatalogRbd(rbd || rawValue),
      normalizedName: normalizeText(name),
      normalizedSimplifiedName: normalizeEstablishmentName(name),
      normalizedCommune: normalizeText(commune),
      normalizedRaw: normalizeText(rawValue),
      normalizedNameAndCommune: normalizeText([name, commune].filter(Boolean).join(' ')),
      normalizedAddress: normalizeText(address),
      variant: inferEstablishmentVariant(name),
    };
  });
}

function buildNombreRbdCatalog(options) {
  return (options ?? []).map((rawValue) => {
    const normalizedRaw = normalizeText(rawValue);
    const rbd = extractCatalogRbd(rawValue);
    const nameWithoutRbd = cleanCell(rawValue).replace(/\b\d{7,9}\b/g, ' ').replace(/\s+/g, ' ');

    return {
      raw: rawValue,
      rbd,
      normalizedRaw,
      normalizedName: normalizeText(nameWithoutRbd),
      normalizedSimplifiedName: normalizeEstablishmentName(nameWithoutRbd),
      variant: inferEstablishmentVariant(rawValue),
    };
  });
}

function findEstablecimientoPaeValue(row, catalog) {
  const sourceName = cleanPlaceholder(row.ESTABLECIMIENTO);
  const normalizedName = normalizeText(sourceName);
  const normalizedSimplifiedName = normalizeEstablishmentName(sourceName);
  const normalizedRbd = normalizeDigits(row['RBD Establecimiento']);
  const normalizedCommune = normalizeText(cleanPlaceholder(row['Comuna RBD']) || cleanPlaceholder(row.Comuna));
  const preferredVariant = inferEstablishmentVariant(sourceName);

  if (!normalizedName && !normalizedSimplifiedName && !normalizedRbd) {
    return '';
  }

  let bestMatch = null;

  catalog.forEach((entry) => {
    let score = 0;

    if (normalizedRbd && entry.rbd === normalizedRbd) {
      score += 140;
    }

    if (normalizedName && entry.normalizedName === normalizedName) {
      score += 110;
    } else if (
      normalizedName &&
      (entry.normalizedName.includes(normalizedName) || normalizedName.includes(entry.normalizedName))
    ) {
      score += 70;
    }

    if (normalizedSimplifiedName && entry.normalizedSimplifiedName === normalizedSimplifiedName) {
      score += 95;
    } else if (
      normalizedSimplifiedName &&
      entry.normalizedSimplifiedName &&
      (
        entry.normalizedSimplifiedName.includes(normalizedSimplifiedName) ||
        normalizedSimplifiedName.includes(entry.normalizedSimplifiedName)
      )
    ) {
      score += 55;
    }

    if (normalizedCommune && entry.normalizedCommune === normalizedCommune) {
      score += 25;
    }

    if (preferredVariant && entry.variant === preferredVariant) {
      score += 20;
    }

    if (
      normalizedName &&
      normalizedCommune &&
      entry.normalizedNameAndCommune === normalizeText(`${cleanPlaceholder(row.ESTABLECIMIENTO)} ${cleanPlaceholder(row['Comuna RBD']) || cleanPlaceholder(row.Comuna)}`)
    ) {
      score += 15;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        score,
        value: entry.raw,
      };
    }
  });

  return bestMatch?.score > 0 ? bestMatch.value : '';
}

function findNombreRbdValue(row, catalog) {
  const sourceName = cleanPlaceholder(row.ESTABLECIMIENTO);
  const normalizedName = normalizeText(sourceName);
  const normalizedSimplifiedName = normalizeEstablishmentName(sourceName);
  const normalizedRbd = normalizeDigits(row['RBD Establecimiento']);
  const preferredVariant = inferEstablishmentVariant(sourceName);

  if (!normalizedName && !normalizedSimplifiedName && !normalizedRbd) {
    return '';
  }

  let bestMatch = null;

  catalog.forEach((entry) => {
    let score = 0;

    if (normalizedRbd && entry.rbd === normalizedRbd) {
      score += 120;
    }

    if (normalizedName && entry.normalizedName === normalizedName) {
      score += 100;
    } else if (normalizedName && entry.normalizedRaw === normalizedName) {
      score += 90;
    } else if (
      normalizedName &&
      (entry.normalizedName.includes(normalizedName) || normalizedName.includes(entry.normalizedName))
    ) {
      score += 65;
    }

    if (normalizedSimplifiedName && entry.normalizedSimplifiedName === normalizedSimplifiedName) {
      score += 110;
    } else if (
      normalizedSimplifiedName &&
      entry.normalizedSimplifiedName &&
      (
        entry.normalizedSimplifiedName.includes(normalizedSimplifiedName) ||
        normalizedSimplifiedName.includes(entry.normalizedSimplifiedName)
      )
    ) {
      score += 70;
    }

    if (preferredVariant && entry.variant === preferredVariant) {
      score += 25;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        score,
        value: entry.raw,
      };
    }
  });

  return bestMatch?.score > 0 ? bestMatch.value : '';
}

function findAllowedLiteralValue(inputValue, allowedValues) {
  const cleanedInput = cleanPlaceholder(inputValue);
  const normalizedInput = normalizeText(cleanedInput);

  if (!normalizedInput) {
    return '';
  }

  const exactMatch = allowedValues.find((allowedValue) => normalizeText(allowedValue) === normalizedInput);
  return exactMatch ?? '';
}

function resolvePlanContableValue(row) {
  const directValue = findAllowedLiteralValue(row['Categoría Contable'], PLAN_CONTABLE_OPTIONS);

  if (directValue) {
    return directValue;
  }

  if (isManipuladoraCargo(row.Cargo)) {
    return 'Manipuladoras';
  }

  const normalizedCargo = normalizeText(row.Cargo);

  if (normalizedCargo.includes('supervisor')) {
    return 'Supervisores';
  }

  if (/(administrativ|asistente|analista|coordinador|contador|rrhh)/.test(normalizedCargo)) {
    return 'Administrativos';
  }

  return '';
}

function isManipuladoraCargo(cargoValue) {
  const normalizedCargo = normalizeText(cargoValue);
  return /(manipulador|manipuladora)/.test(normalizedCargo);
}

const CARGO_ALIASES = {
  manipuladora: 'MANIPULADOR (A) DE ALIMENTOS',
  'tecnico multifuncional': 'SUPERVISOR TECNICO',
  'tecnico multifuncional sec': 'SUPERVISOR TECNICO',
  'jefe de mantencion': 'JEFE DE MANTENCION E INFRAESTRUCTURA',
};

const LOCATION_STOPWORDS = new Set([
  'lr23',
  'lr24',
  'lr22',
  'lr21',
  'pae',
]);

function truncateText(value, maxLength) {
  const cleanedValue = cleanCell(value);
  return cleanedValue.length > maxLength ? cleanedValue.slice(0, maxLength) : cleanedValue;
}
