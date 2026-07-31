import * as XLSX from 'xlsx';
import { cleanCell, extractValidEmail, normalizeText } from '../../lib/utils';

export const REX_KEEP_CURRENT_CORRECTION = '__KEEP_CURRENT__';
export const REX_EMPTY_CORRECTION = '__EMPTY__';
const REX_DEFAULT_PRIMARY_PHONE = '+56999999999';

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
  'distribuidora perkins chilena sac': 'Distribuidora Perkins Chilena S.A.C',
  'sitech southern cone spa': 'Sitech Southern Cone SPA',
};

const STATUS_ALIASES = {
  activo: 'A',
  vigente: 'A',
  inactivo: 'A',
  desvinculado: 'A',
  retirado: 'A',
  finiquitado: 'A',
  baja: 'A',
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
  'no especif': 'S',
  'no especificado': 'S',
  'casado a': 'C',
  casado: 'C',
  'viudo a': 'V',
  viudo: 'V',
  divorciado: 'D',
  divorciada: 'D',
  'conviviente civil': 'U',
  'ac u civil': 'U',
};

const NATION_ALIASES = {
  chileno: 'chile',
  chilena: 'chile',
  'chileno a': 'chile',
  venezolano: 'venezuela',
  venezolana: 'venezuela',
  'venezolano a': 'venezuela',
  peruano: 'peru',
  peruana: 'peru',
  'peruano a': 'peru',
  boliviano: 'bolivia',
  boliviana: 'bolivia',
  'boliviano a': 'bolivia',
  colombiano: 'colombia',
  colombiana: 'colombia',
  'colombiano a': 'colombia',
  argentino: 'argentina',
  argentina: 'argentina',
  'argentino a': 'argentina',
  ecuatoriano: 'ecuador',
  ecuatoriana: 'ecuador',
  'ecuatoriano a': 'ecuador',
  brasileno: 'brasil',
  brasilena: 'brasil',
  'brasileno a': 'brasil',
  uruguayo: 'uruguay',
  uruguaya: 'uruguay',
  'uruguayo a': 'uruguay',
  chino: 'china',
  china: 'china',
  'chino a': 'china',
  paraguayo: 'paraguay',
  paraguaya: 'paraguay',
  'paraguayo a': 'paraguay',
  guatemalteco: 'guatemala',
  guatemalteca: 'guatemala',
  'guatemalteco a': 'guatemala',
  espanol: 'espana',
  espanola: 'espana',
  'espanol a': 'espana',
  mexicano: 'mexico',
  mexicana: 'mexico',
  'mexicano a': 'mexico',
  haitiano: 'haiti',
  haitiana: 'haiti',
  'haitiano a': 'haiti',
};

const PAYMENT_METHOD_ALIASES = {
  'deposito vale vista': 'valevista',
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

const PAYMENT_METHODS_WITHOUT_BANK = new Set(['cheque', 'chequeElec', 'directo', 'efectivo', 'ordenpago', 'servipag', 'valevista']);

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
  desarrollo: 'Scotiabank',
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

const ZONE_NAME_ALIASES = {
  'rebaja de zona iquique finning': 'tarapaca_zona1',
  'rebaja de zona punta arenas finning': 'magallanes_zona1',
};

const SEDE_NAME_ALIASES = {
  'radomiro tomic i': ['Contrato Radomiro Tomic'],
  'suc antof': ['ANTOFAGASTA'],
  'tte rajo sur': ['Contrato Teniente Rajo Sur'],
  concepcion: ['Contrato Arauco Concepcion'],
  'suc concepcion': ['Contrato Arauco Concepcion'],
  'sucursal concepcion': ['Contrato Arauco Concepcion'],
  'minera centinela sulfuro i': ['Contrato Centinela Sulfuro'],
  'suc pto montt': ['Sucursal Puerto Montt'],
  'suc pta arenas': ['Sucursal Punta Arenas'],
  'proyecto cosayach iquique': ['Contrato Proyecto Cosayach Iquique'],
  'minera centinela oxido': ['Contrato Centinela Oxido'],
  'serv min mtos blanc': ['Contrato Mantos Blancos'],
  'suc valdivia': ['Contrato Arauco Valdivia'],
};

const CARGO_NAME_ALIASES = {
  abogado: 'ABOGADO - FINSA',
  'administrativo de repuesto': 'ADMINISTRATIVO DE REPUESTOS',
  'analista de compras tecnicas junio': 'ANALISTA DE COMPRAS TECNICAS JUNIOR - F',
  'analista de repuestos a finsa chile': 'ANALISTA DE REPUESTOS A - FINAS - CHILE',
  'analista de repuestos b': 'ANALISTA DE REPUESTOS B - FINSA - CHILE',
  'analista i': 'ANALISTA I - FINSA - CHILE',
  'analista sos ii': 'ANALISTA SOS II - FINSA - CHILE',
  'ing de ventas repuestos servicios': 'Ingeniero de Ventas Repuestos & Servicio',
  'ingeniero control de gestion senio': 'INGENIERO CONTROL DE GESTION SENIOR- FI',
  'ingeniero de servicios electrico': 'Ingeniero de Servicio',
  'ingeniero de venta equipos e m': 'Ingeniero de Ventas Equipos',
  'ingeniero de ventas semi senior finsa': 'Ingeniero de Ventas Semi Senior',
  'ingeniero en prevencion de riesgos y ges': 'INGENIERO EN PREVENCION DE RIESGOS Y GE',
  'interprete sos ii': 'INTERPRETE SOS II - FINSA',
  'jefe de industria': 'JEFE DE INDUSTRIA - FINSA - CHILE',
  'jefe de infraestructura': 'JEFE DE INFRAESTRUCTURA - FINSA - CHILE',
  'jefe de servicios ti': 'JEFE DE SERVICIOS TI - FINSA',
  'jefe de ventas': 'JEFE DE VENTAS - FINSA',
  'jefe servicio tecnico senior fins': 'JEFE SERVICIO TECNICO SENIOR- FINSA - C',
  'jefe sucursal': 'JEFE SUCURSAL - FINSA',
  'lider de revision operacional': 'Lid de Revision Operacional -FINSA-Chile',
  'maestro ii': 'MAESTRO II - FINSA - CHILE',
  'mecanico a dpp': 'MECANICO A DPP - FINSA - CHILE',
  'pintor lavador crc antofagasta': 'PINTOR LAVADOR - FINSA - CHILE',
  'supervisor de rec y despacho': 'SUPERVISOR DE REC Y DESPACHO - FINSA -',
  'supervisor de terreno': 'SUPERVISOR DE TERRENO - FINSA - CHILE',
  'tecnico implem': 'Tecnico Implementacion Tecnologico',
  'tecnico implementacion': 'Tecnico Implementacion Tecnologico',
};

const CARGO_TOKEN_STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'finsa', 'finas', 'chile']);

