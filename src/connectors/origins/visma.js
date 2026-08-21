import { cleanCell, normalizeText } from '../../lib/utils';

export const vismaHistoricalOrigin = {
  id: 'visma',
  nombre: 'Visma',
  hojaDatos: 0,
  headerRowIndex: 5,
  columnasClave: ['PERÍODO', 'RUT', 'APELLIDO Y NOMBRE', 'DÍAS TRABAJADOS'],
};

export function getVismaHistoricalFormatIssues(headers) {
  const normalizedHeaders = new Set(headers.map((header) => normalizeText(header)));

  return vismaHistoricalOrigin.columnasClave
    .filter((requiredColumn) => !normalizedHeaders.has(normalizeText(requiredColumn)))
    .map((requiredColumn) => `Falta la columna obligatoria ${requiredColumn}.`);
}

export function getVismaHeaderRow(rows) {
  const scanLimit = Math.min(rows.length, 30);
  const required = vismaHistoricalOrigin.columnasClave.map(normalizeText);
  let bestMatch = { index: -1, score: 0 };

  for (let index = 0; index < scanLimit; index += 1) {
    const normalizedHeaders = new Set((rows[index] ?? []).map((value) => normalizeText(value)));
    const score = required.filter((header) => normalizedHeaders.has(header)).length;

    if (score > bestMatch.score) {
      bestMatch = { index, score };
    }
  }

  return bestMatch.index >= 0 ? bestMatch.index : vismaHistoricalOrigin.headerRowIndex;
}

export function extractVismaPeriod(rows, headerRowIndex) {
  const metadata = rows
    .slice(0, headerRowIndex)
    .flat()
    .map(cleanCell)
    .find((value) => /periodo\s*:/i.test(value));

  const match = metadata?.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i);
  if (match) {
    const months = {
      enero: '01',
      febrero: '02',
      marzo: '03',
      abril: '04',
      mayo: '05',
      junio: '06',
      julio: '07',
      agosto: '08',
      septiembre: '09',
      octubre: '10',
      noviembre: '11',
      diciembre: '12',
    };

    return `${match[2]}-${months[normalizeText(match[1])]}`;
  }

  const periodValue = rows[headerRowIndex + 1]?.[0];
  if (typeof periodValue === 'number' && Number.isFinite(periodValue)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + periodValue * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  return '';
}
