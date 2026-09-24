import * as XLSX from 'xlsx';
import { cleanCell, sanitizeFilenameSegment } from './utils';

const VISMA_MASTER_TEMPLATE_BASE_PATH = `${import.meta.env.BASE_URL}templates/`;

export const VISMA_MASTER_LOAD_CONFIG = Object.freeze([
  Object.freeze({
    key: 'positions',
    label: 'Cargos',
    description: 'Usa el ID VISMA como Ítem y el nombre como Nombre.',
    templatePath: `${VISMA_MASTER_TEMPLATE_BASE_PATH}visma-cargos-import-template.xlsx`,
    filePrefix: 'VISMA_CARGOS',
  }),
  Object.freeze({
    key: 'costCenters',
    label: 'Centros de costo',
    description: 'Usa Código y, si falta, el ID VISMA como Ítem.',
    templatePath: `${VISMA_MASTER_TEMPLATE_BASE_PATH}visma-centros-costo-import-template.xlsx`,
    filePrefix: 'VISMA_CENTROS_DE_COSTO',
  }),
  Object.freeze({
    key: 'areas',
    label: 'Áreas',
    description: 'Usa el ID VISMA como Ítem y el nombre como Nombre.',
    templatePath: `${VISMA_MASTER_TEMPLATE_BASE_PATH}visma-areas-import-template.xlsx`,
    filePrefix: 'VISMA_AREAS',
  }),
]);

export async function loadVismaMasterLoadTemplate(masterKey) {
  const config = getVismaMasterLoadConfig(masterKey);
  const response = await fetch(config.templatePath);

  if (!response.ok) {
    throw new Error(`No se pudo cargar la plantilla de importación de ${config.label.toLowerCase()}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sourceSheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sourceSheet, { header: 1, defval: '' });
  const headers = rows[0]?.map(cleanCell) ?? [];

  if (!sheetName || !headers.length) {
    throw new Error(`La plantilla de ${config.label.toLowerCase()} no contiene encabezados válidos.`);
  }

  return {
    ...config,
    arrayBuffer,
    workbook,
    sheetName,
    sourceSheet,
    headers,
    defaultRow: normalizeTemplateRow(rows[1], headers.length),
  };
}

export function buildVismaMasterLoadWorkbook({ masterKey, items, template }) {
  const sourceTemplate = template ?? null;
  const headers = sourceTemplate?.headers ?? ['Ítem', 'Nombre'];
  const defaultRow = sourceTemplate?.defaultRow ?? Array(headers.length).fill('');
  const rows = [
    headers,
    ...normalizeVismaMasterItems(masterKey, items).map((item) => {
      const row = [...defaultRow];
      row[0] = item.id;
      row[1] = item.name;
      return row;
    }),
  ];
  const workbook = createWorkbook();
  const outputSheet = XLSX.utils.aoa_to_sheet(rows);
  copySheetMeta(sourceTemplate?.sourceSheet, outputSheet);
  XLSX.utils.book_append_sheet(workbook, outputSheet, sourceTemplate?.sheetName || 'Ejemplo');
  return workbook;
}

export function normalizeVismaMasterItems(masterKey, items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const vismaId = cleanCell(item?.id);
      const name = cleanCell(item?.name);
      const code = cleanCell(item?.code);
      const id = masterKey === 'costCenters' ? code || vismaId : vismaId;
      return { id, name };
    })
    .filter((item) => item.id && item.name)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index);
}

export function buildVismaMasterFileName(masterKey, companyName) {
  const config = getVismaMasterLoadConfig(masterKey);
  return `${config.filePrefix}_${sanitizeFilenameSegment(companyName || 'todas-las-empresas')}.xlsx`;
}

export function getVismaMasterLoadConfig(masterKey) {
  return VISMA_MASTER_LOAD_CONFIG.find((config) => config.key === masterKey) ?? VISMA_MASTER_LOAD_CONFIG[0];
}

function normalizeTemplateRow(row, columnCount) {
  return Array.from({ length: columnCount }, (_, index) => row?.[index] ?? '');
}

function copySheetMeta(sourceSheet, targetSheet) {
  ['!cols', '!rows', '!merges', '!autofilter'].forEach((metaKey) => {
    if (sourceSheet?.[metaKey]) {
      targetSheet[metaKey] = Array.isArray(sourceSheet[metaKey])
        ? [...sourceSheet[metaKey]]
        : sourceSheet[metaKey];
    }
  });
}

function createWorkbook() {
  return XLSX.utils.book_new();
}
