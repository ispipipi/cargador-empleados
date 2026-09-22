import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils';

export const BUK_HISTORICAL_LIQUIDATIONS_HEADERS = [
  'Número de Documento',
  'Código de Ficha',
  'RUT Empresa',
  'Sueldo Base',
  'Días Laborales',
  'Días Trabajados',
  'Días Licencias',
  'Días Permisos',
  'Días Ausencias',
  'Días Suspendidos',
  'Número Horas No Trabajadas',
  'Sobretiempo horas extras',
  'Costo Empresa',
  'Total Haberes Imponibles',
  'Total Haberes No Imponibles No Tributables',
  'Total Haberes No Imponibles Tributables',
  'Total Descuentos Legales',
  'Total Otros Descuentos',
  'Sueldo Líquido',
  'Base Tributable',
  'Rebaja Zona Extrema',
  'Impuesto',
  'Pago Previsión',
  'Pago Salud Obligatoria',
  'Pago Salud Voluntaria',
  'Pago Previsión Voluntaria',
  'Seguro Cesantía (Trabajador)',
  'Trabajo Pesado (Trabajador)',
  'Seguro Cesantia (Empleador)',
  'Mutual Empleador',
  'Pago SIS (Empleador)',
  'Trabajo Pesado (Empleador)',
  'AFP prevision empleador',
  'Cotización Expectativa de Vida',
  'Previsión (Ley protección empleo)',
  'Salud Obligatoria (Ley protección empleo)',
  'Salud Voluntaria (Ley protección empleo)',
  'Seguro Cesantía Trabajador (Ley protección empleo)',
  'Seguro Cesantía Empleador (Ley protección empleo)',
  'Ley Sanna (Ley protección empleo)',
  'Trabajo Pesado Trabajador (Ley protección empleo)',
  'Trabajo Pesado Empleador (Ley protección empleo)',
  'SIS (Ley protección empleo)',
  'Otros Aportes Patronales',
  'Saldo Sobregiro',
];

export const BUK_HISTORICAL_DETAIL_HEADERS = [
  'Número de Documento',
  'Código de Ficha',
  'Rut empresa',
  'Nombre',
  'Monto',
  'Codigo item',
];

export const BUK_HISTORICAL_SHEET_NAMES = [
  'Liquidaciones',
  'Haberes Imponibles',
  'Haberes No Imponibles',
  'Descuentos',
  'Líneas de Finiquito',
];

const TALANA_FIXED_HEADERS = new Set([
  'Año',
  'Mes',
  'Rut de la Empresa',
  'Rut del Trabajador',
  'Código de Contrato',
  'Nombre',
  'Apellido Paterno',
  'Apellido Materno',
  'Días Trabajados',
  'Sueldo Base',
  'Remuneración Imponible',
  'Remuneración No Imponible',
  'Remuneración Total',
  'Renta Tributable',
  'Descuentos Legales',
  'Otros Descuentos',
  'Impuestos',
  'Sueldo Liquido Mas Anticipo',
  'Sueldo Liquido A Pago',
  'Anticipos',
  'Área',
  'Centro Costo (cod)',
  'Centro Costo',
  'Días Licencia',
  'Días Ausencia',
  'HHs. Extra 50%',
  'HHs. Extra 100%',
  'Horas a pago por días compensatorios vencidos',
]);

const TALANA_IDENTITY_HEADERS = new Set([
  'Año',
  'Mes',
  'Rut de la Empresa',
  'Rut del Trabajador',
  'Código de Contrato',
  'Nombre',
  'Apellido Paterno',
  'Apellido Materno',
  'Área',
  'Centro Costo (cod)',
  'Centro Costo',
]);

const AUTO_EXCLUDED_PATTERNS = [
  /^remuneracion /,
  /^renta tributable$/,
  /^descuentos legales$/,
  /^otros descuentos$/,
  /^impuestos/, 
  /^afp$/,
  /^ips$/,
  /^apv/,
  /^salud/,
  /^isapre/,
  /^seguro cesantia/,
  /^capitalizacion individual/,
  /^expectativa de vida$/,
  /^seguro accidentes/,
  /^seguro invalidez/,
  /^aporte /,
  /^mutual /,
  /^costo empresa$/,
  /^total /,
];

