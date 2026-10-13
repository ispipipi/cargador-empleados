import { arrayValues, cleanValue } from './shared.js';

const VISMA_MAX_EMPLOYEE_PAGES = 100;

export function safeCatalog(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((item) => ({
      id: item.id ?? '',
      description: item.description ?? item.name ?? '',
      externalCode: item.externalCode ?? '',
      initials: item.initials ?? '',
    }))
    .slice(0, 1000);
}

export function summarizeVismaEmployees(employees, totalAvailable) {
  return {
    totalAvailable: Number(totalAvailable) || employees.length,
    returned: employees.length,
    withDocument: employees.filter((item) => cleanValue(item.CI)).length,
    withAddress: employees.filter((item) => cleanValue(item.DIRECCION) || cleanValue(item.COMUNA)).length,
    withBank: employees.filter((item) => cleanValue(item.BANCO) || cleanValue(item['N° CTA CTE'])).length,
    withStructures: employees.filter((item) => Number(item.__visma?.structures) > 0).length,
    withEmail: employees.filter((item) => cleanValue(item.EMAIL)).length,
    withHealthAmount: employees.filter((item) => cleanValue(item['MONTO SALUD UF'])).length,
  };
}

export async function fetchAllVismaPages(fetchPage, pageSize) {
  const values = [];
  let totalCount = null;
  let previousPageKey = '';

  for (let page = 1; page <= VISMA_MAX_EMPLOYEE_PAGES; page += 1) {
    const payload = await fetchPage({ page, pageSize });
    const pageValues = arrayValues(payload);

    if (!pageValues.length) {
      break;
    }

    values.push(...pageValues);
    totalCount = readVismaTotalCount(payload) ?? totalCount;

    const first = pageValues[0];
    const last = pageValues[pageValues.length - 1];
    const pageKey = `${vismaPageIdentity(first)}|${vismaPageIdentity(last)}|${pageValues.length}`;
    if (pageKey === previousPageKey || pageValues.length < pageSize || (totalCount !== null && values.length >= totalCount)) {
      break;
    }

    previousPageKey = pageKey;
  }

  return { values, totalCount };
}

export function vismaPageIdentity(value) {
  if (!value || typeof value !== 'object') {
    return cleanValue(value);
  }

  const identity = [
    value.id,
    value.externalId,
    value.employeeId,
    value.conceptId,
    value.acumulatorId,
    value.accumulatorId,
    value.conceptCode,
    value.conceptName,
    value.acumulatorName,
    value.accumulatorName,
  ].find((candidate) => cleanValue(candidate));

  return cleanValue(identity) || JSON.stringify(value);
}

export function readVismaTotalCount(payload) {
  const total = [payload?.totalCount, payload?.totalItems, payload?.total, payload?.count]
    .map(Number)
    .find((value) => Number.isFinite(value));

  return total ?? null;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}
