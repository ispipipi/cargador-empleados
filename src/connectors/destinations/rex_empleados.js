import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from '../../lib/utils';

export const REX_KEEP_CURRENT_CORRECTION = '__KEEP_CURRENT__';
export const REX_EMPTY_CORRECTION = '__EMPTY__';

const REX_FIXED_DEFAULTS = {
  '¿Es expatriado?': 'N',
  'Tramo de asignación familiar': 'A',
  '¿Supervisa otros empleados?': 'N',
  '¿Es un perfil solo aprobador?': 'N',
  'Número del contrato': '1',
  'Distribución de jornada': '5',
  'Nivel SENCE': '1',
  'Factor SENCE': '0',
  'Pauta contable': 'estandar',
  '¿Descansa domingos?': 'S',
  '¿Afecto a trato?': 'N',
  Teletrabajo: 'N',
  '¿Es Reemplazo?': 'N',
  'Id plantilla grupal': 'GRUPO01',
  'Modalidad del contrato': 'C',
  'Centro de distribucion': 'sin_distribucion',
  'Agrupación de seguridad': 'noagrupar',
  Ocupación: '19',
  'Nivel de estudio': '0',
  'Empleado con perfil privado': 'N',
  'Permite ausencias en días inhábiles': 'N',
  'Contrato por servicios transitorios': 'N',
  '¿Utiliza asitencia?': 'N',
};

const REX_EMPTY_FIELDS = [
  'Licencia de conducir',
  'Lista Adicional 1',
  'Lista Adicional 2',
  'Lista Adicional 3',
  'Lista Adicional 4',
  'Lista Adicional 5',
  'Lista Adicional 6',
  'Lista Adicional 7',
  'Lista Adicional 8',
  'Lista Adicional 9',
  'Lista Adicional 10',
  'Fecha Adicional 1',
  'Fecha Adicional 2',
  'Campo Adicional 1',
  'Campo Adicional 2',
  'Código interno',
  'Talla de ropa',
  'Talla de zapatos',
  'Detalle contrato',
  'Supervisor',
  'Turno',
  'Permisos administrativos',
  'Notas',
  'Lista Adicional 11',
  'Lista Adicional 12',
  'Lista Adicional 13',
  'Lista Adicional 14',
  'Mes de reinicio de permisos administrativos',
  'Dirección laboral',
  'Código interno 2',
  'Lista Adicional 15',
  'Lista Adicional 16',
  'Lista Adicional 17',
  'Lista Adicional 18',
  'Lista Adicional 19',
  'Lista Adicional 20',
  'Sin Observaciones',
  '¿Primero 3 días de licencia máximos a pagar?',
  '¿Cantidad máxima de pagos de primeros 3 días?',
  'Día Acceso a Liquidación en Portal',
  'Talla de pantalon',
  'Fecha inicio fuero Ley 21565',
  'Ley 21545 (TEA)',
  'Cuidador de niño/a menor de 12 años',
  'Nombre contacto de emergencia',
  'Vínculo contacto de emergencia',
  'Teléfono 1 contacto de emergencia',
  'Teléfono 2 contacto de emergencia',
  'Periodicidad de licencias a pagar',
  'Id Institución Póliza',
  'Número Póliza',
  'Tipo Póliza',
  'Monto Póliza',
  'Unidad de permisos administrativos',
];

const COMPANY_ALIASES = {
  'finning capacitacion ltda': 'Finning Capacitación Limitada',
  'finning chile s a': 'Finning Chile S.A.',
  'centro de formacion tecnica finning ltda': 'Centro de Formacion Tecnica Finning Ltda',
  'distribuidora perkins chilena s a c': 'Distribuidora Perkins Chilena S.A.C',
  'sitech southern cone spa': 'Sitech Southern Cone SPA',
};

const STATUS_ALIASES = {
  activo: 'A',
  vigente: 'A',
  inactivo: 'I',
  desvinculado: 'I',
  retirado: 'I',
  finiquitado: 'I',
  baja: 'I',
};

const CONTRACT_TYPE_ALIASES = {
  'contrato indefinido': 'I',
  indefinido: 'I',
  'contrato plazo fijo': 'F',
  'plazo fijo': 'F',
  fijo: 'F',
  'por obra o faena': 'O',
  obra: 'O',
  faena: 'O',
  honorarios: 'H',
};

const MARITAL_STATUS_ALIASES = {
  'soltero a': 'S',
  soltero: 'S',
  'casado a': 'C',
  casado: 'C',
  'viudo a': 'V',
  viudo: 'V',
  divorciado: 'D',
  divorciada: 'D',
  'conviviente civil': 'U',
};

const NATION_ALIASES = {
  chileno: 'chile',
  chilena: 'chile',
  'chileno a': 'chile',
};