const BUK_CONCEPT_CATALOG = [
  ['sueldo_base', 'Sueldo Base', 'Haberes Imponibles', false],
  ['gratificacion_mensual_mpa', 'Gratificación Mensual Mpa', 'Haberes Imponibles', false],
  ['bono_mpa_paepap', 'Bono Mpa Pae/Pap', 'Haberes Imponibles', false],
  ['hhee50', 'Horas Extra 50%', 'Haberes Imponibles', false],
  ['bono_variable', 'Bono Variable', 'Haberes Imponibles', false],
  ['bono_defuncion', 'Bono Defunción', 'Haberes Imponibles', false],
  ['bono_mes', 'Bono Mes', 'Haberes Imponibles', false],
  ['bono_reemplazo', 'Bono Reemplazo', 'Haberes Imponibles', false],
  ['bono_matrimonio', 'Bono Matrimonio', 'Haberes Imponibles', false],
  ['aignacion_sala_cuna', 'Asignación Sala Cuna', 'Haberes Imponibles', false],
  ['bono_natalidad', 'Bono Natalidad', 'Haberes Imponibles', false],
  ['bono_especial', 'Bono Especial', 'Haberes Imponibles', false],
  ['bono_indice_raciones', 'Bono Índice Raciones', 'Haberes Imponibles', false],
  ['anticipo_de_gratificacion', 'Anticipo De Gratificación', 'Haberes Imponibles', false],
  ['bono_variable_asegurado', 'Bono Variable Asegurado', 'Haberes Imponibles', false],
  ['bono_junji_integra', 'Bono Junji-Integra', 'Haberes Imponibles', false],
  ['aguinaldo_navidad', 'Aguinaldo Navidad', 'Haberes Imponibles', false],
  ['bono_noche', 'Bono Noche', 'Haberes Imponibles', false],
  ['movilizacion', 'Movilización', 'Haberes No Imponibles', false],
  ['asfam', 'Asignación Familiar y Maternal', 'Haberes No Imponibles', false],
  ['otro_haber_no_imponible', 'Otro Haber No Imponible', 'Haberes No Imponibles', false],
  ['colacion', 'Colación', 'Haberes No Imponibles', false],
  ['asignacion_familiar_retroactiva', 'Asignación Familiar Retroactiva', 'Haberes No Imponibles', false],
  ['desgaste_materiales', 'Desgaste Materiales', 'Haberes No Imponibles', false],
  ['asignacion_especial', 'Asignación Especial', 'Haberes No Imponibles', false],
  ['viaticos_relatorias', 'Viáticos Relatorías', 'Haberes No Imponibles', false],
  ['asignacion_extraordinaria', 'Asignación Extraordinaria', 'Haberes No Imponibles', false],
  ['buk_viaticos', 'Viáticos', 'Haberes No Imponibles', false],
  ['cuota_sindical', 'Cuota Sindical', 'Descuentos', false],
  ['descuento_falp', 'Descuento FALP', 'Descuentos', false],
  ['dcto_prestamo_coopeuch', 'Préstamo Coopeuch', 'Descuentos', false],
  ['credito_los_heroes', 'Crédito Personal CCAF', 'Descuentos', false],
  ['retencion_prestamo_solidario_sii', 'Retención Préstamo Solidario SII', 'Descuentos', false],
  ['descuento_chilena_consolidada', 'Descuento Chilena Consolidada', 'Descuentos', false],
  ['otro_descuento', 'Otro Descuento', 'Descuentos', false],
  ['descuento_prestamo_n1', 'Préstamo N°1', 'Descuentos', false],
  ['descuento_adicional_sindicato', 'Descuento Adicional Sindicato', 'Descuentos', false],
  ['dcto_ahorrocoop', 'Ahorro Coop', 'Descuentos', false],
  ['cuota_sindical_2', 'Cuota Sindical 2', 'Descuentos', false],
  ['dcto_optica_roccelli', 'Óptica Roccelli', 'Descuentos', false],
  ['dcto_vale_de_gas', 'Vale De Gas', 'Descuentos', false],
  ['dcto_ahorro_voluntario_mpa', 'Ahorro Voluntario MPA', 'Descuentos', false],
  ['colecta_solidaria', 'Colecta Solidaria', 'Descuentos', false],
  ['dcto_prestamo_fonasa', 'Préstamo Fonasa', 'Descuentos', false],
  ['dcto_leasing_ahorro_ccaf', 'Leasing o Ahorro CCAF', 'Descuentos', false],
  ['buk_cuenta2_pesos', 'Cuenta 2 Pesos', 'Descuentos', false],
  ['dcto_sobregiro_mes_anterior', 'Descuento Sobregiro Mes Anterior', 'Descuentos', false],
  ['dcto_anticipo', 'Descuento Anticipo', 'Descuentos', false],
  ['dcto_seguro_complementario', 'Seguro Complementario', 'Descuentos', false],
  ['dcto_compra_celular', 'Descuento Compra Celular', 'Descuentos', false],
  ['dcto_optica_double_vision_spa', 'Óptica Double Visión', 'Descuentos', false],
  ['descuento_dental', 'Descuento Dental', 'Descuentos', false],
  ['dcto_retencion_judicial', 'Retención Judicial', 'Descuentos', false],
  ['dcto_retencion_judicial_2', 'Retención Judicial 2', 'Descuentos', false],
  ['descuento_prestamo_n2', 'Préstamo N°2', 'Descuentos', false],
].map(([id, name, sheet, taxable]) => ({ id, name, sheet, taxable }));

