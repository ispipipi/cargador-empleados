import * as XLSX from 'xlsx';
import { cleanCell } from './utils';

const BUK_COLABORADORES_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}templates/buk-colaboradores-template.xlsx`;
const BUK_TRABAJOS_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}templates/buk-trabajos-template.xlsx`;
const REX_EMPLEADOS_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}templates/rex-empleados-template.xlsx`;
const REX_CORREOS_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}templates/rex-correos-finning.xlsx`;
const REX_CARGOS_TEMPLATE_ASSET_PATH = `${import.meta.env.BASE_URL}templates/rex-cargos-finning.xlsx`;
const ESTABLECIMIENTO_PAE_OPTIONS_ASSET_PATH = `${import.meta.env.BASE_URL}options/establecimiento-pae.txt`;
const NOMBRE_RBD_OPTIONS_ASSET_PATH = `${import.meta.env.BASE_URL}options/nombre-rbd.txt`;
const FICHA_CODES_ASSET_PATH = `${import.meta.env.BASE_URL}options/supervisor-fichas.json`;

export async function loadBukColaboradoresTemplateResource() {
  const [response, fichaCodesResponse] = await Promise.all([
    fetch(BUK_COLABORADORES_TEMPLATE_ASSET_PATH),
    fetch(FICHA_CODES_ASSET_PATH),
  ]);

  if (!response.ok) {
    throw new Error('No fue posible cargar el template embebido de BUK Colaboradores.');
  }

  if (!fichaCodesResponse.ok) {
    throw new Error('No fue posible cargar el maestro embebido de fichas.');
  }

  const [arrayBuffer, fichaCodesCatalog] = await Promise.all([
    response.arrayBuffer(),
    fichaCodesResponse.json(),
  ]);
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
    fichaCodesCatalog,
  };
}

export async function loadBukTrabajosTemplateResource() {
  const [response, establecimientoPaeResponse, nombreRbdResponse, fichaCodesResponse] = await Promise.all([
    fetch(BUK_TRABAJOS_TEMPLATE_ASSET_PATH),
    fetch(ESTABLECIMIENTO_PAE_OPTIONS_ASSET_PATH),
    fetch(NOMBRE_RBD_OPTIONS_ASSET_PATH),
    fetch(FICHA_CODES_ASSET_PATH),
  ]);

  if (!response.ok) {
    throw new Error('No fue posible cargar el template base de BUK Trabajos.');
  }

  if (!establecimientoPaeResponse.ok || !nombreRbdResponse.ok || !fichaCodesResponse.ok) {
    throw new Error('No fue posible cargar las listas embebidas de campos personalizados para BUK Trabajos.');
  }

  const [arrayBuffer, establecimientoPaeText, nombreRbdText, fichaCodesCatalog] = await Promise.all([
    response.arrayBuffer(),
    establecimientoPaeResponse.text(),
    nombreRbdResponse.text(),
    fichaCodesResponse.json(),
  ]);
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const trabajosRows = getSheetRows(workbook.Sheets.trabajos);
  const sueldosRows = getSheetRows(workbook.Sheets.sueldos);
  const estipulacionesRows = getSheetRows(workbook.Sheets.Estipulaciones);
  const empresasRows = getSheetRows(workbook.Sheets.Empresas);
  const subAreasRows = getSheetRows(workbook.Sheets['Sub-áreas']);
  const cargosRows = getSheetRows(workbook.Sheets.Cargos);
  const recintosRows = getSheetRows(workbook.Sheets.Recintos);

  if (
    trabajosRows.length === 0 ||
    sueldosRows.length === 0 ||
    estipulacionesRows.length === 0 ||
    empresasRows.length === 0 ||
    subAreasRows.length === 0 ||
    cargosRows.length === 0 ||
    recintosRows.length === 0
  ) {
    throw new Error('El template base de BUK Trabajos no contiene todas las hojas requeridas.');
  }

  return {
    arrayBuffer,
    workbook,
    trabajosHeaders: trabajosRows[0]?.map(cleanCell) ?? [],
    sueldosRows,
    estipulacionesRows,
    empresasRows,
    subAreasRows,
    cargosRows,
    recintosRows,
    empresasCatalog: buildRowCatalog(empresasRows),
    subAreasCatalog: buildRowCatalog(subAreasRows),
    cargosCatalog: buildRowCatalog(cargosRows),
    establecimientoPaeOptions: buildPlainTextOptionsCatalog(establecimientoPaeText),
    nombreRbdOptions: buildPlainTextOptionsCatalog(nombreRbdText),
    fichaCodesCatalog,
  };
}

