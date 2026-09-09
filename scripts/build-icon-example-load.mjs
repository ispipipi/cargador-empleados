import { mkdir, readFile, writeFile } from 'node:fs/promises';

const BASE_URL = process.env.VISMA_BASE_URL || 'https://apim.vismalatam.com';
const TENANT_ID = process.env.VISMA_TENANT_ID || '4230';
const SOURCE_TEMPLATE = process.env.EXAMPLE_TEMPLATE || 'data/examples/carga-empleados-ejemplo.csv';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'outputs/visma/icon-template-example';
const MAPPING_DAY = clean(process.env.MAPPING_DAY || '2026-09-02');
const TODAY = new Date(process.env.MAPPING_DATE || `${MAPPING_DAY}T00:00:00-04:00`);
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = Number(process.env.VISMA_REQUEST_TIMEOUT_MS || 12000);

const username = clean(process.env.VISMA_USERNAME);
const password = clean(process.env.VISMA_PASSWORD);
const subscriptionKey = clean(process.env.VISMA_SUBSCRIPTION_KEY);

if (!username || !password || !subscriptionKey) {
  throw new Error('Set VISMA_USERNAME, VISMA_PASSWORD and VISMA_SUBSCRIPTION_KEY in the environment.');
}

const templateText = await readFile(SOURCE_TEMPLATE, 'utf8');
const templateRows = parseCsv(templateText.replace(/^\uFEFF/, ''), ';');
const noteRow = templateRows[0] || [];
const headers = templateRows[1] || [];
const sampleRows = templateRows.slice(2).filter((row) => row.some((value) => clean(value)));
const mandatoryCandidates = inferMandatoryCandidates(headers, sampleRows);

const token = await loginToVisma();
const employeeList = await getRaetJson(`/vlwebapi/employees?page=1&pageSize=500&active=true`);
const baseEmployees = Array.isArray(employeeList?.values) ? employeeList.values : [];
const employees = await mapWithConcurrency(baseEmployees, CONCURRENCY, loadEmployee);

const mappedRows = employees.map(mapEmployeeToTemplateRow);
const coverage = buildCoverage(mappedRows);
const mappingRows = buildMappingRows(coverage, mandatoryCandidates);

await mkdir(OUTPUT_DIR, { recursive: true });
const loadPath = `${OUTPUT_DIR}/icon_carga_empleados_ejemplo_${MAPPING_DAY}.csv`;
const mappingPath = `${OUTPUT_DIR}/icon_mapeo_columnas_ejemplo_${MAPPING_DAY}.csv`;
const rawPath = `${OUTPUT_DIR}/icon_visma_empleados_normalizados_${MAPPING_DAY}.json`;

await writeFile(loadPath, stringifyCsv([noteRow, headers, ...mappedRows], ';'), 'utf8');
await writeFile(mappingPath, stringifyCsv([
  ['Columna', 'Obligatoria inferida', 'Estado mapeo', 'Origen VISMA / regla', 'Cobertura', 'Notas'],
  ...mappingRows,
], ';'), 'utf8');
await writeFile(rawPath, JSON.stringify({ tenantId: TENANT_ID, count: employees.length, employees }, null, 2), 'utf8');

console.log(JSON.stringify({
  ok: true,
  tenantId: TENANT_ID,
  employees: employees.length,
  loadPath,
  mappingPath,
  rawPath,
  mappingDay: MAPPING_DAY,
  mandatoryCandidates: mandatoryCandidates.length,
  mappedMandatory: mappingRows.filter((row) => row[1] === 'SI' && row[2].startsWith('Mapeado')).length,
  pendingMandatory: mappingRows.filter((row) => row[1] === 'SI' && !row[2].startsWith('Mapeado')).length,
}, null, 2));

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
    },
    body,
  });
  const payload = await parseResponse(response);
  const token = payload?.access_token;

  if (!token) {
    throw new Error('VISMA did not return an access token.');
  }

  return token;
}