const PAYMENT_METHOD_ALIASES = {
  'deposito cuenta corriente': 'actacorr',
  'deposito cta corriente': 'actacorr',
  'abono en cuenta corriente': 'actacorr',
  'deposito cuenta ahorro': 'actaaho',
  'deposito cta ahorro': 'actaaho',
  'abono en cuenta de ahorro': 'actaaho',
  'deposito cuenta vista': 'actavis',
  'deposito cta vista': 'actavis',
  'abono en cuenta vista': 'actavis',
  cheque: 'cheque',
  'cheque electronico': 'chequeElec',
  'cuenta rut': 'cuentarut',
  'efectivo o directo sin transfer': 'directo',
  directo: 'directo',
  efectivo: 'directo',
};

const PAYMENT_METHODS_WITHOUT_BANK = new Set(['cheque', 'chequeElec', 'directo', 'efectivo', 'ordenpago', 'servipag']);

const AFP_NAME_ALIASES = {
  inp: 'Servicio Seguro Social',
  'ing capital': 'Capital',
  'afp uno': 'AFP UNO',
  'no definida': 'Sin definir',
};

const HEALTH_NAME_ALIASES = {
  fonasa: 'FONASA',
  banmedica: 'ISAPRE Banmedica',
  consalud: 'ISAPRE Consalud',
  'isapre cruzblanca': 'ISAPRE Cruz-Blanca',
  'cruz blanca': 'ISAPRE Cruz-Blanca',
  'cruzblanca': 'ISAPRE Cruz-Blanca',
  'isapre nueva mas vida': 'ISAPRE Nueva Mas Vida',
  'nueva mas vida': 'ISAPRE Nueva Mas Vida',
  'fund salud trabaj bco estado': 'ISAPRE Banco Estado',
  'isapre de codelco ltda': 'ISALUD ISAPRE de Codelco LTDA',
  colmena: 'ISAPRE Colmena',
  'vida tres': 'ISAPRE Vidatres',
  esencial: 'ISAPRE Esencial',
};

const BANK_NAME_ALIASES = {
  'credito inversiones': 'Banco BCI',
  'de chile': 'Banco de CHILE',
  chile: 'Banco de CHILE',
  'banco chile': 'Banco de CHILE',
  'estado de chile': 'Banco del Estado de Chile',
  estado: 'Banco del Estado de Chile',
  'banco estado': 'Banco del Estado de Chile',
  santander: 'Banco Santander Chile',
  bci: 'Banco BCI',
  itau: 'Banco ITAU',
  falabella: 'Banco Falabella',
  security: 'Banco Security',
  bice: 'Banco BICE',
  consorcio: 'Banco Consorcio',
  ripley: 'Banco Ripley',
  internacional: 'Banco Internacional',
  copeuch: 'Banco Coopeuch',
};

const ZONE_EMPTY_ALIASES = new Set(['sin rebaja de zona', 'sin rebaja de zona finning']);

const OCCUPATIONAL_LEVEL_RULES = [
  { id: 'ejecutivo', keywords: ['gerente', 'director', 'chief', 'vp', 'vicepresidente'] },
  { id: 'mando_medio', keywords: ['jefe', 'supervisor', 'coordinador', 'encargado', 'lider'] },
  {
    id: 'administrativo',
    keywords: ['administrativo', 'administrativa', 'asistente', 'secretaria', 'recepcion', 'analista administrativo'],
  },
  {
    id: 'profesional',
    keywords: ['ingeniero', 'abogado', 'analista', 'contador', 'representante comercial', 'consultor', 'especialista'],
  },
  { id: 'trabajo_calificado', keywords: ['tecnico', 'mecanico', 'operador', 'electricista', 'soldador', 'chofer'] },
  { id: 'trabajo_semi_cali', keywords: ['ayudante', 'apoyo', 'auxiliar'] },
  { id: 'trabajo_no_cali', keywords: ['aseo', 'jornal', 'peon'] },
];