export async function loadRexTemplateResource() {
  const [templateResponse, emailResponse, cargosResponse] = await Promise.all([
    fetch(REX_EMPLEADOS_TEMPLATE_ASSET_PATH),
    fetch(REX_CORREOS_TEMPLATE_ASSET_PATH),
    fetch(REX_CARGOS_TEMPLATE_ASSET_PATH),
  ]);

  if (!templateResponse.ok) {
    throw new Error('No fue posible cargar el template embebido de REX+.');
  }

  if (!emailResponse.ok) {
    throw new Error('No fue posible cargar el maestro embebido de correos Finning.');
  }

  if (!cargosResponse.ok) {
    throw new Error('No fue posible cargar el maestro embebido de cargos Finning.');
  }

  const [arrayBuffer, emailArrayBuffer, cargosArrayBuffer] = await Promise.all([
    templateResponse.arrayBuffer(),
    emailResponse.arrayBuffer(),
    cargosResponse.arrayBuffer(),
  ]);
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const cargosWorkbook = XLSX.read(cargosArrayBuffer, { type: 'array' });
  const employeeSheetName = 'Ejemplo';
  const employeeRows = getSheetRows(workbook.Sheets[employeeSheetName]);

  if (employeeRows.length < 2) {
    throw new Error('El template embebido de REX+ no contiene una hoja Ejemplo válida.');
  }

  const employeeHeaders = employeeRows[1]?.map(cleanCell) ?? [];
  const sheetRowsByName = workbook.SheetNames.reduce((lookup, sheetName) => {
    lookup[sheetName] = getSheetRows(workbook.Sheets[sheetName]);
    return lookup;
  }, {});
  const externalCargoSheetName = cargosWorkbook.SheetNames[0];
  const externalCargoRows = getSheetRows(cargosWorkbook.Sheets[externalCargoSheetName]);

  if (externalCargoRows.length > 0) {
    sheetRowsByName.Cargo = externalCargoRows;
  }

  const catalogs = workbook.SheetNames.reduce((lookup, sheetName) => {
    if (sheetName === employeeSheetName) {
      return lookup;
    }

    lookup[sheetName] = buildRexCatalog(sheetRowsByName[sheetName]);
    return lookup;
  }, {});

  if (externalCargoRows.length > 0) {
    catalogs.Cargo = buildRexCargoCatalog(externalCargoRows);
  }

  return {
    arrayBuffer,
    workbook,
    employeeSheetName,
    employeeHeaders,
    employeeLeadRows: employeeRows.slice(0, 2),
    sheetRowsByName,
    catalogs,
    emailCatalog: buildRexEmailCatalog(emailArrayBuffer),
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

export function buildBukColaboradoresExportWorkbook({ templateResource, rowEntries }) {
  const sourceWorkbook = XLSX.read(templateResource.arrayBuffer, { type: 'array' });
  const sourceEmployeesSheet = sourceWorkbook.Sheets.Empleados;
  const sourceListsSheet = sourceWorkbook.Sheets.Listas;

  const workbook = XLSX.utils.book_new();

  const employeesSheet = XLSX.utils.aoa_to_sheet([
    templateResource.employeeHeaders,
    ...rowEntries.map((entry) => templateResource.employeeHeaders.map((header) => entry.exportedRow[header] ?? '')),
  ]);
  const listsSheet = XLSX.utils.aoa_to_sheet(templateResource.listRows);
  const alertEntries = rowEntries.flatMap((entry, index) =>
    (entry.alerts ?? []).map((alert) => ({
      ...alert,
      exportRowNumber: index + 2,
    })),
  );

  copySheetMeta(sourceEmployeesSheet, employeesSheet);
  copySheetMeta(sourceListsSheet, listsSheet);
  applyAlertComments(employeesSheet, templateResource.employeeHeaders, alertEntries);

  XLSX.utils.book_append_sheet(workbook, employeesSheet, 'Empleados');
  XLSX.utils.book_append_sheet(workbook, listsSheet, 'Listas');

  if (alertEntries.length > 0) {
    XLSX.utils.book_append_sheet(workbook, buildAlertsSheet(alertEntries), 'Alertas');
  }

  return workbook;
}

export function buildBukTrabajosExportWorkbook({ templateResource, exportedRows, supportSheets }) {
  const sourceWorkbook = XLSX.read(templateResource.arrayBuffer, { type: 'array' });
  const workbook = XLSX.utils.book_new();
  const sheetSpecs = [
    {
      name: 'trabajos',
      rows: [
        templateResource.trabajosHeaders,
        ...exportedRows.map((row) => templateResource.trabajosHeaders.map((header) => row[header] ?? '')),
      ],
    },
    {
      name: 'sueldos',
      rows: templateResource.sueldosRows,
    },
    {
      name: 'Estipulaciones',
      rows: templateResource.estipulacionesRows,
    },
    {
      name: 'Empresas',
      rows: supportSheets.empresasRows,
    },
    {
      name: 'Sub-áreas',
      rows: supportSheets.subAreasRows,
    },
    {
      name: 'Cargos',
      rows: supportSheets.cargosRows,
    },
    {
      name: 'Recintos',
      rows: supportSheets.recintosRows,
    },
  ];

  sheetSpecs.forEach(({ name, rows }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    copySheetMeta(sourceWorkbook.Sheets[name], sheet);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });

  return workbook;
}

export function buildRexExportWorkbook({ templateResource, rowEntries }) {
  const sourceWorkbook = XLSX.read(templateResource.arrayBuffer, { type: 'array' });
  const workbook = XLSX.utils.book_new();

  sourceWorkbook.SheetNames.forEach((sheetName) => {
    const sourceSheet = sourceWorkbook.Sheets[sheetName];
    const rows =
      sheetName === templateResource.employeeSheetName
        ? [
            ...templateResource.employeeLeadRows,
            ...rowEntries.map((entry) =>
              templateResource.employeeHeaders.map((header) => entry[header] ?? ''),
            ),
          ]
        : templateResource.sheetRowsByName[sheetName];
    const nextSheet = XLSX.utils.aoa_to_sheet(rows);
    copySheetMeta(sourceSheet, nextSheet);
    XLSX.utils.book_append_sheet(workbook, nextSheet, sheetName);
  });

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

function buildPlainTextOptionsCatalog(text) {
  return String(text ?? '')
    .split(/\r?\n/g)
    .map(cleanCell)
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function buildRexCatalog(rows) {
  const [headers = [], ...dataRows] = rows;
  const normalizedHeaders = headers.map(cleanCell);
  const idIndex = normalizedHeaders.findIndex((header) => normalizeCatalogHeader(header) === 'id');
  const nameIndex = normalizedHeaders.findIndex((header) => normalizeCatalogHeader(header) === 'nombre');

  return dataRows
    .filter((row) => row.some((value) => cleanCell(value)))
    .map((row) => ({
      id: cleanCell(row[idIndex]),
      name: cleanCell(row[nameIndex]),
    }))
    .filter((row) => row.id || row.name);
}

function buildRexCargoCatalog(rows) {
  const headerRowIndex = rows.findIndex((row) => {
    const normalizedRow = row.map((value) => normalizeCatalogHeader(value));
    return normalizedRow[0] === 'item' && normalizedRow[1] === 'nombre';
  });

  if (headerRowIndex === -1) {
    return buildRexCatalog(rows);
  }

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((value) => cleanCell(value)))
    .map((row) => ({
      id: cleanCell(row[0]),
      name: cleanCell(row[1]),
    }))
    .filter((row) => row.id || row.name);
}

function buildRexEmailCatalog(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  const headers = (rows[4] ?? []).map(cleanCell);
  const ciIndex = headers.indexOf('CI');
  const employeeIdIndex = headers.indexOf('ID EMPLEADO');
  const emailIndex = headers.indexOf('CORREO');
  const byCi = new Map();
  const byEmployeeId = new Map();

  rows
    .slice(5)
    .filter((row) => row.some((value) => cleanCell(value)))
    .forEach((row) => {
      const ci = cleanCell(row[ciIndex]);
      const employeeId = cleanCell(row[employeeIdIndex]);
      const email = cleanCell(row[emailIndex]).toLowerCase();

      if (!email) {
        return;
      }

      if (ci) {
        appendUniqueValue(byCi, ci, email);
      }

      if (employeeId) {
        appendUniqueValue(byEmployeeId, employeeId, email);
      }
    });

  return { byCi, byEmployeeId };
}

function normalizeCatalogHeader(value) {
  return cleanCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function appendUniqueValue(lookup, key, value) {
  const currentValues = lookup.get(key) ?? [];

  if (!currentValues.includes(value)) {
    currentValues.push(value);
  }

  lookup.set(key, currentValues);
}

function applyAlertComments(sheet, headers, alerts) {
  if (alerts.length === 0) {
    return;
  }

  const headerIndex = headers.reduce((lookup, header, index) => {
    lookup.set(header, index);
    return lookup;
  }, new Map());

  alerts.forEach((alert) => {
    const columnIndex = headerIndex.get(alert.field);

    if (columnIndex === undefined) {
      return;
    }

    const cellRef = XLSX.utils.encode_cell({
      r: alert.exportRowNumber - 1,
      c: columnIndex,
    });
    const currentCell = sheet[cellRef] ?? { t: 's', v: alert.appliedValue ?? '' };

    sheet[cellRef] = {
      ...currentCell,
      c: [
        {
          a: 'Codex',
          t: alert.message,
        },
      ],
    };
  });
}

function buildAlertsSheet(alerts) {
  return XLSX.utils.aoa_to_sheet([
    ['Fila exportada', 'Fila origen', 'Campo', 'Valor aplicado', 'Detalle'],
    ...alerts.map((alert) => [
      alert.exportRowNumber,
      alert.row,
      alert.field,
      alert.appliedValue ?? '',
      alert.message,
    ]),
  ]);
}