async function loadEmployee(employee, index) {
  const employeeRef = employee.externalId || `rh-${employee.id}`;
  const [detail, addresses, phones, phases, structures, bankAccounts, emails, contactPhones] = await Promise.all([
    getRaetJson(`/vlwebapi/employees/${encodeURIComponent(employeeRef)}`).catch(() => employee),
    getRaetJson(`/vlwebapi/employees/${encodeURIComponent(employeeRef)}/addresses?page=1&pageSize=5`).catch(() => null),
    getRaetJson(`/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phones?page=1&pageSize=5`).catch(() => null),
    getRaetJson(`/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phases?page=1&pageSize=5&active=true`).catch(() => null),
    getRaetJson(`/vlwebapi/employees/${encodeURIComponent(employeeRef)}/structures?page=1&pageSize=80`).catch(() => null),
    getRaetJson(`/vlwebapi/employees/${encodeURIComponent(employeeRef)}/bank-accounts?active=true`).catch(() => null),
    employee.id
      ? getTenantJson(`/contact/api/emails?idEntity=${encodeURIComponent(employee.id)}&idEntityType=1`).catch(() => [])
      : [],
    employee.id
      ? getTenantJson(`/contact/api/phones?idEntity=${encodeURIComponent(employee.id)}&idEntityType=1`).catch(() => [])
      : [],
  ]);

  const allStructures = arrayValues(structures);
  const activeStructures = allStructures
    .filter((structure) => isCurrent(structure.dateFrom, structure.dateTo))
    .sort((left, right) => String(right.dateFrom || '').localeCompare(String(left.dateFrom || '')));
  const getStructure = (typeId) => activeStructures.find((structure) => String(structure.type?.id || '') === String(typeId)) || null;
  const merged = { ...employee, ...detail };
  const emailsList = Array.isArray(emails) ? emails : [];
  const laboralEmail = clean(emailsList.find((item) => normalize(item?.type?.description).includes('laboral'))?.description) || clean(merged.email);
  const personalEmail = clean(emailsList.find((item) => normalize(item?.type?.description).includes('personal'))?.description);
  const phoneList = [...arrayValues(phones), ...(Array.isArray(contactPhones) ? contactPhones : [])];

  return {
    rowNumber: index + 1,
    id: merged.id,
    fileNumber: clean(merged.externalId),
    rut: clean(findMainDocument(merged)) || clean(merged.externalId),
    firstName: clean(merged.firstName),
    middleName: clean(merged.middleName),
    lastName: clean(merged.lastName),
    familyName: clean(merged.familyName),
    genre: clean(merged.genre),
    dateOfBirth: clean(merged.dateOfBirth),
    maritalStatus: clean(merged.maritalStatus?.description),
    nationality: clean(findDefaultNationality(merged)),
    isActive: merged.isActive !== false,
    hiringDate: clean(merged.hiringDate),
    address: firstItem(addresses),
    phone: clean(firstPhone(phoneList)),
    phase: firstCurrent(arrayValues(phases)),
    company: getStructure(10),
    contract: getStructure(18),
    afp: getStructure(15),
    health: getStructure(17),
    position: getStructure(4),
    costCenter: getStructure(5),
    department: getStructure(9),
    heavyWork: getStructure(301),
    afc: getStructure(311),
    pensionSystem: getStructure(42),
    workdayLre: getStructure(306),
    employeeType: getStructure(31),
    bankAccount: firstItem(bankAccounts),
    laboralEmail,
    personalEmail: personalEmail && personalEmail !== laboralEmail ? personalEmail : '',
    structures: activeStructures.map((structure) => ({
      typeId: clean(structure.type?.id),
      type: clean(structure.type?.description),
      description: clean(structure.description),
      structureId: clean(structure.structureId),
      externalId: clean(structure.externalId),
      dateFrom: clean(structure.dateFrom),
      dateTo: clean(structure.dateTo),
    })),
  };
}

async function getRaetJson(path) {
  return getVismaJson(path, 'X-RAET-Tenant-Id');
}

async function getTenantJson(path) {
  return getVismaJson(path, 'X-Tenant-Id');
}

async function getVismaJson(path, tenantHeaderName) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  headers[tenantHeaderName] = TENANT_ID;

  if (tenantHeaderName === 'X-Tenant-Id') {
    headers['Ocp-Apim-Subscription-Key'] = subscriptionKey;
  }

  const response = await fetchWithTimeout(`${BASE_URL}${path}`, { headers });
  return parseResponse(response, path);
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