const COMUNA_ALIASES = {
  'san pedro de atacama': 'San Pedro Atacama',
  'andacollo coquimbo': 'Andacollo',
  'bulnes 1031 quillota': 'Quillota',
  'almirante grau 2833 quilpue valparaiso': 'Quilpue',
  calera: 'La Calera',
  'llay llay': 'Llaillay',
  chillnn: 'Chillán',
  maipau: 'Maipu',
  epcion: 'Concepcion',
  curicaao: 'Curico',
  paipote: 'Copiapo',
  'quillota 700': 'Quillota',
};

const LOCATION_COMUNA_ALIASES = {
  'sucursal antofagasta': 'Antofagasta',
  'centro de servicio la negra csar': 'Antofagasta',
  'centro de servicio antofagasta csan': 'Antofagasta',
  'centro formacion tecnico antofagasta': 'Antofagasta',
  'centro hidraulico': 'Antofagasta',
  'centro hidraulico antofagasta': 'Antofagasta',
  'dpp antofagasta': 'Antofagasta',
  'contrato escondida': 'Antofagasta',
  'contrato andina': 'Los Andes',
  'sucursal santiago': 'Santiago',
  'diperk sucursal santiago': 'Santiago',
  'huechuraba edificio corporativo': 'Huechuraba',
  'sucursal coquimbo': 'Coquimbo',
  'sucursal copiapo': 'Copiapo',
  'sucursal concepcion': 'Concepcion',
  'diperk sucursal concepcion': 'Concepcion',
  'sucursal puerto montt': 'Puerto Montt',
  'sucursal calama': 'Calama',
  'sucursal iquique': 'Iquique',
  'sucursal temuco': 'Temuco',
  'centro de distribucion enea': 'Pudahuel',
  'contrato radomiro tomic': 'Calama',
  'contrato ministro hales': 'Calama',
  'chuquicamata ug': 'Calama',
  'contrato gabriela mistral': 'Calama',
  'contrato teniente rajo sur': 'Rancagua',
  'contrato collahuasi': 'Iquique',
  'contrato quebrada blanca': 'Iquique',
  'contrato candelaria': 'Copiapo',
  'contrato los colorados': 'Copiapo',
  'contrato manto verde': 'Copiapo',
  'contrato pucobre': 'Copiapo',
  'contrato el abra': 'Calama',
  'centro logistica la negra cl la negra': 'Antofagasta',
  'contrato sierra gorda': 'Sierra Gorda',
  'contrato marc sierra gorda': 'Sierra Gorda',
  'contrato centinela sulfuro': 'Sierra Gorda',
  'contrato centinela oxido': 'Sierra Gorda',
  'contrato spence': 'Sierra Gorda',
  'contrato carmen de andacollo': 'Andacollo',
};

