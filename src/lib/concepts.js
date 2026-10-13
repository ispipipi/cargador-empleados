import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';
import { loadConceptCatalogMemory } from './sessionPersistence';
import {
  parseConceptsList,
  parseEmployeeTemplate,
  parseMapping,
  parseOutputTemplate,
} from './concepts/parsers';
import {
  buildConceptId,
  compactConceptId,
  resolveNewSequence,
} from './concepts/identifiers';
import { buildConceptMatrixOutputRow, buildConceptOutputRow } from './concepts/parsers';
export {
  MAX_CONCEPT_ID_LENGTH,
  buildConceptId,
  resolveNewSequence,
} from './concepts/identifiers';
export {
  parseConceptCatalogWorkbook,
  parseConceptMatrixWorkbook,
  parseEmployeeMasterWorkbook,
} from './concepts/parsers';

const LISTS_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/lista-conceptos.xlsx`;
const FINNING_LISTS_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/lista-conceptos-finning.xlsx`;
const MAPPING_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/lre-mapeo-general.xlsx`;
const OUTPUT_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/ejemplo-importacion-conceptos.xlsx`;
const EMPLOYEE_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/rex-empleados-concepto-detalle.xlsx`;
const FINNING_EMPLOYEE_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/maestro-finning.xlsx`;
const TYPE_BY_CLASSIFICATION = [
  { match: 'descuentos legales', value: '3L' },
  { match: 'descuento', value: '4D' },
  { match: 'descuentos sindicatos', value: '4D' },
  { match: 'haber solo imponible', value: '1I' },
  { match: 'imponible y no tributable', value: '1I' },
  { match: 'haber solo tributable', value: '1R' },
  { match: 'tributables y no imponibles', value: '1R' },
  { match: 'haberes exentos', value: '2E' },
  { match: 'aporte empleador', value: '5A' },
  { match: 'empresa', value: '5A' },
  { match: 'haber afecto', value: '1H' },
  { match: 'haberes imponibles', value: '1H' },
  { match: 'haberes', value: '1H' },
];

const EXISTING_CONCEPT_OVERRIDES = new Map([
  ['SOBRETIEMPO RETROACTIVO', 'sobretiempoRetrG1KVT'],
  ['RETROACTIVO SOBRETIEMPO', 'sobretiempoRetrG1KVT'],
  ['PAGO ANTICIPADO PRESTAMO TASA CERO', 'solidarioremu'],
  ['COTIZACION VOLUNTARIA AFP', 'apvi'],
  ['AHORRO VOLUNTARIO', 'apvi'],
  ['DESCUENTO ANTICIPO QUINCENAL', 'anticipo'],
  ['PRESTAMO CCAF LA ARAUCANA', 'cajaCred'],
  ['PRESTAMO CCAF LOS HEROES', 'cajaCred'],
  ['PRESTAMO CAJA 18 DE SEPTIEMBRE', 'cajaCred'],
  ['APV PESOS', 'apvi'],
  ['APV INDIV. EMPLEADO SIN REB. TRIB. PESO', 'apvi'],
  ['DEPOSITO CONVENIDO EN PESOS', 'apviConvenido'],
  ['SOBREGIRO LIQUIDACION SUELDO', 'compensaSobre'],
  ['IMPUESTO', 'impuesto'],
  ['IMPUESTO RELIQUIDADO', 'reliquidaImpuesto'],
  ['COTIZACION FONDO RETIRO', 'afp'],
  ['COTIZACION FONDO RETIRO RELIQUIDADA', 'reliquidaAfp'],
  ['COMISION AFP', 'afp'],
  ['COMISION AFP RELIQUIDADA', 'reliquidaAfp'],
  ['COTIZACION SALUD OBLIGATORIA', 'isapre'],
  ['ISAPRE RELIQUIDADA', 'reliquidaIsapre'],
  ['TRABAJO PESADO RELIQUIDADO', 'reliquidaTrabPesa'],
  ['TRABAJO PESADO DESC. TRABAJADOR', 'trabajoPesaEmpl'],
  ['SEGURO CESANTIA', 'cesEmpleado'],
  ['SEGURO EMPRESA APORTE EMPLEADOR', 'cesAporteCi'],
  ['SEGURO SOBREV. E INVALIDEZ', 'sis'],
  ['APORTE EMPRESA MUTUAL', 'mutual'],
  ['APORTE EMPRESA TRABAJO PESADO', 'trabajoPesa'],
  ['SIS EMPRESA RELIQ.', 'reliquidaSis'],
  ['FONDO SOL. RELIQ.', 'reliquidaCesSol'],
  ['MUTUAL RELIQ.', 'reliquidaMutual'],
  ['TRAB. PESADO RELIQ EMPLEADOR', 'reliquidaTrabPesa'],
  ['ASIGNACION SALA CUNA', 'salaCMi'],
  ['ASIGNACION DE MOVILIZACION', 'movilizacion'],
  ['ASIGNACIONES FAMILIAR LEGAL', 'cargasSimp'],
  ['ASIG. FAMILIAR RETROACTIVAS', 'cargasRetr'],
  ['ANT. SUBSIDIO LICENCIA MEDICA', 'sil'],
  ['ASIGNACION TELETRABAJO', 'AsigTeletrabajoMi'],
  ['AGUINALDO', 'AguinaldoMi'],
  ['HORAS EXTRAS 50%', 'horasEx50'],
  ['LIQUIDO', 'totalesEmpl'],
]);