const SOURCE_ALIASES = new Map([
  ['sueldo base', 'sueldo_base'],
  ['gratificacion mensual', 'gratificacion_mensual_mpa'],
  ['bono mpa pae/pap', 'bono_mpa_paepap'],
  ['horas extra 50%', 'hhee50'],
  ['bono variable', 'bono_variable'],
  ['bono responsabilidad', 'bono_responsabilidad'],
  ['bono defuncion', 'bono_defuncion'],
  ['bono mes', 'bono_mes'],
  ['bono reemplazo', 'bono_reemplazo'],
  ['bono matrimonio', 'bono_matrimonio'],
  ['asig sala cuna', 'aignacion_sala_cuna'],
  ['bono natalidad', 'bono_natalidad'],
  ['bono especial', 'bono_especial'],
  ['bono indice raciones', 'bono_indice_raciones'],
  ['anticipo de gratificacion', 'anticipo_de_gratificacion'],
  ['bono variable asegurado', 'bono_variable_asegurado'],
  ['bono aguinaldo', 'otro_haber_no_imponible'],
  ['aguinaldo navidad', 'aguinaldo_navidad'],
  ['bono noche', 'bono_noche'],
  ['junji-integra-bono', 'bono_junji_integra'],
  ['movilizacion', 'movilizacion'],
  ['sobregiro', 'otro_haber_no_imponible'],
  ['indemnizacion por vacaciones pendientes', 'otro_haber_no_imponible'],
  ['colacion', 'colacion'],
  ['asignacion familiar y maternal', 'asfam'],
  ['asignacion familiar retroactiva', 'asignacion_familiar_retroactiva'],
  ['desgaste materiales', 'desgaste_materiales'],
  ['asignacion especial', 'asignacion_especial'],
  ['viaticos relatorias', 'viaticos_relatorias'],
  ['viaticos', 'buk_viaticos'],
  ['asignacion extraordinaria', 'asignacion_extraordinaria'],
  ['cuota sindical', 'cuota_sindical'],
  ['descuento falp', 'descuento_falp'],
  ['prestamo coopeuch', 'dcto_prestamo_coopeuch'],
  ['descuento credito personal ccaf', 'credito_los_heroes'],
  ['descuento credito personal ccaf los heroes', 'credito_los_heroes'],
  ['retencion prestamo solidario sii', 'retencion_prestamo_solidario_sii'],
  ['descuento chilena consolidada', 'descuento_chilena_consolidada'],
  ['retencion judicial 1', 'dcto_retencion_judicial'],
  ['retencion judicial 2', 'dcto_retencion_judicial_2'],
  ['descuento prestamo n°1', 'descuento_prestamo_n1'],
  ['descuento prestamo n°2', 'descuento_prestamo_n2'],
  ['descuento adicional sindicato', 'descuento_adicional_sindicato'],
  ['ahorro coop', 'dcto_ahorrocoop'],
  ['dcto ahorrocoop', 'dcto_ahorrocoop'],
  ['cuota sindical 2', 'cuota_sindical_2'],
  ['optica roccelli', 'dcto_optica_roccelli'],
  ['vale de gas', 'dcto_vale_de_gas'],
  ['dcto ahorro voluntario mpa', 'dcto_ahorro_voluntario_mpa'],
  ['colecta solidaria', 'colecta_solidaria'],
  ['prestamo fonasa', 'dcto_prestamo_fonasa'],
  ['descuento por leasing o ahorro ccaf', 'dcto_leasing_ahorro_ccaf'],
  ['descuento cuenta dos afp', 'buk_cuenta2_pesos'],
  ['descuento sobregiro mes anterior', 'dcto_sobregiro_mes_anterior'],
  ['descuento anticipo', 'dcto_anticipo'],
  ['seguro complementario', 'dcto_seguro_complementario'],
  ['dcto compra celular', 'dcto_compra_celular'],
  ['optica double vision spa', 'dcto_optica_double_vision_spa'],
  ['descuento dental', 'descuento_dental'],
]);

