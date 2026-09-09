import { mkdir, writeFile } from 'node:fs/promises';

const BASE_URL = process.env.VISMA_BASE_URL || 'https://apim.vismalatam.com';
const TENANT_ID = clean(process.env.VISMA_TENANT_ID || '4230');
const EMPLOYEE_EXTERNAL_ID = clean(process.env.VISMA_EMPLOYEE_EXTERNAL_ID || '10150696');
const EMPLOYEE_INTERNAL_ID = clean(process.env.VISMA_EMPLOYEE_INTERNAL_ID || '41366');
const PHASE_ID = clean(process.env.VISMA_PHASE_ID || '37');
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'outputs/visma/salary-discovery';
const REQUEST_TIMEOUT_MS = Number(process.env.VISMA_REQUEST_TIMEOUT_MS || 15000);

const username = clean(process.env.VISMA_USERNAME);
const password = clean(process.env.VISMA_PASSWORD);
const subscriptionKey = clean(process.env.VISMA_SUBSCRIPTION_KEY);

if (!username || !password || !subscriptionKey) {
  throw new Error('Set VISMA_USERNAME, VISMA_PASSWORD and VISMA_SUBSCRIPTION_KEY in the environment.');
}

const token = await loginToVisma();
const report = {
  fetchedAt: new Date().toISOString(),
  tenantId: TENANT_ID,
  employee: {
    externalId: EMPLOYEE_EXTERNAL_ID,
    internalId: EMPLOYEE_INTERNAL_ID,
    phaseId: PHASE_ID,
  },
  officialEndpointsConsidered: [
    '/vlwebapi/pay-elements/individual',
    '/vlwebapi/payrolls/periods',
    '/vlwebapi/payrolls/processes',
    '/vlwebapi/payrolls/master-concepts',
    '/vlwebapi/payrolls/master-concept-types',
    '/vlwebapi/payrolls/monthly-acumulators',
    '/vlwebapi/payrolls/process-concepts',
    '/vlwebapi/phases/rh-{id}',
    '/vlwebapi/employees/{fileNumber}/phases',
    '/PayrollOperationSettings/api/payroll-concepts',
    '/Payroll/api/payroll-processes/{id}/employees/{id}/concepts',
  ],
  results: [],
  findings: {
    salaryConcepts: [],
    individualPayElements: [],
    payrollPeriods: [],
    payrollProcesses: [],
    directProcessConceptCandidates: [],
    directProcessConceptAttempts: [],
    payrollSearches: [],
    masterAcumulatorCandidates: [],
    directMonthlyAcumulatorAttempts: [],
    directProcessAcumulatorAttempts: [],
    processConceptCandidates: [],
    monthlyAcumulatorCandidates: [],
    phaseDetails: [],
    tenantPayrollApi: [],
  },
};

await probeOfficialBusinessEndpoints();
await probeTenantPayrollEndpoints();
await probeLikelyButUndocumentedEmployeeEndpoints();

await mkdir(OUTPUT_DIR, { recursive: true });
const outputPath = `${OUTPUT_DIR}/icon_sueldo_base_discovery_${stampDate()}.json`;
await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({
  ok: true,
  outputPath,
  salaryConcepts: report.findings.salaryConcepts.length,
  individualPayElements: report.findings.individualPayElements.length,
  payrollPeriods: report.findings.payrollPeriods.length,
  payrollProcesses: report.findings.payrollProcesses.length,
  processConceptCandidates: report.findings.processConceptCandidates.length,
  monthlyAcumulatorCandidates: report.findings.monthlyAcumulatorCandidates.length,
  successfulEndpoints: report.results.filter((entry) => entry.ok).length,
  failedEndpoints: report.results.filter((entry) => !entry.ok).length,
}, null, 2));

