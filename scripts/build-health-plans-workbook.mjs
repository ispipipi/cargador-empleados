import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const APP_DIR = path.resolve(new URL('..', import.meta.url).pathname);
const OUTPUT_DIR = path.join(APP_DIR, 'outputs');
const report = process.env.REPORT || 'six-companies';
const reportConfig = {
  'six-companies': {
    output: 'Planes_salud_6_empresas_2026-10-09.xlsx',
    labels: ['icon', 'nutrien', 'sumitomo', 'greenvic', 'unilode', 'rauda'],
    sheetNames: { icon: 'ICON', nutrien: 'Nutrien', sumitomo: 'Sumitomo', greenvic: 'Greenvic', unilode: 'Unilode', rauda: 'Rauda' },
    companyIds: { icon: '22201', nutrien: '21701', sumitomo: '21701', greenvic: '22119', unilode: '21701', rauda: '21701' },
    companyNames: {},
  },
  consorcio: {
    output: 'Planes_salud_consorcio_2026-10-09.xlsx',
    labels: ['banco_consorcio', 'cia_generales_consorcio', 'cia_vida_consorcio', 'consorcio_corredores', 'consorcio_financiero', 'consorcio_servicios'],
    sheetNames: {
      banco_consorcio: 'Banco Consorcio',
      cia_generales_consorcio: 'Seg. Generales',
      cia_vida_consorcio: 'Seg. Vida',
      consorcio_corredores: 'Corredores Bolsa',
      consorcio_financiero: 'Financiero',
      consorcio_servicios: 'Servicios',
    },
    companyIds: {
      banco_consorcio: '22202',
      cia_generales_consorcio: '21701',
      cia_vida_consorcio: '22207',
      consorcio_corredores: '22203',
      consorcio_financiero: '22201',
      consorcio_servicios: '22204',
    },
    companyNames: {},
  },
  enaco: {
    output: 'Planes_salud_enaco_2026-10-09.xlsx',
    labels: ['asesorias_tierra_fuego', 'constructora_asturias', 'constructora_las_perdices', 'constructora_las_terrazas', 'constructora_lo_prado', 'constructora_montano', 'constructora_nueva_tarapaca', 'constructora_pie_andino', 'constructora_san_pedro', 'puerto_esperanza', 'servicios_post_venta_ok_hogar'],
    sheetNames: {
      asesorias_tierra_fuego: 'Tierra del Fuego',
      constructora_asturias: 'C. Asturias',
      constructora_las_perdices: 'Las Perdices',
      constructora_las_terrazas: 'Las Terrazas',
      constructora_lo_prado: 'Lo Prado',
      constructora_montano: 'Montano',
      constructora_nueva_tarapaca: 'Nueva Tarapaca',
      constructora_pie_andino: 'Pie Andino',
      constructora_san_pedro: 'San Pedro',
      puerto_esperanza: 'Puerto Esperanza',
      servicios_post_venta_ok_hogar: 'OK Hogar',
    },
    companyIds: {
      asesorias_tierra_fuego: '22097',
      constructora_asturias: '22096',
      constructora_las_perdices: '22115',
      constructora_las_terrazas: '22109',
      constructora_lo_prado: '22116',
      constructora_montano: '22110',
      constructora_nueva_tarapaca: '22108',
      constructora_pie_andino: '22111',
      constructora_san_pedro: '22117',
      puerto_esperanza: '21701',
      servicios_post_venta_ok_hogar: '22095',
    },
    companyNames: {
      asesorias_tierra_fuego: 'ASESORIAS TIERRA DEL FUEGO S.A.',
      constructora_asturias: 'CONSTRUCTORA ASTURIAS S.A.',
      constructora_las_perdices: 'CONSTRUCTORA LAS PERDICES S.A',
      constructora_las_terrazas: 'CONSTRUCTORA LAS TERRAZAS SpA',
      constructora_lo_prado: 'CONSTRUCTORA LO PRADO S.A.',
      constructora_montano: 'CONSTRUCTORA MONTANO S.A.',
      constructora_nueva_tarapaca: 'CONSTRUCTORA NUEVA TARAPACA S.A.',
      constructora_pie_andino: 'CONSTRUCTORA PIE ANDINO S. A.',
      constructora_san_pedro: 'CONSTRUCTORA SAN PEDRO S.A.',
      puerto_esperanza: 'PUERTO ESPERANZA SPA',
      servicios_post_venta_ok_hogar: 'SERVICIOS POST VENTA OK HOGAR S.A.',
    },
  },
  moneda: {
    output: 'Planes_salud_moneda_2026-10-09.xlsx',
    labels: ['moneda_asset_management', 'moneda_corredores_bolsa', 'moneda_admin_fondos'],
    sheetNames: {
      moneda_asset_management: 'Asset Management',
      moneda_corredores_bolsa: 'Corredores Bolsa',
      moneda_admin_fondos: 'Admin. Fondos',
    },
    companyIds: {
      moneda_asset_management: '22251',
      moneda_corredores_bolsa: '22250',
      moneda_admin_fondos: '22249',
    },
    companyNames: {
      moneda_asset_management: 'MONEDA PATRIA ASSET MANAGEMENT SPA',
      moneda_corredores_bolsa: 'MONEDA PATRIA CORREDORES DE BOLSA LTDA',
      moneda_admin_fondos: 'MONEDA PATRIA S.A. ADMINISTRADORA GENERAL DE FONDOS',
    },
  },
};
const config = reportConfig[report] || reportConfig['six-companies'];
const OUTPUT_PATH = path.join(OUTPUT_DIR, config.output);
const labels = config.labels;
const sheetNames = config.sheetNames;
const companyIds = config.companyIds;
const companyNames = config.companyNames;
const extractedAt = '2026-10-09';

