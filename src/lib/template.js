import * as XLSX from 'xlsx';
import { cleanCell } from './utils';

const BUK_COLABORADORES_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}templates/buk-colaboradores-template.xlsx`;
const BUK_TRABAJOS_LISTS_ASSET_PATH = `${import.meta.env.BASE_URL}templates/buk-trabajos-lists.xlsx`;

export async function loadBukColaboradoresTemplateResource() {
  const response = await fetch(BUK_COLABORADORES_TEMPLATE_ASSET_PATH);

  if (!response.ok) {
    throw new Error('No fue posible cargar el template embebido de BUK Colaboradores.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const employeesSheet = workbook.Sheets.Empleados;
  const listsSheet = workbook.Sheets.Listas;

  if (!employeesSheet || !listsSheet) {
    throw new Error('El template embebido no contiene las hojas Empleados y Listas.');
  }

  const employeeRows = XLSX.utils.sheet_to_json(employeesSheet, {
    header: 1,
    defval: '',
  });
  const listRows = XLSX.utils.sheet_to_json(listsSheet, {
    header: 1,
    defval: '',
  });

  const employeeHeaders = employeeRows[0]?.map(cleanCell) ?? [];

  return {
    arrayBuffer,
    workbook,
    employeeHeaders,
    listRows,
    listsCatalog: buildListsCatalog(listRows),
  };
}

export async function loadBukTrabajosListsResource() {
  const response = await fetch(BUK_TRABAJOS_LISTS_ASSET_PATH);

  if (!response.ok) {
    throw new Error('No fue posible cargar el template base de BUK Trabajos.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const cargosRows = getSheetRows(workbook.Sheets.Cargos);
  const subAreasRows = getSheetRows(workbook.Sheets['Sub-áreas']);
  const empresasRows = getSheetRows(workbook.Sheets.Empresas);

  if (cargosRows.length === 0 || subAreasRows.length === 0 || empresasRows.length === 0) {
    throw new Error('El template base de BUK Trabajos no contiene las listas mínimas requeridas.');
  }

  return {
    cargosRows,
    subAreasRows,
    empresasRows,
    recintosRows: [
      ['Código', 'Nombre'],
      ['casamatriz', 'Casa Matriz'],
    ],
    cargosCatalog: buildRowCatalog(cargosRows),
    subAreasCatalog: buildRowCatalog(subAreasRows),
    empresasCatalog: buildRowCatalog(empresasRows),
  };
}

function buildListsCatalog(listRows) {
  const [headers = [], ...rows] = listRows;
  return headers.reduce((catalog, header, columnIndex) => {
    if (!header) {
      return catalog;
    }

    const values = rows
      .map((row) => cleanCell(row[columnIndex]))
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);

    catalog[cleanCell(header)] = values;
    return catalog;
  }, {});
}

export function buildBukColaboradoresExportWorkbook({ templateResource, exportedRows }) {
  const sourceWorkbook = XLSX.read(templateResource.arrayBuffer, { type: 'array' });
  const sourceEmployeesSheet = sourceWorkbook.Sheets.Empleados;
  const sourceListsSheet = sourceWorkbook.Sheets.Listas;

  const workbook = XLSX.utils.book_new();

  const employeesSheet = XLSX.utils.aoa_to_sheet([
    templateResource.employeeHeaders,
    ...exportedRows.map((row) => templateResource.employeeHeaders.map((header) => row[header] ?? '')),
  ]);
  const listsSheet = XLSX.utils.aoa_to_sheet(templateResource.listRows);

  copySheetMeta(sourceEmployeesSheet, employeesSheet);
  copySheetMeta(sourceListsSheet, listsSheet);

  XLSX.utils.book_append_sheet(workbook, employeesSheet, 'Empleados');
  XLSX.utils.book_append_sheet(workbook, listsSheet, 'Listas');

  return workbook;
}

export function buildBukTrabajosExportWorkbook({ listResource, exportedRows, headers }) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      headers,
      ...exportedRows.map((row) => headers.map((header) => row[header] ?? '')),
    ]),
    'trabajos',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(listResource.cargosRows), 'Cargos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(listResource.subAreasRows), 'Sub-áreas');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(listResource.empresasRows), 'Empresas');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(listResource.recintosRows), 'Recintos');

  return workbook;
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

function getSheetRows(sheet) {
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  });
}

function buildRowCatalog(rows) {
  const [headers = [], ...dataRows] = rows;

  return dataRows
    .filter((row) => row.some((value) => cleanCell(value)))
    .map((row) =>
      headers.reduce((entry, header, index) => {
        if (!header) {
          return entry;
        }

        entry[cleanCell(header)] = cleanCell(row[index]);
        return entry;
      }, {}),
    );
}