const CATEGORY_INE_RULES = [
  { id: 'ine_gerentes', keywords: ['gerente', 'director', 'chief', 'vp', 'vicepresidente'] },
  { id: 'ine_profesionales', keywords: ['ingeniero', 'abogado', 'analista', 'contador', 'consultor'] },
  { id: 'ine_tecnicos', keywords: ['tecnico', 'instructor tecnico', 'mecanico', 'electricista'] },
  { id: 'ine_administrativos', keywords: ['administrativo', 'asistente', 'secretaria', 'recepcion'] },
  { id: 'ine_comercio', keywords: ['comercial', 'ventas', 'vendedor', 'representante comercial'] },
  { id: 'ine_montaje', keywords: ['operador', 'montaje', 'maquina'] },
  { id: 'ine_sical', keywords: ['calificado', 'especialista'] },
  { id: 'ine_protecion', keywords: ['seguridad', 'proteccion', 'guardia'] },
  { id: 'ine_nocal', keywords: ['auxiliar', 'ayudante', 'aseo', 'peon'] },
];

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
  const normalizedPosition = normalizeLooseText(sourceRow.POSICION);
  const normalizedAreaSource = normalizeLooseText(sourceRow['UNIDAD DE NEGOCIOS']);
  const sourceEstado = cleanCell(sourceRow.ESTADO);
  const noCotiza = isNoCotiza(sourceRow);
  const parsedName = splitEmployeeName(sourceRow.NOMBRE);
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
  const cargo = resolveCatalogField({
    key: 'cargo',
    label: 'Cargo',
    catalogName: 'Cargo',
    sourceValue: sourceRow.POSICION,
    correctionValue: corrections?.cargo,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    normalizer: normalizeLooseText,
    allowHeuristicMatch: true,
    allowScoredMatch: true,
  });
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
      normalizedSource: normalizedPosition,
      normalizedArea: normalizedAreaSource,
      rules: OCCUPATIONAL_LEVEL_RULES,
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
      normalizedSource: normalizedPosition,
      normalizedArea: normalizedAreaSource,
      occupationalLevelId: nivelOcupacional.value,
    }),
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
  });
  const terminationCause = resolveCatalogField({
    key: 'terminationCause',
    label: 'Causal de término del contrato',
    catalogName: 'Causal de término de contrato',
    sourceValue: sourceRow['MOTIVO RETIRO'],
    correctionValue: corrections?.terminationCause,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    normalizer: normalizeLooseText,
    allowBlank: true,
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
  exportedRow.Comuna = comunaResolution.comunaId;
  exportedRow.Ciudad = comunaResolution.cityId;
  exportedRow.Region = comunaResolution.regionId;
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
  exportedRow['Estado de jubilación'] = resolveRetirementStatus(sourceRow.JUBILADO);
  exportedRow['Sistema de pensiones'] = resolvePensionSystem(sourceRow.AFP);
  exportedRow['Id institución de salud'] = health.value;
  exportedRow['Monto cotizado en la Isapre en UF'] = resolveHealthAmount(health.value);
  exportedRow['Moneda de la cotización'] = resolveHealthCurrency(health.value);
  exportedRow['Nombre del contrato'] = cleanCell(sourceRow['NOMBRE CONTRATO']);
  exportedRow['Tipo del contrato'] = contractTypeValue;
  exportedRow['Fecha de inicio del contrato'] = formatRexDate(sourceRow['FECHA INGRESO']);
  exportedRow['Fecha de término del contrato'] = formatRexDate(sourceRow['FEC FIN CONTRATO']);
  exportedRow['Sueldo base'] = formatIntegerValue(sourceRow['SUELDO BASE']);
  exportedRow.Cargo = cargo.value;
  exportedRow['Id centro de costo'] = costCenter.value;
  exportedRow['Id sede donde se desempeña'] = sede.value;
  exportedRow['¿Realiza trabajo pesado?'] = resolveHeavyWorkFlag(sourceRow);
  exportedRow['Porcentaje de cotización por trabajo pesado'] =
    exportedRow['¿Realiza trabajo pesado?'] === 'S' ? '2' : '';
  exportedRow['Id sindicato'] = union.value;
  exportedRow['¿Jornada parcial?'] = resolvePartialShift(sourceRow['HORAS JORNADA']);
  exportedRow['Horas de trabajo semanales'] = resolveWeeklyHours(sourceRow['HORAS JORNADA']);
  exportedRow['¿Cotiza seguro de cesantía?'] = sourceRow['FECHA SEGURO CESANTIA'] ? 'S' : 'N';
  exportedRow['Fecha de incorporación al seguro de cesantía'] = formatRexDate(sourceRow['FECHA SEGURO CESANTIA']);
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
  exportedRow['Reconocimiento de Antigüedad'] = hasRecognizedAntiquity(sourceRow) ? 'S' : '';
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

function resolveCatalogField({
  key,
  label,
  catalogName,
  sourceValue,
  correctionValue,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
  aliases = {},
  normalizer = normalizeLooseText,
  allowBlank = false,
  allowHeuristicMatch = false,
  allowScoredMatch = false,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return { value: directCorrection };
  }

  const candidate = cleanCell(sourceValue);

  if (!candidate) {
    if (allowBlank) {
      return { value: '' };
    }

    pendingItems.push(
      buildPendingItem({
        key,
        label,
        type: 'catalog',
        catalogName,
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: '',
      }),
    );
    return { value: '' };
  }

  const catalog = templateResource.catalogs[catalogName] ?? [];
  const aliasCandidate = aliases[normalizer(candidate)] ?? candidate;
  const exactMatch = findCatalogMatch({
    catalog,
    candidate: aliasCandidate,
    normalizer,
  });

  if (exactMatch) {
    return { value: exactMatch.id };
  }

  if (allowHeuristicMatch) {
    const heuristicMatch = findHeuristicCatalogMatch({
      catalog,
      candidate,
      normalizer,
    });

    if (heuristicMatch) {
      return { value: heuristicMatch.id };
    }
  }

  if (allowScoredMatch) {
    const scoredMatch = findScoredCatalogMatch({
      catalog,
      candidate,
      normalizer,
    });

    if (scoredMatch) {
      return { value: scoredMatch.id };
    }
  }

  pendingItems.push(
    buildPendingItem({
      key,
      label,
      type: 'catalog',
      catalogName,
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: candidate,
    }),
  );
  return { value: '' };
}

function resolveBankField({
  sourceValue,
  correctionValue,
  paymentMethodValue,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
  required,
}) {
  if (!required) {
    return { value: '' };
  }

  if (paymentMethodValue === 'cuentarut') {
    return { value: 'estado' };
  }

  return resolveCatalogField({
    key: 'bank',
    label: 'Id banco',
    catalogName: 'Id banco',
    sourceValue,
    correctionValue,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: BANK_NAME_ALIASES,
    normalizer: normalizeBankName,
    allowHeuristicMatch: true,
    allowScoredMatch: true,
  });
}

function resolveContractTypeField({
  sourceRow,
  correctionValue,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return { value: directCorrection };
  }

  const sourceValue = cleanCell(sourceRow['NOMBRE CONTRATO']);
  const inferredContractTypeId = inferContractTypeId({
    sourceValue,
    endDateValue: sourceRow['FEC FIN CONTRATO'],
  });

  if (inferredContractTypeId) {
    const catalog = templateResource.catalogs['Tipo del contrato'] ?? [];
    const inferredMatch =
      findCatalogMatch({
        catalog,
        candidate: inferredContractTypeId,
        normalizer: normalizeLooseText,
      }) ||
      findCatalogMatch({
        catalog,
        candidate: inferredContractTypeId === 'I' ? 'Indefinido' : 'Plazo fijo',
        normalizer: normalizeLooseText,
      });

    if (inferredMatch) {
      return { value: inferredMatch.id };
    }

    return { value: inferredContractTypeId };
  }

  return resolveCatalogField({
    key: 'contractType',
    label: 'Tipo del contrato',
    catalogName: 'Tipo del contrato',
    sourceValue,
    correctionValue,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: CONTRACT_TYPE_ALIASES,
    normalizer: normalizeLooseText,
    allowHeuristicMatch: true,
  });
}

function resolveSedeField({
  sourceValue,
  secondarySourceValue,
  correctionValue,
  sourceCompanyValue,
  resolvedCompanyId,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return { value: directCorrection };
  }

  const candidateValues = [cleanCell(sourceValue), cleanCell(secondarySourceValue)].filter(Boolean);

  if (candidateValues.length === 0) {
    pendingItems.push(
      buildPendingItem({
        key: 'sede',
        label: 'Id sede donde se desempeña',
        type: 'catalog',
        catalogName: 'Id sede donde se desempeña',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: '',
      }),
    );
    return { value: '' };
  }

  const catalog = templateResource.catalogs['Id sede donde se desempeña'] ?? [];
  const candidateOptions = candidateValues.flatMap((candidateValue) =>
    buildSedeCandidates({
      sourceValue: candidateValue,
      sourceCompanyValue,
      resolvedCompanyId,
    }),
  );

  for (const candidateOption of candidateOptions) {
    const exactMatch = findCatalogMatch({
      catalog,
      candidate: candidateOption,
      normalizer: normalizeSedeName,
    });

    if (exactMatch) {
      return { value: exactMatch.id };
    }
  }

  for (const candidateOption of candidateOptions) {
    const heuristicMatch = findHeuristicCatalogMatch({
      catalog,
      candidate: candidateOption,
      normalizer: normalizeSedeName,
    });

    if (heuristicMatch) {
      return { value: heuristicMatch.id };
    }
  }

  pendingItems.push(
    buildPendingItem({
      key: 'sede',
      label: 'Id sede donde se desempeña',
      type: 'catalog',
      catalogName: 'Id sede donde se desempeña',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: candidateValues.join(' / '),
    }),
  );
  return { value: '' };
}

function resolveAfpField({ sourceRow, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName, noCotiza }) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  if (cleanCell(correctionValue)) {
    return { value: cleanCell(correctionValue) };
  }

  if (noCotiza) {
    return { value: 'afp' };
  }

  return resolveCatalogField({
    key: 'afp',
    label: 'Id AFP',
    catalogName: 'Id AFP',
    sourceValue: sourceRow.AFP,
    correctionValue,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: AFP_NAME_ALIASES,
    normalizer: normalizeAfpName,
    allowHeuristicMatch: true,
  });
}

function resolveHealthField({ sourceRow, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  return resolveCatalogField({
    key: 'health',
    label: 'Id institución de salud',
    catalogName: 'Id institución de salud',
    sourceValue: sourceRow.ISAPRE,
    correctionValue,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    aliases: HEALTH_NAME_ALIASES,
    normalizer: normalizeHealthName,
    allowHeuristicMatch: true,
  });
}

function resolveFixedProfessionField({ correctionValue, templateResource }) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { value: '' };
  }

  const directCorrection = cleanCell(correctionValue);

  if (directCorrection) {
    return { value: directCorrection };
  }

  const professionCatalog = templateResource.catalogs.Profesión ?? [];
  const fixedMatch =
    findCatalogMatch({
      catalog: professionCatalog,
      candidate: 'Sin Definir',
      normalizer: normalizeLooseText,
    }) ||
    findCatalogMatch({
      catalog: professionCatalog,
      candidate: 'sinDefinir',
      normalizer: normalizeLooseText,
    });

  return { value: fixedMatch?.id ?? 'sinDefinir' };
}

