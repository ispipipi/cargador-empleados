import {
  cleanCell,
  formatIsoDate,
  formatRutWithDots,
  normalizeText,
  parseIntegerCurrency,
} from '../../lib/utils';
import {
  CARGO_ALIASES,
  buildEstablecimientoPaeCatalog,
  buildNombreRbdCatalog,
  buildSubAreaSearchCandidates,
  findAllowedLiteralValue,
  findEstablecimientoPaeValue,
  findNombreRbdValue,
  inferSubAreaDepartment,
  normalizeDigits,
  resolvePactedGratification,
  resolvePlanContableValue,
  truncateText,
} from './buk_trabajos/supportCatalogs';

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
    fichaCodesCatalog: templateResource.fichaCodesCatalog ?? {},
  };
}

export function transformBukTrabajosRows({ sourceRows, trabajosHeaders, supportSheets }) {
  const transformedRows = sourceRows.map((row, rowIndex) => {
    const exportedRow = trabajosHeaders.reduce((accumulator, header) => {
      accumulator[header] = '';
      return accumulator;
    }, {});
    const rowErrors = [];
    const rowAlerts = [];
    const rowNumber = rowIndex + 2;
    const contractType = normalizeContractType(row['Tipo de Contrato']);
    const companyName = findEmpresaName(row['Razón Social'], supportSheets.empresasCatalog);
    const cargoResolution = resolveCargoCode(row.Cargo, supportSheets.cargosCatalog);

    exportedRow['Número de Documento*'] = formatRutWithDots(row.RUT);
    exportedRow['Código de Ficha'] = findFichaCode(row.RUT, supportSheets.fichaCodesCatalog);
    exportedRow['Sueldo Base*'] = parseIntegerCurrency(row['Sueldo Base']);
    exportedRow['Moneda*'] = 'CLP';
    exportedRow['Fecha de Inicio*'] = formatIsoDate(row['Fecha de Ingreso']);
    exportedRow['Horario Semanal*'] = cleanCell(row['Horas de la Jornada']) || '40';
    exportedRow['Código Cargo*'] = cargoResolution.code;
    if (cargoResolution.suggestion) {
      rowAlerts.push({
        row: rowNumber,
        field: 'Código Cargo*',
        value: cleanCell(row.Cargo),
        appliedValue: cargoResolution.suggestion.code,
        message: `Se aplicó el cargo BUK más cercano: ${cargoResolution.suggestion.name}.`,
      });
    }
    exportedRow['Código Sub-área*'] = findSubAreaCode(row, supportSheets.subAreasCatalog);
    exportedRow['Número de Documento Supervisor*'] = formatRutWithDots(row['Rut Jefe']);
    exportedRow['Código de Ficha Supervisor'] = findSupervisorFichaCode(
      row['Rut Jefe'],
      supportSheets.fichaCodesCatalog,
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
      alerts: rowAlerts,
    };
  });

  const allErrors = transformedRows.flatMap((row) => row.errors);
  const allAlerts = transformedRows.flatMap((row) => row.alerts);
  const cleanRows = transformedRows.filter((row) => !row.hasErrors).map((row) => row.exportedRow);

  return {
    transformedRows,
    allErrors,
    allAlerts,
    allExportedRows: transformedRows.map((row) => row.exportedRow),
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

function resolveCargoCode(inputValue, catalog) {
  const directMatch = findCatalogMatch({
    inputValue,
    catalog,
    compareKey: 'Cargo',
    returnKey: 'Código',
  });

  if (directMatch) {
    return { code: directMatch, suggestion: null };
  }

  const normalizedInput = normalizeText(inputValue);
  const aliasValue = CARGO_ALIASES[normalizedInput];

  if (aliasValue) {
    const aliasMatch = findCatalogMatch({
      inputValue: aliasValue,
      catalog,
      compareKey: 'Cargo',
      returnKey: 'Código',
    });

    if (aliasMatch) {
      return { code: aliasMatch, suggestion: null };
    }
  }

  const closestMatch = findClosestCargoCatalogMatch(inputValue, catalog);
  if (!closestMatch) {
    return { code: '', suggestion: null };
  }

  return {
    code: closestMatch.code,
    suggestion: closestMatch,
  };
}

function findClosestCargoCatalogMatch(inputValue, catalog) {
  const candidateTokens = tokenizeCargoName(inputValue);
  if (candidateTokens.length === 0) {
    return null;
  }

  const rankedMatches = catalog
    .map((entry) => {
      const nameTokens = tokenizeCargoName(entry.Cargo);
      const sharedTokens = candidateTokens.filter((token) => nameTokens.includes(token));
      let score = sharedTokens.length * 30;

      if (sharedTokens.length === candidateTokens.length) {
        score += 35;
      }

      if (candidateTokens[0] && nameTokens[0] === candidateTokens[0]) {
        score += 12;
      }

      score -= Math.max(0, nameTokens.length - candidateTokens.length) * 2;

      return {
        code: cleanCell(entry['Código']),
        name: cleanCell(entry.Cargo),
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  const [bestMatch, secondMatch] = rankedMatches;
  if (!bestMatch || bestMatch.score < 68) {
    return null;
  }

  if (secondMatch && bestMatch.score - secondMatch.score < 14) {
    return null;
  }

  return bestMatch;
}

function tokenizeCargoName(value) {
  const normalized = normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\badm\b/g, 'administrativo')
    .replace(/\benc\b/g, 'encargado')
    .replace(/\bsubgte\b/g, 'subgerente')
    .replace(/\bsub gerente\b/g, 'subgerente')
    .replace(/\bd o\b/g, 'desarrollo organizacional')
    .replace(/\bplanific\b/g, 'planificacion')
    .replace(/\boper\b/g, 'operacional');
  const stopwords = new Set(['a', 'de', 'del', 'el', 'la', 'las', 'los', 'en', 'o', 'y']);
  const tokenAliases = {
    administrativa: 'administrativo',
    asesora: 'asesor',
    encargada: 'encargado',
    ejecutiva: 'ejecutivo',
    jefa: 'jefe',
    monitora: 'monitor',
    operadora: 'operador',
    supervisora: 'supervisor',
    tecnica: 'tecnico',
  };

  return [...new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token && !stopwords.has(token))
      .map((token) => tokenAliases[token] || token),
  )];
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
      message: 'No se encontró una coincidencia válida en el catálogo de BUK.',
    });
  }
}


function normalizeIdentifier(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}


function findFichaCode(rutValue, catalog) {
  const normalizedRut = normalizeDigits(rutValue);

  if (!normalizedRut) {
    return '';
  }

  return cleanCell(catalog?.[normalizedRut]?.code);
}

function findSupervisorFichaCode(supervisorRut, catalog) {
  const normalizedRut = normalizeDigits(supervisorRut);

  if (!normalizedRut) {
    return '';
  }

  const entry = catalog?.[normalizedRut];
  return entry?.hasMultiple ? cleanCell(entry.code) : '';
}
