import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx/xlsx.mjs';
import {
  MONTHLY_DETAIL_HEADERS,
  buildMonthlyConceptCsv,
  buildMonthlyConceptDecisions,
  excludeMonthlyFiniquitoRows,
  parseMonthlyAmount,
  parseMonthlyConceptMatrix,
  parseMonthlyDetailTemplate,
  parseMonthlyVismaBook,
  validateMonthlyConceptLoad,
} from '../src/lib/monthlyConcepts.js';
import { parseVismaHistoricalEmployeeMaster } from '../src/lib/vismaHistoricalEmployeeMaster.js';

function workbookBuffer(sheets) {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  });
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}

test('parses the 16-column REX+ template and rejects a changed order', async () => {
  const valid = workbookBuffer({ Base: [MONTHLY_DETAIL_HEADERS, []] });
  const invalidHeaders = [...MONTHLY_DETAIL_HEADERS];
  [invalidHeaders[1], invalidHeaders[2]] = [invalidHeaders[2], invalidHeaders[1]];

  assert.deepEqual((await parseMonthlyDetailTemplate(valid)).headers, MONTHLY_DETAIL_HEADERS);
  await assert.rejects(parseMonthlyDetailTemplate(workbookBuffer({ Base: [invalidHeaders] })), /16 columnas en orden/);
});

test('reads the source matrix target code and the institution requirement flag', async () => {
  const headers = ['CONCEPTO', 'NOMBRE', 'TIPO', 'FOMULACION', 'LRE- NOMBRE', 'ID-CARGA', 'NOMBRE', 'Se Debe Agregar una Institucion'];
  const matrix = workbookBuffer({ Matriz: [
    ['', '', '', '', '', '', '', 'Se Debe Agregar una Institucion'],
    headers,
    [1100, 'SUELDO GANADO', 'HABER', 'IMPORTE', '2101 - Sueldo', 'sueldoBase', 'Sueldo Base', 'NO'],
    [6600, 'A.F.P.', 'DESCUENTO', 'IMPORTE', '3141 - AFP', '', '', 'SI'],
  ] });
  const parsed = await parseMonthlyConceptMatrix(matrix);

  assert.equal(parsed.concepts[0].targetId, 'sueldoBase');
  assert.equal(parsed.concepts[0].sourceCode, '1100');
  assert.equal(parsed.concepts[1].institutionRequired, true);
});

test('reads Visma-to-REX mapping files and leaves weak or missing matches for review', async () => {
  const mapping = workbookBuffer({ Mapeo: [
    ['Nombre Concepto Visma', 'Nombre Concepto REX+', 'ID Concepto REX+', 'Similitud (%)'],
    ['AGUINALDO', 'Aguinaldo', 'aguinaldo', 100],
    ['IMPUESTO UNICO', 'Impuesto Agricola', 'impuestoAgricola', 77.42],
    ['A.F.P.', 'Sin Coincidencia', 'Sin Coincidencia', 0],
  ] });
  const parsed = await parseMonthlyConceptMatrix(mapping);
  const decisions = buildMonthlyConceptDecisions({
    sourceConcepts: [
      { header: 'AGUINALDO', index: 1, nonZeroCount: 1 },
      { header: 'IMPUESTO UNICO', index: 2, nonZeroCount: 1 },
      { header: 'A.F.P.', index: 3, nonZeroCount: 1 },
    ],
    matrixConcepts: parsed.concepts,
  });

  assert.equal(parsed.format, 'visma-rex-mapping');
  assert.equal(decisions[0].approved, true);
  assert.equal(decisions[1].targetId, 'impuestoAgricola');
  assert.equal(decisions[1].approved, false);
  assert.equal(decisions[1].similarity, 77.42);
  assert.equal(decisions[2].targetId, '');
  assert.equal(decisions[2].approved, false);
  assert.equal(decisions[2].loadable, false);
});

test('does not auto-approve duplicate source names that point to different REX IDs', async () => {
  const mapping = workbookBuffer({ Mapeo: [
    ['Nombre Concepto Visma', 'Nombre Concepto REX+', 'ID Concepto REX+', 'Similitud (%)'],
    ['BONO', 'Bono', 'bono', 100],
    ['BÓNO', 'Bono especial', 'bonoEspecial', 100],
  ] });
  const parsed = await parseMonthlyConceptMatrix(mapping);
  const [decision] = buildMonthlyConceptDecisions({
    sourceConcepts: [{ header: 'BONO', index: 1, nonZeroCount: 1 }],
    matrixConcepts: parsed.concepts,
  });

  assert.equal(decision.mappingConflict, true);
  assert.equal(decision.targetId, '');
  assert.equal(decision.approved, false);
});