async function probeOfficialBusinessEndpoints() {
  const [conceptTypes, payrollSearches, masterAcumulators, individualPayElements, phaseById, employeePhases] = await Promise.all([
    getBusiness('/vlwebapi/payrolls/master-concept-types?page=1&pageSize=200'),
    getBusiness('/vlwebapi/payrolls/searches?search=sueldo&page=1&pageSize=50'),
    getBusiness('/vlwebapi/payrolls/master-acumulators?page=1&pageSize=500'),
    getBusiness(`/vlwebapi/pay-elements/individual?page=1&pageSize=200&employeeExternalId=${encodeURIComponent(EMPLOYEE_EXTERNAL_ID)}&dateFrom=2024-01-01&dateTo=2026-12-31`),
    getBusiness(`/vlwebapi/phases/rh-${encodeURIComponent(PHASE_ID)}`),
    getBusiness(`/vlwebapi/employees/${encodeURIComponent(EMPLOYEE_EXTERNAL_ID)}/phases?page=1&pageSize=20&active=true`),
  ]);

  const masterConcepts = { body: { values: [] } };
  for (const conceptType of arrayValues(conceptTypes.body)) {
    const conceptTypeId = conceptType.id ?? conceptType.Id;
    if (!conceptTypeId) continue;
    const response = await getBusiness(`/vlwebapi/payrolls/master-concepts?conceptTypeId=${encodeURIComponent(conceptTypeId)}&page=1&pageSize=300`);
    masterConcepts.body.values.push(...arrayValues(response.body));
  }

  report.findings.salaryConcepts = arrayValues(masterConcepts.body)
    .filter((concept) => salaryLikeText([
      concept.conceptExternalCode,
      concept.additionalDescription,
      concept.extendedDescription,
      concept.id,
    ].join(' ')))
    .map((concept) => pick(concept, [
      'id',
      'conceptExternalCode',
      'conceptTypeId',
      'additionalDescription',
      'extendedDescription',
      'printable',
    ]));

  report.findings.individualPayElements = arrayValues(individualPayElements.body)
    .filter((item) => salaryLikeText(JSON.stringify(item)))
    .map((item) => pick(item, [
      'id',
      'employeeId',
      'employeeExternalId',
      'conceptId',
      'conceptExternalId',
      'parameterId',
      'dateFrom',
      'dateTo',
      'value',
    ]));
  report.findings.payrollSearches = arrayValues(payrollSearches.body)
    .filter((item) => salaryLikeText(JSON.stringify(item)))
    .map((item) => compactDeep(item));
  report.findings.masterAcumulatorCandidates = arrayValues(masterAcumulators.body)
    .filter((item) => salaryLikeText(JSON.stringify(item)))
    .map((item) => compactDeep(item));

  report.findings.phaseDetails = [
    summarizePayload('phase-by-id', phaseById),
    summarizePayload('employee-active-phases', employeePhases),
  ];

  const periods = [];
  for (const year of [2026, 2025, 2024]) {
    const periodResponse = await getBusiness(`/vlwebapi/payrolls/periods?year=${year}&page=1&pageSize=200`);
    periods.push(...arrayValues(periodResponse.body));
  }

  report.findings.payrollPeriods = periods
    .sort((left, right) => String(right.startingDate || '').localeCompare(String(left.startingDate || '')))
    .slice(0, 36)
    .map((period) => pick(period, [
      'id',
      'periodDescription',
      'companyId',
      'companyName',
      'startingDate',
      'endDate',
      'periodMonth',
      'periodYear',
    ]));

  const targetPeriods = report.findings.payrollPeriods.slice(0, 8);
  const salaryConceptCodes = preferredSalaryConceptCodes(report.findings.salaryConcepts);
  for (const period of targetPeriods.slice(0, 12)) {
    for (const conceptCode of salaryConceptCodes) {
      const response = await getBusiness(`/vlwebapi/payrolls/process-concepts?periodId=${encodeURIComponent(period.id)}&employeeId=${encodeURIComponent(EMPLOYEE_INTERNAL_ID)}&conceptCode=${encodeURIComponent(conceptCode)}&page=1&pageSize=20`);
      report.findings.directProcessConceptAttempts.push({
        period: pick(period, ['id', 'periodDescription', 'periodMonth', 'periodYear']),
        conceptCode,
        ok: response.ok,
        status: response.status,
        totalCount: response.totalCount,
      });
      report.findings.directProcessConceptCandidates.push(...arrayValues(response.body).map((concept) => ({
        period: pick(period, ['id', 'periodDescription', 'periodMonth', 'periodYear']),
        ...pick(concept, [
          'periodId',
          'processId',
          'conceptId',
          'conceptCode',
          'employeeId',
          'conceptName',
          'quantity',
          'amount',
          'printable',
          'retroactive',
        ]),
      })));
    }

    for (const acumulator of report.findings.masterAcumulatorCandidates.slice(0, 12)) {
      const acumulatorId = acumulator.id ?? acumulator.acumulatorId ?? acumulator.Id ?? acumulator.AcumulatorId;
      if (!acumulatorId) continue;

      const monthlyResponse = await getBusiness(`/vlwebapi/payrolls/monthly-acumulators?periodId=${encodeURIComponent(period.id)}&employeeId=${encodeURIComponent(EMPLOYEE_INTERNAL_ID)}&acumulatorId=${encodeURIComponent(acumulatorId)}&page=1&pageSize=20`);
      report.findings.directMonthlyAcumulatorAttempts.push({
        period: pick(period, ['id', 'periodDescription', 'periodMonth', 'periodYear']),
        acumulatorId,
        ok: monthlyResponse.ok,
        status: monthlyResponse.status,
        totalCount: monthlyResponse.totalCount,
        values: arrayValues(monthlyResponse.body).map((item) => compactDeep(item)),
      });

      const processResponse = await getBusiness(`/vlwebapi/payrolls/process-acumulators?periodId=${encodeURIComponent(period.id)}&employeeId=${encodeURIComponent(EMPLOYEE_INTERNAL_ID)}&acumulatorId=${encodeURIComponent(acumulatorId)}&page=1&pageSize=20`);
      report.findings.directProcessAcumulatorAttempts.push({
        period: pick(period, ['id', 'periodDescription', 'periodMonth', 'periodYear']),
        acumulatorId,
        ok: processResponse.ok,
        status: processResponse.status,
        totalCount: processResponse.totalCount,
        values: arrayValues(processResponse.body).map((item) => compactDeep(item)),
      });
    }
  }

  const processes = [];
  for (const period of targetPeriods) {
    const processResponse = await getBusiness(`/vlwebapi/payrolls/processes?periodId=${encodeURIComponent(period.id)}`);
    for (const process of arrayValues(processResponse.body)) {
      processes.push({ ...process, periodId: period.id, periodDescription: period.periodDescription });
    }
  }

  report.findings.payrollProcesses = processes.map((process) => pick(process, [
    'id',
    'periodId',
    'periodDescription',
    'name',
    'modelId',
    'modelName',
    'companyName',
    'startingDate',
    'endDate',
    'plannedDate',
    'paymentDate',
    'stateId',
    'state',
  ]));

  for (const process of report.findings.payrollProcesses.slice(0, 12)) {
    const periodId = encodeURIComponent(process.periodId);
    const processId = encodeURIComponent(process.id);
    const employeeId = encodeURIComponent(EMPLOYEE_INTERNAL_ID);

    const conceptsResponse = await getBusiness(`/vlwebapi/payrolls/process-concepts?periodId=${periodId}&processId=${processId}&employeeId=${employeeId}&page=1&pageSize=300`);
    const concepts = arrayValues(conceptsResponse.body)
      .filter((concept) => salaryLikeText(`${concept.conceptCode} ${concept.conceptName}`))
      .map((concept) => ({
        process: pick(process, ['id', 'periodId', 'periodDescription', 'name', 'paymentDate', 'state']),
        ...pick(concept, [
          'periodId',
          'processId',
          'conceptId',
          'conceptCode',
          'employeeId',
          'conceptName',
          'quantity',
          'amount',
          'printable',
          'retroactive',
        ]),
      }));
    report.findings.processConceptCandidates.push(...concepts);

    const acumulatorsResponse = await getBusiness(`/vlwebapi/payrolls/monthly-acumulators?periodId=${periodId}&employeeId=${employeeId}&printable=true&page=1&pageSize=300`);
    const acumulators = arrayValues(acumulatorsResponse.body)
      .filter((acumulator) => salaryLikeText(`${acumulator.acumulatorId} ${acumulator.name}`))
      .map((acumulator) => ({
        process: pick(process, ['id', 'periodId', 'periodDescription', 'name', 'paymentDate', 'state']),
        ...pick(acumulator, [
          'periodId',
          'employeeId',
          'acumulatorId',
          'name',
          'quantity',
          'amount',
          'printable',
        ]),
      }));
    report.findings.monthlyAcumulatorCandidates.push(...acumulators);
  }

  report.findings.conceptTypes = arrayValues(conceptTypes.body).slice(0, 50);
}

