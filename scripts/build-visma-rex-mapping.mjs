import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, '..');
const MAPPING_PATH = path.join(APP_DIR, 'data/mappings/visma-rex-mapping.json');
const TEMPLATE_PATH = path.join(APP_DIR, 'data/examples/carga-empleados-ejemplo.csv');
const RAW_PATH = path.join(APP_DIR, 'outputs/visma/icon-template-example/icon_visma_empleados_normalizados_2026-09-02.json');
const OUTPUT_DIR = path.join(APP_DIR, 'outputs/visma/mapeo-visma-rex');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'mapeo_visma_rex_2026-09-03.xlsx');

const mapping = JSON.parse(await fs.readFile(MAPPING_PATH, 'utf8'));
const templateText = await fs.readFile(TEMPLATE_PATH, 'utf8');
const templateRows = templateText.replace(/^\uFEFF/, '').split(/\r?\n/g).filter((line) => line.trim() !== '').map(parseDelimitedLine);
const headers = (templateRows[1] || []).map((value) => String(value || '').trim()).filter(Boolean);
const csvDataRows = templateRows.slice(2).filter((row) => row.some((value) => String(value || '').trim() !== ''));
const csvCoverage = new Map(headers.map((header, index) => [header, {
  nonEmptyCount: csvDataRows.filter((row) => String(row[index] || '').trim() !== '').length,
  totalRows: csvDataRows.length,
}]));
const raw = JSON.parse(await fs.readFile(RAW_PATH, 'utf8'));
const employees = Array.isArray(raw.employees) ? raw.employees : [];
const templateMandatoryHeaders = new Set(mapping.templateMandatoryHeaders || []);

const employeeRows = headers.map((header, index) => {
  const rule = mapping.employeeRules[header] || mapping.employeeDefaultRule;
  const statusClass = classifyRule(rule);
  const csvColumn = csvCoverage.get(header) || { nonEmptyCount: 0, totalRows: csvDataRows.length };
  return [
    index + 1,
    header,
    mapping.mandatoryHeaders.includes(header) ? 'SI' : 'NO',
    `${csvColumn.nonEmptyCount}/${csvColumn.totalRows}`,
    templateMandatoryHeaders.has(header) ? 'SI' : 'NO',
    rule.status,
    statusClass,
    rule.source || '',
    rule.endpoint || '',
    rule.transform || '',
    coverageForRule(rule, employees),
    rule.action || '',
    rule.notes || '',
  ];
});

const catalogRows = mapping.catalogRules.map((rule, index) => [
  index + 1,
  rule.rexCatalog,
  mapping.mandatoryHeaders.includes(rule.requiredFor) ? 'SI' : 'NO',
  rule.requiredFor,
  rule.status,
  rule.vismaSource,
  mapping.employeeRules[rule.requiredFor]?.endpoint || '',
  mapping.employeeRules[rule.requiredFor]?.transform || '',
  mapping.employeeRules[rule.requiredFor]?.action || '',
]);

const conceptRows = mapping.conceptRules.map((rule, index) => [
  index + 1,
  rule.rexField,
  rule.required,
  rule.status,
  rule.vismaSource,
  rule.endpoint,
  rule.transform,
]);

const historicalRows = mapping.historicalRules.map((rule, index) => [
  index + 1,
  rule.rexField,
  rule.status,
  rule.vismaSource,
  rule.endpoint,
  rule.transform,
]);

const apiRows = mapping.apiRules.map((rule) => [rule.step, rule.name, rule.endpoint, rule.rule]);

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add('Resumen');
const employeeSheet = workbook.worksheets.add('Mapeo empleados');
const catalogSheet = workbook.worksheets.add('Catálogos');
const conceptSheet = workbook.worksheets.add('Conceptos');
const historicalSheet = workbook.worksheets.add('Libros históricos');
const apiSheet = workbook.worksheets.add('API y reglas');