function resolvePhone({ key, label, sourceValue, corrections, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(corrections?.[key])) {
    return '';
  }

  const directCorrection = cleanCell(corrections?.[key]);

  if (directCorrection) {
    return directCorrection;
  }

  const normalizedPhone = normalizePhone(sourceValue);

  if (normalizedPhone) {
    return normalizedPhone;
  }

  pendingItems.push(
    buildPendingItem({
      key,
      label,
      type: 'text',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: cleanCell(sourceValue),
      bulkDefaultValue: key === 'emails' ? 'sincorreo@gmail.com' : '',
    }),
  );
  return '';
}

function resolveEmail({ sourceRow, corrections, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(corrections?.emails)) {
    return { email: '' };
  }

  const directCorrection = cleanCell(corrections?.emails).toLowerCase();

  if (directCorrection) {
    return { email: directCorrection };
  }

  const ciMatches = templateResource.emailCatalog.byCi.get(cleanCell(sourceRow.CI)) ?? [];
  const employeeMatches = templateResource.emailCatalog.byEmployeeId.get(cleanCell(sourceRow['ID EMPLEADO'])) ?? [];
  const uniqueMatches = [...new Set([...ciMatches, ...employeeMatches].filter(Boolean))];

  if (uniqueMatches.length === 1) {
    return { email: uniqueMatches[0] };
  }

  pendingItems.push(
    buildPendingItem({
      key: 'emails',
      label: 'Correos',
      type: 'text',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: uniqueMatches.join(', '),
      bulkDefaultValue: 'sincorreo@gmail.com',
    }),
  );

  return { email: '' };
}

