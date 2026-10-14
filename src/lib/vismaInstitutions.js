import { cleanCell, normalizeText } from './utils.js';

const INSTITUTION_SOURCE_FIELDS = {
  afp: ['CÓDIGO AFP', 'CODIGO AFP', 'ID AFP', 'AFP'],
  health: ['CÓDIGO ISAPRE', 'CODIGO ISAPRE', 'ID ISAPRE', 'ISAPRE'],
  mutual: ['CÓDIGO MUTUAL', 'CODIGO MUTUAL', 'ID MUTUAL', 'MUTUAL'],
};

const AFP_CONCEPT_IDS = new Set([
  'afp', 'afpahor', 'afpahorrootra', 'afprebaja', 'apvi', 'afpreliquida', 'reliquidaafp',
  'aporteafpemp', 'aporteafpreliquida', 'reliquidaaporteafp', 'ley21227afp', 'eximidaleyafp',
  'sis', 'sispago', 'sisreliquida', 'reliquidasis', 'trabajopesa', 'trabajopesaempl', 'reliquidatrabpesa',
]);

const HEALTH_CONCEPT_IDS = new Set(['isapre', 'isaprereliquida', 'reliquidaisapre', 'ley21227salud']);
const MUTUAL_CONCEPT_IDS = new Set(['mutual', 'mutualreliquida', 'reliquidamutual', 'ley21227mutual']);

const AFP_CODES = new Map([
  ['33', 'capital'],
  ['03', 'cuprum'],
  ['05', 'habitat'],
  ['34', 'modelo'],
  ['29', 'planvital'],
  ['08', 'provida'],
  ['35', 'uno'],
  ['1405', 'canaempu'],
  ['0601', 'capremer'],
  ['0101', 'empart'],
  ['0901', 'sss'],
  ['00', 'afp'],
  ['0702', 'triomar'],
]);

const HEALTH_ALIASES = new Map([
  ['fundsaludtrabajbcoestado', 'bancoestado'],
  ['fundsaludtrabajadorbancoestado', 'bancoestado'],
  ['fundsaludbancoestado', 'bancoestado'],
  ['isapredecodelco', 'isalud'],
  ['isapredecodelcoltda', 'isalud'],
  ['codelco', 'isalud'],
]);

const GENERIC_INSTITUTION_WORDS = new Set([
  'afp', 'isapre', 'institucion', 'instituto', 'de', 'del', 'la', 'las', 'el', 'los',
  'ltda', 'limitada', 'sa', 'cia', 'compania', 'sucursal',
]);

export function getVismaInstitutionKind(conceptId) {
  const normalizedId = normalizeText(conceptId).replace(/[^a-z0-9]+/g, '');
  if (['cajaahor', 'cajacred', 'cajasegu'].includes(normalizedId)) return 'ccaf';
  if (AFP_CONCEPT_IDS.has(normalizedId)) return 'afp';
  if (HEALTH_CONCEPT_IDS.has(normalizedId)) return 'health';
  if (MUTUAL_CONCEPT_IDS.has(normalizedId)) return 'mutual';
  return '';
}

export function resolveVismaInstitution(conceptId, sourceRow, institutions = []) {
  const kind = getVismaInstitutionKind(conceptId);
  if (!kind) return { id: '', rawValue: '', issue: '' };

  const rawValue = kind === 'ccaf'
    ? 'losandes'
    : firstSourceValue(sourceRow, INSTITUTION_SOURCE_FIELDS[kind]);
  if (!rawValue) {
    const label = { afp: 'AFP', health: 'de salud', mutual: 'mutual', ccaf: 'CCAF' }[kind];
    return { id: '', rawValue, issue: `Falta la institución ${label} en el libro.` };
  }

  const catalog = institutions.filter((entry) => cleanCell(entry.id));
  let requestedId = rawValue;

  if (kind === 'afp') {
    const digits = rawValue.replace(/\D/g, '');
    const normalizedDigits = digits.replace(/^0+(?=\d)/, '');
    const mappedAfpId = digits ? AFP_CODES.get(digits)
      ?? [...AFP_CODES].find(([code]) => code.replace(/^0+(?=\d)/, '') === normalizedDigits)?.[1] : '';
    if (mappedAfpId) requestedId = mappedAfpId;
    if (!mappedAfpId && compactInstitutionName(rawValue) === 'afp') {
      return { id: '', rawValue, issue: 'El libro sólo indica “AFP”, sin identificar cuál institución corresponde.' };
    }
  }

  if (kind === 'health') {
    if (['isapre', 'salud'].includes(compactInstitutionName(rawValue))) {
      return { id: '', rawValue, issue: 'El libro sólo indica “Isapre”, sin identificar cuál institución corresponde.' };
    }
    const alias = HEALTH_ALIASES.get(compactInstitutionName(rawValue));
    if (alias) requestedId = alias;
  }

  const exactId = catalog.find((entry) => compactInstitutionName(entry.id) === compactInstitutionName(requestedId));
  if (exactId) return { id: exactId.id, rawValue, issue: '' };

  const nameMatches = catalog.filter((entry) => (
    compactInstitutionName(entry.name) === compactInstitutionName(requestedId)
    || institutionWords(entry.name) === institutionWords(requestedId)
  ));
  if (nameMatches.length === 1) return { id: nameMatches[0].id, rawValue, issue: '' };
  if (nameMatches.length > 1) {
    return { id: '', rawValue, issue: `La institución “${rawValue}” coincide con más de un ID del catálogo REX+.` };
  }

  return {
    id: '',
    rawValue,
    issue: `La institución “${rawValue}” no se pudo asociar a un ID del catálogo REX+. Revisa el catálogo cargado.`,
  };
}

function firstSourceValue(sourceRow, candidates) {
  const normalizedEntries = Object.entries(sourceRow ?? {}).map(([key, value]) => [normalizeText(key), value]);
  for (const candidate of candidates) {
    const entry = normalizedEntries.find(([key]) => key === normalizeText(candidate));
    const value = cleanCell(entry?.[1]);
    if (value) return value;
  }
  return '';
}

function compactInstitutionName(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function institutionWords(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !GENERIC_INSTITUTION_WORDS.has(word))
    .join(' ');
}