const catalogById = new Map(BUK_CONCEPT_CATALOG.map((concept) => [concept.id, concept]));

export function getTalanaHistoricalCatalog() {
  return BUK_CONCEPT_CATALOG;
}

export function buildTalanaHistoricalModel({ sourceRows, sourceHeaders }) {
  const conceptColumns = sourceHeaders
    .map((sourceKey) => ({
      sourceKey,
      sourceName: stripDuplicateSuffix(sourceKey),
    }))
    .filter(({ sourceKey }) => !TALANA_FIXED_HEADERS.has(sourceKey))
    .filter(({ sourceName }) => sourceName);

  const decisions = conceptColumns.map((column, index) => buildDecision(column, sourceRows, index));

  return {
    decisions,
    catalog: BUK_CONCEPT_CATALOG,
    sourceRows: sourceRows.length,
    sourceConcepts: decisions.length,
  };
}

export function buildTalanaHistoricalWorkbook({ sourceRows, decisions, period, fichaCode = 'F1' }) {
  const employeeRows = consolidateTalanaEmployeeRows(sourceRows);
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);
  const detailRowsBySheet = new Map(BUK_HISTORICAL_SHEET_NAMES.slice(1, 4).map((sheet) => [sheet, []]));

  approvedDecisions.forEach((decision) => {
    employeeRows.forEach((row) => {
      const amount = parseAmount(row[decision.sourceKey]);
      if (!amount) {
        return;
      }

      const rut = cleanCell(row['Rut del Trabajador']);
      const detailRow = [
        rut,
        fichaCode,
        cleanCell(row['Rut de la Empresa']),
        decision.targetName,
        amount,
        decision.targetId,
      ];
      detailRowsBySheet.get(decision.sheet)?.push(detailRow);
    });
  });

  employeeRows.forEach((row) => {
    const detailDiscounts = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Descuentos');
    const totalBukOtherDiscounts = parseAmount(row['Otros Descuentos']) + parseAmount(row['Impuestos']);
    const residualDiscount = totalBukOtherDiscounts - detailDiscounts;
    if (residualDiscount > 0) {
      detailRowsBySheet.get('Descuentos')?.push([
        cleanCell(row['Rut del Trabajador']),
        fichaCode,
        cleanCell(row['Rut de la Empresa']),
        catalogById.get('otro_descuento').name,
        residualDiscount,
        'otro_descuento',
      ]);
    }
  });

  const liquidationRows = employeeRows.map((row) => {
    const employerContributions = sumFields(row, [
      'Capitalización Individual AFP',
      'Expectativa de Vida',
      'Seguro accidentes del Trabajo',
      'Seguro Cesantia Empleador',
      'Seguro Cesantia (Fondo Solidario)',
      'Seguro Invalidez y Supervivencia (SIS)',
    ]);
    const imponible = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes Imponibles');
    const noTaxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && !decision.taxable);
    const taxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && decision.taxable);
    const otherDiscounts = parseAmount(row['Otros Descuentos']) + parseAmount(row['Impuestos']);
    const liquid = imponible + noTaxable + taxable - parseAmount(row['Descuentos Legales']) - otherDiscounts;

    return [
      cleanCell(row['Rut del Trabajador']),
      fichaCode,
      cleanCell(row['Rut de la Empresa']),
      parseAmount(row['Sueldo Base']),
      parseAmount(row['Días Laborales']) || 30,
      parseAmount(row['Días Trabajados']),
      parseAmount(row['Días Licencia']),
      0,
      parseAmount(row['Días Ausencia']),
      0,
      0,
      sumFields(row, ['HHs. Extra 50%', 'HHs. Extra 100%', 'Horas a pago por días compensatorios vencidos']),
      imponible + noTaxable + taxable + employerContributions,
      imponible,
      noTaxable,
      taxable,
      parseAmount(row['Descuentos Legales']),
      otherDiscounts,
      liquid,
      parseAmount(row['Renta Tributable']),
      0,
      parseAmount(row['Impuestos']),
      parseAmount(row.AFP) || parseAmount(row.IPS),
      parseAmount(row['Salud 7% (Fonasa)']) || parseAmount(row.Isapre),
      parseAmount(row['Isapre sobre 7%']),
      sumFields(row, ['APV (Régimen A)', 'APV', 'APV 2']),
      parseAmount(row['Seguro Cesantia Trabajador']),
      0,
      parseAmount(row['Seguro Cesantia Empleador']),
      parseAmount(row['Seguro accidentes del Trabajo']),
      parseAmount(row['Seguro Invalidez y Supervivencia (SIS)']),
      0,
      parseAmount(row['Capitalización Individual AFP']),
      parseAmount(row['Expectativa de Vida']),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      employerContributions,
      parseAmount(row.Sobregiro),
    ];
  });

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, 'Liquidaciones', BUK_HISTORICAL_LIQUIDATIONS_HEADERS, liquidationRows);
  appendSheet(workbook, 'Haberes Imponibles', BUK_HISTORICAL_DETAIL_HEADERS, detailRowsBySheet.get('Haberes Imponibles'));
  appendSheet(workbook, 'Haberes No Imponibles', BUK_HISTORICAL_DETAIL_HEADERS, detailRowsBySheet.get('Haberes No Imponibles'));
  appendSheet(workbook, 'Descuentos', BUK_HISTORICAL_DETAIL_HEADERS, detailRowsBySheet.get('Descuentos'));
  appendSheet(workbook, 'Líneas de Finiquito', BUK_HISTORICAL_DETAIL_HEADERS, []);

  return workbook;
}

