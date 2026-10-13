import { cleanCell } from '../../../lib/utils';
import {
  COMUNA_ALIASES,
  LOCATION_COMUNA_ALIASES,
} from './catalogs';
import {
  normalizeLooseText,
  repairCommonMojibake,
  tokenizeNormalized,
} from './normalizers';

function findCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  return catalog.find((item) => {
    const normalizedName = normalizer(item.name);
    const normalizedId = normalizer(item.id);

    if (!normalizedName && !normalizedId) {
      return false;
    }

    return normalizedName === normalizedCandidate || normalizedId === normalizedCandidate;
  });
}

export function sanitizeStreetSegment(value) {
  const repairedValue = repairCommonMojibake(cleanCell(value))
    .replace(/[º°]\s*\d+[a-zA-Z0-9-]*/g, ' ')
    .replace(/[;,]+/g, ' ')
    .replace(/\b(depto|dpto|depa|depart\w*|casa)\b.*$/iu, '')
    .replace(/[^\p{L}\d\s.-]+/gu, ' ')
    .replace(/^[^0-9\p{L}]+|[^0-9\p{L}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return isPlaceholderStreetValue(repairedValue) ? '' : repairedValue;
}

export function isValidRegionId(value) {
  const normalizedValue = cleanCell(value);
  return Boolean(normalizedValue) && normalizedValue !== '99';
}

export function isValidComunaId(value) {
  const normalizedValue = cleanCell(value);
  return Boolean(normalizedValue) && normalizedValue !== '99999';
}

export function isValidCityId(value) {
  return Boolean(cleanCell(value));
}

export function inferStreetNumberFallback() {
  return '0';
}

export function inferStreetNameFallback(value) {
  const fallbackValue = cleanCell(value)
    .replace(/\b\d+[a-zA-Z0-9-]*\b/g, ' ')
    .replace(/\b(depto|dpto|depa|depart\w*|of|oficina|block|bloque|km)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return isPlaceholderStreetValue(fallbackValue) ? '' : fallbackValue;
}

export function isPlaceholderStreetValue(value) {
  const normalizedValue = normalizeLooseText(value);
  return !normalizedValue || /^(x|xx|xxx|xxxx|xxxxx)$/.test(normalizedValue);
}

export function parseAddress(value) {
  const rawValue = cleanCell(value).replace(/\s+/g, ' ');

  if (!rawValue) {
    return {
      streetName: '',
      streetNumber: '',
      department: '',
    };
  }

  const departmentMatch = rawValue.match(/(depto|dpto|depa|departamento|of|oficina|block|bloque)\s+([a-z0-9-]+)/i);
  const departmentKeyword = departmentMatch?.[1]?.toLowerCase() ?? '';
  const department = departmentMatch?.[2] ?? '';
  const withoutDepartment = departmentMatch ? rawValue.replace(departmentMatch[0], '').trim() : rawValue;
  const normalizedAddress = withoutDepartment
    .replace(/\bN\s*(?=[a-zA-Z]?\d)/gi, ' ')
    .replace(/([a-zA-Z])(\d{2,}[a-zA-Z-]*)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const streetMatch = normalizedAddress.match(/^(.*?)(?:\s+|,\s*|#\s*)([a-zA-Z]?\d+[a-zA-Z0-9-]*)$/i);

  if (!streetMatch) {
    const kilometerMatch = normalizedAddress.match(/\bkm\s*(\d+[a-zA-Z-]*)\b/i);
    const kilometerNumber = kilometerMatch ? `KM${kilometerMatch[1]}` : '';
    const inlineNumberMatch = normalizedAddress.match(/\b([a-zA-Z]?\d+[a-zA-Z0-9-]*)\b/i);
    const derivedBlockNumber =
      !inlineNumberMatch && department && ['block', 'bloque'].includes(departmentKeyword) ? department : '';
    const streetNumber = inlineNumberMatch?.[1] || kilometerNumber || derivedBlockNumber;
    const streetName = streetNumber
      ? cleanCell(
          normalizedAddress
            .replace(inlineNumberMatch?.[0] ?? kilometerMatch?.[0] ?? '', '')
            .replace(/\bN\b/gi, '')
            .replace(/\s+/g, ' '),
        )
      : cleanCell(normalizedAddress);

    return {
      streetName,
      streetNumber,
      department: derivedBlockNumber ? '' : department,
    };
  }

  return {
    streetName: cleanCell(streetMatch[1].replace(/\bN\b/gi, '')),
    streetNumber: cleanCell(streetMatch[2]),
    department: cleanCell(department),
  };
}

export function buildComunaCandidates({ sourceValue, locationValue, secondaryLocationValue, addressValue }) {
  const rawValue = cleanCell(sourceValue);
  const repairedRawValue = repairCommonMojibake(rawValue);
  const locationCandidates = [secondaryLocationValue, locationValue]
    .map((value) => cleanCell(value))
    .filter(Boolean);
  const rawAddressValue = cleanCell(addressValue);
  const repairedAddressValue = repairCommonMojibake(rawAddressValue);
  const inferredRawCandidate = inferComunaFromLocation(repairedRawValue || rawValue);
  const inferredLocationCandidate = locationCandidates
    .map((value) => inferComunaFromLocation(value))
    .find(Boolean);
  const inferredAddressCandidate = inferComunaFromLocation(repairedAddressValue || rawAddressValue);

  if (!rawValue && !rawAddressValue && locationCandidates.length === 0 && !inferredLocationCandidate && !inferredAddressCandidate) {
    return [];
  }

  const normalizedRawValue = normalizeLooseText(repairedRawValue || rawValue);
  const aliasCandidate = normalizedRawValue ? COMUNA_ALIASES[normalizedRawValue] : '';
  const commaSegments = (repairedRawValue || rawValue)
    ? (repairedRawValue || rawValue)
        .split(',')
        .map((segment) => cleanCell(segment))
        .filter(Boolean)
    : [];
  const trailingTokenCandidate = (repairedRawValue || rawValue)
    ? cleanCell((repairedRawValue || rawValue).replace(/^.*\d+\s*/u, ''))
    : '';
  const leadingTextCandidate = (repairedRawValue || rawValue)
    ? cleanCell((repairedRawValue || rawValue).split(/\d/u)[0])
    : '';

  return [
    rawValue,
    repairedRawValue,
    aliasCandidate,
    inferredRawCandidate,
    inferredLocationCandidate,
    inferredAddressCandidate,
    rawAddressValue,
    repairedAddressValue,
    ...locationCandidates,
    ...commaSegments,
    leadingTextCandidate,
    trailingTokenCandidate,
  ]
    .filter(Boolean)
    .filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
}

export function findAddressComunaMatch({ catalog, addressValue }) {
  const repairedAddressValue = repairCommonMojibake(cleanCell(addressValue));
  const normalizedAddress = normalizeLooseText(repairedAddressValue);

  if (!normalizedAddress) {
    return null;
  }

  const inferredComunaName = inferComunaFromLocation(repairedAddressValue);
  const inferredComuna = inferredComunaName
    ? findCatalogMatch({
        catalog,
        candidate: inferredComunaName,
        normalizer: normalizeLooseText,
      })
    : null;

  if (inferredComuna) {
    return inferredComuna;
  }

  const addressSegments = repairedAddressValue
    .split(',')
    .map((segment) => normalizeLooseText(segment))
    .filter(Boolean);
  const numberMatches = [...normalizedAddress.matchAll(/\b\d+[a-z0-9-]*\b/g)];
  const lastNumberMatch = numberMatches[numberMatches.length - 1];
  const trailingAddressText = lastNumberMatch
    ? normalizedAddress.slice(lastNumberMatch.index + lastNumberMatch[0].length).trim()
    : '';
  const rankedMatches = catalog
    .map((item) => {
      const normalizedName = normalizeLooseText(item.name);

      if (!normalizedName) {
        return { item, score: 0, exactSegment: false };
      }

      const exactSegment = addressSegments.some(
        (segment) => segment === normalizedName || segment.endsWith(` ${normalizedName}`),
      );
      const appearsInAddress = hasNormalizedPhrase(normalizedAddress, normalizedName);
      const appearsAfterNumber = hasNormalizedPhrase(trailingAddressText, normalizedName);
      const nameTokens = tokenizeNormalized(normalizedName).filter((token) => token.length >= 4);
      const addressTokens = new Set(tokenizeNormalized(normalizedAddress));
      const allNameTokensPresent = nameTokens.length > 0 && nameTokens.every((token) => addressTokens.has(token));
      const isSingleWordName = nameTokens.length === 1;
      const isReliableAddressMatch =
        exactSegment ||
        appearsAfterNumber ||
        (appearsInAddress && !isSingleWordName && normalizedAddress.endsWith(normalizedName));

      if (!isReliableAddressMatch || !allNameTokensPresent) {
        return { item, score: 0, exactSegment };
      }

      return {
        item,
        exactSegment,
        score:
          (exactSegment ? 120 : 0) +
          (appearsAfterNumber ? 100 : 0) +
          (normalizedAddress.endsWith(normalizedName) ? 40 : 0) +
          nameTokens.length * 8,
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
  const [bestMatch, secondMatch] = rankedMatches;

  if (!bestMatch) {
    return null;
  }

  if (secondMatch && bestMatch.score - secondMatch.score < 16 && !bestMatch.exactSegment) {
    return null;
  }

  return bestMatch.item;
}

export function hasNormalizedPhrase(value, phrase) {
  return Boolean(
    value &&
      phrase &&
      (value === phrase ||
        value.startsWith(`${phrase} `) ||
        value.endsWith(` ${phrase}`) ||
        value.includes(` ${phrase} `)),
  );
}

export function hasPendingItem(pendingItems, key) {
  return pendingItems.some((item) => item.key === key);
}

export function inferComunaFromLocation(value) {
  const normalizedValue = normalizeLooseText(value);

  if (!normalizedValue) {
    return '';
  }

  if (LOCATION_COMUNA_ALIASES[normalizedValue]) {
    return LOCATION_COMUNA_ALIASES[normalizedValue];
  }

  const keywordRules = [
    ['radomiro tomic', 'Calama'],
    ['ministro hales', 'Calama'],
    ['gabriela mistral', 'Calama'],
    ['chuquicamata', 'Calama'],
    ['el abra', 'Calama'],
    ['candelaria', 'Copiapo'],
    ['los colorados', 'Copiapo'],
    ['manto verde', 'Copiapo'],
    ['pucobre', 'Copiapo'],
    ['collahuasi', 'Iquique'],
    ['quebrada blanca', 'Iquique'],
    ['sierra gorda', 'Sierra Gorda'],
    ['centinela', 'Sierra Gorda'],
    ['spence', 'Sierra Gorda'],
    ['andacollo', 'Andacollo'],
    ['teniente', 'Rancagua'],
    ['rajo sur', 'Rancagua'],
    ['antofagasta', 'Antofagasta'],
    ['la negra', 'Antofagasta'],
    ['huechuraba', 'Huechuraba'],
    ['copiapo', 'Copiapo'],
    ['coquimbo', 'Coquimbo'],
    ['concepcion', 'Concepcion'],
    ['puerto montt', 'Puerto Montt'],
    ['calama', 'Calama'],
    ['iquique', 'Iquique'],
    ['temuco', 'Temuco'],
    ['santiago', 'Santiago'],
    ['enea', 'Pudahuel'],
    ['pudahuel', 'Pudahuel'],
  ];

  const matchedRule = keywordRules.find(([keyword]) => normalizedValue.includes(keyword));
  return matchedRule?.[1] ?? '';
}

export function resolveCityIdForRegion(regionId, comunaName, cityCatalog) {
  const normalizedComuna = normalizeLooseText(comunaName);
  const exactCity = cityCatalog.find((item) => normalizeLooseText(item.name) === normalizedComuna);

  if (exactCity) {
    return exactCity.id;
  }

  const regionMatches = cityCatalog.filter((item) => item.id.startsWith(`${regionId}-`));
  return regionMatches[0]?.id ?? '';
}
