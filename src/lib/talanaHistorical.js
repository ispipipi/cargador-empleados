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
  /^aporte (?:empleador|empresa|patronal)/,
  /^aportes? patronales?/,
  /^mutual /,
  /^costo empresa$/,
  /^total /,
];

const BUK_CONCEPT_CATALOG = [
  // Catálogo vigente de ítems SOSER entregado el 25-09-2026.
  ['aguinaldo_fiestas_patrias', 'Aguinaldo Fiestas Patrias', 'Haberes Imponibles', false, true],
  ['aguinaldo_navidad', 'Aguinaldo Navidad', 'Haberes Imponibles', false, true],
  ['buk_ajuste_sueldo_minimo', 'Ajuste Sueldo Mínimo', 'Haberes Imponibles', false, true],
  ['anticipo_de_gratificacion', 'Anticipo De Gratificación', 'Haberes Imponibles', false, true],
  ['anticipo_licencia_medica', 'Anticipo Licencia Medica', 'Haberes No Imponibles', false, true],
  ['buk_aporte_asistencia', 'Aporte Asistencia', 'Haberes Imponibles', false, true],
  ['asignacion_caja', 'Asignación Caja', 'Haberes No Imponibles', false, true],
  ['asignacion_de_invierno', 'Asignación De Invierno', 'Haberes No Imponibles', false, true],
  ['asignacion_especial', 'Asignación Especial', 'Haberes No Imponibles', false, true],
  ['asignacion_extraordinaria', 'Asignación Extraordinaria', 'Haberes No Imponibles', false, true],
  ['asignacion_familiar', 'Asignación Familiar', 'Haberes No Imponibles', false, true],
  ['asignacion_familiar_retroactiva', 'Asignación Familiar Retroactiva', 'Haberes No Imponibles', false, true],
  ['aignacion_sala_cuna', 'Asignación Sala Cuna', 'Haberes No Imponibles', false, true],
  ['bono_acta_supervisor', 'Bono Acta Supervisor', 'Haberes Imponibles', false, true],
  ['bono_aguinaldo_mpa', 'Bono Aguinaldo Mpa', 'Haberes Imponibles', false, true],
  ['bono_amasijo', 'Bono Amasijo', 'Haberes Imponibles', false, true],
  ['bono_anual', 'Bono Anual', 'Haberes Imponibles', false, true],
  ['bono_compensatorio_feriado_progresivo', 'Bono Compensatorio Feriado Progresivo', 'Haberes Imponibles', false, true],
  ['bono_cumplimiento_indicadores', 'Bono Cumplimiento Indicadores', 'Haberes Imponibles', false, true],
  ['bono_defuncion', 'Bono Defunción', 'Haberes Imponibles', false, true],
  ['bono_desempeno_anual', 'Bono Desempeño Anual', 'Haberes Imponibles', false, true],
  ['bono_desempeno_mensual', 'Bono Desempeño Mensual', 'Haberes Imponibles', false, true],
  ['bono_diferencia_mes_anterior', 'Bono Diferencia Mes Anterior', 'Haberes Imponibles', false, true],
  ['bono_diferencia_renta', 'Bono Diferencia Renta', 'Haberes Imponibles', false, true],
  ['bono_escolaridad', 'Bono Escolaridad', 'Haberes Imponibles', false, true],
  ['bono_especial', 'Bono Especial', 'Haberes Imponibles', false, true],
  ['bono_indice_raciones', 'Bono Índice Raciones', 'Haberes Imponibles', false, true],
  ['bono_inicio_programa', 'Bono Inicio Programa', 'Haberes Imponibles', false, true],
  ['bono_invierno_mpa', 'Bono Invierno Mpa', 'Haberes Imponibles', false, true],
  ['bono_junji_integra', 'Bono Junji-Integra', 'Haberes Imponibles', false, true],
  ['bono_liquido', 'Bono Líquido', 'Haberes No Imponibles', false, true],
  ['bono_matrimonio', 'Bono Matrimonio', 'Haberes Imponibles', false, true],
  ['bono_mes', 'Bono Mes', 'Haberes Imponibles', false, true],
  ['bono_mpa_paepap', 'Bono Mpa Pae/Pap', 'Haberes Imponibles', false, true],
  ['bono_mpa_paepap_np', 'Bono Mpa Pae/Pap Np', 'Haberes Imponibles', false, true],
  ['bono_natalidad', 'Bono Natalidad', 'Haberes Imponibles', false, true],
  ['bono_noche', 'Bono Noche', 'Haberes Imponibles', false, true],
  ['bono_otros', 'Bono Otros', 'Haberes Imponibles', false, true],
  ['bono_productividad', 'Bono Productividad', 'Haberes Imponibles', false, true],
  ['bono_reemplazo', 'Bono Reemplazo', 'Haberes Imponibles', false, true],
  ['bono_reliquidado', 'Bono Reliquidado', 'Haberes Imponibles', false, true],
  ['bono_reliquidado_actualizado', 'Bono Reliquidado Actualizado', 'Haberes No Imponibles', false, true],
  ['bono_responsabilidad', 'Bono Responsabilidad', 'Haberes Imponibles', false, true],
  ['bono_retencion', 'Bono Retención', 'Haberes Imponibles', false, true],
  ['bono_salud', 'Bono Salud', 'Haberes Imponibles', false, true],
  ['bono_sindical', 'Bono Sindical', 'Haberes Imponibles', false, true],
  ['bono_variable', 'Bono Variable', 'Haberes Imponibles', false, true],
  ['bono_variable_asegurado', 'Bono Variable Asegurado', 'Haberes Imponibles', false, true],
  ['bono_variable_promedio', 'Bono Variable Promedio', 'Haberes Imponibles', false, true],
  ['colacion', 'Colación', 'Haberes No Imponibles', false, true],
  ['comisiones', 'Comisiones', 'Haberes Imponibles', false, true],
  ['comision_garantizada', 'Comisión Garantizada', 'Haberes Imponibles', false, true],
  ['comision_mensual', 'Comisión Mensual', 'Haberes Imponibles', false, true],
  ['comision_venta', 'Comisión Venta', 'Haberes Imponibles', false, true],
  ['desgaste_materiales', 'Desgaste Materiales', 'Haberes No Imponibles', false, true],
  ['devolucion_dcto_sindical_mes_anterior', 'Devolución Dcto Sindical Mes Anterior', 'Haberes No Imponibles', false, true],
  ['devolucion_dif_liq_mes_anterior', 'Devolución Dif Liq Mes Anterior', 'Haberes No Imponibles', false, true],
  ['dias_compensatorios_vencidos', 'Días Compensatorios Vencidos', 'Haberes Imponibles', false, true],
  ['dif_bono_paepap_ajuste_i_m_m', 'Dif Bono Pae/Pap Ajuste I M M', 'Haberes Imponibles', false, true],
  ['diferencia_gratificacion', 'Diferencia Gratificación', 'Haberes Imponibles', false, true],
  ['diferencia_sueldo_base', 'Diferencia Sueldo Base', 'Haberes Imponibles', false, true],
  ['dif_gratificacion_ajuste_i_m_m', 'Dif Gratificación Ajuste I M M', 'Haberes Imponibles', false, true],
  ['hhee_ajuste_i_m_m', 'Dif Horas Extras Ajuste I M M', 'Haberes Imponibles', false, true],
  ['dif_sueldo_base_ajuste_imm', 'Dif Sueldo Base Ajuste I M M', 'Haberes Imponibles', false, true],
  ['buk_gratificacion', 'Gratificación', 'Haberes Imponibles', false, true],
  ['gratificacion_anual', 'Gratificación Anual', 'Haberes Imponibles', false, true],
  ['gratificacion_mensual_mpa', 'Gratificación Mensual Mpa', 'Haberes Imponibles', false, true],
  ['buk_finiquito_indemnizacion_legal_por_anos_servicios', 'Indemnización Legal Años de Servicio', 'Haberes No Imponibles', false, true],
  ['buk_finiquito_indemnizacion_legal_por_meses_obra', 'Indemnización Legal Meses de Servicio en Obra', 'Haberes No Imponibles', false, true],
  ['buk_finiquito_indemnizacion_pactada_contractualmente', 'Indemnización Pactada Contractualmente', 'Haberes No Imponibles', false, true],
  ['buk_finiquito_feriado', 'Indemnización por Vacaciones', 'Haberes No Imponibles', false, true],
  ['buk_finiquito_indemnizacion_sustitutiva_previo_aviso', 'Indemnización Sustitutiva Previo Aviso', 'Haberes No Imponibles', false, true],
  ['buk_finiquito_indemnizacion_tributable', 'Indemnización Tributable', 'Haberes No Imponibles', true, true],
  ['buk_finiquito_indemnizacion_voluntaria', 'Indemnización Voluntaria', 'Haberes No Imponibles', false, true],
  ['buk_finiquito_intereses', 'Intereses Indemnizaciones', 'Haberes No Imponibles', false, true],
  ['movilizacion', 'Movilización', 'Haberes No Imponibles', false, true],
  ['movilizacion_especial', 'Movilización Especial', 'Haberes No Imponibles', false, true],
  ['movilizacion_sindical', 'Movilización Sindical', 'Haberes No Imponibles', false, true],
  ['movilizacion_sindical_f', 'Movilización Sindical F', 'Haberes No Imponibles', false, true],
  ['otros_haberes_afectos', 'Otros Haberes Afectos', 'Haberes Imponibles', false, true],
  ['otros_haberes_exentos', 'Otros Haberes Exentos', 'Haberes No Imponibles', false, true],
  ['premio_por_productividad', 'Premio Por Productividad', 'Haberes Imponibles', false, true],
  ['buk_finiquito_reajustes', 'Reajuste Indemnizaciones', 'Haberes No Imponibles', false, true],
  ['reliquidacion_gratificacion', 'Reliquidación Gratificación', 'Haberes Imponibles', false, true],
  ['buk_wage', 'Sueldo Base', 'Haberes Imponibles', false, true],
  ['buk_viaticos', 'Viáticos', 'Haberes No Imponibles', false, true],
  ['viaticos_relatorias', 'Viáticos Relatorías', 'Haberes No Imponibles', false, true],

  // Estos descuentos ya estaban soportados y se mantienen mientras SOSER entrega su pestaña de descuentos.
  ['hhee50', 'Horas Extra 50%', 'Haberes Imponibles', false],
  ['otro_haber_no_imponible', 'Otro Haber No Imponible', 'Haberes No Imponibles', false],
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
].map(([id, name, sheet, taxable, authoritative = false]) => ({ id, name, sheet, taxable, authoritative }));

