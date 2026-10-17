import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from '../utils';
import { parseHistoricalAmount, stripDuplicateHeaderSuffix } from './matching';
import {
  firstSourceValue,
  getSourceEmployeeId,
  LOS_ANDES_CONCEPT_IDS,
  normalizeEmployeeId,
  resolveAfpInstitutionId,
  REX_LIQUIDATION_HEADERS,
} from './support';

const REX_LIQUIDATION_TEMPLATE_PATH = `${import.meta.env.BASE_URL}templates/ejemplo-importacion-liquidaciones-detalle.xlsx`;
const HISTORICAL_LIQUIDO_PATTERNS = [/^LIQUIDO$/i, /^LIQUIDO A PAGO$/i, /^SUELDO LIQUIDO$/i];

const REX_COMPANY_IDS = [
  ['finning chile', 1],
  ['finning capacitacion', 2],
  ['centro de formacion tecnica finning', 3],
  ['distribuidora perkins chilena', 4],
  ['sitech southern cone', 5],
];

const REX_HEALTH_INSTITUTIONS = [
  ['cruzblanca', 'cruzblanca'],
  ['banmedica', 'banmedica'],
  ['colmena', 'colmena'],
  ['consalud', 'consalud'],
  ['esencialsa', 'esencial'],
  ['esencial', 'esencial'],
  ['fund salud trabaj bco estado', 'bancoestado'],
  ['isapre banco estado', 'bancoestado'],
  ['isapre de codelco ltda', 'isalud'],
  ['isalud isapre de codelco ltda', 'isalud'],
  ['isapre nueva mas vida', 'nuevamasvida'],
  ['isapre nueva masvida', 'nuevamasvida'],
  ['nueva mas vida', 'nuevamasvida'],
  ['nueva masvida', 'nuevamasvida'],
  ['vida tres', 'vidatres'],
  ['masvida', 'masvida'],
  ['fonasa', 'fonasa'],
];

export async function loadHistoricalRexLiquidationTemplate() {
  const response = await fetch(REX_LIQUIDATION_TEMPLATE_PATH);
  if (!response.ok) {
    throw new Error('No se pudo cargar la plantilla de Liquidaciones en Detalle de REX+.');
  }

  return XLSX.read(await response.arrayBuffer(), { type: 'array' });
}

export function buildHistoricalRexLiquidationWorkbook({
  templateWorkbook,
  sourceRows,
  decisions,
  employeeCatalog = [],
  mappingScope,
  period = '',
  employeeIds = null,
  excludedEmployeeIds = [],
}) {
  const rows = buildHistoricalRexLiquidationRows({ sourceRows, decisions, employeeCatalog, mappingScope, period, employeeIds, excludedEmployeeIds });
  const workbook = {
    ...templateWorkbook,
    SheetNames: [...(templateWorkbook?.SheetNames ?? [])],
    Sheets: { ...(templateWorkbook?.Sheets ?? {}) },
  };
  workbook.SheetNames = workbook.SheetNames.filter((name) => name !== 'Ejemplo');
  workbook.SheetNames.unshift('Ejemplo');
  workbook.Sheets.Ejemplo = XLSX.utils.aoa_to_sheet([REX_LIQUIDATION_HEADERS, ...rows]);

  return workbook;
}