function resolveAddress({ sourceValue, corrections, pendingItems, rowNumber, employeeId, employeeName }) {
  const shouldKeepStreetNameBlank = isIntentionalBlankCorrection(corrections?.streetName);
  const shouldKeepStreetNumberBlank = isIntentionalBlankCorrection(corrections?.streetNumber);
  const parsedAddress = parseAddress(sourceValue);
  const streetNameCorrection = shouldKeepStreetNameBlank ? '' : cleanCell(corrections?.streetName);
  const streetNumberCorrection = shouldKeepStreetNumberBlank ? '' : cleanCell(corrections?.streetNumber);

  if (!streetNameCorrection && !parsedAddress.streetName && !shouldKeepStreetNameBlank && !cleanCell(sourceValue)) {
    pendingItems.push(
      buildPendingItem({
        key: 'streetName',
        label: 'Nombre Calle',
        type: 'text',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: cleanCell(sourceValue),
      }),
    );
  }

  if (!streetNumberCorrection && !parsedAddress.streetNumber && !shouldKeepStreetNumberBlank && hasAddressNumberHint(sourceValue)) {
    pendingItems.push(
      buildPendingItem({
        key: 'streetNumber',
        label: 'Numero Calle',
        type: 'text',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: cleanCell(sourceValue),
      }),
    );
  }

  return {
    streetName: streetNameCorrection || parsedAddress.streetName,
    streetNumber: streetNumberCorrection || parsedAddress.streetNumber,
    department: parsedAddress.department,
  };
}

