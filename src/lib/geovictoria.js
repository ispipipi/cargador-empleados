import * as XLSX from 'xlsx';
import { cleanCell, normalizeText } from './utils.js';

export const GEOVICTORIA_CONCEPTS = {
  overtime: 'hheee50',
  delay: 'minatrasos',
  absence: 'faltaDias',
};

export const REX_CONCEPT_DETAIL_HEADERS = [
  'Plantilla',
  'Contrato',
  'Concepto',
  'Valor',
  'Origen',
  'Objeto',
  'Periodo de pago',
  'Fecha de inicio',
  'Fecha de término',
  'Institución',
  'Dato adicional',
  'Comentario',
  'Valor Por Defecto',
  'Centro Costo',
  'Acción',
  'Consolidable',
];

const CASE_LABELS = {
  overtime: 'Horas extra',
  delay: 'Atrasos',
  absence: 'Inasistencias',
};

export function buildGeovictoriaReviewModel({ users = [], attendanceBook = null, overtime = null, startDate, endDate }) {
  const userRows = Array.isArray(users) ? users : [];
  const attendanceUsers = Array.isArray(attendanceBook?.Users) ? attendanceBook.Users : [];
  const overtimeRows = normalizeOvertimeRows(overtime);
  const usersByIdentifier = buildUsersByIdentifier(userRows, attendanceUsers);
  const attendanceCases = buildAttendanceCases(attendanceUsers, usersByIdentifier, { startDate, endDate });
  const overtimeCases = buildOvertimeCases(overtimeRows, attendanceUsers, usersByIdentifier, { startDate, endDate });
  const cases = [...overtimeCases, ...attendanceCases]
    .filter((item) => Number(item.value) > 0)
    .sort(sortCases);
  const summary = summarizeCases(cases, usersByIdentifier.size);

  return {
    cases,
    summary,
    users: [...usersByIdentifier.values()],
    period: { startDate, endDate },
    fetchedAt: new Date().toISOString(),
  };
}

export function buildRexConceptDetailWorkbook({ cases }) {
  const approvedCases = cases.filter((item) => item.approved);
  const exportRows = mergeApprovedCases(approvedCases).map((item) => buildRexRow(item));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    REX_CONCEPT_DETAIL_HEADERS,
    ...exportRows.map((row) => REX_CONCEPT_DETAIL_HEADERS.map((header) => row[header] ?? '')),
  ]);

  sheet['!cols'] = [
    { wch: 15 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 34 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
  ];
  sheet['!autofilter'] = { ref: `A1:P${Math.max(1, exportRows.length + 1)}` };

  XLSX.utils.book_append_sheet(workbook, sheet, 'Ejemplo de importación');
  return workbook;
}

export function formatDecimalHours(value, digits = 2) {
  const numericValue = Number(value) || 0;
  return numericValue.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '.0');
}

export function formatCaseValue(item) {
  if (item.type === 'absence') {
    return String(Math.max(0, Math.min(30, Math.trunc(Number(item.value) || 0))));
  }

  return formatDecimalHours(item.value);
}

export function caseTypeLabel(type) {
  return CASE_LABELS[type] ?? type;
}