function preferredSalaryConceptCodes(concepts) {
  const preferred = ['01000', '01100', '00997', '00998', '00030'];
  const found = concepts
    .map((concept) => clean(concept.conceptExternalCode))
    .filter(Boolean);
  return [...new Set([...preferred.filter((code) => found.includes(code)), ...found.slice(0, 10)])].slice(0, 12);
}

async function probeTenantPayrollEndpoints() {
  const tenantConcepts = await getTenant('/PayrollOperationSettings/api/payroll-concepts?PageNumber=1&PageSize=500&OrderBy=id');
  const payrollProcesses = await getTenant('/Payroll/api/payroll-processes?PageNumber=1&PageSize=20&OrderBy=id');

  const concepts = arrayValues(tenantConcepts.body)
    .filter((concept) => salaryLikeText(JSON.stringify(concept)))
    .slice(0, 50);

  report.findings.tenantPayrollApi.push({
    endpoint: '/PayrollOperationSettings/api/payroll-concepts',
    ok: tenantConcepts.ok,
    matches: concepts.map((concept) => compactDeep(concept)),
  });
  report.findings.tenantPayrollApi.push({
    endpoint: '/Payroll/api/payroll-processes',
    ok: payrollProcesses.ok,
    sample: arrayValues(payrollProcesses.body).slice(0, 5).map((item) => compactDeep(item)),
  });

  const process = arrayValues(payrollProcesses.body)[0];
  const processId = process?.id ?? process?.idPayrollProcess ?? process?.payrollProcessId;
  if (!processId) return;

  const conceptResponse = await getTenant(`/Payroll/api/payroll-processes/${encodeURIComponent(processId)}/employees/${encodeURIComponent(EMPLOYEE_INTERNAL_ID)}/concepts?PageNumber=1&PageSize=300`);
  report.findings.tenantPayrollApi.push({
    endpoint: '/Payroll/api/payroll-processes/{process}/employees/{employee}/concepts',
    processId,
    ok: conceptResponse.ok,
    matches: arrayValues(conceptResponse.body)
      .filter((concept) => salaryLikeText(JSON.stringify(concept)))
      .map((item) => compactDeep(item)),
  });
}