const SOURCE_ALIASES = new Map([
  ['sueldo base', 'buk_wage'],
  ['gratificacion anual', 'gratificacion_anual'],
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
  ['bono aguinaldo', 'bono_aguinaldo_mpa'],
  ['bono inicio', 'bono_inicio_programa'],
  ['bono inicio programa', 'bono_inicio_programa'],
  ['aguinaldo navidad', 'aguinaldo_navidad'],
  ['bono noche', 'bono_noche'],
  ['junji-integra-bono', 'bono_junji_integra'],
  ['movilizacion', 'movilizacion'],
  ['movilizacion especial', 'movilizacion_especial'],
  ['sobregiro', 'otro_haber_no_imponible'],
  ['indemnizacion por vacaciones pendientes', 'otro_haber_no_imponible'],
  ['colacion', 'colacion'],
  ['asignacion familiar y maternal', 'asignacion_familiar'],
  ['asignacion familiar retroactiva', 'asignacion_familiar_retroactiva'],
  ['desgaste materiales', 'desgaste_materiales'],
  ['asignacion especial', 'asignacion_especial'],
  ['asignacion de invierno', 'asignacion_de_invierno'],
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
  ['descuento venta interna', 'descuento_dental'],
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

export const TALANA_HISTORICAL_RULES = [
  {
    id: 'employee-identifiers',
    title: 'Identificación del trabajador',
    description: 'Se usa el RUT del trabajador, el RUT de la empresa y el código de ficha del archivo de salida.',
    scope: 'Identificación',
  },
  {
    id: 'buk-workbook',
    title: 'Formato BUK',
    description: 'La salida conserva las cinco pestañas del formato histórico: Liquidaciones, Haberes Imponibles, Haberes No Imponibles, Descuentos y Líneas de Finiquito.',
    scope: 'Archivo de carga',
  },
  {
    id: 'buk-soser-catalog',
    title: 'Catálogo BUK SOSER',
    description: 'El pareo reutiliza los 87 ítems vigentes del catálogo SOSER entregado el 25-09-2026, incluyendo Bono Inicio Programa (bono_inicio_programa).',
    scope: 'Catálogo BUK+',
  },
  {
    id: 'detail-concepts',
    title: 'Conceptos que se cargan como detalle',
    description: 'Solo se generan detalles para haberes y descuentos variables con monto distinto de cero. Totales, impuestos, leyes sociales, previsión, salud, cesantía y aportes patronales quedan fuera del detalle.',
    scope: 'Haberes y descuentos',
  },
  {
    id: 'overdraft',
    title: 'Tratamiento del sobregiro',
    description: 'Sobregiro se lleva a Otro Haber No Imponible y el Saldo Sobregiro se calcula por separado para no duplicar el concepto.',
    scope: 'Liquidaciones',
  },
  {
    id: 'unique-details',
    title: 'Sin duplicados en los detalles',
    description: 'Si varios conceptos de origen usan el mismo código BUK, se consolidan en una sola fila por trabajador, empresa, ficha y concepto.',
    scope: 'Haberes y descuentos',
  },
  {
    id: 'taxable-discounts',
    title: 'Descuentos tributables válidos',
    description: 'La base tributable se mantiene entre Haberes Imponibles menos Descuentos Legales y Haberes Imponibles, para que los Descuentos Tributables queden entre cero y los Descuentos Legales.',
    scope: 'Liquidaciones',
  },
  {
    id: 'mapping-memory',
    title: 'Memoria de mapeos',
    description: 'Los pareos confirmados se guardan por origen, destino y empresa para reutilizarlos en futuras cargas del mismo contexto.',
    scope: 'Mapeo',
  },
  {
    id: 'controlled-batches',
    title: 'Carga por paquetes',
    description: 'La carga BUK se divide por trabajadores. Cada paquete conserva sus liquidaciones y detalles, se puede repetir si falla y solo se descuenta al marcarlo como cargado correctamente.',
    scope: 'Descarga',
  },
];

export function getTalanaHistoricalCatalog() {
  return BUK_CONCEPT_CATALOG;
}

export function buildTalanaHistoricalAnalysis({ decisions = [], reconciliation, mappingScope } = {}) {
  const unresolvedConcepts = decisions.filter((decision) => !decision.approved && !decision.excluded).length;
  const hasReconciliation = Boolean(reconciliation);
  const reconciliationReady = hasReconciliation && reconciliation.isBalanced;
  const scopeLabel = [mappingScope?.origin, mappingScope?.destination, mappingScope?.company]
    .filter(Boolean)
    .join(' → ');
  const checks = [
    {
      id: 'mapping',
      title: 'Mapeo de conceptos',
      status: unresolvedConcepts === 0 ? 'ok' : 'blocked',
      detail: unresolvedConcepts === 0
        ? 'Todos los conceptos con monto tienen un pareo o una exclusión confirmada.'
        : `${unresolvedConcepts.toLocaleString('es-CL')} conceptos requieren una decisión antes de descargar.`,
    },
    {
      id: 'reconciliation',
      title: 'Cuadratura del líquido',
      status: reconciliationReady ? 'ok' : 'blocked',
      detail: !hasReconciliation
        ? 'Aún no se ha podido calcular la conciliación.'
        : reconciliationReady
          ? 'Líquidos, haberes y descuentos cuadran por trabajador.'
          : `${reconciliation.liquidDifferences} diferencias de líquido, ${reconciliation.totalDifferences} de haberes y ${reconciliation.discountDifferences} de descuentos.`,
    },
    {
      id: 'details',
      title: 'Detalles de carga',
      status: 'applied',
      detail: 'Se excluyen los conceptos automáticos y se consolidan los códigos BUK repetidos por trabajador.',
    },
    {
      id: 'buk-rules',
      title: 'Validaciones BUK',
      status: 'applied',
      detail: 'La base tributable y los descuentos tributables se preparan dentro de los límites aceptados por BUK.',
    },
  ];

  return {
    scopeLabel,
    rules: TALANA_HISTORICAL_RULES,
    checks,
    blockers: checks.filter((check) => check.status === 'blocked'),
    isReady: unresolvedConcepts === 0 && reconciliationReady,
  };
}

export function getTalanaHistoricalEmployeeIds(sourceRows) {
  return consolidateTalanaEmployeeRows(sourceRows)
    .map((row) => normalizeTalanaEmployeeId(row['Rut del Trabajador']))
    .filter(Boolean);
}

export function buildTalanaHistoricalRuleReportRows(analysis) {
  const ruleRows = (analysis?.rules ?? TALANA_HISTORICAL_RULES).map((rule) => ({
    Tipo: 'Regla aplicada',
    Regla: rule.title,
    Descripción: rule.description,
    Ámbito: rule.scope,
    Estado: 'Aplicada',
  }));
  const checkRows = (analysis?.checks ?? []).map((check) => ({
    Tipo: 'Control antes de descargar',
    Regla: check.title,
    Descripción: check.detail,
    Ámbito: 'Análisis actual',
    Estado: check.status === 'ok' || check.status === 'applied' ? 'OK' : 'Bloquea descarga',
  }));

  return [...ruleRows, ...checkRows];
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

export function buildTalanaHistoricalWorkbook({ sourceRows, decisions, fichaCode = 'F1', employeeIds = null }) {
  const selectedEmployeeIds = Array.isArray(employeeIds)
    ? new Set(employeeIds.map(normalizeTalanaEmployeeId).filter(Boolean))
    : null;
  const employeeRows = consolidateTalanaEmployeeRows(sourceRows)
    .filter((row) => !selectedEmployeeIds || selectedEmployeeIds.has(normalizeTalanaEmployeeId(row['Rut del Trabajador'])));
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

  // REX+ rejects more than one detail row with the same employee and item code.
  // Different source concepts can intentionally reuse one REX+ concept, so
  // consolidate those rows while preserving their combined amount.
  detailRowsBySheet.forEach((detailRows, sheet) => {
    const consolidatedRows = new Map();

    detailRows.forEach((detailRow) => {
      const key = [detailRow[0], detailRow[1], detailRow[2], detailRow[5]].join('|');
      const existingRow = consolidatedRows.get(key);

      if (existingRow) {
        existingRow[4] += detailRow[4];
        return;
      }

      consolidatedRows.set(key, [...detailRow]);
    });

    detailRowsBySheet.set(sheet, [...consolidatedRows.values()]);
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
    const legalDiscounts = parseAmount(row['Descuentos Legales']);
    const otherDiscounts = parseAmount(row['Otros Descuentos']) + parseAmount(row['Impuestos']);
    const saldoSobregiro = resolveBukOverdraftBalance(row);
    const liquid = imponible + noTaxable + taxable - legalDiscounts - otherDiscounts + saldoSobregiro;
    // BUK derives taxable discounts as taxable earnings minus taxable base.
    // Keep that derived value between zero and total legal discounts.
    const minimumBaseTributable = Math.max(0, imponible - legalDiscounts);
    const baseTributable = Math.min(
      imponible,
      Math.max(minimumBaseTributable, parseAmount(row['Renta Tributable'])),
    );

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
      legalDiscounts,
      otherDiscounts,
      liquid,
      baseTributable,
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
      resolveBukOverdraftBalance(row),
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
    const saldoSobregiro = resolveBukOverdraftBalance(row);
    const bukLiquid = imponible + noTaxable + taxable - legalDiscounts - bukOtherDiscounts + saldoSobregiro;
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
      'Sobregiro Talana como haber': parseAmount(row.Sobregiro),
      'Saldo Sobregiro BUK': saldoSobregiro,
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

function resolveBukOverdraftBalance(row) {
  // Talana's Sobregiro is a liquidation detail and is exported as a haber.
  // BUK's Saldo Sobregiro is only the remaining negative balance, which is
  // zero when the source liquid is already zero or positive.
  const sourceLiquid = parseAmount(row['Sueldo Liquido A Pago']);
  return Math.max(0, -sourceLiquid);
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

function normalizeTalanaEmployeeId(value) {
  const normalized = cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
  return isValidRut(normalized) ? normalized : '';
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
