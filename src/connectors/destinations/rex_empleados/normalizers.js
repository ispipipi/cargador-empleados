import { cleanCell, normalizeText } from '../../../lib/utils.js';
import { CARGO_TOKEN_STOPWORDS } from './catalogs.js';

export function normalizeLooseText(value) {
  return normalizeText(repairCommonMojibake(value))
    .replace(/[().,/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function repairCommonMojibake(value) {
  return cleanCell(value)
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ãô/g, 'ó')
    .replace(/Ãë/g, 'é')
    .replace(/Ãæ/g, 'ñ')
    .replace(/Ãi/g, 'í')
    .replace(/Ãü/g, 'á')
    .replace(/ÃâÃ´/g, 'ó')
    .replace(/Ã/g, 'Á')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã/g, 'Í')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/Ã¼/gi, 'ü');
}

export function normalizeCargoName(value) {
  return normalizeLooseText(value)
    .replace(/\bfinsa\b|\bfinas\b|\bchile\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAreaName(value) {
  return normalizeLooseText(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bjuan\b|\bpedro\b|\bcristian\b|\bsebastian\b|\bsebastián\b|\bjoaquin\b|\bjoaquín\b|\bmark\b|\bneil\b|\bdori\b|\btrinidad\b|\bgerman\b|\bgermán\b|\bcheryl\b|\bgray\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeNormalized(value) {
  return String(value)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => token.length > 2);
}

export function normalizeCargoToken(token) {
  const normalizedToken = String(token).trim();

  if (!normalizedToken) {
    return '';
  }

  const aliasMap = {
    implem: 'implementacion',
    inspecto: 'inspector',
    vts: 'ventas',
  };

  const aliasedToken = aliasMap[normalizedToken] ?? normalizedToken;

  if (aliasedToken.length > 4 && aliasedToken.endsWith('s')) {
    return aliasedToken.slice(0, -1);
  }

  return aliasedToken;
}

export function tokenizeCargoName(value) {
  return normalizeCargoName(value)
    .split(/[^a-z0-9]+/g)
    .map(normalizeCargoToken)
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !CARGO_TOKEN_STOPWORDS.has(token));
}

export function normalizeSedeName(value) {
  return normalizeLooseText(value)
    .replace(/\bsucursal\b/g, '')
    .replace(/\boficina\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePaymentMethodName(value) {
  return normalizeLooseText(value).replace(/\bcta\b/g, 'cuenta');
}

export function normalizeBankName(value) {
  return normalizeLooseText(value)
    .replace(/\bbanco\b/g, '')
    .replace(/\bdel\b/g, '')
    .replace(/\bde\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAfpName(value) {
  return normalizeLooseText(value)
    .replace(/\bs a\b/g, '')
    .replace(/\bafp\b/g, '')
    .replace(/\bj\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeHealthName(value) {
  return normalizeLooseText(value)
    .replace(/\bisapre\b/g, '')
    .replace(/\bs a\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