export function buildTalanaHistoricalReportRows(decisions) {
  return decisions.map((decision, index) => ({
    Fila: index + 2,
    'Columna Talana': decision.sourceKey,
    'Concepto Talana': decision.sourceName,
    'Colaboradores con monto': decision.nonZeroCount,
    'Valor de muestra': decision.sampleValue,
    Estado: decision.autoExcluded
      ? 'Excluido automático'
      : decision.excluded
        ? 'Excluido'
        : decision.matchStatus === 'exact'
          ? 'Match exacto'
          : decision.approved
            ? 'Pareado manual'
            : decision.suggestedMatches.length
              ? 'Propuesta pendiente'
              : 'Sin propuesta',
    'Motivo exclusión': decision.exclusionReason ?? '',
    'Hoja BUK': decision.sheet ?? '',
    'Id BUK': decision.targetId,
    'Nombre BUK': decision.targetName,
    'Id propuesto': decision.proposedId,
  }));
}

export function buildTalanaHistoricalReconciliation({ sourceRows, decisions, fichaCode = 'F1' }) {
  const employeeRows = consolidateTalanaEmployeeRows(sourceRows);
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);

  return employeeRows.map((row) => {
    const imponible = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes Imponibles');
    const noTaxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && !decision.taxable);
    const taxable = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Haberes No Imponibles' && decision.taxable);
    const discounts = sumApprovedDetails(row, approvedDecisions, (decision) => decision.sheet === 'Descuentos');
    const legalDiscounts = parseAmount(row['Descuentos Legales']);
    const otherDiscounts = parseAmount(row['Otros Descuentos']);
    const tax = parseAmount(row['Impuestos']);
    const voluntaryPension = sumFields(row, ['APV (Régimen A)', 'APV', 'APV 2']);
    const voluntaryHealth = parseAmount(row['Isapre sobre 7%']);
    const bukOtherDiscounts = otherDiscounts + tax;
    const expectedDetailDiscounts = bukOtherDiscounts;
    const sourceLiquid = parseAmount(row['Sueldo Liquido A Pago']);
    const bukLiquid = imponible + noTaxable + taxable - legalDiscounts - bukOtherDiscounts;
    const detailTotal = imponible + noTaxable + taxable;
    const sourceTotal = parseAmount(row['Remuneración Total']);
    const loadedDiscounts = discounts + Math.max(0, expectedDetailDiscounts - discounts);

    return {
      'Número de Documento': cleanCell(row['Rut del Trabajador']),
      'RUT Empresa': cleanCell(row['Rut de la Empresa']),
      'Código de Ficha': fichaCode,
      'Haberes imponibles BUK': imponible,
      'Haberes no imponibles no tributables BUK': noTaxable,
      'Haberes no imponibles tributables BUK': taxable,
      'Total haberes BUK': detailTotal,
      'Total haberes Talana': sourceTotal,
      'Descuentos legales': legalDiscounts,
      'Otros descuentos Talana': otherDiscounts,
      Impuesto: tax,
      'APV / previsión voluntaria': voluntaryPension,
      'Salud voluntaria': voluntaryHealth,
      'Otros descuentos BUK': bukOtherDiscounts,
      'Líquido a pago Talana': sourceLiquid,
      'Líquido a pago BUK': bukLiquid,
      'Diferencia líquido': bukLiquid - sourceLiquid,
      'Diferencia haberes': detailTotal - sourceTotal,
      'Descuentos detallados BUK': loadedDiscounts,
      'Otros descuentos BUK a detallar': expectedDetailDiscounts,
      'Diferencia descuentos': loadedDiscounts - expectedDetailDiscounts,
      Estado: bukLiquid === sourceLiquid && detailTotal === sourceTotal && loadedDiscounts === expectedDetailDiscounts ? 'Cuadrado' : 'Revisar',
    };
  });
}