test('detects concept columns while keeping totals and employee attributes out', async () => {
  const source = workbookBuffer({ Libro: [
    ['RAUDA'],
    ['Período', 'Empleado', 'Apellido y Nombre', 'RUT', 'AFP', 'Días Trabajados', 'Sueldo', 'SUELDO GANADO', 'A.F.P.', 'Total Haberes', 'Líquido'],
    [new Date(2026, 8, 1), 123, 'PERSONA PRUEBA', '12345678-5', 'MODELO', 30, 800000, 800000, 62000, 800000, 738000],
  ] });
  const parsed = await parseMonthlyVismaBook(source);

  assert.equal(parsed.period, '2026-09');
  assert.equal(parsed.workerCount, 1);
  assert.deepEqual(parsed.conceptColumns.map((column) => column.header), ['SUELDO GANADO', 'A.F.P.']);
});

test('Rauda in Ola 1 only offers aguinaldo, colacion and movilizacion as monthly variables', () => {
  const decisions = buildMonthlyConceptDecisions({
    scope: 'ola-1',
    company: 'Rauda',
    sourceConcepts: [
      { header: 'SUELDO GANADO', index: 1, nonZeroCount: 1 },
      { header: 'A.F.P.', index: 2, nonZeroCount: 1 },
      { header: 'SALUD', index: 3, nonZeroCount: 1 },
      { header: 'ADICIONAL SALUD', index: 4, nonZeroCount: 1 },
      { header: 'SIS Aporte Empleador', index: 5, nonZeroCount: 1 },
      { header: '* Aporte Patronal Mutual', index: 11, nonZeroCount: 1 },
      { header: 'GRATIFICACION', index: 6, nonZeroCount: 1 },
      { header: 'AGUINALDO', index: 7, nonZeroCount: 1 },
      { header: 'COLACION', index: 8, nonZeroCount: 1 },
      { header: 'MOVILIZACION', index: 9, nonZeroCount: 1 },
      { header: 'IMPUESTO UNICO', index: 10, nonZeroCount: 1 },
    ],
    matrixConcepts: [
      { sourceName: 'SIS Aporte Empleador', classification: 'Contribuciones Empleador' },
      { sourceName: '* Aporte Patronal Mutual', classification: 'Aporte Patronal' },
    ],
  });

  assert.deepEqual(decisions.filter((decision) => decision.selected).map((decision) => decision.sourceName), [
    'AGUINALDO', 'COLACION', 'MOVILIZACION',
  ]);
});

test('does not apply Rauda variable rules to another company in Ola 1', () => {
  const decisions = buildMonthlyConceptDecisions({
    scope: 'ola-1',
    company: 'Otra empresa',
    sourceConcepts: [
      { header: 'SUELDO GANADO', index: 1, nonZeroCount: 1 },
      { header: 'ADICIONAL SALUD', index: 2, nonZeroCount: 1 },
      { header: 'AGUINALDO', index: 3, nonZeroCount: 1 },
      { header: '* Aporte Patronal Mutual', index: 4, nonZeroCount: 1 },
    ],
    matrixConcepts: [{ sourceName: '* Aporte Patronal Mutual', classification: 'Aporte Patronal' }],
  });

  assert.deepEqual(decisions.filter((decision) => decision.selected).map((decision) => decision.sourceName), [
    'ADICIONAL SALUD', 'AGUINALDO',
  ]);
  assert.equal(decisions.find((decision) => decision.sourceName === '* Aporte Patronal Mutual').loadable, false);
});

