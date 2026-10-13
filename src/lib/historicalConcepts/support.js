import { cleanCell, normalizeText } from '../utils';

export const REX_LIQUIDATION_HEADERS = [
  'Fecha de proceso',
  'Id empleado',
  'Número de contrato',
  'Id del concepto',
  'Monto del concepto',
  'Afecto',
  'Id de institución',
  'Cotización de jubilación',
  'Días de licencias',
  'Días trabajados',
  'Fecha de aplicación',
  'Empresa',
  'Total de rebajas por LLSS',
  'Rentas no gravadas',
  'Rebaja por zona extrema',
  'Jornada',
  'Días de vacaciones',
  'Monto Init',
  'Parcial 7',
  'Parcial 8',
];

export const LOS_ANDES_CONCEPT_IDS = new Set(['cajaahor', 'cajacred', 'cajasegu']);

const AFP_INSTITUTION_IDS = [
  ['capital', 'AFP Capital', '33'],
  ['cuprum', 'AFP Cuprum', '03'],
  ['habitat', 'AFP Habitat', '05'],
  ['modelo', 'AFP Modelo', '34'],
  ['planvital', 'AFP Planvital', '29'],
  ['provida', 'AFP Provida', '08'],
  ['uno', 'AFP UNO', '35'],
  ['canaempu', 'Canaemput', '1405'],
  ['capremer', 'Capremer', '0601'],
  ['empart', 'Empart', '0101'],
  ['sss', 'Servicio Seguro Social', '0901'],
  ['afp', 'Sin definir', '00'],
  ['triomar', 'Triomar', '0702'],
];

export function resolveInstitutionId(conceptId, sourceRow) {
  const normalizedConceptId = normalizeText(conceptId).replace(/[^a-z0-9]+/g, '');

  if (LOS_ANDES_CONCEPT_IDS.has(normalizedConceptId)) {
    return 'losandes';
  }

  if (normalizedConceptId === 'apvi') {
    return resolveAfpInstitutionId(firstSourceValue(sourceRow, ['CÓDIGO AFP', 'CODIGO AFP', 'ID AFP', 'AFP']));
  }

  if (normalizedConceptId === 'isapre') {
    return firstSourceValue(sourceRow, ['CÓDIGO ISAPRE', 'CODIGO ISAPRE', 'ID ISAPRE', 'ISAPRE']);
  }

  return '';
}

export function resolveAfpInstitutionId(value) {
  const rawValue = cleanCell(value);
  const normalizedValue = normalizeText(rawValue).replace(/^afp\s+/, '');
  const normalizedCode = rawValue.replace(/\D/g, '').replace(/^0+/, '') || '0';

  const match = AFP_INSTITUTION_IDS.find(([id, name, code]) => (
    normalizeText(id) === normalizedValue ||
    normalizeText(name).replace(/^afp\s+/, '') === normalizedValue ||
    code.replace(/^0+/, '') === normalizedCode
  ));

  return match?.[0] ?? rawValue;
}

export function firstSourceValue(sourceRow, keys) {
  const normalizedEntries = Object.entries(sourceRow ?? {}).map(([key, value]) => [normalizeText(key), value]);

  for (const key of keys) {
    const value = cleanCell(sourceRow?.[key]);
    if (value) {
      return value;
    }

    const normalizedKey = normalizeText(key);
    const entry = normalizedEntries.find(([sourceKey]) => sourceKey === normalizedKey);
    const normalizedValue = cleanCell(entry?.[1]);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
}

export function getSourceEmployeeId(sourceRow) {
  return normalizeEmployeeId(sourceRow.CI || sourceRow['ID EMPLEADO']);
}

export function normalizeEmployeeId(value) {
  return cleanCell(value).replace(/[.\s]/g, '').toUpperCase();
}