writeTitle(summarySheet, 'Mapa maestro VISMA → REX+', `Versión ${mapping.version} · Actualizado ${mapping.updatedAt} · Evidencia de ICON, ${employees.length} empleados · CSV de ejemplo, ${csvDataRows.length} filas`);
summarySheet.getRange('A4:B4').values = [['Indicador', 'Valor']];
summarySheet.getRange('A5:A13').values = [
  ['Columnas de empleados REX+'],
  ['Columnas obligatorias según CSV de ejemplo'],
  ['Columnas completas en todas las filas del CSV'],
  ['Obligatorias según plantilla visual (referencia)'],
  ['Campos con fuente VISMA o transformación'],
  ['Campos pendientes de fuente'],
  ['Campos de configuración o regla REX+'],
  ['Catálogos revisados'],
  ['Campos de conceptos revisados'],
];
const firstDataRow = 5;
const lastEmployeeRow = employeeRows.length + firstDataRow - 1;
const lastCatalogRow = catalogRows.length + firstDataRow - 1;
const lastConceptRow = conceptRows.length + firstDataRow - 1;
summarySheet.getRange('B5:B13').formulas = [[
  `=COUNTA('Mapeo empleados'!B${firstDataRow}:B${lastEmployeeRow})`,
], [
  `=COUNTIF('Mapeo empleados'!C${firstDataRow}:C${lastEmployeeRow},"SI")`,
], [
  `=COUNTIF('Mapeo empleados'!D${firstDataRow}:D${lastEmployeeRow},"${csvDataRows.length}/${csvDataRows.length}")`,
], [
  `=COUNTIF('Mapeo empleados'!E${firstDataRow}:E${lastEmployeeRow},"SI")`,
], [
  `=COUNTIF('Mapeo empleados'!G${firstDataRow}:G${lastEmployeeRow},"Fuente o transformación")`,
], [
  `=COUNTIF('Mapeo empleados'!G${firstDataRow}:G${lastEmployeeRow},"Pendiente")`,
], [
  `=COUNTIF('Mapeo empleados'!G${firstDataRow}:G${lastEmployeeRow},"Regla o configuración")`,
], [
  `=COUNTA('Catálogos'!B${firstDataRow}:B${lastCatalogRow})`,
], [
  `=COUNTA('Conceptos'!B${firstDataRow}:B${lastConceptRow})`,
]];
summarySheet.getRange('A14:F14').merge();
summarySheet.getRange('A14').values = [['Conclusiones para la implementación']];
['15', '16', '17', '18'].forEach((row) => summarySheet.getRange(`B${row}:F${row}`).merge());
summarySheet.getRange('A15:F18').values = [
  ['1', 'La selección de empresa debe filtrar empleados por la estructura VISMA EMPRESA vigente.', '', '', '', ''],
  ['2', 'Cargo y centro de costo se extraen de estructuras VISMA, pero sus códigos deben homologarse al catálogo REX+.', '', '', '', ''],
  ['3', 'ICON no expone una Sede ni un Área confiables en la extracción revisada; no se deben reemplazar automáticamente por DEPARTAMENTO.', '', '', '', ''],
  ['4', 'El sueldo base se obtiene desde nómina: concepto 01000 principal, 01100 respaldo y acumuladores 256/211 para control.', '', '', '', ''],
];
summarySheet.getRange('A20:F20').merge();
summarySheet.getRange('A20').values = [[`Documentación VISMA: ${mapping.evidence.apiDocumentation}`]];

writeTable(employeeSheet, 'Mapeo de columnas de empleados', [
  '#', 'Columna REX+', 'Obligatoria según CSV', 'Cobertura CSV ejemplo', 'Obligatoria según plantilla', 'Estado', 'Clase', 'Fuente VISMA', 'Endpoint / ruta', 'Transformación / regla', 'Cobertura ICON (evidencia)', 'Acción en Transformator', 'Observaciones',
], employeeRows);
writeTable(catalogSheet, 'Catálogos que deben homologarse', [
  '#', 'Catálogo REX+', 'Obligatorio', 'Campo relacionado', 'Estado', 'Fuente VISMA', 'Endpoint / ruta', 'Transformación', 'Acción en Transformator',
], catalogRows);
writeTable(conceptSheet, 'Mapeo de conceptos de remuneración', [
  '#', 'Campo de carga REX+', 'Obligatorio', 'Estado', 'Fuente VISMA', 'Endpoint / ruta', 'Transformación / decisión',
], conceptRows);
writeTable(historicalSheet, 'Mapeo de libros históricos / liquidaciones detalle', [
  '#', 'Campo de carga REX+', 'Estado', 'Fuente VISMA', 'Endpoint / ruta', 'Transformación / decisión',
], historicalRows);
writeTable(apiSheet, 'Reglas de conexión y extracción', ['Paso', 'Bloque', 'Endpoint / ruta', 'Regla de implementación'], apiRows);