function resolveComuna({ sourceValue, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return {
      comunaId: '',
      cityId: '',
      regionId: '',
    };
  }

  const directCorrection = cleanCell(correctionValue);
  const catalog = templateResource.catalogs.Comuna ?? [];
  const selectedComuna =
    catalog.find((item) => item.id === directCorrection) ||
    findCatalogMatch({
      catalog,
      candidate: sourceValue,
      normalizer: normalizeLooseText,
    }) ||
    findHeuristicCatalogMatch({
      catalog,
      candidate: sourceValue,
      normalizer: normalizeLooseText,
    }) ||
    findScoredCatalogMatch({
      catalog,
      candidate: sourceValue,
      normalizer: normalizeLooseText,
    });

  if (!selectedComuna) {
    pendingItems.push(
      buildPendingItem({
        key: 'comuna',
        label: 'Comuna',
        type: 'catalog',
        catalogName: 'Comuna',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: cleanCell(sourceValue),
      }),
    );
    return {
      comunaId: '',
      cityId: '',
      regionId: '',
    };
  }

  const regionId = selectedComuna.id.slice(0, 2);
  const cityId = resolveCityIdForRegion(regionId, selectedComuna.name, templateResource.catalogs.Ciudad ?? []);

  return {
    comunaId: selectedComuna.id,
    cityId,
    regionId,
  };
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

function buildPendingItem({
  key,
  label,
  type,
  catalogName = '',
  rowNumber,
  employeeId,
  employeeName,
  sourceValue,
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
    bulkDefaultValue,
  };
}

function isIntentionalBlankCorrection(value) {
  return value === REX_KEEP_CURRENT_CORRECTION || value === REX_EMPTY_CORRECTION;
}

function splitEmployeeName(value) {
  const rawValue = cleanCell(value);
  const [lastNames = '', names = ''] = rawValue.split(/\s*,\s*/);
  const lastNameParts = lastNames.split(/\s+/).filter(Boolean);

  return {
    names: cleanCell(names),
    lastName: lastNameParts[0] ?? '',
    middleName: lastNameParts.slice(1).join(' '),
  };
}

function resolveStatusValue(value) {
  return STATUS_ALIASES[normalizeLooseText(value)] ?? 'I';
}

function resolveSexValue(value) {
  const normalizedValue = normalizeLooseText(value);
  return normalizedValue.startsWith('fem') ? 'F' : normalizedValue.startsWith('mas') ? 'M' : '';
}

function resolveRetirementStatus(value) {
  const normalizedValue = cleanCell(value).toUpperCase();

  if (normalizedValue === 'S') {
    return '1';
  }

  if (normalizedValue === 'X') {
    return '2';
  }

  return '0';
}

function resolvePensionSystem(afpValue) {
  return normalizeAfpName(afpValue) === 'inp' ? 'S' : 'N';
}

function resolveHealthAmount(healthValue) {
  if (!healthValue) {
    return '';
  }

  if (healthValue === 'fonasa') {
    return '';
  }

  return '0';
}

function resolveHealthCurrency(healthValue) {
  if (!healthValue) {
    return '';
  }

  return healthValue === 'fonasa' ? '%' : 'U';
}

function resolveWeeklyHours(value) {
  const numericValue = Number(cleanCell(value));

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '';
  }

  return String(Math.round(numericValue / 4));
}

function resolvePartialShift(value) {
  const weeklyHours = Number(resolveWeeklyHours(value));

  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    return '';
  }

  return weeklyHours <= 30 ? 'S' : 'N';
}

function resolveHeavyWorkFlag(sourceRow) {
  const heavyWorkFields = [
    'APORTE EMPRESA TRABAJO PESADO',
    'TRAB. PESADO RELIQ EMPLEADOR',
    'TRABAJO PESADO RELIQUIDADO',
    'TRABAJO PESADO DESC. TRABAJADOR',
  ];

  return heavyWorkFields.some((field) => Number(cleanCell(sourceRow[field])) > 0) ? 'S' : 'N';
}

function resolveContributionFlag({ noCotiza, afpValue, healthValue }) {
  if (noCotiza) {
    return 'N';
  }

  return afpValue && healthValue ? 'S' : '';
}

function resolveVacationStartDate(sourceRow) {
  const antiguedadDate = toDateOnly(sourceRow['FECHA ANTIGUEDAD']);
  const ingresoDate = toDateOnly(sourceRow['FECHA INGRESO']);

  if (antiguedadDate && ingresoDate && antiguedadDate.getTime() < ingresoDate.getTime()) {
    return formatDateAsDmy(antiguedadDate);
  }

  return formatDateAsDmy(ingresoDate);
}

function hasRecognizedAntiquity(sourceRow) {
  const antiguedadDate = toDateOnly(sourceRow['FECHA ANTIGUEDAD']);
  const ingresoDate = toDateOnly(sourceRow['FECHA INGRESO']);

  if (!antiguedadDate || !ingresoDate) {
    return false;
  }

  return antiguedadDate.getTime() < ingresoDate.getTime();
}

function calculateMonthDifference(startValue, endValue) {
  const startDate = toDateOnly(startValue);
  const endDate = toDateOnly(endValue);

  if (!startDate || !endDate || startDate.getTime() >= endDate.getTime()) {
    return 0;
  }

  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
  months += endDate.getMonth() - startDate.getMonth();

  if (endDate.getDate() < startDate.getDate()) {
    months -= 1;
  }

  return Math.max(months, 0);
}

