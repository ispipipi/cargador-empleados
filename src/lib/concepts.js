import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';
import { loadConceptCatalogMemory } from './sessionPersistence';

const LISTS_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/lista-conceptos.xlsx`;
const MAPPING_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/lre-mapeo-general.xlsx`;
const OUTPUT_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/ejemplo-importacion-conceptos.xlsx`;
const EMPLOYEE_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}concepts/rex-empleados-concepto-detalle.xlsx`;
export const MAX_CONCEPT_ID_LENGTH = 20;

const REQUIRED_CONCEPT_HEADERS = ['Concepto', 'Nombre', 'Tipo', 'Secuencia'];

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
  ['COMISION AFP', 'comisionAfp'],
  ['COMISION AFP RELIQUIDADA', 'reliquidaAfp'],
  ['COTIZACION SALUD OBLIGATORIA', 'isapre'],
  ['ISAPRE RELIQUIDADA', 'reliquidaIsapre'],
  ['TRABAJO PESADO RELIQUIDADO', 'reliquidaTrabPesa'],
  ['TRABAJO PESADO DESC. TRABAJADOR', 'trabajoPesaEmpl'],
  ['SEGURO CESANTIA', 'cesEmpleado'],
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
  const [listsResponse, mappingResponse, outputTemplateResponse, employeeTemplateResponse] = await Promise.all([
    fetch(LISTS_ASSET_PATH),
    fetch(MAPPING_ASSET_PATH),
    fetch(OUTPUT_TEMPLATE_ASSET_PATH),
    fetch(EMPLOYEE_TEMPLATE_ASSET_PATH),
  ]);

  if (!listsResponse.ok || !mappingResponse.ok || !outputTemplateResponse.ok || !employeeTemplateResponse.ok) {
    throw new Error('No fue posible cargar los maestros embebidos de Conceptos y colaboradores REX+.');
  }

  const [listsBuffer, mappingBuffer, outputTemplateBuffer, employeeTemplateBuffer] = await Promise.all([
    listsResponse.arrayBuffer(),
    mappingResponse.arrayBuffer(),
    outputTemplateResponse.arrayBuffer(),
    employeeTemplateResponse.arrayBuffer(),
  ]);

  const listsWorkbook = XLSX.read(listsBuffer, { type: 'array' });
  const mappingWorkbook = XLSX.read(mappingBuffer, { type: 'array' });
  const outputTemplateWorkbook = XLSX.read(outputTemplateBuffer, { type: 'array' });
  const employeeTemplateWorkbook = XLSX.read(employeeTemplateBuffer, { type: 'array' });

  const concepts = loadConceptCatalogMemory() ?? parseConceptsList(listsWorkbook);
  const mappingRows = parseMapping(mappingWorkbook);
  const outputTemplate = parseOutputTemplate(outputTemplateWorkbook);
  const employeeCatalog = parseEmployeeTemplate(employeeTemplateWorkbook);

  return {
    concepts,
    mappingRows,
    outputTemplate,
    employeeCatalog,
  };
}

export function parseConceptCatalogWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames.find((name) => normalizeText(name) === normalizeText('Lista de conceptos')) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('El archivo no contiene una hoja de conceptos válida.');
  }

  const concepts = parseConceptsList({ Sheets: { 'Lista de conceptos': sheet } });
  if (concepts.length === 0) {
    throw new Error('No se encontraron conceptos en el listado de REX+.');
  }

  return concepts;
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

