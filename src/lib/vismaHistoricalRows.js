const TERMINATION_DATE_HEADERS = new Set([
  'fecha de baja',
  'fecha baja',
  'fecha de termino',
  'fecha termino',
]);
const EMPTY_DATE_VALUES = new Set(['', '-', '--', '0', 'null', 'undefined', 'nan']);

export function isVismaFiniquitoRow(row = {}) {
  const terminationDate = Object.entries(row).find(([header]) => (
    TERMINATION_DATE_HEADERS.has(normalizeHeader(header))
  ))?.[1];

  if (terminationDate instanceof Date) {
    return !Number.isNaN(terminationDate.getTime());
  }

  if (typeof terminationDate === 'number') {
    return Number.isFinite(terminationDate) && terminationDate > 0;
  }

  return !EMPTY_DATE_VALUES.has(String(terminationDate ?? '').trim().toLowerCase());
}

export function splitVismaHistoricalRows(rows = []) {
  const monthlyRows = [];
  const finiquitoRows = [];

  rows.forEach((row) => {
    (isVismaFiniquitoRow(row) ? finiquitoRows : monthlyRows).push(row);
  });

  return { monthlyRows, finiquitoRows };
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