function inferFromKeywordRules({ normalizedSource, normalizedArea, rules }) {
  const combinedSource = `${normalizedSource} ${normalizedArea}`.trim();
  const matchedRule = rules.find((rule) => rule.keywords.some((keyword) => combinedSource.includes(keyword)));
  return matchedRule?.id ?? '';
}

function inferIneCategory({ normalizedSource, normalizedArea, occupationalLevelId }) {
  const directRule = inferFromKeywordRules({
    normalizedSource,
    normalizedArea,
    rules: CATEGORY_INE_RULES,
  });

  if (directRule) {
    return directRule;
  }

  const occupationalFallbacks = {
    ejecutivo: 'ine_gerentes',
    mando_medio: 'ine_profesionales',
    administrativo: 'ine_administrativos',
    profesional: 'ine_profesionales',
    trabajo_calificado: 'ine_tecnicos',
    trabajo_semi_cali: 'ine_nocal',
    trabajo_no_cali: 'ine_nocal',
  };

  return occupationalFallbacks[occupationalLevelId] ?? '';
}

function findCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  return catalog.find(
    (item) =>
      normalizer(item.name) === normalizedCandidate ||
      normalizer(item.id) === normalizedCandidate,
  );
}

function findHeuristicCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const matches = catalog.filter((item) => {
    const normalizedName = normalizer(item.name);
    return normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName);
  });

  return matches.length === 1 ? matches[0] : null;
}

function findScoredCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const candidateTokens = tokenizeNormalized(normalizedCandidate);
  const rankedMatches = catalog
    .map((item) => {
      const normalizedName = normalizer(item.name);
      const normalizedId = normalizer(item.id);
      const nameTokens = tokenizeNormalized(normalizedName);
      const sharedTokens = candidateTokens.filter((token) => nameTokens.includes(token));
      let score = sharedTokens.length * 18;

      if (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName)) {
        score += 36;
      }

      if (normalizedId === normalizedCandidate) {
        score += 50;
      }

      if (candidateTokens.length > 0 && sharedTokens.length === candidateTokens.length) {
        score += 18;
      }

      return {
        item,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  const [bestMatch, secondMatch] = rankedMatches;

  if (!bestMatch || bestMatch.score < 36) {
    return null;
  }

  if (secondMatch && bestMatch.score - secondMatch.score < 12) {
    return null;
  }

  return bestMatch.item;
}

function inferContractTypeId({ sourceValue, endDateValue }) {
  const normalizedSource = normalizeLooseText(sourceValue);

  if (
    normalizedSource.includes('indef') ||
    normalizedSource.includes('indefinido')
  ) {
    return 'I';
  }

  if (
    normalizedSource.includes('plazo') ||
    normalizedSource.includes('fijo') ||
    normalizedSource.includes('pf')
  ) {
    return 'F';
  }

  if (cleanCell(endDateValue)) {
    return 'F';
  }

  if (normalizedSource) {
    return 'I';
  }

  return '';
}

function buildSedeCandidates({ sourceValue, sourceCompanyValue, resolvedCompanyId }) {
  const rawValue = cleanCell(sourceValue);
  const branchName = rawValue.replace(/^(sucursal|oficina|agencia)\s+/i, '').trim();
  const candidates = [rawValue];

  if (branchName && branchName !== rawValue) {
    candidates.push(branchName);

    const companySedePrefix = getCompanySedePrefix(sourceCompanyValue, resolvedCompanyId);

    if (companySedePrefix) {
      candidates.push(`${companySedePrefix} ${branchName}`);
    }
  }

  return [...new Set(candidates.map(cleanCell).filter(Boolean))];
}

function getCompanySedePrefix(sourceCompanyValue, resolvedCompanyId) {
  if (cleanCell(resolvedCompanyId) === '4') {
    return 'Diperk';
  }

  if (cleanCell(resolvedCompanyId) === '5') {
    return 'Sitech';
  }

  const normalizedCompany = normalizeLooseText(sourceCompanyValue);

  if (normalizedCompany.includes('distribuidora perkins chilena') || normalizedCompany.includes('diperk')) {
    return 'Diperk';
  }

  if (normalizedCompany.includes('sitech')) {
    return 'Sitech';
  }

  return '';
}

function isNoCotiza(sourceRow) {
  return normalizeLooseText(sourceRow.AFP) === 'no definida' || cleanCell(sourceRow['CODIGO AFP']) === '9999';
}

function normalizePhone(value) {
  const digits = cleanCell(value).replace(/\D/g, '');

  if (!digits || /^0+$/.test(digits)) {
    return '';
  }

  if (digits.length === 11 && digits.startsWith('56')) {
    return `+${digits}`;
  }

  if (digits.length === 9 && digits.startsWith('9')) {
    return `+56${digits}`;
  }

  if (digits.length === 9 && digits.startsWith('2')) {
    return `+56${digits}`;
  }

  if (digits.length === 8 && digits.startsWith('2')) {
    return `+562${digits.slice(1)}`;
  }

  return '';
}

function parseAddress(value) {
  const rawValue = cleanCell(value).replace(/\s+/g, ' ');

  if (!rawValue) {
    return {
      streetName: '',
      streetNumber: '',
      department: '',
    };
  }

  const departmentMatch = rawValue.match(/(?:depto|dpto|of|oficina)\s+([a-z0-9-]+)/i);
  const department = departmentMatch?.[1] ?? '';
  const withoutDepartment = departmentMatch ? rawValue.replace(departmentMatch[0], '').trim() : rawValue;
  const streetMatch = withoutDepartment.match(/^(.*?)(?:\s+|,\s*)(\d+[a-zA-Z-]*)$/);

  if (!streetMatch) {
    const inlineNumberMatch = withoutDepartment.match(/\b(\d+[a-zA-Z-]*)\b/);
    const streetNumber = inlineNumberMatch?.[1] ?? '';
    const streetName = streetNumber
      ? cleanCell(withoutDepartment.replace(inlineNumberMatch[0], '').replace(/\s+/g, ' '))
      : cleanCell(withoutDepartment);

    return {
      streetName,
      streetNumber,
      department,
    };
  }

  return {
    streetName: cleanCell(streetMatch[1]),
    streetNumber: cleanCell(streetMatch[2]),
    department: cleanCell(department),
  };
}

function resolveCityIdForRegion(regionId, comunaName, cityCatalog) {
  const normalizedComuna = normalizeLooseText(comunaName);
  const exactCity = cityCatalog.find((item) => normalizeLooseText(item.name) === normalizedComuna);

  if (exactCity) {
    return exactCity.id;
  }

  const regionMatches = cityCatalog.filter((item) => item.id.startsWith(`${regionId}-`));
  return regionMatches[0]?.id ?? '';
}

function normalizeLooseText(value) {
  return normalizeText(value)
    .replace(/[().,/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAreaName(value) {
  return normalizeLooseText(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bjuan\b|\bpedro\b|\bcristian\b|\bsebastian\b|\bsebastián\b|\bjoaquin\b|\bjoaquín\b|\bmark\b|\bneil\b|\bdori\b|\btrinidad\b|\bgerman\b|\bgermán\b|\bcheryl\b|\bgray\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeNormalized(value) {
  return String(value)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => token.length > 2);
}

function hasAddressNumberHint(value) {
  return /\d/.test(cleanCell(value));
}

function normalizeSedeName(value) {
  return normalizeLooseText(value)
    .replace(/\bsucursal\b/g, '')
    .replace(/\boficina\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePaymentMethodName(value) {
  return normalizeLooseText(value).replace(/\bcta\b/g, 'cuenta');
}

function normalizeBankName(value) {
  return normalizeLooseText(value)
    .replace(/\bbanco\b/g, '')
    .replace(/\bdel\b/g, '')
    .replace(/\bde\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAfpName(value) {
  return normalizeLooseText(value)
    .replace(/\bs a\b/g, '')
    .replace(/\bafp\b/g, '')
    .replace(/\bj\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHealthName(value) {
  return normalizeLooseText(value)
    .replace(/\bisapre\b/g, '')
    .replace(/\bs a\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatIntegerValue(value) {
  const numericValue = Number(cleanCell(value));
  return Number.isFinite(numericValue) ? String(Math.trunc(numericValue)) : '';
}

function formatRut(value) {
  const rawValue = cleanCell(value).replace(/\./g, '').toUpperCase();

  if (!rawValue) {
    return '';
  }

  const [body, verifier = ''] = rawValue.split('-');
  const numericBody = body.replace(/\D/g, '');

  if (!numericBody || !verifier) {
    return rawValue;
  }

  return `${numericBody}-${verifier}`;
}

function formatRexDate(value) {
  const dateValue = toDateOnly(value);
  return formatDateAsDmy(dateValue);
}

function toDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedDate = XLSX.SSF.parse_date_code(value);

    if (!parsedDate) {
      return null;
    }

    return new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d);
  }

  const rawValue = cleanCell(value);

  if (!rawValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [year, month, day] = rawValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const normalizedYear = year.length === 2 ? Number(`20${year}`) : Number(year);
    return new Date(normalizedYear, Number(month) - 1, Number(day));
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
}

function formatDateAsDmy(dateValue) {
  if (!dateValue || Number.isNaN(dateValue.getTime())) {
    return '';
  }

  const day = String(dateValue.getDate()).padStart(2, '0');
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const year = dateValue.getFullYear();
  return `${day}/${month}/${year}`;
}