function parseConceptsList(workbook) {
  const sheet = workbook.Sheets['Lista de conceptos'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerRowIndex = findConceptHeaderRow(rows);
  const headers = rows[headerRowIndex] ?? [];

  if (headerRowIndex < 0) {
    throw new Error('El archivo no contiene una fila de encabezados válida para el catálogo REX+.');
  }

  const missingHeaders = REQUIRED_CONCEPT_HEADERS.filter(
    (header) => !headers.some((value) => normalizeText(value) === normalizeText(header)),
  );

  if (missingHeaders.length > 0) {
    throw new Error(`Al catálogo REX+ le faltan columnas obligatorias: ${missingHeaders.join(', ')}.`);
  }

  const getIndex = (header) => headers.findIndex((value) => normalizeText(value) === normalizeText(header));
  const indexes = {
    id: getIndex('Concepto'),
    name: getIndex('Nombre'),
    type: getIndex('Tipo'),
    sequence: getIndex('Secuencia'),
    lreCode: getIndex('Código LRE'),
    behavior: getIndex('Comportamiento'),
    categoryIne: getIndex('Categoría INE'),
    categoryInternal: getIndex('Categoría Interna'),
    rebase: getIndex('Rebaja Días No Trabajados'),
    baseIas: getIndex('Base para IAS'),
    baseVpp: getIndex('Base Vacaciones Proporcionales'),
    baseSil: getIndex('Base Cálculo SIL'),
    warningDiscount: getIndex('Afecto para advertencia de descuentos'),
    vacationProvision: getIndex('Suma base provisión de vacaciones'),
    noOverdraft: getIndex('No genera sobregiro'),
  };

  return rows.slice(headerRowIndex + 1).filter((row) => cleanCell(row[indexes.id])).map((row) => ({
    id: cleanCell(row[indexes.id]),
    name: cleanCell(row[indexes.name]),
    type: typeIdFromLabel(row[indexes.type]),
    sequence: cleanCell(row[indexes.sequence]),
    lreCode: extractLreCode(row[indexes.lreCode]),
    behavior: behaviorIdFromLabel(row[indexes.behavior]),
    categoryIne: cleanCell(row[indexes.categoryIne]) || 'ine_noAplica',
    categoryInternal: categoryInternalIdFromLabel(row[indexes.categoryInternal]),
    rebase: booleanId(row[indexes.rebase]),
    baseIas: booleanId(row[indexes.baseIas]),
    baseVpp: booleanId(row[indexes.baseVpp]),
    baseSil: booleanId(row[indexes.baseSil]),
    warningDiscount: booleanId(row[indexes.warningDiscount]),
    vacationProvision: booleanId(row[indexes.vacationProvision]),
    noOverdraft: booleanId(row[indexes.noOverdraft]),
  }));
}

function findConceptHeaderRow(rows) {
  return rows.findIndex((row) => {
    const normalizedHeaders = new Set(row.map((value) => normalizeText(value)));
    return REQUIRED_CONCEPT_HEADERS.every((header) => normalizedHeaders.has(normalizeText(header)));
  });
}

function parseMapping(workbook) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Mapeo, { header: 1, defval: '' });
  return rows.slice(1).filter((row) => cleanCell(row[0])).map((row) => ({
    sourceName: cleanCell(row[0]),
    lreField: cleanCell(row[1]),
    sourceCode: cleanCell(row[2]),
    classification: cleanCell(row[3]),
    comments: cleanCell(row[4]),
  }));
}

function parseOutputTemplate(workbook) {
  const sheetName = workbook.SheetNames.find((name) => name === 'Sheet') ?? workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

  return {
    sheetName,
    headers: rows[0] ?? [],
    defaults: rows[1] ?? [],
    optionSheets: workbook.SheetNames.filter((name) => name !== sheetName).map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }),
    })),
  };
}

function parseEmployeeTemplate(workbook) {
  const sheetName = workbook.SheetNames.find((name) => normalizeText(name) === normalizeText('Conceptos detalle')) ?? workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  return rows
    .map((row) => ({
      id: cleanCell(row.Plantilla),
      name: cleanCell(row['Nombre colaborador']),
      contract: cleanCell(row.Contrato) || '1',
      contractName: cleanCell(row['Nombre de contrato']) || 'Contrato Indefinido',
    }))
    .filter((employee) => employee.id);
}

