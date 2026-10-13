import { cleanCell } from '../../lib/utils';
import {
  COMPANY_ALIASES,
  MARITAL_STATUS_ALIASES,
  NATION_ALIASES,
  PAYMENT_METHOD_ALIASES,
  PAYMENT_METHODS_WITHOUT_BANK,
  REX_EMPTY_FIELDS,
  REX_FIXED_DEFAULTS,
  ZONE_EMPTY_ALIASES,
  ZONE_NAME_ALIASES,
} from './rex_empleados/catalogs';
import {
  normalizeAreaName,
  normalizeLooseText,
  normalizePaymentMethodName,
} from './rex_empleados/normalizers';
import {
  getCatalogItemName,
  getOccupationRuleSet,
  inferFromKeywordRules,
  inferIneCategory,
} from './rex_empleados/catalogMatching';
import { buildPendingItem, isIntentionalBlankCorrection } from './rex_empleados/pending';
import {
  resolveAfpField,
  resolveBankField,
  resolveCargoField,
  resolveCatalogField,
  resolveContractTypeField,
  resolveEmail,
  resolveFixedProfessionField,
  resolveHealthField,
  resolvePhone,
  resolveSedeField,
  resolveTerminationCauseField,
} from './rex_empleados/fieldResolvers';
import {
  calculateMonthDifference,
  formatIntegerValue,
  formatRexDate,
  formatRut,
  hasRecognizedAntiquity,
  isNoCotiza,
  resolveContractStartField,
  resolveVacationStartDate,
} from './rex_empleados/contractValues';
import {
  resolveContributionFlag,
  resolveHealthAmount,
  resolveHealthCurrency,
  resolveHeavyWorkField,
  resolvePartialShift,
  resolvePensionSystem,
  resolveRetirementStatus,
  resolveSexValue,
  resolveStatusValue,
  resolveUnemploymentInsuranceValue,
  resolveWeeklyHours,
  splitEmployeeName,
} from './rex_empleados/employeeValues';
import {
  enrichGeographyFromSede,
  ensureRequiredGeography,
  resolveAddress,
  resolveComuna,
} from './rex_empleados/geographyResolvers';

export const REX_KEEP_CURRENT_CORRECTION = '__KEEP_CURRENT__';
export const REX_EMPTY_CORRECTION = '__EMPTY__';
export const rexDestination = {
  id: 'rex',
  nombre: 'REX+',
  userParameters: [],
};

export function getDefaultRexParameterValues() {
  return {};
}

export function buildInitialRexTransformation({ sourceRows, templateResource }) {
  const rowStates = sourceRows.map((sourceRow) =>
    buildRexRow({
      sourceRow,
      templateResource,
      corrections: {},
    }),
  );

  return {
    rowStates,
    summary: summarizeRexRows(rowStates),
  };
}