const OCCUPATIONAL_LEVEL_RULES = [
  { id: 'ejecutivo', keywords: ['gerente', 'director', 'chief', 'vp', 'vicepresidente', 'gte', 'dtor', 'head of'] },
  { id: 'mando_medio', keywords: ['jefe', 'jefa', 'supervisor', 'coordinador', 'encargado', 'lider'] },
  {
    id: 'administrativo',
    keywords: ['administrativo', 'administrativa', 'asistente', 'secretaria', 'recepcion', 'analista administrativo', 'digitador'],
  },
  {
    id: 'profesional',
    keywords: [
      'instructor',
      'ingeniero',
      'abogado',
      'analista',
      'analyst',
      'architect',
      'arquitecto',
      'contador',
      'programador',
      'planificador',
      'product manager',
      'project manager',
      'product specialist',
      'representante comercial',
      'representante de ventas',
      'consultor',
      'especialista',
      'prevencion',
      'prevención',
      'sheq',
      'seguridad',
      'proteccion',
      'protección',
      'ventas',
      'vendedor',
      'vendedora',
      'vts',
      'rental',
      'arriendo',
      'business partner',
      'planner',
      'soporte al producto',
      'post venta',
      'account manager',
      'category manager',
      'developer',
      'desarrollador',
      'engineer',
      'manager',
      'lead',
      'leader',
      'comprador',
      'pmo',
      'customer success',
      'cientifico de datos',
      'auditoria interna',
      'auditoría interna',
      'ejecutivo de cuenta',
      'pricing',
      'administrador de contrato',
      'administrador aplicaciones',
      'interprete',
      'intérprete',
      'global services lead',
      'specialist',
      'human resources',
      'procurement',
      'mejoramiento de procesos',
      'instructor operaciones',
      'asesor de repuestos',
      'asesor de operaciones',
      'expert',
      'experto',
      'sap',
      'black belt',
      'comunicaciones',
      'diversity',
      'equity',
      'inclusion',
    ],
  },
  {
    id: 'trabajo_calificado',
    keywords: [
      'tecnico',
      'mecanico',
      'operador',
      'electricista',
      'electrico',
      'soldador',
      'chofer',
      'panolero',
      'pañolero',
      'bodeguero',
      'bodega',
      'inventario',
      'auditor de inventario',
      'expeditor',
      'expeditora',
      'mentor',
      'inspector de calidad',
      'inspector de motores',
      'inspector de cores',
      'inspector terreno',
      'calderero',
      'pintor',
      'responsable de pintura',
      'armador de mangueras',
      'armador',
      'instalador',
      'operario',
      'maestro',
      'inspector tecnico',
      'asesor tecnico',
    ],
  },
  { id: 'trabajo_semi_cali', keywords: ['ayudante', 'apoyo', 'auxiliar'] },
  { id: 'trabajo_no_cali', keywords: ['aseo', 'jornal', 'peon'] },
];