async function probeLikelyButUndocumentedEmployeeEndpoints() {
  const employeePaths = [
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/salaries`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/salary`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/compensations`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/compensation`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/contracts`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/working-hours`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/phases/${PHASE_ID}`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/phases/${PHASE_ID}/salary`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/phases/${PHASE_ID}/real`,
    `/vlwebapi/employees/${EMPLOYEE_EXTERNAL_ID}/phases/${PHASE_ID}/compensation`,
  ];

  for (const path of employeePaths) {
    await getBusiness(path);
  }
}

async function loginToVisma() {
  const body = new URLSearchParams();
  body.set('grant_type', 'password');
  body.set('username', username);
  body.set('password', password);

  const response = await fetchWithTimeout(`${BASE_URL}/vlwebapiadmin/authentication/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
    body,
  });
  const payload = await parseResponse(response);
  const accessToken = payload?.access_token;

  if (!accessToken) {
    throw new Error('VISMA did not return an access token.');
  }

  return accessToken;
}

async function getBusiness(path) {
  return getVismaJson(path, 'X-RAET-Tenant-Id');
}

async function getTenant(path) {
  return getVismaJson(path, 'X-Tenant-Id');
}

async function getVismaJson(path, tenantHeaderName) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      [tenantHeaderName]: TENANT_ID,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });
  const payload = await parseResponse(response, path, false);
  const result = {
    ok: response.ok,
    status: response.status,
    path: redactPath(path),
    totalCount: payload?.totalCount ?? payload?.TotalCount ?? null,
    keys: payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload) : [],
    sample: compactDeep(Array.isArray(payload) ? payload.slice(0, 3) : arrayValues(payload).slice(0, 3)),
    body: payload,
  };
  report.results.push(omitBody(result));
  return result;
}

async function parseResponse(response, path = '', throwOnError = true) {
  const text = await response.text();
  const payload = parseJsonSafe(text);

  if (!response.ok && throwOnError) {
    throw new Error(`${path || response.url}: HTTP ${response.status} ${text.slice(0, 180)}`);
  }

  if (!response.ok) {
    return {
      error: text.slice(0, 300),
    };
  }

  return payload;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function arrayValues(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.values)) return payload.values;
  if (Array.isArray(payload?.Values)) return payload.Values;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.Items)) return payload.Items;
  if (Array.isArray(payload?.paginationList)) return payload.paginationList;
  if (Array.isArray(payload?.paginatedList)) return payload.paginatedList;
  return [];
}

function salaryLikeText(value) {
  const text = normalize(value);
  return [
    'sueldo',
    'salario',
    'salary',
    'remuneracion',
    'remuneración',
    'haber base',
    'base',
    'basico',
    'básico',
  ].some((term) => text.includes(normalize(term)));
}

function pick(object, keys) {
  return keys.reduce((output, key) => {
    if (object?.[key] !== undefined) output[key] = object[key];
    return output;
  }, {});
}

function omitBody(result) {
  const { body, ...summary } = result;
  return summary;
}

function summarizePayload(label, payload) {
  return {
    label,
    ok: payload.ok,
    status: payload.status,
    path: payload.path,
    totalCount: payload.totalCount,
    sample: payload.sample,
  };
}

function compactDeep(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (typeof item === 'string' && item.length > 180) return `${item.slice(0, 180)}...`;
    return item;
  }));
}

function redactPath(path) {
  return String(path)
    .replace(new RegExp(EMPLOYEE_EXTERNAL_ID, 'g'), '{employeeExternalId}')
    .replace(new RegExp(EMPLOYEE_INTERNAL_ID, 'g'), '{employeeInternalId}')
    .replace(new RegExp(PHASE_ID, 'g'), '{phaseId}');
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function stampDate() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