export function summarizeTalanaHistoricalReconciliation(rows) {
  const liquidDifferences = rows.filter((row) => row['Diferencia líquido'] !== 0);
  const totalDifferences = rows.filter((row) => row['Diferencia haberes'] !== 0);
  const discountDifferences = rows.filter((row) => row['Diferencia descuentos'] !== 0);

  return {
    employees: rows.length,
    liquidMatched: rows.length - liquidDifferences.length,
    liquidDifferences: liquidDifferences.length,
    liquidDifferenceTotal: liquidDifferences.reduce((total, row) => total + row['Diferencia líquido'], 0),
    totalMatched: rows.length - totalDifferences.length,
    totalDifferences: totalDifferences.length,
    totalDifferenceTotal: totalDifferences.reduce((total, row) => total + row['Diferencia haberes'], 0),
    discountsMatched: rows.length - discountDifferences.length,
    discountDifferences: discountDifferences.length,
    discountDifferenceTotal: discountDifferences.reduce((total, row) => total + row['Diferencia descuentos'], 0),
    isBalanced: liquidDifferences.length === 0 && totalDifferences.length === 0 && discountDifferences.length === 0,
  };
}

export function summarizeTalanaHistoricalDecisions(decisions) {
  return {
    total: decisions.length,
    exact: decisions.filter((decision) => decision.matchStatus === 'exact').length,
    proposals: decisions.filter((decision) => !decision.approved && decision.suggestedMatches.length > 0).length,
    pending: decisions.filter((decision) => !decision.approved && decision.suggestedMatches.length === 0).length,
    approved: decisions.filter((decision) => decision.approved && !decision.excluded).length,
    excluded: decisions.filter((decision) => decision.excluded).length,
    autoExcluded: decisions.filter((decision) => decision.autoExcluded).length,
  };
}