formatSummary(summarySheet);
formatTable(employeeSheet, employeeRows.length + firstDataRow - 1, 13, { widths: [6, 30, 17, 18, 21, 22, 24, 44, 52, 58, 24, 38, 52] });
formatTable(catalogSheet, catalogRows.length + firstDataRow - 1, 9, { widths: [6, 30, 14, 30, 25, 42, 52, 52, 42] });
formatTable(conceptSheet, conceptRows.length + firstDataRow - 1, 7, { widths: [6, 34, 14, 25, 48, 52, 60] });
formatTable(historicalSheet, historicalRows.length + firstDataRow - 1, 6, { widths: [6, 34, 28, 52, 52, 60] });
formatTable(apiSheet, apiRows.length + firstDataRow - 1, 4, { widths: [8, 26, 60, 90] });

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_PATH);

for (const [sheetName, range] of [
  ['Resumen', 'A1:F20'],
  ['Mapeo empleados', 'A1:M28'],
  ['Catálogos', 'A1:I38'],
  ['Conceptos', 'A1:G17'],
  ['Libros históricos', 'A1:F20'],
  ['API y reglas', 'A1:D8'],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: 'png' });
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(path.join(OUTPUT_DIR, `${sheetName.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.png`), previewBytes);
}

const scan = await workbook.inspect({
  kind: 'table',
  range: `Resumen!A1:F20`,
  include: 'values,formulas',
  tableMaxRows: 20,
  tableMaxCols: 6,
  maxChars: 6000,
});
await fs.writeFile(path.join(OUTPUT_DIR, 'mapeo_visma_rex_inspect.ndjson'), scan.ndjson || '', 'utf8');

console.log(JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  employeeColumns: employeeRows.length,
  mandatoryColumns: mapping.mandatoryHeaders.length,
  catalogRows: catalogRows.length,
  conceptRows: conceptRows.length,
  historicalRows: historicalRows.length,
  employeesInEvidence: employees.length,
}, null, 2));

function writeTitle(sheet, title, subtitle) {
  sheet.getRange('A1:F1').merge();
  sheet.getRange('A1').values = [[title]];
  sheet.getRange('A2:F2').merge();
  sheet.getRange('A2').values = [[subtitle]];
  sheet.showGridLines = false;
}

function writeTable(sheet, title, headersForTable, rows) {
  const endColumn = columnLetter(headersForTable.length - 1);
  const titleRange = `A1:${endColumn}1`;
  const subtitleRange = `A2:${endColumn}2`;
  sheet.getRange(titleRange).merge();
  sheet.getRange('A1').values = [[title]];
  sheet.getRange(subtitleRange).merge();
  sheet.getRange('A2').values = [['Fuente: reglas canónicas del mapa VISMA → REX+; la cobertura solo representa la evidencia observada en ICON.']];
  sheet.getRange(`A4:${endColumn}4`).values = [headersForTable];
  if (rows.length > 0) {
    sheet.getRange(`A5:${endColumn}${rows.length + 4}`).values = rows;
  }
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
}

function formatSummary(sheet) {
  sheet.getRange('A1:F1').format = {
    fill: '#102A43',
    font: { bold: true, color: '#FFFFFF', size: 16 },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
  };
  sheet.getRange('A2:F2').format = {
    fill: '#EAF4F4',
    font: { italic: true, color: '#486581' },
    wrapText: true,
  };
  sheet.getRange('A4:B4').format = headerFormat();
  sheet.getRange('A5:B13').format = { borders: { preset: 'all', style: 'thin', color: '#D9E2EC' } };
  sheet.getRange('A5:A13').format.font = { bold: true, color: '#243B53' };
  sheet.getRange('B5:B13').format = { horizontalAlignment: 'center', borders: { preset: 'all', style: 'thin', color: '#D9E2EC' } };
  sheet.getRange('A14:F14').format = { fill: '#147D92', font: { bold: true, color: '#FFFFFF' } };
  sheet.getRange('A15:F18').format = { wrapText: true, borders: { preset: 'all', style: 'thin', color: '#D9E2EC' }, verticalAlignment: 'top' };
  sheet.getRange('A15:A18').format = { fill: '#EAF4F4', font: { bold: true, color: '#147D92' }, horizontalAlignment: 'center' };
  sheet.getRange('A20:F20').format = { fill: '#F0F4F8', font: { color: '#486581', italic: true }, wrapText: true };
  sheet.getRange('A1:F20').format.rowHeight = 24;
  sheet.getRange('A15:F18').format.rowHeight = 42;
  sheet.getRange('A1:F20').format.wrapText = true;
  sheet.getRange('A:A').format.columnWidth = 42;
  sheet.getRange('B:B').format.columnWidth = 22;
  sheet.getRange('C:F').format.columnWidth = 18;
}