const NEW_CONCEPT_ALIASES = new Map([
  ['ANTICIPO DE SUBSIDIO MES ANTERIOR', ['anticipoSubsidioMesAnterior', 'ANTICIPO SUBSIDIO MES ANTERIOR']],
  ['ANTICIPO AGUINALDO', ['anticipoAguinaldo', 'ANTICIPO AGUINALDO']],
  ['ANTICIPO BONO PRODUCTIVIDAD', ['anticipoBonoProductividad', 'ANTICIPO BONO PRODUCTIVIDAD']],
  ['BONO PRACTICAS PRODUCTIVAS MENSUAL', ['bonoPracticasProductivas', 'BONO PRACTICAS PRODUCTIVAS']],
  ['BONO PERMANENCIA HABER', ['bonoPermanenciaHaber', 'BONO PERMANENCIA HABER']],
  ['EXTENSION SINDICATO 2', ['extensionSindicatoN2', 'EXTENSION SINDICATO 2']],
  ['EXTENSION SINDICATO N?2', ['extensionSindicatoN2', 'EXTENSION SINDICATO 2']],
  ['CUOTA SINDICATO N? 2', ['cuotaSindicatoN2', 'CUOTA SINDICATO N 2']],
  ['CUOTA SINDICATO N 2', ['cuotaSindicatoN2', 'CUOTA SINDICATO N 2']],
  ['CUOTA SINDICATO N? 2 RENTAL', ['cuotaSindicatoN2Rental', 'CUOTA SINDICATO N 2 RENTAL']],
  ['BONO TRAYECTORIA SINDICAL', ['bonoTrayectoriaSindical', 'BONO TRAYECTORIA SINDICAL']],
  ['DESCUENTO POR COMPRA ESPP', ['descuentoPorCompraEspp', 'DESCUENTO POR COMPRA ESPP']],
]);

const VIRTUAL_EXISTING_CONCEPTS = [
  {
    id: 'comisionAfp',
    name: 'Comisión AFP',
    type: '3L',
    sequence: '6310',
    lreCode: '3141',
    behavior: 'F',
    categoryIne: 'ine_noAplica',
    categoryInternal: 'NO',
  },
];

const AUTO_EXCLUDED_CONCEPTS = new Set(['ADICIONAL AL 7%']);