export function buildRexRow({ sourceRow, templateResource, corrections }) {
  const exportedRow = createEmptyExportRow(templateResource.employeeHeaders);
  const pendingItems = [];
  const alerts = [];
  const rowNumber = Number(sourceRow.__sourceRowNumber) || 0;
  const employeeId = cleanCell(sourceRow.CI);
  const employeeName = cleanCell(sourceRow.NOMBRE);
  const normalizedAreaSource = normalizeLooseText(sourceRow['UNIDAD DE NEGOCIOS']);
  const sourceEstado = cleanCell(sourceRow.ESTADO);
  const noCotiza = isNoCotiza(sourceRow);
  const parsedName = splitEmployeeName(sourceRow.NOMBRE, sourceRow.__visma?.nameParts);
  const contractType = resolveContractTypeField({
    sourceRow,
    correctionValue: corrections?.contractType,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const contractTypeValue = contractType.value;
  const maritalStatus = resolveCatalogField({
    key: 'maritalStatus',
    label: 'Estado civil',
    catalogName: 'Estado civil',
    sourceValue: sourceRow['ESTADO CIVIL'],
    correctionValue: corrections?.maritalStatus,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: MARITAL_STATUS_ALIASES,
    normalizer: normalizeLooseText,
  });
  const nation = resolveCatalogField({
    key: 'nation',
    label: 'Id nación',
    catalogName: 'Id nación',
    sourceValue: sourceRow.NACIONALIDAD,
    correctionValue: corrections?.nation,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: NATION_ALIASES,
    normalizer: normalizeLooseText,
  });
  
  const phoneOneValue = resolvePhone({
    key: 'phoneOne',
    label: 'Numero de teléfono 1',
    sourceValue: sourceRow.CELULAR,
    corrections,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const phoneTwoValue = resolvePhone({
    key: 'phoneTwo',
    label: 'Numero de teléfono 2',
    sourceValue: sourceRow.TELEFONO,
    corrections,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const address = resolveAddress({
    sourceValue: sourceRow.DIRECCION,
    corrections,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const comunaResolution = resolveComuna({
    sourceValue: sourceRow.COMUNA,
    locationValue: sourceRow.UBICACION,
    secondaryLocationValue: sourceRow['UBICACION WORKDAY'],
    addressValue: sourceRow.DIRECCION,
    correctionValue: corrections?.comuna,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const emailResolution = resolveEmail({
    sourceRow,
    corrections,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const paymentMethod = resolveCatalogField({
    key: 'paymentMethod',
    label: 'Id forma de pago',
    catalogName: 'Id forma de pago',
    sourceValue: sourceRow['FORMA DE PAGO'],
    correctionValue: corrections?.paymentMethod,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: PAYMENT_METHOD_ALIASES,
    normalizer: normalizePaymentMethodName,
  });
  const requiresBankDetails = !PAYMENT_METHODS_WITHOUT_BANK.has(paymentMethod.value);
  const bank = resolveBankField({
    sourceValue: sourceRow.BANCO,
    correctionValue: corrections?.bank,
    paymentMethodValue: paymentMethod.value,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    required: requiresBankDetails,
  });
  const accountNumber = resolveAccountNumber({
    sourceValue: sourceRow['N° CTA CTE'],
    correctionValue: corrections?.bankAccount,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    required: requiresBankDetails,
  });
  const afp = resolveAfpField({
    sourceRow,
    correctionValue: corrections?.afp,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    noCotiza,
  });
  const health = resolveHealthField({
    sourceRow,
    correctionValue: corrections?.health,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    noCotiza,
  });
  const healthAmount = resolveHealthAmount({
    healthValue: health.value,
    sourceValue: sourceRow['MONTO SALUD UF'] || sourceRow.__visma?.healthAmount,
    correctionValue: corrections?.healthAmount,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const company = resolveCatalogField({
    key: 'company',
    label: 'Id empresa',
    catalogName: 'Id empresa',
    sourceValue: sourceRow.EMPRESA,
    correctionValue: corrections?.company,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: COMPANY_ALIASES,
    normalizer: normalizeLooseText,
  });
  const cargo = resolveCargoField({
    sourceRow,
    correctionValue: corrections?.cargo,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const resolvedCargoName = getCatalogItemName(templateResource.catalogs.Cargo ?? [], cargo.value);
  const normalizedOccupationSource = normalizeLooseText(
    `${sourceRow.POSICION ?? ''} ${sourceRow['JOB CODE'] ?? ''} ${resolvedCargoName}`,
  );
  const occupationRules = getOccupationRuleSet(sourceRow.EMPRESA);
  const costCenter = resolveCatalogField({
    key: 'costCenter',
    label: 'Id centro de costo',
    catalogName: 'Id centro de costo',
    sourceValue: sourceRow['CENTRO COSTO'],
    correctionValue: corrections?.costCenter,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    normalizer: normalizeLooseText,
  });
  const sede = resolveSedeField({
    sourceValue: cleanCell(sourceRow.UBICACION),
    secondarySourceValue: '',
    correctionValue: corrections?.sede,
    sourceCompanyValue: sourceRow.EMPRESA,
    resolvedCompanyId: company.value,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const geographyResolution = enrichGeographyFromSede({
    comunaResolution,
    sedeValue: sede.value,
    templateResource,
  });
  const requiredGeography = ensureRequiredGeography({
    geographyResolution,
    templateResource,
    sourceComunaValue: sourceRow.COMUNA,
    sourceLocationValue: sourceRow.UBICACION,
    secondaryLocationValue: sourceRow['UBICACION WORKDAY'],
    addressValue: sourceRow.DIRECCION,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const area = resolveCatalogField({
    key: 'area',
    label: 'Área',
    catalogName: 'Área',
    sourceValue: sourceRow['UNIDAD DE NEGOCIOS'],
    correctionValue: corrections?.area,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    normalizer: normalizeAreaName,
    allowHeuristicMatch: true,
    allowScoredMatch: true,
    allowDirectValue: true,
  });
  const union = resolveCatalogField({
    key: 'union',
    label: 'Id sindicato',
    catalogName: 'Id sindicato',
    sourceValue: sourceRow.SINDICATO,
    correctionValue: corrections?.union,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    normalizer: normalizeLooseText,
  });
  const profession = resolveFixedProfessionField({
    correctionValue: corrections?.profession,
    templateResource,
  });
  const nivelOcupacional = resolveDerivedField({
    key: 'occupationalLevel',
    label: 'Nivel Ocupacional',
    correctionValue: corrections?.occupationalLevel,
    inferredValue: inferFromKeywordRules({
      normalizedSource: normalizedOccupationSource,
      normalizedArea: normalizedAreaSource,
      rules: occupationRules.level,
    }),
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const categoriaIne = resolveDerivedField({
    key: 'ineCategory',
    label: 'Categoría INE',
    correctionValue: corrections?.ineCategory,
    inferredValue: inferIneCategory({
      normalizedSource: normalizedOccupationSource,
      normalizedArea: normalizedAreaSource,
      occupationalLevelId: nivelOcupacional.value,
      rules: occupationRules.ine,
    }),
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const terminationCause = resolveTerminationCauseField({
    sourceValue: sourceRow['MOTIVO RETIRO'],
    correctionValue: corrections?.terminationCause,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const zone = resolveZoneField({
    sourceValue: sourceRow['TIPO REBAJA ZONA'],
    correctionValue: corrections?.extremeZone,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const recognizedMonths = resolveRecognizedMonths({
    sourceRow,
    correctionValue: corrections?.recognizedMonths,
  });
  const contractStartDate = resolveContractStartField({
    sourceRow,
    correctionValue: corrections?.contractStartDate,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const retirementStatus = resolveRetirementStatus(sourceRow.JUBILADO);
  const heavyWork = resolveHeavyWorkField({
    sourceRow,
    correctionValue: corrections?.heavyWorkFlag,
    retirementStatus,
    pendingItems,
    alerts,
    rowNumber,
    employeeId,
    employeeName,
  });

  Object.entries(REX_FIXED_DEFAULTS).forEach(([header, value]) => {
    exportedRow[header] = value;
  });
  REX_EMPTY_FIELDS.forEach((header) => {
    exportedRow[header] = '';
  });

  exportedRow['Id empleado'] = formatRut(cleanCell(sourceRow.CI));
  exportedRow['Situación'] = resolveStatusValue(sourceEstado);
  exportedRow.Nombres = parsedName.names;
  exportedRow['Apellido paterno'] = parsedName.lastName;
  exportedRow['Apellido materno'] = parsedName.middleName;
  exportedRow.Sexo = resolveSexValue(sourceRow.SEXO);
  exportedRow['Fecha de nacimiento'] = formatRexDate(sourceRow['FECHA NACIMIENTO']);
  exportedRow['Estado civil'] = maritalStatus.value;
  exportedRow['Numero de teléfono 1'] = phoneOneValue;
  exportedRow['Numero de teléfono 2'] = phoneTwoValue;
  exportedRow.Comuna = requiredGeography.comunaId;
  exportedRow.Ciudad = requiredGeography.cityId;
  exportedRow.Region = requiredGeography.regionId;
  exportedRow['Nombre Calle'] = address.streetName;
  exportedRow['Numero Calle'] = address.streetNumber;
  exportedRow.Departamento = address.department;
  exportedRow['Id nación'] = nation.value;
  exportedRow['Email institucional'] = emailResolution.email;
  exportedRow['Email personal'] = emailResolution.email;
  exportedRow['Nivel de estudio'] = '0';
  exportedRow.Profesión = profession.value;
  exportedRow['Id banco'] = bank.value;
  exportedRow['Cuenta del banco'] = accountNumber;
  exportedRow['Id forma de pago'] = paymentMethod.value;
  exportedRow['Id AFP'] = afp.value;
  exportedRow['Estado de jubilación'] = retirementStatus;
  exportedRow['Sistema de pensiones'] = resolvePensionSystem(sourceRow.AFP);
  exportedRow['Id institución de salud'] = health.value;
  exportedRow['Monto cotizado en la Isapre en UF'] = healthAmount.value;
  exportedRow['Moneda de la cotización'] = resolveHealthCurrency(health.value);
  exportedRow['Nombre del contrato'] = cleanCell(sourceRow['NOMBRE CONTRATO']);
  exportedRow['Tipo del contrato'] = contractTypeValue;
  exportedRow['Fecha de inicio del contrato'] = contractStartDate;
  exportedRow['Fecha de término del contrato'] = formatRexDate(sourceRow['FEC FIN CONTRATO']);
  exportedRow['Sueldo base'] = formatIntegerValue(sourceRow['SUELDO BASE']);
  exportedRow.Cargo = cargo.value;
  exportedRow['Id centro de costo'] = costCenter.value;
  exportedRow['Id sede donde se desempeña'] = sede.value;
  exportedRow['¿Realiza trabajo pesado?'] = heavyWork;
  exportedRow['Porcentaje de cotización por trabajo pesado'] =
    exportedRow['¿Realiza trabajo pesado?'] === 'S' ? '2' : '';
  exportedRow['Id sindicato'] = union.value;
  exportedRow['¿Jornada parcial?'] = resolvePartialShift(sourceRow['HORAS JORNADA']);
  exportedRow['Horas de trabajo semanales'] = resolveWeeklyHours(sourceRow['HORAS JORNADA']);
  exportedRow['¿Cotiza seguro de cesantía?'] = resolveUnemploymentInsuranceValue(sourceRow);
  exportedRow['Fecha de incorporación al seguro de cesantía'] = contractStartDate;
  exportedRow['Id empresa'] = company.value;
  exportedRow['Id plantilla grupal'] = 'GRUPO01';
  exportedRow['Causal de término del contrato'] = terminationCause.value;
  exportedRow['Fecha de reconocimiento de vacaciones'] = formatRexDate(sourceRow['FECHA ANTIGUEDAD']);
  exportedRow['Número de meses reconocidos con otro empleador'] = recognizedMonths;
  exportedRow.Área = area.value;
  exportedRow['¿Cotiza previsión y salud?'] = resolveContributionFlag({
    noCotiza,
    afpValue: afp.value,
    healthValue: health.value,
  });
  exportedRow['Modalidad del contrato'] = 'C';
  exportedRow['Zona extrema'] = zone.value;
  exportedRow['Fecha de afiliación a AFP'] = formatRexDate(sourceRow['FECHA INGRESO']);
  exportedRow['Fecha primera renovación'] = contractTypeValue === 'F' ? formatRexDate(sourceRow['FEC FIN CONTRATO']) : '';
  exportedRow['Fecha segunda renovación'] = '';
  exportedRow.Ocupación = '19';
  exportedRow['Fecha de inicio de vacaciones'] = resolveVacationStartDate(sourceRow);
  exportedRow['Nivel Ocupacional'] = nivelOcupacional.value;
  exportedRow['Periodicidad de licencias a pagar'] = '';
  exportedRow['Reconocimiento de Antigüedad'] = hasRecognizedAntiquity(sourceRow)
    ? formatRexDate(sourceRow['FECHA ANTIGUEDAD'])
    : '';
  exportedRow['Contrato por servicios transitorios'] = 'N';
  exportedRow['Categoría INE'] = categoriaIne.value;

  const unresolvedCriticalFields = [];

  if (!company.value) unresolvedCriticalFields.push('Id empresa');
  if (!cargo.value) unresolvedCriticalFields.push('Cargo');
  if (!costCenter.value) unresolvedCriticalFields.push('Id centro de costo');
  if (!sede.value) unresolvedCriticalFields.push('Id sede donde se desempeña');
  if (!area.value) unresolvedCriticalFields.push('Área');
  if (!paymentMethod.value) unresolvedCriticalFields.push('Id forma de pago');
  if (requiresBankDetails && !bank.value) unresolvedCriticalFields.push('Id banco');
  if (requiresBankDetails && !accountNumber) unresolvedCriticalFields.push('Cuenta del banco');
  if (!afp.value && !noCotiza) unresolvedCriticalFields.push('Id AFP');
  if (!health.value && !noCotiza) unresolvedCriticalFields.push('Id institución de salud');

  unresolvedCriticalFields.forEach((field) => {
    alerts.push({
      row: rowNumber,
      field,
      value: '',
      message: `${field} quedó pendiente de corrección manual.`,
    });
  });

  return {
    sourceRow,
    rowNumber,
    employeeId,
    employeeName,
    exportedRow,
    pendingItems,
    alerts,
  };
}

export function summarizeRexRows(rowStates) {
  const pendingRows = rowStates.filter((rowState) => rowState.pendingItems.length > 0);
  const unresolvedPendingCount = pendingRows.flatMap((rowState) => rowState.pendingItems).length;
  const alertCount = rowStates.flatMap((rowState) => rowState.alerts).length;

  return {
    totalRows: rowStates.length,
    readyRows: rowStates.length - pendingRows.length,
    pendingRows: pendingRows.length,
    pendingCount: unresolvedPendingCount,
    alertCount,
  };
}

function createEmptyExportRow(headers) {
  return headers.reduce((row, header) => {
    row[header] = '';
    return row;
  }, {});
}

function resolveRecognizedMonths({ sourceRow, correctionValue }) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return '';
  }

  if (cleanCell(correctionValue)) {
    return cleanCell(correctionValue);
  }

  if (!hasRecognizedAntiquity(sourceRow)) {
    return '';
  }

  const suggestedMonths = calculateMonthDifference(sourceRow['FECHA ANTIGUEDAD'], sourceRow['FECHA INGRESO']);
  return suggestedMonths > 0 ? String(suggestedMonths) : '';
}

function resolveDerivedField({ key, label, correctionValue, inferredValue, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return { value: directCorrection };
  }

  if (inferredValue) {
    return { value: inferredValue };
  }

  pendingItems.push(
    buildPendingItem({
      key,
      label,
      type: 'catalog',
      catalogName: label,
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: '',
    }),
  );
  return { value: '' };
}

function resolveZoneField({ sourceValue, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return { value: directCorrection };
  }

  const normalizedSource = normalizeLooseText(sourceValue);

  if (!normalizedSource || ZONE_EMPTY_ALIASES.has(normalizedSource)) {
    return { value: '' };
  }

  return resolveCatalogField({
    key: 'extremeZone',
    label: 'Zona extrema',
    catalogName: 'Zona extrema',
    sourceValue,
    correctionValue,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: ZONE_NAME_ALIASES,
    normalizer: normalizeLooseText,
    allowHeuristicMatch: true,
  });
}

function resolveAccountNumber({ sourceValue, correctionValue, pendingItems, rowNumber, employeeId, employeeName, required }) {
  if (!required) {
    return '';
  }

  if (isIntentionalBlankCorrection(correctionValue)) {
    return '';
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return directCorrection;
  }

  const candidate = cleanCell(sourceValue);

  if (candidate) {
    return candidate;
  }

  pendingItems.push(
    buildPendingItem({
      key: 'bankAccount',
      label: 'Cuenta del banco',
      type: 'text',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: candidate,
    }),
  );
  return '';
}
