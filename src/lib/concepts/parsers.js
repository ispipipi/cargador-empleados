import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from '../utils';
import { decryptWorkbook } from '../workbookCrypto';
import {
  booleanId,
  buildConceptId,
  behaviorIdFromLabel,
  categoryInternalIdFromLabel,
  compactConceptId,
  extractLreCode,
  normalizeLreOutput,
  resolveNewSequence,
  sanitizeConceptName,
  typeIdFromLabel,
} from './identifiers';

const REQUIRED_CONCEPT_HEADERS = ['Concepto', 'Nombre', 'Tipo', 'Secuencia'];

export async function parseConceptCatalogWorkbook(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array' });
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

export async function parseConceptMatrixWorkbook(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array' });
  const sheetName = findConceptMatrixSheetName(workbook);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerRowIndex = findConceptMatrixHeaderRow(rows);

  if (headerRowIndex < 0) {
    throw new Error('La matriz no contiene una fila de encabezados VISMA válida.');
  }

  const headers = rows[headerRowIndex] ?? [];
  const attributeHeaders = rows[headerRowIndex - 1] ?? [];
  const getIndex = (header, occurrence = 0) => {
    let matches = 0;
    const findInRow = (row) => row.findIndex((value) => {
      if (normalizeText(value) !== normalizeText(header)) {
        return false;
      }

      const isRequestedMatch = matches === occurrence;
      matches += 1;
      return isRequestedMatch;
    });

    const headerIndex = findInRow(headers);
    return headerIndex >= 0 ? headerIndex : findInRow(attributeHeaders);
  };
  const indexes = {
    sourceCode: getIndex('CONCEPTO'),
    sourceName: getIndex('NOMBRE'),
    classification: getIndex('TIPO'),
    formulation: getIndex('FOMULACION'),
    lreField: getIndex('LRE- NOMBRE'),
    targetId: getIndex('ID-CARGA'),
    targetName: getIndex('NOMBRE', 1),
    rebase: getIndex('Se Rebaja por Dias No Trabajados'),
    baseIas: getIndex('Suma Base Para IAS'),
    vacationProvision: getIndex('Suma Base Provision de Vacaciones'),
    baseVpp: getIndex('Suma Base Vacaciones Proporcionales'),
    baseSil: getIndex('Suma Base de Calculo SIL'),
    bonusFixed: getIndex('Es Bono Fijo'),
  };

  if (indexes.sourceCode < 0 || indexes.sourceName < 0 || indexes.classification < 0) {
    throw new Error('La matriz debe incluir las columnas CONCEPTO, NOMBRE y TIPO.');
  }

  const concepts = rows.slice(headerRowIndex + 1)
    .map((row, index) => {
      const sourceCode = cleanCell(row[indexes.sourceCode]);
      const sourceName = cleanCell(row[indexes.sourceName]);
      const targetId = cleanCell(indexes.targetId >= 0 ? row[indexes.targetId] : '') || sourceCode || buildConceptId(sourceName, index);
      const targetName = cleanCell(indexes.targetName >= 0 ? row[indexes.targetName] : '') || sourceName;

      return {
        sourceCode,
        sourceName,
        classification: cleanCell(row[indexes.classification]),
        formulation: cleanCell(indexes.formulation >= 0 ? row[indexes.formulation] : ''),
        lreField: cleanCell(indexes.lreField >= 0 ? row[indexes.lreField] : ''),
        targetId,
        targetName,
        type: matrixTypeId(row[indexes.classification]),
        sequence: resolveNewSequence(sourceCode, index),
        behavior: matrixBehaviorId(indexes.formulation >= 0 ? row[indexes.formulation] : ''),
        rebase: matrixBoolean(indexes.rebase >= 0 ? row[indexes.rebase] : ''),
        baseIas: matrixBoolean(indexes.baseIas >= 0 ? row[indexes.baseIas] : ''),
        baseVpp: matrixBoolean(indexes.baseVpp >= 0 ? row[indexes.baseVpp] : ''),
        baseSil: matrixBoolean(indexes.baseSil >= 0 ? row[indexes.baseSil] : ''),
        vacationProvision: matrixBoolean(indexes.vacationProvision >= 0 ? row[indexes.vacationProvision] : ''),
        bonusFixed: matrixBoolean(indexes.bonusFixed >= 0 ? row[indexes.bonusFixed] : ''),
      };
    })
    .filter((concept) => concept.sourceCode || concept.sourceName);

  if (concepts.length === 0) {
    throw new Error('No se encontraron conceptos en la matriz seleccionada.');
  }

  return {
    sheetName,
    sourceLabel: sheetName.replace(/^MatrizConceptos[-_ ]*/i, '').trim() || 'matriz',
    concepts,
  };
}

export async function parseEmployeeMasterWorkbook(arrayBuffer, password = '') {
  const workbook = XLSX.read(await decryptWorkbook(arrayBuffer, password), { type: 'array' });
  const employeeCatalog = parseEmployeeTemplate(workbook);

  if (employeeCatalog.length === 0) {
    throw new Error('No se encontraron trabajadores en el maestro REX+. Revisa que exista la columna empleado.');
  }

  return employeeCatalog;
}

export function parseConceptsList(workbook) {
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

function findConceptMatrixSheetName(workbook) {
  const preferredName = workbook.SheetNames.find((name) => normalizeText(name).includes('matrizconceptos') && normalizeText(name).includes('icon'));
  if (preferredName) {
    return preferredName;
  }

  const matchingName = workbook.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
    return findConceptMatrixHeaderRow(rows) >= 0;
  });

  if (!matchingName) {
    throw new Error('No se encontró una hoja MatrizConceptos en el archivo.');
  }

  return matchingName;
}