export async function loadConceptsResource() {
  const [listsResponse, finningListsResponse, mappingResponse, outputTemplateResponse, employeeTemplateResponse, finningEmployeeTemplateResponse] = await Promise.all([
    fetch(LISTS_ASSET_PATH),
    fetch(FINNING_LISTS_ASSET_PATH),
    fetch(MAPPING_ASSET_PATH),
    fetch(OUTPUT_TEMPLATE_ASSET_PATH),
    fetch(EMPLOYEE_TEMPLATE_ASSET_PATH),
    fetch(FINNING_EMPLOYEE_TEMPLATE_ASSET_PATH),
  ]);

  if (!listsResponse.ok || !finningListsResponse.ok || !mappingResponse.ok || !outputTemplateResponse.ok || !employeeTemplateResponse.ok || !finningEmployeeTemplateResponse.ok) {
    throw new Error('No fue posible cargar los maestros embebidos de Conceptos y colaboradores REX+.');
  }

  const [listsBuffer, finningListsBuffer, mappingBuffer, outputTemplateBuffer, employeeTemplateBuffer, finningEmployeeTemplateBuffer] = await Promise.all([
    listsResponse.arrayBuffer(),
    finningListsResponse.arrayBuffer(),
    mappingResponse.arrayBuffer(),
    outputTemplateResponse.arrayBuffer(),
    employeeTemplateResponse.arrayBuffer(),
    finningEmployeeTemplateResponse.arrayBuffer(),
  ]);

  const listsWorkbook = XLSX.read(listsBuffer, { type: 'array' });
  const finningListsWorkbook = XLSX.read(finningListsBuffer, { type: 'array' });
  const mappingWorkbook = XLSX.read(mappingBuffer, { type: 'array' });
  const outputTemplateWorkbook = XLSX.read(outputTemplateBuffer, { type: 'array' });
  const employeeTemplateWorkbook = XLSX.read(employeeTemplateBuffer, { type: 'array' });
  const finningEmployeeTemplateWorkbook = XLSX.read(finningEmployeeTemplateBuffer, { type: 'array' });

  const concepts = loadConceptCatalogMemory() ?? parseConceptsList(listsWorkbook);
  const finningCatalog = parseConceptsList(finningListsWorkbook);
  const conceptsById = new Map(concepts.map((concept) => [normalizeText(concept.id), concept]));
  const historicalConcepts = finningCatalog.map((concept) =>
    conceptsById.get(normalizeText(concept.id)) ?? concept,
  );
  const mappingRows = parseMapping(mappingWorkbook);
  const outputTemplate = parseOutputTemplate(outputTemplateWorkbook);
  const employeeCatalog = parseEmployeeTemplate(employeeTemplateWorkbook);
  const finningEmployeeCatalog = parseEmployeeTemplate(finningEmployeeTemplateWorkbook);

  return {
    concepts,
    historicalConcepts,
    historicalCatalogLabel: 'Lista de conceptos FINNING V2',
    mappingRows,
    outputTemplate,
    employeeCatalog,
    finningEmployeeCatalog,
  };
}

