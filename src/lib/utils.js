export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function cleanCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

export function titleCase(value) {
  return cleanCell(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatIsoDate(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const rawValue = cleanCell(value);

  if (!rawValue) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const slashDateMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (slashDateMatch) {
    const [, day, month, year] = slashDateMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsedDate = new Date(rawValue);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return '';
}

export function parseCurrencyLikeValue(value) {
  const rawValue = cleanCell(value);

  if (!rawValue) {
    return '0';
  }

  const normalized = rawValue
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');

  return normalized || '0';
}

export function parseIntegerCurrency(value) {
  const normalized = parseCurrencyLikeValue(value);
  const numericValue = Number(normalized);

  if (Number.isNaN(numericValue)) {
    return '';
  }

  return String(Math.trunc(numericValue));
}

export function parseAntiquityYears(value) {
  const rawValue = cleanCell(value);

  if (!rawValue) {
    return 0;
  }

  const yearMatch = rawValue.match(/(\d+)\s*a[nñ]o/i);
  return yearMatch ? Number(yearMatch[1]) : 0;
}

export function yesNoFromPensionStatus(value) {
  const normalized = normalizeText(value);
  return normalized === 's' ? 'Sí' : 'No';
}

export function sanitizeFilenameSegment(value) {
  return cleanCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'configuracion';
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function downloadTextFile(contents, filename, mimeType = 'application/json') {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatRutWithDots(value) {
  const rawValue = cleanCell(value).replace(/\./g, '').toUpperCase();

  if (!rawValue) {
    return '';
  }

  const [body, verifier = ''] = rawValue.split('-');
  const numericBody = body.replace(/\D/g, '');

  if (!numericBody) {
    return cleanCell(value);
  }

  const formattedBody = numericBody.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return verifier ? `${formattedBody}-${verifier}` : formattedBody;
}
