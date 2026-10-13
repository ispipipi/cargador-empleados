import {
  CATEGORY_INE_RULES,
  COMPANY_OCCUPATION_PROFILES,
  OCCUPATIONAL_LEVEL_RULES,
} from './catalogs';
import {
  normalizeCargoName,
  normalizeLooseText,
  tokenizeCargoName,
  tokenizeNormalized,
} from './normalizers';

export function inferFromKeywordRules({ normalizedSource, normalizedArea, rules }) {
  const combinedSource = `${normalizedSource} ${normalizedArea}`.trim();
  const matchedRule = rules.find((rule) => rule.keywords.some((keyword) => matchesKeywordRule(combinedSource, keyword)));
  return matchedRule?.id ?? '';
}

export function getOccupationRuleSet(companyValue) {
  const normalizedCompany = normalizeLooseText(companyValue);
  const profile = COMPANY_OCCUPATION_PROFILES.find((candidate) =>
    candidate.companyKeywords.some((keyword) => normalizedCompany.includes(normalizeLooseText(keyword))),
  );

  if (!profile) {
    return {
      level: OCCUPATIONAL_LEVEL_RULES,
      ine: CATEGORY_INE_RULES,
    };
  }

  return {
    level: OCCUPATIONAL_LEVEL_RULES.map((rule) =>
      rule.id === 'profesional'
        ? { ...rule, keywords: [...rule.keywords, ...profile.professionalKeywords] }
        : rule,
    ),
    ine: CATEGORY_INE_RULES.map((rule) =>
      rule.id === 'ine_profesionales'
        ? { ...rule, keywords: [...rule.keywords, ...profile.professionalKeywords] }
        : rule,
    ),
  };
}

export function inferIneCategory({ normalizedSource, normalizedArea, occupationalLevelId, rules = CATEGORY_INE_RULES }) {
  const directRule = inferFromKeywordRules({ normalizedSource, normalizedArea, rules });

  if (directRule) {
    return directRule;
  }

  const occupationalFallbacks = {
    ejecutivo: 'ine_gerentes',
    mando_medio: 'ine_profesionales',
    administrativo: 'ine_administrativos',
    profesional: 'ine_profesionales',
    trabajo_calificado: 'ine_tecnicos',
    trabajo_semi_cali: 'ine_nocal',
    trabajo_no_cali: 'ine_nocal',
  };

  return occupationalFallbacks[occupationalLevelId] ?? '';
}

export function findCatalogMatch({ catalog, candidate, normalizer }) {
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

export function findHeuristicCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const matches = catalog.filter((item) => {
    const normalizedName = normalizer(item.name);

    if (!normalizedName) {
      return false;
    }

    return normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName);
  });

  return matches.length === 1 ? matches[0] : null;
}

export function findScoredCatalogMatch({ catalog, candidate, normalizer }) {
  const normalizedCandidate = normalizer(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const candidateTokens = tokenizeNormalized(normalizedCandidate);
  const rankedMatches = catalog
    .map((item) => {
      const normalizedName = normalizer(item.name);
      const normalizedId = normalizer(item.id);

      if (!normalizedName && !normalizedId) {
        return { item, score: -1 };
      }

      const nameTokens = tokenizeNormalized(normalizedName);
      const sharedTokens = candidateTokens.filter((token) => nameTokens.includes(token));
      let score = sharedTokens.length * 18;

      if (normalizedName && (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName))) {
        score += 36;
      }

      if (normalizedId === normalizedCandidate) {
        score += 50;
      }

      if (candidateTokens.length > 0 && sharedTokens.length === candidateTokens.length) {
        score += 18;
      }

      return { item, score };
    })
    .sort((left, right) => right.score - left.score);

  const [bestMatch, secondMatch] = rankedMatches;

  if (!bestMatch || bestMatch.score < 36 || (secondMatch && bestMatch.score - secondMatch.score < 12)) {
    return null;
  }

  return bestMatch.item;
}

export function getCatalogItemName(catalog, id) {
  if (!id) {
    return '';
  }

  return catalog.find((item) => item.id === id)?.name ?? '';
}

function matchesKeywordRule(normalizedSource, keyword) {
  const normalizedKeyword = normalizeLooseText(keyword);

  if (!normalizedSource || !normalizedKeyword) {
    return false;
  }

  if (normalizedSource.includes(normalizedKeyword)) {
    return true;
  }

  const sourceTokens = tokenizeNormalized(normalizedSource);
  const keywordTokens = tokenizeNormalized(normalizedKeyword);

  return sourceTokens.length > 0 && keywordTokens.length > 0 && keywordTokens.every((token) => sourceTokens.includes(token));
}

export function findScoredCargoCatalogMatch({ catalog, candidate }) {
  const normalizedCandidate = normalizeCargoName(candidate);

  if (!normalizedCandidate) {
    return null;
  }

  const candidateTokens = tokenizeCargoName(candidate);

  if (!candidateTokens.length) {
    return null;
  }

  const rankedMatches = catalog
    .map((item) => {
      const normalizedName = normalizeCargoName(item.name);
      const nameTokens = tokenizeCargoName(item.name);
      const sharedTokens = candidateTokens.filter((token) => nameTokens.includes(token));
      let score = sharedTokens.length * 26;

      if (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName)) {
        score += 34;
      }

      if (sharedTokens.length === candidateTokens.length) {
        score += 32;
      }

      if (candidateTokens[0] && nameTokens[0] === candidateTokens[0]) {
        score += 10;
      }

      score -= Math.max(0, nameTokens.length - candidateTokens.length) * 3;
      return { item, score };
    })
    .sort((left, right) => right.score - left.score);

  const [bestMatch, secondMatch] = rankedMatches;

  if (!bestMatch || bestMatch.score < 58 || (secondMatch && bestMatch.score - secondMatch.score < 10)) {
    return null;
  }

  return bestMatch.item;
}