export function buildConceptDecisions(resource) {
  const conceptsCatalog = [...resource.concepts, ...VIRTUAL_EXISTING_CONCEPTS];
  const conceptByName = new Map();
  const conceptById = new Map();

  conceptsCatalog.forEach((concept) => {
    conceptByName.set(normalizeText(concept.name), concept);
    conceptById.set(normalizeText(concept.id), concept);
  });

  return resource.mappingRows.map((mapping, index) => {
    const exactMatch =
      conceptByName.get(normalizeText(mapping.sourceName)) ??
      conceptById.get(normalizeText(mapping.sourceName)) ??
      null;
    const override = resolveDecisionOverride(mapping, conceptById, index);
    const type = inferConceptType(mapping.classification, mapping.lreField);
    const proposedId = buildConceptId(mapping.sourceName, index);
    const isExcluded = override?.action === 'exclude';
    const resolvedMatch = override?.targetConcept ?? exactMatch;
    const isConfiguredNewConcept = override?.action === 'create';

    return {
      id: `${index + 1}-${proposedId}`,
      sourceName: mapping.sourceName,
      sourceCode: mapping.sourceCode,
      lreField: mapping.lreField,
      classification: mapping.classification,
      comments: mapping.comments,
      type,
      action: override?.action ?? (exactMatch ? 'reuse' : 'create'),
      matchStatus: isExcluded ? 'excluded' : (resolvedMatch || isConfiguredNewConcept ? 'exact' : 'proposal'),
      targetId: override?.targetId ?? resolvedMatch?.id ?? proposedId,
      targetName: override?.targetName ?? resolvedMatch?.name ?? mapping.sourceName,
      targetConcept: resolvedMatch,
      sequence: override?.sequence ?? resolvedMatch?.sequence ?? resolveNewSequence(mapping.sourceCode, index),
      proposedId,
      proposedSequence: resolveNewSequence(mapping.sourceCode, index),
      excluded: isExcluded,
      approved: isExcluded || Boolean(override?.approved || resolvedMatch || exactMatch),
      warning: getDecisionWarning(mapping, resolvedMatch, type, isExcluded),
    };
  });
}
export function applyConceptDecision(decision, patch = {}) {
  const next = {
    ...decision,
    ...patch,
  };

  if (next.action === 'reuse' && next.targetConcept) {
    return {
      ...next,
      targetId: next.targetConcept.id,
      targetName: next.targetConcept.name,
      sequence: next.targetConcept.sequence,
      type: next.targetConcept.type,
      lreField: next.targetConcept.lreCode || next.lreField,
    };
  }

  return {
    ...next,
    action: 'create',
    matchStatus: 'proposal',
  };
}

export function buildConceptExportWorkbook({ resource, decisions }) {
  const workbook = XLSX.utils.book_new();
  const exportedDecisions = uniqueCreateDecisions(decisions);
  const rows = exportedDecisions.map((decision) => buildConceptOutputRow(resource.outputTemplate, decision));
  const sheet = XLSX.utils.aoa_to_sheet([resource.outputTemplate.headers, ...rows]);

  XLSX.utils.book_append_sheet(workbook, sheet, resource.outputTemplate.sheetName);
  resource.outputTemplate.optionSheets.forEach((optionSheet) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(optionSheet.rows), optionSheet.name);
  });

  return workbook;
}

export function buildConceptMatrixExportWorkbook({ resource, matrix }) {
  const workbook = XLSX.utils.book_new();
  const rows = matrix.concepts.map((concept) => buildConceptMatrixOutputRow(resource.outputTemplate, concept));
  const sheet = XLSX.utils.aoa_to_sheet([resource.outputTemplate.headers, ...rows]);

  XLSX.utils.book_append_sheet(workbook, sheet, resource.outputTemplate.sheetName);
  resource.outputTemplate.optionSheets.forEach((optionSheet) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(optionSheet.rows), optionSheet.name);
  });

  return workbook;
}

export function buildConceptReportWorkbook({ decisions }) {
  const workbook = XLSX.utils.book_new();
  const reportRows = decisions.map((decision, index) => ({
    Fila: index + 2,
    'Concepto Meta4': decision.sourceName,
    'Código Meta4': decision.sourceCode,
    'Campo LRE': decision.lreField,
    Clasificación: decision.classification,
    Acción: decision.action === 'reuse' ? 'Reutilizar existente' : decision.action === 'exclude' ? 'Excluir' : 'Crear nuevo',
    'Concepto REX+': decision.targetId,
    Nombre: decision.targetName,
    Tipo: decision.type,
    Secuencia: decision.sequence,
    Estado: decision.matchStatus === 'excluded'
      ? 'Excluido del archivo de carga'
      : decision.matchStatus === 'exact'
      ? 'Match exacto'
      : decision.approved
        ? 'Aprobado manualmente'
        : 'Propuesta revisable',
    Advertencia: decision.warning || '',
    Comentarios: decision.comments || '',
  }));

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportRows), 'Informe final');
  return workbook;
}