const CATEGORY_INE_RULES = [
  { id: 'ine_gerentes', keywords: ['gerente', 'director', 'chief', 'vp', 'vicepresidente'] },
  {
    id: 'ine_profesionales',
    keywords: [
      'ingeniero',
      'abogado',
      'analista',
      'contador',
      'consultor',
      'programador',
      'planificador',
      'planner',
      'developer',
      'business partner',
      'pricing',
      'product manager',
      'project manager',
      'product specialist',
      'business intelligence',
      'workday',
    ],
  },
  { id: 'ine_tecnicos', keywords: ['tecnico', 'instructor', 'instructor tecnico', 'mecanico', 'electricista', 'electrico', 'maestro', 'inspector tecnico', 'asesor tecnico'] },
  { id: 'ine_administrativos', keywords: ['administrativo', 'asistente', 'secretaria', 'recepcion'] },
  { id: 'ine_comercio', keywords: ['comercial', 'ventas', 'vendedor', 'vendedora', 'representante comercial', 'representante de ventas', 'vts', 'rental', 'arriendo'] },
  { id: 'ine_montaje', keywords: ['operador', 'montaje', 'maquina', 'panolero', 'pañolero', 'bodeguero', 'bodega', 'inventario'] },
  { id: 'ine_sical', keywords: ['calificado', 'especialista'] },
  { id: 'ine_protecion', keywords: ['seguridad', 'proteccion', 'protección', 'guardia', 'prevencion', 'prevención', 'sheq'] },
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
      normalizedSource: normalizedOccupationSource,
      normalizedArea: normalizedAreaSource,
      occupationalLevelId: nivelOcupacional.value,
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
  exportedRow['Monto cotizado en la Isapre en UF'] = resolveHealthAmount(health.value);
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

function resolveCargoField({
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

  const catalog = templateResource.catalogs.Cargo ?? [];
  const candidateValues = [cleanCell(sourceRow.POSICION), cleanCell(sourceRow['JOB CODE'])]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const candidateValue of candidateValues) {
    const aliasedCandidate = CARGO_NAME_ALIASES[normalizeLooseText(candidateValue)];

    if (!aliasedCandidate) {
      continue;
    }

    const aliasMatch = findCatalogMatch({
      catalog,
      candidate: aliasedCandidate,
      normalizer: normalizeLooseText,
    });

    if (aliasMatch) {
      return { value: aliasMatch.id };
    }
  }

  for (const candidateValue of candidateValues) {
    const exactMatch = findCatalogMatch({
      catalog,
      candidate: candidateValue,
      normalizer: normalizeLooseText,
    });

    if (exactMatch) {
      return { value: exactMatch.id };
    }
  }

  for (const candidateValue of candidateValues) {
    const heuristicMatch = findHeuristicCatalogMatch({
      catalog,
      candidate: candidateValue,
      normalizer: normalizeLooseText,
    });

    if (heuristicMatch) {
      return { value: heuristicMatch.id };
    }
  }

  for (const candidateValue of candidateValues) {
    const scoredCargoMatch = findScoredCargoCatalogMatch({
      catalog,
      candidate: candidateValue,
    });

    if (scoredCargoMatch) {
      return { value: scoredCargoMatch.id };
    }
  }

  for (const candidateValue of candidateValues) {
    const scoredMatch = findScoredCatalogMatch({
      catalog,
      candidate: candidateValue,
      normalizer: normalizeLooseText,
    });

    if (scoredMatch) {
      return { value: scoredMatch.id };
    }
  }

  pendingItems.push(
    buildPendingItem({
      key: 'cargo',
      label: 'Cargo',
      type: 'catalog',
      catalogName: 'Cargo',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: candidateValues.join(' / '),
    }),
  );

  return { value: '' };
}

function inferTerminationCauseId(sourceValue) {
  const normalizedSource = normalizeLooseText(sourceValue);

  if (!normalizedSource) {
    return '';
  }

  if (normalizedSource.includes('mutuo acuerdo') || normalizedSource.startsWith('159 1')) {
    return '159i1';
  }

  if (normalizedSource.includes('renuncia')) {
    return '159i2';
  }

  if (normalizedSource.includes('inciso 2do') || normalizedSource.includes('desahucio')) {
    return '161i2';
  }

  if (normalizedSource.includes('necesidades de la empresa') || normalizedSource.startsWith('161')) {
    return '161i1';
  }

  if (normalizedSource.includes('falta de probidad')) {
    return '160i1a';
  }

  if (normalizedSource.includes('actos omisiones o imprudencias')) {
    return '160i5';
  }

  if (normalizedSource.includes('incumplimiento grave')) {
    return '160i7';
  }

  return '';
}

function resolveTerminationCauseField({
  sourceValue,
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

  const inferredCauseId = inferTerminationCauseId(sourceValue);

  if (inferredCauseId) {
    return { value: inferredCauseId };
  }

  return resolveCatalogField({
    key: 'terminationCause',
    label: 'Causal de término del contrato',
    catalogName: 'Causal de término de contrato',
    sourceValue,
    correctionValue,
    templateResource,
    pendingItems,
    rowNumber,
    employeeId,
    employeeName,
    normalizer: normalizeLooseText,
    allowBlank: true,
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
  if (key === 'phoneTwo') {
    return '';
  }

  if (isIntentionalBlankCorrection(corrections?.[key])) {
    return key === 'phoneOne' ? REX_DEFAULT_PRIMARY_PHONE : '';
  }

  const directCorrection = cleanCell(corrections?.[key]);

  if (directCorrection) {
    return directCorrection;
  }

  const normalizedPhone = normalizePhone(sourceValue);

  if (normalizedPhone) {
    return normalizedPhone;
  }

  if (key === 'phoneOne') {
    return REX_DEFAULT_PRIMARY_PHONE;
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
    return { email: 'sincorreo@gmail.com' };
  }

  const directCorrection = normalizeEmailValue(corrections?.emails);

  if (directCorrection) {
    return { email: directCorrection };
  }

  const ciMatches = templateResource.emailCatalog.byCi.get(cleanCell(sourceRow.CI)) ?? [];
  const employeeMatches = templateResource.emailCatalog.byEmployeeId.get(cleanCell(sourceRow['ID EMPLEADO'])) ?? [];
  const uniqueMatches = [...new Set([...ciMatches, ...employeeMatches].filter(Boolean))];

  if (uniqueMatches.length === 1) {
    return { email: uniqueMatches[0] };
  }

  if (uniqueMatches.length === 0) {
    return { email: 'sincorreo@gmail.com' };
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

function resolveAddress({ sourceValue, corrections }) {
  const shouldKeepStreetNameBlank = isIntentionalBlankCorrection(corrections?.streetName);
  const shouldKeepStreetNumberBlank = isIntentionalBlankCorrection(corrections?.streetNumber);
  const parsedAddress = parseAddress(sourceValue);
  const streetNameCorrection = shouldKeepStreetNameBlank ? '' : cleanCell(corrections?.streetName);
  const streetNumberCorrection = shouldKeepStreetNumberBlank ? '' : cleanCell(corrections?.streetNumber);
  const resolvedStreetName = streetNameCorrection || parsedAddress.streetName;
  const resolvedStreetNumber = streetNumberCorrection || parsedAddress.streetNumber || inferStreetNumberFallback(sourceValue);

  const sanitizedDepartment = sanitizeStreetSegment(parsedAddress.department);
  const normalizedStreetName = normalizeLooseText(resolvedStreetName);
  const shouldPromoteDepartmentToStreet =
    (!resolvedStreetName || normalizedStreetName.startsWith('depa') || normalizedStreetName.startsWith('casa')) &&
    /^[\p{L}\s]+$/u.test(sanitizedDepartment);
  const resolvedSanitizedStreetName = shouldPromoteDepartmentToStreet
    ? sanitizedDepartment
    : sanitizeStreetSegment(resolvedStreetName);
  const fallbackStreetName =
    resolvedSanitizedStreetName ||
    sanitizeStreetSegment(inferStreetNameFallback(sourceValue)) ||
    'XXX';

  return {
    streetName: fallbackStreetName,
    streetNumber: resolvedStreetNumber,
    department: shouldPromoteDepartmentToStreet ? '' : sanitizedDepartment,
  };
}

function resolveComuna({
  sourceValue,
  locationValue,
  secondaryLocationValue,
  addressValue,
  correctionValue,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return {
      comunaId: '',
      cityId: '',
      regionId: '',
    };
  }

  const directCorrection = cleanCell(correctionValue);
  const catalog = templateResource.catalogs.Comuna ?? [];
  const candidateValues = buildComunaCandidates({
    sourceValue,
    locationValue,
    secondaryLocationValue,
    addressValue,
  });
  const selectedComuna =
    catalog.find((item) => item.id === directCorrection) ||
    candidateValues
      .map((candidate) =>
        findCatalogMatch({
          catalog,
          candidate,
          normalizer: normalizeLooseText,
        }) ||
        findHeuristicCatalogMatch({
          catalog,
          candidate,
          normalizer: normalizeLooseText,
        }) ||
        findScoredCatalogMatch({
          catalog,
          candidate,
          normalizer: normalizeLooseText,
        }),
      )
      .find(Boolean);

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

function enrichGeographyFromSede({ comunaResolution, sedeValue, templateResource }) {
  if (
    isValidComunaId(comunaResolution.comunaId) &&
    isValidCityId(comunaResolution.cityId) &&
    isValidRegionId(comunaResolution.regionId)
  ) {
    return comunaResolution;
  }

  const sedeName = getCatalogItemName(templateResource.catalogs['Id sede donde se desempeña'] ?? [], sedeValue);
  const cityCatalog = templateResource.catalogs.Ciudad ?? [];
  const comunaCatalog = templateResource.catalogs.Comuna ?? [];
  const inferredComunaName = inferComunaFromLocation(sedeName);
  const seededComuna =
    (isValidComunaId(comunaResolution.comunaId)
      ? comunaCatalog.find((item) => item.id === comunaResolution.comunaId)
      : null) ||
    (inferredComunaName
      ? findCatalogMatch({
          catalog: comunaCatalog,
          candidate: inferredComunaName,
          normalizer: normalizeLooseText,
        }) ||
        findHeuristicCatalogMatch({
          catalog: comunaCatalog,
          candidate: inferredComunaName,
          normalizer: normalizeLooseText,
        }) ||
        findScoredCatalogMatch({
          catalog: comunaCatalog,
          candidate: inferredComunaName,
          normalizer: normalizeLooseText,
        })
      : null);
  const cityMatch =
    (isValidCityId(comunaResolution.cityId) ? cityCatalog.find((item) => item.id === comunaResolution.cityId) : null) ||
    (seededComuna
      ? cityCatalog.find((item) => normalizeLooseText(item.name) === normalizeLooseText(seededComuna.name))
      : null) ||
    findCatalogMatch({
      catalog: cityCatalog,
      candidate: sedeName,
      normalizer: normalizeLooseText,
    }) ||
    findHeuristicCatalogMatch({
      catalog: cityCatalog,
      candidate: sedeName,
      normalizer: normalizeLooseText,
    }) ||
    findScoredCatalogMatch({
      catalog: cityCatalog,
      candidate: sedeName,
      normalizer: normalizeLooseText,
    });

  const nextRegionId =
    (isValidRegionId(comunaResolution.regionId) ? comunaResolution.regionId : '') ||
    (isValidComunaId(comunaResolution.comunaId) ? cleanCell(comunaResolution.comunaId).slice(0, 2) : '') ||
    (seededComuna ? cleanCell(seededComuna.id).slice(0, 2) : '') ||
    (cityMatch ? cleanCell(cityMatch.id).slice(0, 2) : '');
  const nextComunaId =
    (isValidComunaId(comunaResolution.comunaId) ? comunaResolution.comunaId : '') ||
    seededComuna?.id ||
    comunaCatalog.find(
      (item) =>
        item.id.startsWith(nextRegionId) &&
        cityMatch &&
        normalizeLooseText(item.name) === normalizeLooseText(cityMatch.name),
    )?.id ||
    '';
  const fallbackCityId =
    cityCatalog.find((item) => item.id.startsWith(`${nextRegionId}-`))?.id ||
    '';

  return {
    comunaId: nextComunaId,
    cityId:
      (isValidCityId(comunaResolution.cityId) ? comunaResolution.cityId : '') ||
      cityMatch?.id ||
      fallbackCityId,
    regionId: nextRegionId,
  };
}

function ensureRequiredGeography({
  geographyResolution,
  templateResource,
  sourceComunaValue,
  sourceLocationValue,
  secondaryLocationValue,
  addressValue,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  const cityCatalog = templateResource.catalogs.Ciudad ?? [];
  const comunaCatalog = templateResource.catalogs.Comuna ?? [];
  const currentComunaId = cleanCell(geographyResolution.comunaId);
  const currentRegionId =
    cleanCell(geographyResolution.regionId) ||
    (currentComunaId ? currentComunaId.slice(0, 2) : '');
  const currentComunaName = currentComunaId
    ? getCatalogItemName(comunaCatalog, currentComunaId)
    : '';
  const rebuiltCityId =
    resolveCityIdForRegion(currentRegionId, currentComunaName, cityCatalog) ||
    cityCatalog.find((item) => cleanCell(item.id).startsWith(`${currentRegionId}-`))?.id ||
    '';
  const resolvedGeography = {
    comunaId: currentComunaId,
    cityId: isValidCityId(geographyResolution.cityId) ? geographyResolution.cityId : rebuiltCityId,
    regionId: currentRegionId,
  };
  const geographySourceValue = cleanCell(sourceComunaValue) || cleanCell(addressValue);
  const geographyContext = buildPendingContext([
    ['Comuna origen', sourceComunaValue],
    ['Ubicación', sourceLocationValue],
    ['Ubicación Workday', secondaryLocationValue],
    ['Dirección', addressValue],
  ]);

  if (!isValidComunaId(resolvedGeography.comunaId) && !hasPendingItem(pendingItems, 'comuna')) {
    pendingItems.push(
      buildPendingItem({
        key: 'comuna',
        label: 'Comuna',
        type: 'catalog',
        catalogName: 'Comuna',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: geographySourceValue,
        sourceContext: geographyContext,
      }),
    );
  }

  if (!isValidCityId(resolvedGeography.cityId) && !hasPendingItem(pendingItems, 'city')) {
    pendingItems.push(
      buildPendingItem({
        key: 'city',
        label: 'Ciudad',
        type: 'catalog',
        catalogName: 'Ciudad',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: geographySourceValue,
        sourceContext: geographyContext,
      }),
    );
  }

  if (!isValidRegionId(resolvedGeography.regionId) && !hasPendingItem(pendingItems, 'region')) {
    pendingItems.push(
      buildPendingItem({
        key: 'region',
        label: 'Region',
        type: 'catalog',
        catalogName: 'Region',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: geographySourceValue,
        sourceContext: geographyContext,
      }),
    );
  }

  return resolvedGeography;
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

function buildPendingItem({
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

function buildPendingContext(entries) {
  return entries
    .map(([label, value]) => ({
      label,
      value: cleanCell(value),
    }))
    .filter((entry) => entry.value);
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
  return STATUS_ALIASES[normalizeLooseText(value)] ?? 'A';
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

function resolvePensionSystem() {
  return 'N';
}

function resolveHealthAmount(healthValue) {
  if (!healthValue) {
    return '';
  }

  if (healthValue === 'fonasa') {
    return '';
  }

  return '1';
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
    return '40';
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

function resolveHeavyWorkField({
  sourceRow,
  correctionValue,
  retirementStatus,
  pendingItems,
  alerts,
  rowNumber,
  employeeId,
  employeeName,
}) {
  const directCorrection = normalizeYesNoCorrection(correctionValue);
  const sourceHeavyWork = resolveHeavyWorkFlag(sourceRow);
  const resolvedHeavyWork = directCorrection || sourceHeavyWork;
  const isRetired = cleanCell(retirementStatus) !== '0';

  if (isRetired && resolvedHeavyWork === 'S') {
    pendingItems.push(
      buildPendingItem({
        key: 'heavyWorkFlag',
        label: '¿Realiza trabajo pesado?',
        type: 'text',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: sourceHeavyWork,
      }),
    );

    alerts.push({
      row: rowNumber,
      field: '¿Realiza trabajo pesado?',
      appliedValue: resolvedHeavyWork,
      message: 'Si el empleado esta jubilado no puede tener trabajo pesado. Requiere correccion manual.',
    });
  }

  return resolvedHeavyWork;
}

function normalizeYesNoCorrection(value) {
  const normalizedValue = cleanCell(value).toUpperCase();

  if (normalizedValue === 'S' || normalizedValue === 'N') {
    return normalizedValue;
  }

  return '';
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
  const matchedRule = rules.find((rule) => rule.keywords.some((keyword) => matchesKeywordRule(combinedSource, keyword)));
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

  if (!normalizedCandidate) {
    return null;
  }

  return catalog.find(
    (item) => {
      const normalizedName = normalizer(item.name);
      const normalizedId = normalizer(item.id);

      if (!normalizedName && !normalizedId) {
        return false;
      }

      return normalizedName === normalizedCandidate || normalizedId === normalizedCandidate;
    },
  );
}

function findHeuristicCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const matches = catalog.filter((item) => {
    const normalizedName = normalizer(item.name);

    if (!normalizedName) {
      return false;
    }

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

      if (!normalizedName && !normalizedId) {
        return {
          item,
          score: -1,
        };
      }

      const nameTokens = tokenizeNormalized(normalizedName);
      const sharedTokens = candidateTokens.filter((token) => nameTokens.includes(token));
      let score = sharedTokens.length * 18;

      if (normalizedName && (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName))) {
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

function getCatalogItemName(catalog, id) {
  if (!id) {
    return '';
  }

  return catalog.find((item) => item.id === id)?.name ?? '';
}

function matchesKeywordRule(normalizedSource, keyword) {
  const normalizedKeyword = normalizeLooseText(keyword);

  if (!normalizedSource || !normalizedKeyword) {
    return false;
  }

  if (normalizedSource.includes(normalizedKeyword)) {
    return true;
  }

  const sourceTokens = tokenizeNormalized(normalizedSource);
  const keywordTokens = tokenizeNormalized(normalizedKeyword);

  if (!sourceTokens.length || !keywordTokens.length) {
    return false;
  }

  return keywordTokens.every((token) => sourceTokens.includes(token));
}

function findScoredCargoCatalogMatch({ catalog, candidate }) {
  const normalizedCandidate = normalizeCargoName(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const candidateTokens = tokenizeCargoName(candidate);

  if (!candidateTokens.length) {
    return null;
  }

  const rankedMatches = catalog
    .map((item) => {
      const normalizedName = normalizeCargoName(item.name);
      const nameTokens = tokenizeCargoName(item.name);
      const sharedTokens = candidateTokens.filter((token) => nameTokens.includes(token));
      let score = sharedTokens.length * 26;

      if (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName)) {
        score += 34;
      }

      if (sharedTokens.length === candidateTokens.length) {
        score += 32;
      }

      if (candidateTokens[0] && nameTokens[0] === candidateTokens[0]) {
        score += 10;
      }

      score -= Math.max(0, nameTokens.length - candidateTokens.length) * 3;

      return {
        item,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  const [bestMatch, secondMatch] = rankedMatches;

  if (!bestMatch || bestMatch.score < 58) {
    return null;
  }

  if (secondMatch && bestMatch.score - secondMatch.score < 10) {
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
  const normalizedRawValue = normalizeSedeName(rawValue);
  const aliasCandidates = SEDE_NAME_ALIASES[normalizedRawValue] ?? [];

  candidates.push(...aliasCandidates);

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
  const hasAfpNoCotizaSignal =
    normalizeLooseText(sourceRow.AFP) === 'no definida' || cleanCell(sourceRow['CODIGO AFP']) === '9999';

  if (!hasAfpNoCotizaSignal) {
    return false;
  }

  const normalizedHealth = normalizeLooseText(sourceRow.ISAPRE);
  return (
    !cleanCell(sourceRow.ISAPRE) ||
    ['no definida', 'sin definir', 'no cotiza', 'sindefinir'].includes(normalizedHealth)
  );
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

function normalizeEmailValue(value) {
  const normalizedValue = extractValidEmail(value);
  return isValidEmailFormat(normalizedValue) ? normalizedValue : '';
}

function isValidEmailFormat(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCell(value));
}

function sanitizeStreetSegment(value) {
  const repairedValue = repairCommonMojibake(cleanCell(value))
    .replace(/[º°]\s*\d+[a-zA-Z0-9-]*/g, ' ')
    .replace(/[;,]+/g, ' ')
    .replace(/\b(depto|dpto|depa|depart\w*|casa)\b.*$/iu, '')
    .replace(/[^\p{L}\d\s.-]+/gu, ' ')
    .replace(/^[^0-9\p{L}]+|[^0-9\p{L}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return isPlaceholderStreetValue(repairedValue) ? '' : repairedValue;
}

function resolveContractStartField({
  sourceRow,
  correctionValue,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  const normalizedCorrection = cleanCell(correctionValue);

  if (normalizedCorrection && !isIntentionalBlankCorrection(normalizedCorrection)) {
    return formatRexDate(normalizedCorrection) || normalizedCorrection;
  }

  const sourceFormattedDate = formatRexDate(sourceRow['FECHA INGRESO']);

  if (isContractStartBeforeLegalAge(sourceRow)) {
    pendingItems.push(
      buildPendingItem({
        key: 'contractStartDate',
        label: 'Fecha de inicio del contrato',
        type: 'text',
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: sourceFormattedDate,
      }),
    );
  }

  return sourceFormattedDate;
}

function isContractStartBeforeLegalAge(sourceRow) {
  const ingresoDate = toDateOnly(sourceRow['FECHA INGRESO']);
  const birthDate = toDateOnly(sourceRow['FECHA NACIMIENTO']);

  if (!ingresoDate || !birthDate) {
    return false;
  }

  const minimumLegalStartDate = new Date(birthDate.getFullYear() + 15, birthDate.getMonth(), birthDate.getDate());
  return ingresoDate.getTime() < minimumLegalStartDate.getTime();
}

function repairCommonMojibake(value) {
  return cleanCell(value)
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ãô/g, 'ó')
    .replace(/Ãë/g, 'é')
    .replace(/Ãæ/g, 'ñ')
    .replace(/Ãi/g, 'í')
    .replace(/Ãü/g, 'á')
    .replace(/ÃâÃ´/g, 'ó')
    .replace(/Ã/g, 'Á')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã/g, 'Í')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/Ã¼/gi, 'ü');
}

function isValidRegionId(value) {
  const normalizedValue = cleanCell(value);
  return Boolean(normalizedValue) && normalizedValue !== '99';
}

function isValidComunaId(value) {
  const normalizedValue = cleanCell(value);
  return Boolean(normalizedValue) && normalizedValue !== '99999';
}

function isValidCityId(value) {
  return Boolean(cleanCell(value));
}

function inferStreetNumberFallback() {
  return '0';
}

function inferStreetNameFallback(value) {
  const fallbackValue = cleanCell(value)
    .replace(/\b\d+[a-zA-Z0-9-]*\b/g, ' ')
    .replace(/\b(depto|dpto|depa|depart\w*|of|oficina|block|bloque|km)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return isPlaceholderStreetValue(fallbackValue) ? '' : fallbackValue;
}

function isPlaceholderStreetValue(value) {
  const normalizedValue = normalizeLooseText(value);
  return !normalizedValue || /^(x|xx|xxx|xxxx|xxxxx)$/.test(normalizedValue);
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

  const departmentMatch = rawValue.match(/(depto|dpto|depa|departamento|of|oficina|block|bloque)\s+([a-z0-9-]+)/i);
  const departmentKeyword = departmentMatch?.[1]?.toLowerCase() ?? '';
  const department = departmentMatch?.[2] ?? '';
  const withoutDepartment = departmentMatch ? rawValue.replace(departmentMatch[0], '').trim() : rawValue;
  const normalizedAddress = withoutDepartment
    .replace(/\bN\s*(?=[a-zA-Z]?\d)/gi, ' ')
    .replace(/([a-zA-Z])(\d{2,}[a-zA-Z-]*)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const streetMatch = normalizedAddress.match(/^(.*?)(?:\s+|,\s*|#\s*)([a-zA-Z]?\d+[a-zA-Z0-9-]*)$/i);

  if (!streetMatch) {
    const kilometerMatch = normalizedAddress.match(/\bkm\s*(\d+[a-zA-Z-]*)\b/i);
    const kilometerNumber = kilometerMatch ? `KM${kilometerMatch[1]}` : '';
    const inlineNumberMatch = normalizedAddress.match(/\b([a-zA-Z]?\d+[a-zA-Z0-9-]*)\b/i);
    const derivedBlockNumber =
      !inlineNumberMatch && department && ['block', 'bloque'].includes(departmentKeyword) ? department : '';
    const streetNumber = inlineNumberMatch?.[1] || kilometerNumber || derivedBlockNumber;
    const streetName = streetNumber
      ? cleanCell(
          normalizedAddress
            .replace(inlineNumberMatch?.[0] ?? kilometerMatch?.[0] ?? '', '')
            .replace(/\bN\b/gi, '')
            .replace(/\s+/g, ' '),
        )
      : cleanCell(normalizedAddress);

    return {
      streetName,
      streetNumber,
      department: derivedBlockNumber ? '' : department,
    };
  }

  return {
    streetName: cleanCell(streetMatch[1].replace(/\bN\b/gi, '')),
    streetNumber: cleanCell(streetMatch[2]),
    department: cleanCell(department),
  };
}

function buildComunaCandidates({ sourceValue, locationValue, secondaryLocationValue, addressValue }) {
  const rawValue = cleanCell(sourceValue);
  const repairedRawValue = repairCommonMojibake(rawValue);
  const locationCandidates = [secondaryLocationValue, locationValue]
    .map((value) => cleanCell(value))
    .filter(Boolean);
  const rawAddressValue = cleanCell(addressValue);
  const repairedAddressValue = repairCommonMojibake(rawAddressValue);
  const inferredRawCandidate = inferComunaFromLocation(repairedRawValue || rawValue);
  const inferredLocationCandidate = locationCandidates
    .map((value) => inferComunaFromLocation(value))
    .find(Boolean);
  const inferredAddressCandidate = inferComunaFromLocation(repairedAddressValue || rawAddressValue);

  if (!rawValue && !inferredLocationCandidate && !inferredAddressCandidate) {
    return [];
  }

  const normalizedRawValue = normalizeLooseText(repairedRawValue || rawValue);
  const aliasCandidate = normalizedRawValue ? COMUNA_ALIASES[normalizedRawValue] : '';
  const commaSegments = (repairedRawValue || rawValue)
    ? (repairedRawValue || rawValue)
        .split(',')
        .map((segment) => cleanCell(segment))
        .filter(Boolean)
    : [];
  const trailingTokenCandidate = (repairedRawValue || rawValue)
    ? cleanCell((repairedRawValue || rawValue).replace(/^.*\d+\s*/u, ''))
    : '';
  const leadingTextCandidate = (repairedRawValue || rawValue)
    ? cleanCell((repairedRawValue || rawValue).split(/\d/u)[0])
    : '';

  return [
    rawValue,
    repairedRawValue,
    aliasCandidate,
    inferredRawCandidate,
    inferredLocationCandidate,
    inferredAddressCandidate,
    rawAddressValue,
    repairedAddressValue,
    ...locationCandidates,
    ...commaSegments,
    leadingTextCandidate,
    trailingTokenCandidate,
  ]
    .filter(Boolean)
    .filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
}

function hasPendingItem(pendingItems, key) {
  return pendingItems.some((item) => item.key === key);
}

function inferComunaFromLocation(value) {
  const normalizedValue = normalizeLooseText(value);

  if (!normalizedValue) {
    return '';
  }

  if (LOCATION_COMUNA_ALIASES[normalizedValue]) {
    return LOCATION_COMUNA_ALIASES[normalizedValue];
  }

  const keywordRules = [
    ['radomiro tomic', 'Calama'],
    ['ministro hales', 'Calama'],
    ['gabriela mistral', 'Calama'],
    ['chuquicamata', 'Calama'],
    ['el abra', 'Calama'],
    ['candelaria', 'Copiapo'],
    ['los colorados', 'Copiapo'],
    ['manto verde', 'Copiapo'],
    ['pucobre', 'Copiapo'],
    ['collahuasi', 'Iquique'],
    ['quebrada blanca', 'Iquique'],
    ['sierra gorda', 'Sierra Gorda'],
    ['centinela', 'Sierra Gorda'],
    ['spence', 'Sierra Gorda'],
    ['andacollo', 'Andacollo'],
    ['teniente', 'Rancagua'],
    ['rajo sur', 'Rancagua'],
    ['antofagasta', 'Antofagasta'],
    ['la negra', 'Antofagasta'],
    ['huechuraba', 'Huechuraba'],
    ['copiapo', 'Copiapo'],
    ['coquimbo', 'Coquimbo'],
    ['concepcion', 'Concepcion'],
    ['puerto montt', 'Puerto Montt'],
    ['calama', 'Calama'],
    ['iquique', 'Iquique'],
    ['temuco', 'Temuco'],
    ['santiago', 'Santiago'],
    ['enea', 'Pudahuel'],
    ['pudahuel', 'Pudahuel'],
  ];

  const matchedRule = keywordRules.find(([keyword]) => normalizedValue.includes(keyword));
  return matchedRule?.[1] ?? '';
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
  return normalizeText(repairCommonMojibake(value))
    .replace(/[().,/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCargoName(value) {
  return normalizeLooseText(value)
    .replace(/\bfinsa\b|\bfinas\b|\bchile\b/g, ' ')
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

function normalizeCargoToken(token) {
  const normalizedToken = String(token).trim();

  if (!normalizedToken) {
    return '';
  }

  const aliasMap = {
    implem: 'implementacion',
    inspecto: 'inspector',
    vts: 'ventas',
  };

  const aliasedToken = aliasMap[normalizedToken] ?? normalizedToken;

  if (aliasedToken.length > 4 && aliasedToken.endsWith('s')) {
    return aliasedToken.slice(0, -1);
  }

  return aliasedToken;
}

function tokenizeCargoName(value) {
  return normalizeCargoName(value)
    .split(/[^a-z0-9]+/g)
    .map(normalizeCargoToken)
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !CARGO_TOKEN_STOPWORDS.has(token));
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