function findConceptMatrixHeaderRow(rows) {
  return rows.findIndex((row) => {
    const normalizedHeaders = new Set(row.map((value) => normalizeText(value)));
    return ['concepto', 'nombre', 'tipo'].every((header) => normalizedHeaders.has(header));
  });
}

export function buildConceptMatrixOutputRow(template, concept) {
  const values = [...template.defaults];
  const columnIndex = new Map(template.headers.map((header, index) => [normalizeText(header), index]));
  const set = (header, value) => {
    const index = columnIndex.get(normalizeText(header));
    if (index !== undefined) {
      values[index] = value ?? '';
    }
  };

  set('concepto_id', compactConceptId(concept.targetId, concept.sourceCode || concept.sourceName));
  set('Nombre', sanitizeConceptName(concept.targetName));
  set('Tipo', concept.type);
  set('Secuencia', concept.sequence);
  set('¿Rebaja días no trabajados?', concept.rebase);
  set('Comportamiento', concept.behavior);
  set('¿Es base de cálculo para IAS?', concept.baseIas);
  set('¿Es base de cálculo para Base VPP?', concept.baseVpp);
  set('¿Es base de cálculo para Base SIL?', concept.baseSil);
  set('Código LRE', normalizeLreOutput(concept.lreField));
  set('Afecto para Prov. Vacaciones', concept.vacationProvision);

  return values;
}

function matrixTypeId(value) {
  const normalized = normalizeText(value);

  if (normalized.includes('dato')) return '0D';
  if (normalized.includes('vacacion')) return '9V';
  if (normalized.includes('aporte empleador')) return '5A';
  if (normalized.includes('descuento legal')) return '3L';
  if (normalized.includes('descuento')) return '4D';
  if (normalized.includes('haber solo imponible')) return '1I';
  if (normalized.includes('haber solo tributable')) return '1R';
  if (normalized.includes('haber exento')) return '2E';
  if (normalized.includes('haber imponible') || normalized.includes('haber afecto') || normalized.includes('haber')) return '1H';

  return '1H';
}

function matrixBehaviorId(value) {
  const normalized = normalizeText(value);
  return normalized.includes('variable') ? 'V' : 'F';
}

function matrixBoolean(value) {
  const normalized = normalizeText(value);
  return ['si', 's', 'v', 'verdadero', 'true'].includes(normalized) ? 'V' : 'F';
}

function findConceptHeaderRow(rows) {
  return rows.findIndex((row) => {
    const normalizedHeaders = new Set(row.map((value) => normalizeText(value)));
    return REQUIRED_CONCEPT_HEADERS.every((header) => normalizedHeaders.has(normalizeText(header)));
  });
}

export function parseMapping(workbook) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Mapeo, { header: 1, defval: '' });
  return rows.slice(1).filter((row) => cleanCell(row[0])).map((row) => ({
    sourceName: cleanCell(row[0]),
    lreField: cleanCell(row[1]),
    sourceCode: cleanCell(row[2]),
    classification: cleanCell(row[3]),
    comments: cleanCell(row[4]),
  }));
}

export function parseOutputTemplate(workbook) {
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

export function parseEmployeeTemplate(workbook) {
  const sheetName = workbook.SheetNames.find((name) => normalizeText(name) === normalizeText('Conceptos detalle')) ?? workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  const headerRowIndex = rows.findIndex((row) => {
    const normalizedHeaders = new Set(row.map((value) => normalizeText(value)));
    return normalizedHeaders.has('plantilla') || normalizedHeaders.has('empleado');
  });
  const headers = rows[headerRowIndex] ?? [];
  if (headerRowIndex < 0) {
    throw new Error('El maestro REX+ no contiene una fila de encabezados con la columna empleado.');
  }
  const headerIndexes = new Map(headers.map((header, index) => [normalizeText(header), index]));
  const get = (row, names) => {
    const index = names.map((name) => headerIndexes.get(normalizeText(name))).find((value) => value !== undefined);
    return index === undefined ? '' : row[index];
  };

  return rows.slice(headerRowIndex + 1)
    .map((row) => ({
      id: cleanCell(get(row, ['Plantilla', 'empleado'])),
      name: cleanCell(get(row, ['Nombre colaborador', 'nombre_completo'])),
      contract: cleanCell(get(row, ['Contrato', 'contrato'])) || '1',
      contractName: cleanCell(get(row, ['Nombre de contrato', 'tipoCont'])) || 'Contrato Indefinido',
      tipoCont: cleanCell(get(row, ['tipoCont', 'Tipo de contrato', 'Nombre de contrato'])),
      status: cleanCell(get(row, ['estado'])),
      afp: cleanCell(get(row, ['afp'])),
      afpName: cleanCell(get(row, ['nombre_afp'])),
      afpCoti: cleanCell(get(row, ['afpCoti', 'Cotización AFP'])),
    }))
    .filter((employee) => employee.id);
}

export function buildConceptOutputRow(template, decision) {
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