export function summarizeConceptDecisions(decisions) {
  return {
    total: decisions.length,
    exactMatches: decisions.filter((decision) => decision.matchStatus === 'exact').length,
    proposals: decisions.filter((decision) => decision.matchStatus === 'proposal').length,
    pendingProposals: decisions.filter((decision) => decision.matchStatus === 'proposal' && !decision.approved).length,
    reused: decisions.filter((decision) => decision.action === 'reuse').length,
    created: decisions.filter((decision) => decision.action === 'create').length,
    createdApproved: decisions.filter((decision) => decision.action === 'create' && decision.approved && !decision.excluded).length,
    memoryMatches: decisions.filter((decision) => decision.matchOrigin === 'memory').length,
    excluded: decisions.filter((decision) => decision.action === 'exclude').length,
    warnings: decisions.filter((decision) => decision.warning).length,
  };
}

export function inferConceptType(classification, lreField) {
  const normalizedClassification = normalizeText(classification);
  const normalizedLre = cleanCell(lreField);

  if (/^415[1254]$/.test(normalizedLre)) {
    return '5A';
  }

  return TYPE_BY_CLASSIFICATION.find((item) => normalizedClassification.includes(item.match))?.value ?? '1H';
}

function getDecisionWarning(mapping, exactMatch, type, isExcluded) {
  if (isExcluded) {
    return 'Se excluye del archivo de carga porque la fuente marca este registro como NO APLICA.';
  }

  if (exactMatch) {
    return '';
  }

  const classification = normalizeText(mapping.classification);
  if (classification.includes('no aplica')) {
    return 'La fuente marca este registro como NO APLICA; revisar antes de importar.';
  }

  if (classification.includes('reliquidable')) {
    return 'Concepto reliquidable propuesto como nuevo para no mezclarlo con el concepto base.';
  }

  if (type === '1I' || type === '1R') {
    return `Tipo ${type} inferido desde la clasificación de origen.`;
  }

  return 'No hubo coincidencia exacta en la lista REX+; la propuesta debe aprobarse antes de crearla.';
}

function resolveDecisionOverride(mapping, conceptById, index) {
  const sourceName = normalizeText(mapping.sourceName);
  const sourceKey = mapping.sourceName.toUpperCase();
  const existingOverrideId = EXISTING_CONCEPT_OVERRIDES.get(sourceKey);

  if (AUTO_EXCLUDED_CONCEPTS.has(sourceKey)) {
    return { action: 'exclude' };
  }

  if (existingOverrideId) {
    return {
      action: 'reuse',
      targetConcept: conceptById.get(normalizeText(existingOverrideId)) ?? null,
      approved: true,
    };
  }

  const newAlias = NEW_CONCEPT_ALIASES.get(sourceKey);
  if (newAlias) {
    return {
      action: 'create',
      targetId: newAlias[0],
      targetName: newAlias[1],
      sequence: resolveNewSequence(mapping.sourceCode, index),
      approved: true,
    };
  }

  if (sourceName === 'liquido') {
    return {
      action: 'reuse',
      targetConcept: conceptById.get('totalesempl') ?? null,
    };
  }

  if (normalizeText(mapping.classification).includes('no aplica')) {
    return { action: 'exclude' };
  }

  return null;
}

function uniqueCreateDecisions(decisions) {
  const seen = new Set();

  return decisions.filter((decision) => {
    const targetId = compactConceptId(decision.targetId);

    if (decision.excluded || decision.action !== 'create' || seen.has(targetId)) {
      return false;
    }

    seen.add(targetId);
    return true;
  });
}
