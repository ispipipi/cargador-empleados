import { cleanCell, normalizeText } from './utils.js';

export function getVismaSourceValue(row, header) {
  const expectedHeader = normalizeText(header);
  const matchingHeader = Object.keys(row).find((candidate) => normalizeText(candidate) === expectedHeader);
  return cleanCell(matchingHeader ? row[matchingHeader] : '');
}