export function buildHistoricalRexLiquidationCsv({
  sourceRows,
  decisions,
  employeeCatalog = [],
  mappingScope,
  period = '',
  employeeIds = null,
  excludedEmployeeIds = [],
}) {
  const rows = buildHistoricalRexLiquidationRows({ sourceRows, decisions, employeeCatalog, mappingScope, period, employeeIds, excludedEmployeeIds });
  const sheet = XLSX.utils.aoa_to_sheet([REX_LIQUIDATION_HEADERS, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', RS: '\r\n', blankrows: false });

  return `\uFEFF${csv}`;
}

export function buildHistoricalRexLiquidationRows({
  sourceRows,
  decisions,
  employeeCatalog = [],
  mappingScope,
  period = '',
  employeeIds = null,
  excludedEmployeeIds = [],
}) {
  const employeeById = new Map(employeeCatalog.map((employee) => [normalizeEmployeeId(employee.id), employee]));
  const selectedEmployeeIds = employeeIds ? new Set([...employeeIds].map(normalizeEmployeeId)) : null;
  const additionalExcludedIds = new Set([...excludedEmployeeIds].map(normalizeEmployeeId));
  const approvedDecisions = decisions.filter((decision) => decision.approved && !decision.excluded && decision.targetId);
  const outputByKey = new Map();

  sourceRows.forEach((sourceRow) => {
    const employeeId = getSourceEmployeeId(sourceRow);
    const employee = employeeById.get(employeeId);
    if (!employee || additionalExcludedIds.has(employeeId) || (selectedEmployeeIds && !selectedEmployeeIds.has(employeeId))) {
      return;
    }

    approvedDecisions.forEach((decision) => {
      const taxDecision = isTaxDecision(decision);
      const amount = parseHistoricalAmount(sourceRow[decision.sourceKey]) ?? 0;
      if (!taxDecision && amount === 0) {
        return;
      }

      const key = `${employeeId}::${normalizeText(decision.targetId)}`;
      const existing = outputByKey.get(key);
      if (existing) {
        existing[4] += amount;
        return;
      }

      outputByKey.set(key, buildRexLiquidationRow({ sourceRow, employee, decision, amount, period, decisions: approvedDecisions, mappingScope }));
    });

    const liquidEntry = Object.entries(sourceRow ?? {}).find(([header, value]) => (
      HISTORICAL_LIQUIDO_PATTERNS.some((pattern) => pattern.test(stripDuplicateHeaderSuffix(header))) &&
      parseHistoricalAmount(value) !== null
    ));
    if (liquidEntry) {
      const liquidKey = `${employeeId}::totalesempl`;
      const existingLiquidRow = outputByKey.get(liquidKey);
      const liquidAmount = parseHistoricalAmount(liquidEntry[1]) ?? 0;
      if (existingLiquidRow) {
        existingLiquidRow[4] = liquidAmount;
        return;
      }

      outputByKey.set(liquidKey, buildRexLiquidationRow({
        sourceRow,
        employee,
        decision: { targetId: 'totalesEmpl' },
        amount: liquidAmount,
        period,
        decisions: approvedDecisions,
        mappingScope,
      }));
    }
  });

  return [...outputByKey.values()];
}

export function validateHistoricalRexLiquidationRows(options) {
  const rows = buildHistoricalRexLiquidationRows(options);
  const institutionRequired = new Set([
    'afp', 'comisionafp', 'reliquidaafp', 'isapre', 'reliquidaisapre', 'apvi',
    'cesempleado', 'reliquidacesempleado', 'sis', 'sispago', 'mutual', 'reliquidamutual',
    'trabajopesa', 'trabajopesaempl', 'reliquidatrabpesa', 'cajaahor', 'cajacred', 'cajasegu',
  ]);
  const issues = [];

  rows.forEach((row, index) => {
    const conceptId = normalizeText(row[3]).replace(/[^a-z0-9]+/g, '');
    const institutionId = cleanCell(row[6]);
    const amount = Number(row[4]);
    if (Number.isFinite(amount) && amount < 0) {
      issues.push({
        row: index + 2,
        employeeId: row[1],
        conceptId: row[3],
        amount,
        message: 'El monto del concepto no puede ser negativo para la carga histórica REX+.',
      });
    }

    if (!institutionRequired.has(conceptId)) {
      return;
    }
    if (!institutionId) {
      issues.push({
        row: index + 2,
        employeeId: row[1],
        conceptId: row[3],
        message: conceptId.includes('trabajopesa')
          ? 'Falta el código de AFP del trabajador para el descuento de trabajo pesado.'
          : 'Falta el Id de institución requerido por el concepto.',
      });
      return;
    }
    if (!/^[a-z0-9]+$/i.test(institutionId)) {
      issues.push({
        row: index + 2,
        employeeId: row[1],
        conceptId: row[3],
        institutionId,
        message: 'El Id de institución debe ser el código REX+ sin espacios ni nombre visible.',
      });
    }
  });

  return { valid: issues.length === 0, rows, issues };
}

export function isTaxDecision(decision) {
  return normalizeText(decision?.targetId).replace(/[^a-z0-9]+/g, '').includes('impuesto');
}

export function isEmployerContributionDecision(decision) {
  return normalizeText(decision?.targetConcept?.type || decision?.type)
    .replace(/[^a-z0-9]+/g, '') === '5a';
}

function buildRexLiquidationRow({ sourceRow, employee, decision, amount, period, decisions, mappingScope }) {
  const targetId = decision.targetId;
  const row = Array(REX_LIQUIDATION_HEADERS.length).fill(0);
  const isTax = isTaxDecision(decision);

  row[0] = period || inferHistoricalPeriod(sourceRow);
  row[1] = employee.id || getSourceEmployeeId(sourceRow);
  row[2] = employee.contract || '1';
  row[3] = targetId;
  row[4] = amount;
  row[5] = 0;
  row[6] = resolveRexInstitutionId(targetId, sourceRow, employee);
  row[7] = resolveCotizacionJubilacion(targetId, sourceRow, employee);
  row[8] = resolveSourceAmount(sourceRow, [/DIAS .*LICEN/, /LICENCIAS/]);
  row[9] = resolveSourceAmount(sourceRow, [/^DIAS TRABAJADOS$/]);
  row[10] = 'x';
  row[11] = resolveRexCompanyId(sourceRow, mappingScope);
  row[12] = isTax ? resolveLegalDiscountTotal(sourceRow, decisions) : 0;
  row[13] = isTax ? resolveNonTaxableTotal(sourceRow, decisions) : 0;
  row[14] = resolveSourceAmount(sourceRow, [/REBAJA .*ZONA/, /ZONA EXTREMA/]);
  row[15] = resolveRexJornada(sourceRow);
  row[16] = resolveSourceAmount(sourceRow, [/DIAS .*VACACIONES/, /DIAS CORRIDOS VACACIONES/]);
  row[17] = isSalaryBaseDecision(targetId) ? resolveSourceAmount(sourceRow, [/^SUELDO BASE$/]) : 0;
  row[18] = 0;
  row[19] = 0;

  return row;
}

function isSalaryBaseDecision(targetId) {
  return normalizeText(targetId).replace(/[^a-z0-9]+/g, '') === 'sueldobase';
}

function resolveCotizacionJubilacion(targetId, sourceRow, employee) {
  const normalizedTargetId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');
  const explicit = resolveSourceAmount(sourceRow, [/PORCENTAJE.*AFP/, /COTIZACION.*AFP.*%/, /AFP COTI/]);
  if (explicit) return explicit;
  if (['afp', 'comisionafp', 'reliquidaafp'].includes(normalizedTargetId)) return Number(employee.afpCoti) || 10;
  if (['cesempleado', 'reliquidacesempleado'].includes(normalizedTargetId)) return normalizeText(employee.tipoCont).includes('indef') ? 0.6 : 0;
  if (['sis', 'sispago'].includes(normalizedTargetId)) return 1.54;
  if (normalizedTargetId.includes('trabajopesa')) return 2;
  if (normalizedTargetId.includes('mutual')) return 2.1;
  return 0;
}

function resolveRexInstitutionId(targetId, sourceRow, employee) {
  const normalizedTargetId = normalizeText(targetId).replace(/[^a-z0-9]+/g, '');
  if (LOS_ANDES_CONCEPT_IDS.has(normalizedTargetId)) return 'losandes';
  if (['afp', 'comisionafp', 'reliquidaafp', 'sis', 'sispago', 'cesempleado', 'reliquidacesempleado', 'trabajopesa', 'trabajopesaempl', 'reliquidatrabpesa'].includes(normalizedTargetId)) {
    return resolveAfpInstitutionId(employee.afp || firstSourceValue(sourceRow, ['AFP', 'CODIGO AFP']));
  }
  if (normalizedTargetId.includes('isapre') || normalizedTargetId === 'salud') {
    return resolveHealthInstitutionId(firstSourceValue(sourceRow, ['ISAPRE', 'CODIGO ISAPRE']));
  }
  if (normalizedTargetId === 'apvi' || normalizedTargetId.includes('apv')) {
    const sourceInstitution = firstSourceValue(sourceRow, ['INSTITUCION APV', 'ID APV', 'APV INSTITUCION']);
    return sourceInstitution || (employee.afp ? `apv${normalizeText(employee.afp).replace(/[^a-z0-9]/g, '')}` : '');
  }
  if (normalizedTargetId.includes('mutual') || normalizedTargetId.includes('sanna')) return 'mutseg';
  return '';
}

function resolveHealthInstitutionId(value) {
  const normalizedValue = normalizeText(value);
  const compactValue = normalizedValue.replace(/[^a-z0-9]+/g, '');
  const match = REX_HEALTH_INSTITUTIONS.find(([label]) => compactValue.includes(label.replace(/[^a-z0-9]+/g, '')));
  return match?.[1] ?? cleanCell(value);
}

function resolveRexCompanyId(sourceRow, mappingScope) {
  const value = normalizeText(firstSourceValue(sourceRow, ['EMPRESA']));
  const match = REX_COMPANY_IDS.find(([label]) => value.includes(label));
  return match?.[1] ?? (mappingScope?.company === 'finning' ? 1 : 0);
}

function resolveRexJornada(sourceRow) {
  const directValue = normalizeText(firstSourceValue(sourceRow, ['JORNADA', 'MODALIDAD DEL CONTRATO']));
  if (directValue === 'c' || directValue.includes('completa')) return 'C';
  if (directValue === 'p' || directValue.includes('parcial')) return 'P';
  return resolveSourceAmount(sourceRow, [/^HORAS JORNADA$/, /^FACTOR HORAS$/]) >= 160 ? 'C' : 'P';
}

function resolveLegalDiscountTotal(sourceRow, decisions) {
  const legalTargets = new Set(['afp', 'isapre', 'cesempleado', 'apvi', 'trabajopesaempl']);
  return decisions.reduce((total, decision) => {
    const targetId = normalizeText(decision.targetId).replace(/[^a-z0-9]+/g, '');
    if (!legalTargets.has(targetId)) return total;
    return total + Math.max(0, parseHistoricalAmount(sourceRow[decision.sourceKey]) ?? 0);
  }, 0);
}

function resolveNonTaxableTotal(sourceRow, decisions) {
  return decisions.reduce((total, decision) => {
    const type = normalizeText(decision.targetConcept?.type || decision.type);
    const name = normalizeText(decision.targetName);
    const isNonTaxable = type === '2e' || name.includes('exento') || name.includes('no gravad');
    if (!isNonTaxable || name.includes('sobregiro')) return total;
    return total + Math.max(0, parseHistoricalAmount(sourceRow[decision.sourceKey]) ?? 0);
  }, 0);
}

function resolveSourceAmount(sourceRow, patterns) {
  const entries = Object.entries(sourceRow ?? {});
  for (const pattern of patterns) {
    const entry = entries.find(([header, value]) => pattern.test(stripDuplicateHeaderSuffix(header)) && parseHistoricalAmount(value) !== null);
    if (entry) return parseHistoricalAmount(entry[1]) ?? 0;
  }
  return 0;
}

function inferHistoricalPeriod(sourceRow) {
  const sourceHeader = Object.keys(sourceRow ?? {}).find((header) => /SUELDO BASE ORIGINAL\d{2}\/\d{4}/i.test(header));
  const match = sourceHeader?.match(/(\d{2})\/(\d{4})/);
  return match ? `${match[2]}-${match[1]}` : '';
}