const workbook = Workbook.create();

for (const label of labels) {
  const payload = JSON.parse(await fs.readFile(`/tmp/visma-health-${label}.json`, 'utf8'));
  const rows = (payload.employees || [])
    .filter((employee) => String(employee.__visma?.companyId || '') === companyIds[label])
    .filter((employee) => String(employee['MONTO SALUD UF'] ?? '').trim() !== '')
    .map((employee) => [
      cleanCell(employee.CI),
      cleanCell(employee.NOMBRE),
      cleanCell(employee.ISAPRE),
      parseAmount(employee['MONTO SALUD UF']),
      cleanCell(employee.ESTADO),
    ])
    .sort((left, right) => left[0].localeCompare(right[0], 'es'));

  const sheet = workbook.worksheets.add(sheetNames[label]);
  const companyName = cleanCell(
    payload.employees?.find((employee) => String(employee.__visma?.companyId || '') === companyIds[label])?.EMPRESA
      || companyNames[label]
      || payload.tenant?.name
      || sheetNames[label],
  );
  const endRow = rows.length + 5;

  sheet.getRange('A1:E1').merge();
  sheet.getRange('A1').values = [['Planes de salud en UF']];
  sheet.getRange('A2:E2').merge();
  sheet.getRange('A2').values = [[`Empresa: ${companyName} · Concepto VISMA: 06622`]];
  sheet.getRange('A3:E3').merge();
  sheet.getRange('A3').values = [[`Extracción: ${extractedAt} · Se muestran solo trabajadores con monto informado por VISMA.`]];
  sheet.getRange('A5:E5').values = [[
    'RUT',
    'Nombre',
    'Institución de salud',
    'Monto plan (UF)',
    'Estado trabajador',
  ]];
  if (rows.length > 0) {
    sheet.getRange(`A6:E${endRow}`).values = rows;
    sheet.getRange(`D6:D${endRow}`).format.numberFormat = '0.000';
  }
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(5);
  sheet.getRange('A1:E1').format = {
    fill: '#102A43',
    font: { bold: true, color: '#FFFFFF', size: 16 },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
  };
  sheet.getRange('A2:E2').format = {
    fill: '#EAF4F4',
    font: { color: '#243B53', bold: true },
    wrapText: true,
  };
  sheet.getRange('A3:E3').format = {
    fill: '#F0F4F8',
    font: { color: '#486581', italic: true },
    wrapText: true,
  };
  sheet.getRange('A5:E5').format = {
    fill: '#147D92',
    font: { bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
  };
  if (rows.length > 0) {
    sheet.getRange(`A6:E${endRow}`).format = {
      borders: { preset: 'all', style: 'thin', color: '#D9E2EC' },
      verticalAlignment: 'center',
    };
    sheet.getRange(`D6:D${endRow}`).format.horizontalAlignment = 'right';
  }
  sheet.getRange('A1:E3').format.rowHeight = 24;
  sheet.getRange('A5:E5').format.rowHeight = 36;
  if (rows.length > 0) sheet.getRange(`A6:E${endRow}`).format.rowHeight = 22;
  sheet.getRange('A:A').format.columnWidth = 16;
  sheet.getRange('B:B').format.columnWidth = 36;
  sheet.getRange('C:C').format.columnWidth = 34;
  sheet.getRange('D:D').format.columnWidth = 18;
  sheet.getRange('E:E').format.columnWidth = 18;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_PATH);

const scan = await workbook.inspect({
  kind: 'table',
  range: `${sheetNames[labels[0]]}!A1:E12`,
  include: 'values,formulas',
  tableMaxRows: 12,
  tableMaxCols: 5,
  maxChars: 5000,
});
await fs.writeFile(`${OUTPUT_PATH}.inspect.ndjson`, scan.ndjson || '', 'utf8');

const preview = await workbook.render({ sheetName: sheetNames[labels[0]], range: 'A1:E12', scale: 1, format: 'png' });
await fs.writeFile(`${OUTPUT_PATH}.preview.png`, new Uint8Array(await preview.arrayBuffer()));

console.log(JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  sheets: labels.map((label) => sheetNames[label]),
  rowsBySheet: Object.fromEntries(labels.map((label) => {
    const payload = JSON.parse(readFileSync(`/tmp/visma-health-${label}.json`, 'utf8'));
    return [sheetNames[label], (payload.employees || [])
      .filter((employee) => String(employee.__visma?.companyId || '') === companyIds[label])
      .filter((employee) => String(employee['MONTO SALUD UF'] ?? '').trim() !== '').length];
  })),
}, null, 2));

function cleanCell(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseAmount(value) {
  const text = cleanCell(value).replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}