test('Sumitomo only offers its mapped monthly variables and resolves approved company aliases', () => {
  const decisions = buildMonthlyConceptDecisions({
    scope: 'ola-1',
    company: 'Sumitomo',
    sourceConcepts: [
      { header: 'SUELDO GANADO', index: 1, nonZeroCount: 1 },
      { header: 'GRATIFICACION', index: 2, nonZeroCount: 1 },
      { header: 'HORAS EXTRAS NORMALES AL 50', index: 3, nonZeroCount: 1 },
      { header: 'COLACION MES', index: 4, nonZeroCount: 1 },
      { header: 'APV_t', index: 5, nonZeroCount: 1 },
      { header: 'A.F.P.', index: 6, nonZeroCount: 1 },
      { header: 'IMPUESTO UNICO', index: 7, nonZeroCount: 1 },
      { header: 'SIS Aporte Empleador', index: 8, nonZeroCount: 1 },
    ],
    matrixConcepts: [
      { sourceName: 'ASIGNACION DE COLACION', targetId: 'colacion', targetName: 'Colacion' },
      { sourceName: 'APV_t', targetId: 'apvi', targetName: 'APVI Ahorro voluntario mensual' },
    ],
  });

  assert.deepEqual(decisions.filter((decision) => decision.selected).map((decision) => decision.sourceName), [
    'HORAS EXTRAS NORMALES AL 50', 'COLACION MES', 'APV_t',
  ]);
  assert.equal(decisions.find((decision) => decision.sourceName === 'HORAS EXTRAS NORMALES AL 50').targetId, 'horasEx50');
  assert.equal(decisions.find((decision) => decision.sourceName === 'COLACION MES').targetId, 'colacion');
  assert.equal(decisions.find((decision) => decision.sourceName === 'APV_t').targetId, 'apvi');
});

test('applies confirmed Unilode mappings only to Unilode and excludes legal formulas', () => {
  const sourceConcepts = [
    'BONO BACK UP GRUA ELEVADORA',
    'HORAS EXTRAS NORMALES AL 50',
    'HORAS EXTRAS AL 100',
    'HORAS NO TRABAJADAS',
    'ASIGNACIÓN TELÉFONO',
    'COLACION MES',
    'MOVILIZACION',
    'RET. JUD. UTM',
    'PRESTAMO CCAF LOS ANDES',
    'FULL AHORRO CCAF LOS ANDES',
    'CUOTA SINDICAL',
    'PRESTAMO EMPRESA',
  ].map((header, index) => ({ header, index, nonZeroCount: 1 }));
  const matrixConcepts = [
    { sourceName: 'GRATIFICACION', classification: 'HABER IMPONIBLE Y TRIBUTABLE', formulation: 'FORMULA LEGAL' },
    { sourceName: 'SEGURO DE CESANTIA', classification: 'DESCUENTO LEGAL' },
    { sourceName: 'ADICIONAL SALUD', classification: 'DESCUENTO LEGAL' },
    { sourceName: '* Ley Sanna' },
  ];
  const unilode = buildMonthlyConceptDecisions({
    company: 'UNILODE AVIATION',
    sourceConcepts: [...sourceConcepts, ...matrixConcepts.map((concept, index) => ({
      header: concept.sourceName,
      index: sourceConcepts.length + index,
      nonZeroCount: 1,
    }))],
    matrixConcepts,
    catalog: [{ id: 'oldCatalogConcept', name: 'Concepto antiguo' }],
  });

  const expectedMappings = new Map([
    ['BONO BACK UP GRUA ELEVADORA', 'bonoBackUpGruaElevad'],
    ['CUOTA SINDICAL', 'cuotaSindical'],
    ['PRESTAMO EMPRESA', 'prestamoEmpresa'],
    ['HORAS EXTRAS NORMALES AL 50', 'horasEx50'],
    ['HORAS EXTRAS AL 100', 'horasEx100'],
    ['HORAS NO TRABAJADAS', 'minatrasos'],
    ['ASIGNACIÓN TELÉFONO', 'asigtelefono'],
    ['COLACION MES', 'colacion'],
    ['MOVILIZACION', 'movilizacion'],
    ['RET. JUD. UTM', 'retencionJudicial'],
    ['PRESTAMO CCAF LOS ANDES', 'cajaCred'],
    ['FULL AHORRO CCAF LOS ANDES', 'cajaAhor'],
  ]);
  expectedMappings.forEach((targetId, sourceName) => {
    const decision = unilode.find((item) => item.sourceName === sourceName);
    assert.equal(decision.targetId, targetId);
    assert.equal(decision.approved, true);
  });
  assert.equal(unilode.find((item) => item.sourceName === 'ASIGNACIÓN TELÉFONO').targetName, 'ASIGNACIÓN TELÉFONO');
  assert.equal(unilode.find((item) => item.sourceName === 'CUOTA SINDICAL').approved, true);
  assert.equal(unilode.find((item) => item.sourceName === 'GRATIFICACION').selected, false);
  assert.equal(unilode.find((item) => item.sourceName === 'SEGURO DE CESANTIA').selected, false);
  assert.equal(unilode.find((item) => item.sourceName === 'ADICIONAL SALUD').selected, false);
  assert.equal(unilode.find((item) => item.sourceName === '* Ley Sanna').selected, false);

  const [otherCompany] = buildMonthlyConceptDecisions({
    company: 'Otra empresa',
    sourceConcepts: [sourceConcepts.find(({ header }) => header === 'ASIGNACIÓN TELÉFONO')],
  });
  assert.equal(otherCompany.targetId, '');
  assert.equal(otherCompany.approved, false);

  const [updatedUnionMapping] = buildMonthlyConceptDecisions({
    company: 'UNILODE AVIATION',
    sourceConcepts: [{ header: 'CUOTA SINDICAL', index: 1, nonZeroCount: 1 }],
    matrixConcepts: [{ sourceName: 'CUOTA SINDICAL', targetId: 'CuotaSindMi', targetName: 'Cuota sindical 1' }],
    catalog: [{ id: 'CuotaSindMi', name: 'Cuota sindical 1 MI' }],
  });
  assert.equal(updatedUnionMapping.targetId, 'cuotaSindical');
  assert.equal(updatedUnionMapping.approved, true);
});