function buildDecision(column, sourceRows, index) {
  const sourceName = column.sourceName;
  const nonZeroRows = sourceRows.filter((row) => isValidRut(row['Rut del Trabajador']) && parseAmount(row[column.sourceKey]) !== 0);
  const normalizedSourceName = normalizeSourceName(sourceName);
  const autoExcluded = AUTO_EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalizedSourceName));

  if (autoExcluded) {
    return {
      id: `talana-historical-${index}`,
      sourceKey: column.sourceKey,
      sourceName,
      nonZeroCount: nonZeroRows.length,
      sampleValue: nonZeroRows[0]?.[column.sourceKey] ?? '',
      targetId: '',
      targetName: '',
      targetConcept: null,
      suggestedMatches: [],
      proposedId: '',
      sheet: '',
      taxable: false,
      approved: true,
      excluded: true,
      autoExcluded: true,
      matchStatus: 'excluded',
      exclusionReason: 'Total, impuesto, ley social o aporte patronal. No se carga como haber o descuento detallado.',
      action: 'exclude',
    };
  }

  const targetId = SOURCE_ALIASES.get(normalizedSourceName) ?? findCatalogByName(normalizedSourceName)?.id ?? '';
  const target = catalogById.get(targetId);
  const suggestedMatches = target ? [] : findSuggestedMatches(normalizedSourceName);
  const taxable = getTaxability(sourceName, target);

  return {
    id: `talana-historical-${index}`,
    sourceKey: column.sourceKey,
    sourceName,
    nonZeroCount: nonZeroRows.length,
    sampleValue: nonZeroRows[0]?.[column.sourceKey] ?? '',
    targetId: target?.id ?? '',
    targetName: target?.name ?? '',
    targetConcept: target ?? null,
    suggestedMatches,
    proposedId: suggestedMatches[0]?.id ?? '',
    sheet: target?.sheet ?? '',
    taxable,
    approved: Boolean(target),
    excluded: false,
    autoExcluded: false,
    matchStatus: target ? 'exact' : '',
    exclusionReason: '',
    action: target ? 'reuse' : '',
  };
}

function getTaxability(sourceName, target) {
  if (!target) {
    return false;
  }

  if (target.id === 'otro_haber_no_imponible' && normalizeSourceName(sourceName) === 'bono aguinaldo') {
    return true;
  }

  return target.taxable;
}

function findCatalogByName(sourceName) {
  return BUK_CONCEPT_CATALOG.find((concept) => normalizeSourceName(concept.name) === sourceName);
}

function findSuggestedMatches(sourceName) {
  const sourceTokens = normalizeSourceName(sourceName).split(' ').filter((token) => token.length > 2);
  return BUK_CONCEPT_CATALOG
    .map((concept) => {
      const targetTokens = normalizeSourceName(concept.name).split(' ');
      const score = sourceTokens.filter((token) => targetTokens.includes(token)).length;
      return { concept, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.concept.name.localeCompare(right.concept.name))
    .slice(0, 5)
    .map(({ concept }) => concept);
}

function sumApprovedDetails(row, decisions, predicate) {
  return decisions
    .filter(predicate)
    .reduce((total, decision) => total + parseAmount(row[decision.sourceKey]), 0);
}

function sumFields(row, fields) {
  return fields.reduce((total, field) => total + parseAmount(row[field]), 0);
}

function consolidateTalanaEmployeeRows(sourceRows) {
  const groupedRows = new Map();

  sourceRows
    .filter((row) => isValidRut(row['Rut del Trabajador']))
    .forEach((row) => {
      const rut = cleanCell(row['Rut del Trabajador']).replace(/\./g, '');
      const rows = groupedRows.get(rut) ?? [];
      rows.push(row);
      groupedRows.set(rut, rows);
    });

  return [...groupedRows.values()].map((rows) => {
    const primaryRow = rows[0];
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    const consolidatedRow = { ...primaryRow };

    keys.forEach((key) => {
      if (TALANA_IDENTITY_HEADERS.has(key)) {
        return;
      }

      const numericValues = rows.map((row) => parseAmount(row[key]));
      if (numericValues.some((value) => value !== 0) || rows.some((row) => cleanCell(row[key]) !== '')) {
        consolidatedRow[key] = numericValues.reduce((total, value) => total + value, 0);
      }
    });

    return consolidatedRow;
  });
}

function appendSheet(workbook, sheetName, headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...(rows ?? [])]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function normalizeSourceName(value) {
  return normalizeText(stripDuplicateSuffix(value));
}

function stripDuplicateSuffix(value) {
  return cleanCell(value).replace(/_\d+$/, '');
}

function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const rawValue = cleanCell(value);
  if (!rawValue || rawValue === '-') {
    return 0;
  }

  const normalized = rawValue.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').replace(/\s+/g, '');
  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : 0;
}

function isValidRut(value) {
  return /^\d{6,9}-[\dkK]$/.test(cleanCell(value).replace(/\./g, ''));
}