function buildConceptOutputRow(template, decision) {
  const values = [...template.defaults];
  const columnIndex = new Map(template.headers.map((header, index) => [normalizeText(header), index]));
  const set = (header, value) => {
    const index = columnIndex.get(normalizeText(header));
    if (index !== undefined) {
      values[index] = value ?? '';
    }
  };

  set('concepto_id', compactConceptId(decision.targetId));
  set('Nombre', sanitizeConceptName(decision.targetName));
  set('Tipo', decision.type);
  set('Secuencia', decision.sequence);
  set('Código LRE', normalizeLreOutput(decision.lreField));
  set('Comportamiento', decision.targetConcept?.behavior || 'F');
  set('Categoría INE', decision.targetConcept?.categoryIne || 'ine_noAplica');
  set('Categoría interna', decision.targetConcept?.categoryInternal || 'NO');
  set('¿Rebaja días no trabajados?', decision.targetConcept?.rebase || 'F');
  set('¿Es base de cálculo para IAS?', decision.targetConcept?.baseIas || 'F');
  set('¿Es base de cálculo para Base VPP?', decision.targetConcept?.baseVpp || 'F');
  set('¿Es base de cálculo para Base SIL?', decision.targetConcept?.baseSil || 'F');
  set('Afecto para advertencia de descuentos', decision.targetConcept?.warningDiscount || 'F');
  set('Afecto para Prov. Vacaciones', decision.targetConcept?.vacationProvision || 'F');
  set('No genera sobregiro', decision.targetConcept?.noOverdraft || 'F');

  return values;
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

export function buildConceptId(value, index) {
  const id = normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part, partIndex) => (partIndex === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join('');

  if (!id) {
    return `concepto${index + 1}`;
  }

  if (id.length <= MAX_CONCEPT_ID_LENGTH) {
    return id;
  }

  const suffix = stableHash(value);
  return `${id.slice(0, MAX_CONCEPT_ID_LENGTH - suffix.length)}${suffix}`;
}

export function resolveNewSequence(sourceCode, index) {
  const numericSourceCode = Number(sourceCode);
  return Number.isInteger(numericSourceCode) && numericSourceCode > 0 && numericSourceCode <= 9999
    ? numericSourceCode
    : 9000 + index;
}

function sanitizeConceptName(value) {
  return cleanCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\?/g, 'N')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactConceptId(value, seed = value) {
  const id = cleanCell(value);
  return id.length <= 20 ? id : `${id.slice(0, 15)}${stableHash(normalizeText(seed))}`;
}

function stableHash(value) {
  let hash = 0;

  for (const character of cleanCell(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36).toUpperCase().padStart(5, '0').slice(-5);
}

function typeIdFromLabel(value) {
  const normalized = normalizeText(value);
  if (normalized.startsWith('haber afecto')) return '1H';
  if (normalized.includes('solo imponible')) return '1I';
  if (normalized.includes('solo tributable')) return '1R';
  if (normalized.startsWith('haber exento')) return '2E';
  if (normalized.startsWith('descuento legal')) return '3L';
  if (normalized.startsWith('descuento')) return '4D';
  if (normalized.startsWith('aporte empleador')) return '5A';
  return '';
}

function behaviorIdFromLabel(value) {
  return normalizeText(value).includes('variable') ? 'V' : 'F';
}

function categoryInternalIdFromLabel(value) {
  const normalized = normalizeText(value);
  return normalized === 'sin categoria' || !normalized ? 'NO' : cleanCell(value);
}

function booleanId(value) {
  return normalizeText(value) === 'si' || normalizeText(value) === 'verdadero' ? 'V' : 'F';
}

function extractLreCode(value) {
  const raw = cleanCell(value);
  return raw.match(/^\s*(\d+)/)?.[1] ?? '';
}

function normalizeLreOutput(value) {
  const raw = cleanCell(value);
  return raw === '-' || normalizeText(raw) === 'no aplica' || normalizeText(raw) === '0' ? '' : raw;
}
