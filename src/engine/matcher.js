import { cleanCell, normalizeText } from '../lib/utils';

export function matchControlledValue({ listName, value, listsCatalog, aliases = {}, allowBlank = false }) {
  const candidate = cleanCell(value);

  if (!candidate) {
    return {
      matchedValue: '',
      error: allowBlank ? null : null,
    };
  }

  const sourceList = listsCatalog[listName] ?? [];
  const normalizedListMap = sourceList.reduce((lookup, item) => {
    lookup.set(normalizeText(item), item);
    return lookup;
  }, new Map());

  const normalizedCandidate = normalizeText(candidate);
  const aliasValue = aliases[normalizedCandidate] ?? candidate;
  const matchedValue = normalizedListMap.get(normalizeText(aliasValue));

  return {
    matchedValue: matchedValue ?? '',
    error: matchedValue ? null : { listName, originalValue: candidate },
  };
}