test('applies confirmed GreenVic mappings without leaking them to other companies', () => {
  const sourceConcepts = [
    { header: 'APV_t', index: 1, nonZeroCount: 1 },
    { header: 'COLACION MES', index: 2, nonZeroCount: 1 },
    { header: 'MOVILIZACION', index: 3, nonZeroCount: 1 },
    { header: 'SEGURO CCAF LOS ANDES', index: 4, nonZeroCount: 1 },
    { header: 'PRESTAMO CCAF LOS ANDES', index: 5, nonZeroCount: 1 },
    { header: 'ANTICIPO DE SUELDO', index: 6, nonZeroCount: 1 },
    { header: 'AHORRO CUENTA 2', index: 7, nonZeroCount: 1 },
    { header: 'PRESTAMO EMPRESA', index: 8, nonZeroCount: 1 },
    { header: 'DESCTO.VARIOS BIENESTAR', index: 9, nonZeroCount: 1 },
    { header: 'FUNDACION ARTURO LOPEZ', index: 10, nonZeroCount: 1 },
    { header: 'OTROS DESCUENTOS', index: 11, nonZeroCount: 1 },
    { header: 'DESCUENTO TELEFONICO', index: 12, nonZeroCount: 1 },
    { header: 'SEGURO SALUD METLIFE', index: 13, nonZeroCount: 1 },
    { header: 'ANTICIPO GRATIFICACION', index: 14, nonZeroCount: 1 },
  ];
  const decisions = buildMonthlyConceptDecisions({
    scope: 'ola-1',
    company: 'Comercial Greenvic S.A.',
    sourceConcepts,
    matrixConcepts: sourceConcepts.map(({ header }) => ({
      sourceName: header,
      classification: 'Descuento',
      targetId: '',
    })),
    catalog: [
      'colacion', 'seguromet', 'apvi', 'movilizacion', 'cajaSegu', 'cajaCred',
      'anticipo', 'cajaAhor', 'descuentosVarios', 'fundacionArturoLopez', 'prestamoempresa',
    ].map((id) => ({ id, name: id })),
  });

  assert.equal(decisions.find((decision) => decision.sourceName === 'SEGURO SALUD METLIFE').targetId, 'seguromet');
  assert.equal(decisions.find((decision) => decision.sourceName === 'SEGURO SALUD METLIFE').approved, true);
  assert.equal(decisions.find((decision) => decision.sourceName === 'APV_t').targetId, 'apvi');
  assert.equal(decisions.find((decision) => decision.sourceName === 'COLACION MES').targetId, 'colacion');
  assert.equal(decisions.find((decision) => decision.sourceName === 'MOVILIZACION').targetId, 'movilizacion');
  assert.equal(decisions.find((decision) => decision.sourceName === 'SEGURO CCAF LOS ANDES').targetId, 'cajaSegu');
  assert.equal(decisions.find((decision) => decision.sourceName === 'PRESTAMO CCAF LOS ANDES').targetId, 'cajaCred');
  assert.equal(decisions.find((decision) => decision.sourceName === 'ANTICIPO DE SUELDO').targetId, 'anticipo');
  assert.equal(decisions.find((decision) => decision.sourceName === 'AHORRO CUENTA 2').targetId, 'cajaAhor');
  assert.equal(decisions.find((decision) => decision.sourceName === 'PRESTAMO EMPRESA').targetId, 'prestamoEmpresa');
  assert.equal(decisions.find((decision) => decision.sourceName === 'PRESTAMO EMPRESA').approved, true);
  assert.equal(decisions.find((decision) => decision.sourceName === 'DESCTO.VARIOS BIENESTAR').targetId, 'descuentosVarios');
  assert.equal(decisions.find((decision) => decision.sourceName === 'FUNDACION ARTURO LOPEZ').targetId, 'fundacionArturoLopez');
  assert.equal(decisions.find((decision) => decision.sourceName === 'OTROS DESCUENTOS').targetId, 'descuentosVarios');
  assert.equal(decisions.find((decision) => decision.sourceName === 'DESCUENTO TELEFONICO').targetId, 'descuentosVarios');
  assert.equal(decisions.find((decision) => decision.sourceName === 'ANTICIPO GRATIFICACION').selected, false);

  const otherCompany = buildMonthlyConceptDecisions({
    company: 'Otra empresa',
    sourceConcepts: [sourceConcepts[2]],
  });
  assert.equal(otherCompany[0].targetId, '');
});