function buildAttendanceCases(attendanceUsers, usersByIdentifier, { startDate, endDate }) {
  return attendanceUsers.flatMap((attendanceUser) => {
    const user = resolveUser(attendanceUser.Identifier, usersByIdentifier, attendanceUser);
    const intervals = flattenIntervals(attendanceUser);
    const delayHours = intervals.reduce((total, interval) => total + intervalDelayHours(interval), 0);
    const absenceDays = intervals.filter((interval) => isTrue(interval.Absent)).length || Number(attendanceUser.Absent) || 0;
    const cases = [];

    if (delayHours > 0) {
      cases.push({
        id: `delay:${user.identifier}`,
        type: 'delay',
        concept: GEOVICTORIA_CONCEPTS.delay,
        identifier: user.identifier,
        employeeName: user.fullName,
        costCenter: user.costCenter,
        metadata: buildCaseMetadata(user),
        periodLabel: `${startDate} al ${endDate}`,
        value: roundHours(delayHours),
        approved: false,
        severity: delayHours >= 2 ? 'high' : delayHours >= 1 ? 'medium' : 'low',
        rankValue: delayHours,
        source: 'AttendanceBook',
        notes: 'Atraso de entrada y colacion expresado como horas decimales.',
      });
    }

    if (absenceDays > 0) {
      const normalizedAbsences = Math.max(0, Math.min(30, Math.trunc(absenceDays)));
      cases.push({
        id: `absence:${user.identifier}`,
        type: 'absence',
        concept: GEOVICTORIA_CONCEPTS.absence,
        identifier: user.identifier,
        employeeName: user.fullName,
        costCenter: user.costCenter,
        metadata: buildCaseMetadata(user),
        periodLabel: `${startDate} al ${endDate}`,
        value: normalizedAbsences,
        approved: false,
        severity: normalizedAbsences >= 3 ? 'high' : normalizedAbsences >= 2 ? 'medium' : 'low',
        rankValue: normalizedAbsences,
        source: 'AttendanceBook',
        notes: absenceDays > 30 ? 'GeoVictoria reporto mas de 30 dias; se limita a 30 para Rex+.' : 'Dias de inasistencia del periodo.',
      });
    }

    return cases;
  });
}

function buildOvertimeCases(overtimeRows, attendanceUsers, usersByIdentifier, { startDate, endDate }) {
  const sourceRows = overtimeRows.length > 0 ? overtimeRows : buildOvertimeRowsFromAttendance(attendanceUsers);
  const byEmployeeWeek = new Map();

  sourceRows.forEach((row) => {
    const identifier = cleanCell(row.UserIdentifier ?? row.Identifier);
    if (!identifier) {
      return;
    }

    const date = parseGeovictoriaDate(row.Date) || parseIsoDate(startDate);
    const week = getIsoWeekRange(date);
    const detectedHours =
      parseDecimal(row.ExtraTimeBefore) +
      parseDecimal(row.ExtraTimeAfter) +
      parseHours(row.TotalAuthorizedOvertime) +
      parseObjectHours(row.AccomplishedExtraTime);
    const approvedHours =
      parseDecimal(row.ApprovedOvertimeBefore) +
      parseDecimal(row.ApprovedOvertimeAfter) +
      parseHours(row.TotalAuthorizedOvertime);
    const hours = detectedHours || approvedHours;

    if (!hours) {
      return;
    }

    const key = `${identifier}:${week.key}`;
    const current = byEmployeeWeek.get(key) ?? {
      identifier,
      week,
      value: 0,
      alreadyApprovedHours: 0,
      source: overtimeRows.length > 0 ? 'OverTime/GetOvertime' : 'AttendanceBook',
    };

    current.value += hours;
    current.alreadyApprovedHours += approvedHours;
    byEmployeeWeek.set(key, current);
  });

  return [...byEmployeeWeek.values()].map((entry) => {
    const user = resolveUser(entry.identifier, usersByIdentifier, {});
    const value = roundHours(entry.value);

    return {
      id: `overtime:${entry.identifier}:${entry.week.key}`,
      type: 'overtime',
      concept: GEOVICTORIA_CONCEPTS.overtime,
      identifier: user.identifier,
      employeeName: user.fullName,
      costCenter: user.costCenter,
      metadata: buildCaseMetadata(user),
      periodLabel: `${entry.week.start} al ${entry.week.end}`,
      value,
      approved: false,
      severity: value > 10 ? 'high' : value >= 5 ? 'medium' : 'low',
      rankValue: value,
      source: entry.source,
      notes: value > 10
        ? 'Supera 10 horas extra semanales.'
        : entry.alreadyApprovedHours > 0
          ? `${formatDecimalHours(entry.alreadyApprovedHours)} horas ya venian aprobadas en GeoVictoria.`
          : 'Horas extra semanales detectadas.',
    };
  });
}

function buildOvertimeRowsFromAttendance(attendanceUsers) {
  return attendanceUsers.flatMap((attendanceUser) =>
    flattenIntervals(attendanceUser).map((interval) => ({
      ...interval,
      UserIdentifier: attendanceUser.Identifier,
    })),
  );
}