function formatTable(sheet, rowCount, columnCount, { widths }) {
  const endColumn = columnLetter(columnCount - 1);
  sheet.getRange(`A1:${endColumn}1`).format = {
    fill: '#102A43',
    font: { bold: true, color: '#FFFFFF', size: 14 },
    verticalAlignment: 'center',
  };
  sheet.getRange(`A2:${endColumn}2`).format = {
    fill: '#EAF4F4',
    font: { italic: true, color: '#486581' },
    wrapText: true,
  };
  sheet.getRange(`A4:${endColumn}4`).format = headerFormat();
  if (rowCount >= 5) {
    sheet.getRange(`A5:${endColumn}${rowCount}`).format = {
      wrapText: true,
      verticalAlignment: 'top',
      borders: { preset: 'all', style: 'thin', color: '#D9E2EC' },
    };
  }
  sheet.getRange(`A1:${endColumn}${Math.min(rowCount, 30)}`).format.rowHeight = 30;
  sheet.getRange(`A4:${endColumn}4`).format.rowHeight = 42;
  if (rowCount >= 5) sheet.getRange(`A5:${endColumn}${rowCount}`).format.rowHeight = 42;
  widths.forEach((width, index) => {
    sheet.getRange(`${columnLetter(index)}:${columnLetter(index)}`).format.columnWidth = width;
  });

  if (sheet.name === 'Mapeo empleados' && rowCount >= 5) {
    sheet.getRange(`C5:C${rowCount}`).conditionalFormats.add('containsText', { text: 'SI', format: { fill: '#FFF3CD', font: { bold: true, color: '#8A5A00' } } });
    sheet.getRange(`F5:F${rowCount}`).conditionalFormats.add('containsText', { text: 'Pendiente', format: { fill: '#FDE8E7', font: { color: '#B42318' } } });
    sheet.getRange(`F5:F${rowCount}`).conditionalFormats.add('containsText', { text: 'Fuente', format: { fill: '#E8F5E9', font: { color: '#1B5E20' } } });
  }
}

function headerFormat() {
  return {
    fill: '#147D92',
    font: { bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
    borders: { preset: 'all', style: 'thin', color: '#0B5269' },
  };
}

function parseDelimitedLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ';' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function classifyRule(rule) {
  const status = String(rule.status || '');
  if (/pendiente|no identificado|no directo|campo de cliente/i.test(status)) return 'Pendiente';
  if (/configuración|externo a/i.test(status)) return 'Regla o configuración';
  return 'Fuente o transformación';
}

function coverageForRule(rule, records) {
  const total = records.length;
  if (rule.coverageKind === 'fixed') return 'Regla fija, no aplica';
  if (rule.coverageKind === 'derived') return 'Regla de negocio, no aplica';
  if (rule.coverageKind === 'salary') return 'Endpoint probado en 1 trabajador';
  if (rule.coverageKind === 'missing') return `0/${total}`;
  const count = records.filter((record) => {
    if (rule.coverageKind === 'path') return Boolean(readPath(record, rule.path));
    if (rule.coverageKind === 'structure') return hasStructure(record, [rule.typeId]);
    if (rule.coverageKind === 'structuresAny') return hasStructure(record, rule.typeIds || []);
    return false;
  }).length;
  return `${count}/${total}`;
}

function hasStructure(record, typeIds) {
  const accepted = new Set((typeIds || []).map((id) => String(id)));
  return (Array.isArray(record.structures) ? record.structures : []).some((item) => accepted.has(String(item.typeId)) && Boolean(item.description || item.externalId));
}

function readPath(record, sourcePath) {
  return String(sourcePath || '').split('.').reduce((value, key) => value?.[key], record);
}

function columnLetter(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