test('excludes GreenVic contractual and statutory concepts only for GreenVic', () => {
  const sourceConcepts = [
    'A.F.P.',
    'SALUD',
    'ADICIONAL SALUD',
    'SEGURO DE CESANTÍA',
    'IMPUESTO ÚNICO',
  ].map((header, index) => ({ header, index, nonZeroCount: 1 }));
  const greenvic = buildMonthlyConceptDecisions({
    company: 'Comercial Greenvic S.A.',
    sourceConcepts,
  });

  assert.deepEqual(greenvic.map(({ loadable, selected }) => ({ loadable, selected })),
    sourceConcepts.map(() => ({ loadable: false, selected: false })));

  const otherCompany = buildMonthlyConceptDecisions({
    company: 'Otra empresa',
    sourceConcepts: sourceConcepts.slice(2),
  });
  assert.deepEqual(otherCompany.map(({ loadable }) => loadable), [true, true, true]);
});

test('reads the REX+ employee CSV header aliases and preserves its actual contract and AFP ID', async () => {
  const csv = '\uFEFFMaestro de colaboradores\r\nId empleado;Nombres;Id AFP;Número del contrato\r\n12.345.678-5;PERSONA PRUEBA;capital;C-18\r\n';
  const bytes = new TextEncoder().encode(csv);
  const employees = await parseVismaHistoricalEmployeeMaster(bytes.buffer, '', 'maestro.csv');

  assert.deepEqual(employees, [{
    id: '12345678-5',
    name: 'PERSONA PRUEBA',
    contract: 'C-18',
    afp: 'capital',
    status: '',
  }]);
});

test('excludes only GreenVic rows with a termination date and finiquito amounts', () => {
  const source = {
    headers: ['RUT', 'Fecha de Baja', 'SUELDO GANADO', 'INDEMNIZACION VOLUNTARIA'],
    rows: [
      { RUT: '12345678-5', 'Fecha de Baja': '0', 'SUELDO GANADO': 1000, 'INDEMNIZACION VOLUNTARIA': 0 },
      { RUT: '98765432-1', 'Fecha de Baja': new Date('2026-08-31'), 'SUELDO GANADO': 0, 'INDEMNIZACION VOLUNTARIA': 5000 },
    ],
    rowNumbers: [7, 8],
    workerCount: 2,
    conceptColumns: [
      { header: 'SUELDO GANADO', index: 2, nonZeroCount: 1, invalidRows: [] },
      { header: 'INDEMNIZACION VOLUNTARIA', index: 3, nonZeroCount: 1, invalidRows: [] },
    ],
    duplicateRutGroups: [],
  };

  const filtered = excludeMonthlyFiniquitoRows(source, 'Comercial Greenvic S.A.');
  assert.equal(filtered.excludedFiniquitoRows, 1);
  assert.equal(filtered.workerCount, 1);
  assert.deepEqual(filtered.rowNumbers, [7]);
  assert.deepEqual(filtered.conceptColumns.map(({ header }) => header), ['SUELDO GANADO']);
  assert.equal(source.rows.length, 2);
  assert.equal(excludeMonthlyFiniquitoRows(source, 'Sumitomo'), source);
});