function mergeApprovedCases(cases) {
  const byKey = new Map();

  cases.forEach((item) => {
    const key = `${item.identifier}:${item.concept}`;
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, { ...item });
      return;
    }

    byKey.set(key, {
      ...current,
      value: item.type === 'absence'
        ? Math.min(30, (Number(current.value) || 0) + (Number(item.value) || 0))
        : roundHours((Number(current.value) || 0) + (Number(item.value) || 0)),
      periodLabel: current.periodLabel === item.periodLabel ? current.periodLabel : 'Periodo aprobado',
      notes: 'Consolidado desde casos aprobados.',
    });
  });

  return [...byKey.values()].sort((left, right) =>
    left.identifier.localeCompare(right.identifier) || left.concept.localeCompare(right.concept),
  );
}

function buildRexRow(item) {
  return {
    Plantilla: item.identifier,
    Contrato: 1,
    Concepto: item.concept,
    Valor: formatCaseValue(item),
    Origen: 'M',
    Objeto: '',
    'Periodo de pago': 'M',
    'Fecha de inicio': '',
    'Fecha de término': '',
    Institución: '',
    'Dato adicional': '',
    Comentario: `${caseTypeLabel(item.type)} GeoVictoria ${item.periodLabel}`,
    'Valor Por Defecto': '',
    'Centro Costo': item.costCenter,
    Acción: 'M',
    Consolidable: 'No',
  };
}

function summarizeCases(cases, userCount) {
  const approved = cases.filter((item) => item.approved);

  return {
    userCount,
    totalCases: cases.length,
    approvedCases: approved.length,
    highRiskCases: cases.filter((item) => item.severity === 'high').length,
    overtimeHours: roundHours(sumByType(cases, 'overtime')),
    delayHours: roundHours(sumByType(cases, 'delay')),
    absenceDays: Math.trunc(sumByType(cases, 'absence')),
  };
}