async function parseResponse(response, path = '') {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${path || response.url}: HTTP ${response.status} ${text.slice(0, 180)}`);
  }

  return payload;
}

function mapEmployeeToTemplateRow(employee) {
  const output = headers.map(() => '');
  const set = (header, value) => {
    const index = headers.indexOf(header);
    if (index >= 0) {
      output[index] = clean(value);
    }
  };
  const phase = employee.phase || {};
  const bank = employee.bankAccount || {};
  const address = employee.address || {};
  const healthId = mapHealth(employee.health?.description);
  const contractName = clean(employee.contract?.description);
  const startDate = clean(phase.startDate) || employee.hiringDate;

  set('Id empleado', employee.rut);
  set('Situación', employee.isActive ? 'A' : 'A');
  set('Nombres', [employee.firstName, employee.middleName].filter(Boolean).join(' '));
  set('Apellido paterno', employee.lastName);
  set('Apellido materno', employee.familyName === '.' ? '' : employee.familyName);
  set('Sexo', mapGenre(employee.genre));
  set('Fecha de nacimiento', formatDate(employee.dateOfBirth));
  set('Estado civil', mapMaritalStatus(employee.maritalStatus));
  set('Numero de teléfono 1', employee.phone);
  set('Ciudad', clean(address.city));
  set('Region', clean(address.zone || address.state));
  set('Nombre Calle', clean(address.street));
  set('Numero Calle', clean(address.houseNumber));
  set('Id nación', mapNationality(employee.nationality));
  set('Email institucional', employee.laboralEmail);
  set('Email personal', employee.personalEmail);
  set('Id banco', mapBank(bank.bankCode));
  set('Cuenta del banco', clean(bank.accountNumber || bank.cbuNumber));
  set('Id forma de pago', mapPaymentMethod(bank.paymentMethod));
  set('Id AFP', mapAfp(employee.afp?.description));
  set('Estado de jubilación', '0');
  set('¿Es expatriado?', normalize(employee.employeeType?.description).includes('extranjero') ? 'S' : 'N');
  set('Sistema de pensiones', 'N');
  set('Id institución de salud', healthId);
  set('Monto cotizado en la Isapre en UF', healthId === 'fonasa' ? '0' : '');
  set('Moneda de la cotización', healthId === 'fonasa' ? '%' : '');
  set('Número del contrato', clean(employee.fileNumber) || 'C');
  set('Nombre del contrato', contractName || 'Contrato VISMA');
  set('Tipo del contrato', mapContractType(contractName, phase.endDate));
  set('Fecha de inicio del contrato', formatDate(startDate));
  set('Fecha de término del contrato', formatDate(phase.endDate));
  set('Cargo', clean(employee.position?.description));
  set('Id centro de costo', clean(employee.costCenter?.description));
  set('Id sede donde se desempeña', clean(employee.department?.description));
  set('¿Realiza trabajo pesado?', normalize(employee.heavyWork?.description).includes('no') ? 'N' : '');
  set('¿Cotiza seguro de cesantía?', normalize(employee.afc?.description).includes('si') ? 'S' : 'N');
  set('Fecha de incorporación al seguro de cesantía', formatDate(startDate));
  set('Id empresa', clean(employee.company?.externalId || employee.company?.structureId));
  set('Fecha de reconocimiento de vacaciones', formatDate(clean(phase.recognizedStartDate) || startDate));
  set('¿Cotiza previsión y salud?', 'S');
  set('Empleado con perfil privado', 'N');
  set('Modalidad del contrato', 'C');
  set('Sin Observaciones', 'S');
  set('¿Es Reemplazo?', 'N');
  set('¿Afecto a trato?', 'N');
  set('Fecha de inicio de vacaciones', formatDate(startDate));

  return output;
}

function buildMappingRows(coverage, mandatoryCandidates) {
  const mandatorySet = new Set(mandatoryCandidates);
  const rules = {
    'Id empleado': ['Mapeado directo', 'nationalIdentificationNumbers.number / externalId', 'RUT desde VISMA.'],
    'Situación': ['Mapeado por regla', 'isActive => A', 'Se conserva A para carga activa segun la plantilla ejemplo.'],
    Nombres: ['Mapeado directo', 'firstName + middleName', ''],
    'Apellido paterno': ['Mapeado directo', 'lastName', ''],
    'Apellido materno': ['Mapeado directo', 'familyName', ''],
    Sexo: ['Mapeado por regla', 'genre Female/Male => F/M', ''],
    'Fecha de nacimiento': ['Mapeado directo', 'dateOfBirth', 'Convertido a dd/mm/yyyy.'],
    'Estado civil': ['Mapeado por regla', 'maritalStatus.description', 'CASADO/SOLTERO/DIVORCIADO/VIUDO => C/S/D/V.'],
    'Numero de teléfono 1': ['Mapeado si existe', 'contact phones / employee phones', 'En la muestra VISMA casi no trae telefonos.'],
    Comuna: ['Pendiente catalogo', 'address', 'VISMA entrega ciudad/region textual, no codigo de comuna del archivo destino.'],
    Ciudad: ['Mapeado textual', 'address.city', 'Validar si el archivo destino exige slug/codigo.'],
    Region: ['Mapeado textual', 'address.zone/state', 'Validar si el archivo destino exige codigo numerico.'],
    'Nombre Calle': ['Mapeado directo', 'address.street', ''],
    'Numero Calle': ['Mapeado directo', 'address.houseNumber', ''],
    'Id nación': ['Mapeado por regla', 'nationalities.default => chile', ''],
    'Email institucional': ['Mapeado directo', 'contact emails Laboral / employee.email', ''],
    'Email personal': ['Mapeado si existe', 'contact emails Personal', ''],
    'Id banco': ['Mapeado por alias', 'bank-accounts.bankCode', 'Validar contra catalogo del archivo destino.'],
    'Cuenta del banco': ['Mapeado directo', 'bank-accounts.accountNumber', ''],
    'Id forma de pago': ['Mapeado por alias', 'bank-accounts.paymentMethod', 'Cuenta corriente/vista/ahorro.'],
    'Id AFP': ['Mapeado por alias', 'estructura 15 ADM. FONDOS PENSION vigente', ''],
    'Estado de jubilación': ['Mapeado por default', '0', 'No se detecto dato especifico vigente.'],
    '¿Es expatriado?': ['Mapeado por regla', 'estructura TIPO TRABAJADOR', ''],
    'Sistema de pensiones': ['Mapeado por default', 'N', 'Mismo criterio usado en conector actual.'],
    'Id institución de salud': ['Mapeado por alias', 'estructura 17 INSTITUCION DE SALUD vigente', ''],
    'Monto cotizado en la Isapre en UF': ['Pendiente dato VISMA', 'No disponible en endpoints consultados', 'Para Isapre requiere monto pactado.'],
    'Moneda de la cotización': ['Mapeado parcial', 'fonasa => %', 'Para Isapre queda pendiente junto al monto.'],
    'Número del contrato': ['Mapeado por regla', 'externalId', 'Validar si el archivo destino espera correlativo propio.'],
    'Nombre del contrato': ['Mapeado directo', 'estructura CONTRATO vigente', ''],
    'Tipo del contrato': ['Mapeado por alias', 'CONTRATO INDEFINIDO => I', ''],
    'Fecha de inicio del contrato': ['Mapeado directo', 'phase.startDate / hiringDate', ''],
    'Fecha de término del contrato': ['Mapeado directo si existe', 'phase.endDate', ''],
    'Sueldo base': ['Pendiente dato VISMA', 'No disponible en endpoints consultados', 'El endpoint de fases indica salary=true, pero no entrega monto.'],
    Cargo: ['Mapeado textual', 'estructura CARGO vigente', 'Requiere catalogo/homologacion si el destino espera ID.'],
    'Id centro de costo': ['Mapeado textual', 'estructura CENTRO DE COSTO vigente', 'Requiere homologacion si el destino usa IDs propios.'],
    'Id sede donde se desempeña': ['Mapeado textual', 'estructura DEPARTAMENTO vigente', 'Requiere homologacion si el destino usa IDs propios.'],
    '¿Realiza trabajo pesado?': ['Mapeado por regla', 'estructura TRABAJO PESADO', 'NO APLICA => N.'],
    'Id sindicato': ['Pendiente dato VISMA', 'No detectado en estructuras ICON consultadas', ''],
    '¿Jornada parcial?': ['Pendiente dato VISMA', 'Jornada/horas no disponible en endpoints consultados', ''],
    'Horas de trabajo semanales': ['Pendiente dato VISMA', 'Jornada/horas no disponible en endpoints consultados', ''],
    'Distribución de jornada': ['Pendiente catalogo', 'No disponible', ''],
    '¿Cotiza seguro de cesantía?': ['Mapeado por regla', 'estructura AFC - LRE', 'SI/NO => S/N.'],
    'Fecha de incorporación al seguro de cesantía': ['Mapeado por regla', 'Fecha inicio contrato', 'Validar si existe fecha AFC especifica.'],
    'Id empresa': ['Mapeado parcial', 'EMPRESA.externalId / structureId', 'Puede requerir ID de empresa del sistema destino, no VISMA.'],
    'Fecha de reconocimiento de vacaciones': ['Mapeado por regla', 'recognizedStartDate / startDate', 'VISMA devuelve recognizedStartDate como booleano en algunos casos; se usa inicio si no hay fecha.'],
    '¿Cotiza previsión y salud?': ['Mapeado por default', 'S', ''],
    'Empleado con perfil privado': ['Mapeado por default', 'N', ''],
    'Modalidad del contrato': ['Mapeado por default', 'C', 'Validar catalogo del archivo destino.'],
    'Sin Observaciones': ['Mapeado por default', 'S', ''],
    '¿Es Reemplazo?': ['Mapeado por default', 'N', ''],
    '¿Afecto a trato?': ['Mapeado por default', 'N', ''],
    'Fecha de inicio de vacaciones': ['Mapeado por regla', 'Fecha inicio contrato', ''],
  };

  return headers.map((header) => {
    const rule = rules[header] || ['Sin mapeo', '', 'No se identifico origen VISMA confiable.'];
    const count = coverage.get(header) || 0;
    return [
      header,
      mandatorySet.has(header) ? 'SI' : 'NO',
      rule[0],
      rule[1],
      `${count}/${mappedRows.length}`,
      rule[2],
    ];
  });
}

function buildCoverage(rows) {
  const coverage = new Map();
  headers.forEach((header, index) => {
    coverage.set(header, rows.filter((row) => clean(row[index])).length);
  });
  return coverage;
}

function inferMandatoryCandidates(headersList, rows) {
  if (!rows.length) {
    return [];
  }

  return headersList.filter((_, index) => rows.every((row) => clean(row[index])));
}

function findMainDocument(employee) {
  const documents = Array.isArray(employee.nationalIdentificationNumbers) ? employee.nationalIdentificationNumbers : [];
  return clean((documents.find((item) => item.mainDocument) || documents[0])?.number);
}

function findDefaultNationality(employee) {
  const nationalities = Array.isArray(employee.nationalities) ? employee.nationalities : [];
  const nationality = nationalities.find((item) => item.isDefault) || nationalities[0];
  return clean(nationality?.description || nationality?.externalDescription);
}

function firstCurrent(items) {
  return items
    .filter((item) => isCurrent(item.startDate || item.dateFrom, item.endDate || item.dateTo))
    .sort((left, right) => String(right.startDate || right.dateFrom || '').localeCompare(String(left.startDate || left.dateFrom || '')))[0] || items[0] || null;
}

function isCurrent(dateFrom, dateTo) {
  const from = dateFrom ? new Date(`${String(dateFrom).slice(0, 10)}T00:00:00-04:00`) : null;
  const to = dateTo ? new Date(`${String(dateTo).slice(0, 10)}T23:59:59-04:00`) : null;

  return (!from || from <= TODAY) && (!to || to >= TODAY);
}

function firstPhone(items) {
  const phone = items.find((item) => clean(item.number || item.phoneNumber || item.description));
  return phone?.number || phone?.phoneNumber || phone?.description || '';
}

function firstItem(payload) {
  return arrayValues(payload)[0] || null;
}

function arrayValues(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.values)) return payload.values;
  if (Array.isArray(payload?.paginationList)) return payload.paginationList;
  if (Array.isArray(payload?.paginatedList)) return payload.paginatedList;
  return [];
}

function mapGenre(value) {
  const normalized = normalize(value);
  if (normalized.startsWith('female') || normalized.startsWith('fem')) return 'F';
  if (normalized.startsWith('male') || normalized.startsWith('mas')) return 'M';
  return '';
}

function mapMaritalStatus(value) {
  const normalized = normalize(value);
  if (normalized.includes('casado')) return 'C';
  if (normalized.includes('divorciado')) return 'D';
  if (normalized.includes('viudo')) return 'V';
  if (normalized.includes('soltero')) return 'S';
  return '';
}

function mapNationality(value) {
  return normalize(value).includes('chilen') ? 'chile' : normalize(value);
}

function mapContractType(value, endDate) {
  const normalized = normalize(value);
  if (normalized.includes('indef')) return 'I';
  if (normalized.includes('plazo') || normalized.includes('fijo')) return 'F';
  if (normalized.includes('obra') || normalized.includes('faena')) return 'O';
  return endDate ? 'F' : '';
}

function mapPaymentMethod(value) {
  const normalized = normalize(value);
  if (normalized.includes('corriente')) return 'actacorr';
  if (normalized.includes('vista')) return 'actavis';
  if (normalized.includes('ahorro')) return 'actaaho';
  if (normalized.includes('rut')) return 'cuentarut';
  if (normalized.includes('cheque')) return 'cheque';
  return normalized.replace(/\s+/g, '');
}

function mapAfp(value) {
  const normalized = normalize(value);
  if (normalized.includes('capital')) return 'capital';
  if (normalized.includes('cuprum')) return 'cuprum';
  if (normalized.includes('habitat')) return 'habitat';
  if (normalized.includes('modelo')) return 'modelo';
  if (normalized.includes('planvital')) return 'planvital';
  if (normalized.includes('provida')) return 'provida';
  if (normalized.includes('uno')) return 'uno';
  return normalized.replace(/^afp\s+/, '').replace(/\s+/g, '');
}

function mapHealth(value) {
  const normalized = normalize(value);
  if (normalized.includes('fonasa')) return 'fonasa';
  if (normalized.includes('banmedica')) return 'banmedica';
  if (normalized.includes('consalud')) return 'consalud';
  if (normalized.includes('cruz')) return 'cruzblanca';
  if (normalized.includes('colmena')) return 'colmena';
  if (normalized.includes('vida tres') || normalized.includes('vidatres')) return 'vidatres';
  if (normalized.includes('nueva mas vida')) return 'nuevamasvida';
  return normalized.replace(/^isapre\s+/, '').replace(/\s+/g, '');
}

function mapBank(value) {
  const normalized = normalize(value);
  if (normalized.includes('bci')) return 'bci';
  if (normalized.includes('chile')) return 'chile';
  if (normalized.includes('estado')) return 'estado';
  if (normalized.includes('itau')) return 'itau';
  if (normalized.includes('santander')) return 'santander';
  if (normalized.includes('security')) return 'security';
  if (normalized.includes('bice')) return 'bice';
  if (normalized.includes('falabella')) return 'falabella';
  if (normalized.includes('scotiabank') || normalized.includes('desarrollo')) return 'scotiabank';
  if (normalized.includes('consorcio')) return 'consorcio';
  if (normalized.includes('banefe')) return 'banefe';
  return normalized.replace(/^banco\s+/, '').replace(/\s+/g, '');
}

function formatDate(value) {
  const raw = clean(value);
  if (!raw || raw === 'true') return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function mapWithConcurrency(items, concurrency, mapper) {
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

function parseCsv(text, separator) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === separator) {
      row.push(value);
      value = '';
      continue;
    }

    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += character;
  }

  row.push(value);
  rows.push(row);
  return rows;
}

function stringifyCsv(rows, separator) {
  return rows.map((row) => row.map((value) => csvEscape(value, separator)).join(separator)).join('\r\n');
}

function csvEscape(value, separator) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(separator)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
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