test('creates only non-zero rows with the real employee contract and REX+ headers', () => {
  const source = {
    period: '2026-09',
    duplicateRutGroups: [],
    rows: [{
      RUT: '12345678-5',
      'Apellido y Nombre': 'PERSONA PRUEBA',
      AGUINALDO: 80000,
      COLACION: 50000,
      'Id Centro de Costo': '-',
    }],
  };
  const decisions = buildMonthlyConceptDecisions({
    sourceConcepts: [
      { header: 'AGUINALDO', index: 7, nonZeroCount: 1 },
      { header: 'COLACION', index: 8, nonZeroCount: 1 },
    ],
    matrixConcepts: [
      { sourceName: 'AGUINALDO', targetId: 'aguinaldo', targetName: 'Aguinaldo' },
      { sourceName: 'COLACION', targetId: 'colacion', targetName: 'Colación' },
    ],
  });
  const result = buildMonthlyConceptCsv({
    source,
    decisions,
    employeeCatalog: [{ id: '12345678-5', contract: '4' }],
    templateHeaders: MONTHLY_DETAIL_HEADERS,
    scope: 'ola-1',
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0][1], '4');
  assert.equal(result.rows[0][2], 'aguinaldo');
  assert.equal(result.rows[0][4], 'M');
  assert.equal(result.rows[0][6], 'M');
  assert.equal(result.rows[0][13], '');
  assert.match(result.csv, /^\uFEFFPlantilla;Contrato;Concepto;Valor/);
  assert.equal(result.fileName, 'REX_conceptos_detalle_ola-1_2026-09.csv');
});

test('fills GreenVic institution IDs for CCAF, APV and MetLife concepts', () => {
  const names = [
    'AHORRO CUENTA 2',
    'APV_t',
    'PRESTAMO CCAF LOS ANDES',
    'SEGURO CCAF LOS ANDES',
    'SEGURO SALUD METLIFE',
  ];
  const source = {
    period: '2026-09',
    duplicateRutGroups: [],
    rows: [Object.fromEntries([
      ['RUT', '12345678-5'],
      ...names.map((name) => [name, 1000]),
    ])],
  };
  const decisions = buildMonthlyConceptDecisions({
    company: 'Comercial Greenvic S.A.',
    sourceConcepts: names.map((header, index) => ({ header, index, nonZeroCount: 1 })),
    matrixConcepts: names.map((sourceName) => ({ sourceName, institutionRequired: true })),
  });
  const result = buildMonthlyConceptCsv({
    source,
    decisions,
    employeeCatalog: [{ id: '12345678-5', contract: 'C-18', afp: 'capital' }],
    templateHeaders: MONTHLY_DETAIL_HEADERS,
  });

  assert.deepEqual(result.rows.map((row) => row[9]), ['losandes', 'capital', 'losandes', 'losandes', '121']);
});

test('blocks an APV detail when the employee master lacks that worker AFP ID', () => {
  const source = {
    rows: [{ RUT: '12345678-5', 'APV_t': 1000 }],
    duplicateRutGroups: [],
  };
  const decisions = [{
    sourceName: 'APV_t',
    sourceKey: 'APV_t',
    targetId: 'apvi',
    loadable: true,
    selected: true,
    approved: true,
    institutionRequired: true,
  }];
  const validation = validateMonthlyConceptLoad({
    source,
    decisions,
    employeeCatalog: [{ id: '12345678-5', contract: 'C-18', afp: '' }],
    template: MONTHLY_DETAIL_HEADERS,
  });

  assert.equal(validation.canDownload, false);
  assert.match(validation.issues[0].reason, /Falta el ID de institución para 1 trabajador/);
});

test('unselected unmapped variables do not block a selected subset', () => {
  const decisions = [
    { sourceName: 'AGUINALDO', sourceKey: 'AGUINALDO', loadable: true, selected: true, approved: true, targetId: 'aguinaldo', nonZeroCount: 1 },
    { sourceName: 'IMPUESTO UNICO', sourceKey: 'IMPUESTO UNICO', loadable: true, selected: false, approved: false, targetId: '', nonZeroCount: 1 },
  ];
  const validation = validateMonthlyConceptLoad({
    source: { rows: [{ RUT: '12345678-5' }], duplicateRutGroups: [] },
    decisions,
    employeeCatalog: [{ id: '12345678-5', contract: '1' }],
    template: MONTHLY_DETAIL_HEADERS,
  });

  assert.equal(validation.canDownload, true);
  assert.equal(validation.conceptCount, 1);
});

test('parses Chilean money strings without confusing thousands separators', () => {
  assert.equal(parseMonthlyAmount('1.234.567'), 1234567);
  assert.equal(parseMonthlyAmount('1.234,50'), 1234.5);
  assert.equal(parseMonthlyAmount('-450.000'), -450000);
  assert.equal(parseMonthlyAmount('texto'), null);
});