function sumByType(cases, type) {
  return cases
    .filter((item) => item.type === type)
    .reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function buildUsersByIdentifier(users, attendanceUsers) {
  const lookup = new Map();

  [...users, ...attendanceUsers].forEach((user) => {
    const identifier = cleanCell(user.Identifier ?? user.UserIdentifier);
    if (!identifier) {
      return;
    }

    lookup.set(identifier, normalizeUser(user, lookup.get(identifier)));
  });

  return lookup;
}

function normalizeUser(user, current = {}) {
  const identifier = cleanCell(user.Identifier ?? user.UserIdentifier ?? current.identifier);
  const name = cleanCell(user.Name ?? current.name);
  const lastName = cleanCell(user.LastName ?? current.lastName);
  const fullName = cleanCell(`${name} ${lastName}`) || cleanCell(user.FullName ?? current.fullName) || identifier;

  return {
    ...current,
    identifier,
    name,
    lastName,
    fullName,
    company: firstCleanValue(user, current, ['CompanyName', 'Company', 'EnterpriseName', 'Enterprise', 'EmployerName', 'BusinessName']),
    group: firstCleanValue(user, current, ['GroupDescription', 'GroupName', 'Group']),
    area: firstCleanValue(user, current, ['AreaDescription', 'AreaName', 'Area']),
    department: firstCleanValue(user, current, ['DepartmentDescription', 'DepartmentName', 'Department']),
    costCenter: firstCleanValue(user, current, ['CostCenterDescription', 'CostCenterName', 'CostCenterCode', 'CostCenter']),
    location: firstCleanValue(user, current, ['LocationDescription', 'LocationName', 'Location', 'BranchName', 'Branch']),
  };
}

function buildCaseMetadata(user) {
  return {
    company: user.company,
    group: user.group,
    area: user.area,
    department: user.department,
    costCenter: user.costCenter,
    location: user.location,
  };
}

function firstCleanValue(source, current, keys) {
  const sourceValue = keys.map((key) => cleanCell(source[key])).find(Boolean);
  if (sourceValue) {
    return sourceValue;
  }

  const currentKey = keys.find((key) => Object.prototype.hasOwnProperty.call(current, normalizeMetadataKey(key)));
  if (currentKey) {
    return cleanCell(current[normalizeMetadataKey(currentKey)]);
  }

  return '';
}

function normalizeMetadataKey(key) {
  if (/company|enterprise|employer|business/i.test(key)) {
    return 'company';
  }
  if (/group/i.test(key)) {
    return 'group';
  }
  if (/area/i.test(key)) {
    return 'area';
  }
  if (/department/i.test(key)) {
    return 'department';
  }
  if (/costcenter/i.test(key)) {
    return 'costCenter';
  }
  if (/location|branch/i.test(key)) {
    return 'location';
  }
  return key;
}

function resolveUser(identifier, usersByIdentifier, fallback) {
  const normalizedIdentifier = cleanCell(identifier);
  const user = usersByIdentifier.get(normalizedIdentifier) ?? normalizeUser({ ...fallback, Identifier: normalizedIdentifier });
  if (!usersByIdentifier.has(normalizedIdentifier) && normalizedIdentifier) {
    usersByIdentifier.set(normalizedIdentifier, user);
  }
  return user;
}

function flattenIntervals(user) {
  const direct = Array.isArray(user.PlannedInterval) ? user.PlannedInterval : [];
  const weekIntervals = Object.values(user)
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((entry) => Array.isArray(entry?.PlannedInterval))
    .flatMap((entry) => entry.PlannedInterval);

  return [...direct, ...weekIntervals];
}

function normalizeOvertimeRows(overtime) {
  if (Array.isArray(overtime)) {
    return overtime;
  }

  if (Array.isArray(overtime?.Response)) {
    return overtime.Response;
  }

  return [];
}

function intervalDelayHours(interval) {
  const compensatedDelay = parseHours(interval.DelayTimeAfterCompensation);
  if (compensatedDelay > 0) {
    return compensatedDelay;
  }

  return parseHours(interval.Delay) + parseHours(interval.BreakDelay);
}

function parseObjectHours(value) {
  if (!value || typeof value !== 'object') {
    return 0;
  }

  return Object.values(value).reduce((total, item) => total + parseHours(item), 0);
}

function parseHours(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const rawValue = cleanCell(value);
  if (!rawValue) {
    return 0;
  }

  if (/^\d+([.,]\d+)?$/.test(rawValue)) {
    return parseDecimal(rawValue);
  }

  const match = rawValue.match(/^(-?\d+):(\d{1,2})$/);
  if (!match) {
    return 0;
  }

  const [, rawHours, rawMinutes] = match;
  const sign = rawHours.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(Number(rawHours)) + Number(rawMinutes) / 60);
}

function parseDecimal(value) {
  const numericValue = Number(cleanCell(value).replace(',', '.'));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function roundHours(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isTrue(value) {
  return normalizeText(value) === 'true' || value === true;
}

function parseGeovictoriaDate(value) {
  const rawValue = cleanCell(value);

  if (/^\d{14}$/.test(rawValue)) {
    return new Date(
      Number(rawValue.slice(0, 4)),
      Number(rawValue.slice(4, 6)) - 1,
      Number(rawValue.slice(6, 8)),
      Number(rawValue.slice(8, 10)),
      Number(rawValue.slice(10, 12)),
      Number(rawValue.slice(12, 14)),
    );
  }

  return parseIsoDate(rawValue);
}

function parseIsoDate(value) {
  const rawValue = cleanCell(value);
  const normalized = rawValue.includes(' ') ? rawValue.replace(' ', 'T') : rawValue;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getIsoWeekRange(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = normalized.getDay() || 7;
  const monday = new Date(normalized);
  monday.setDate(normalized.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    key: toDateString(monday),
    start: toDateString(monday),
    end: toDateString(sunday),
  };
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function sortCases(left, right) {
  return severityRank(right.severity) - severityRank(left.severity) ||
    right.rankValue - left.rankValue ||
    left.employeeName.localeCompare(right.employeeName);
}

function severityRank(severity) {
  return severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
}
