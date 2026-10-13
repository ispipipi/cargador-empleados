import { cleanNamePart, cleanValue, findMainDocument, normalizeLookupText } from './shared.js';
import { vismaLabel } from './organizations.js';

export function buildVismaLeaveEmployeeLookup(employees, companyId, companyTypeId) {
  const lookup = new Map();
  const normalizedCompanyId = normalizeLookupText(companyId);
  const normalizedCompanyTypeId = normalizeLookupText(companyTypeId);

  for (const employee of Array.isArray(employees) ? employees : []) {
    const structures = Array.isArray(employee.__structures) ? employee.__structures : [];
    const companyMatches = !normalizedCompanyId || structures.some((structure) => {
      const typeMatches = !normalizedCompanyTypeId
        || normalizeLookupText(structure.typeId ?? structure.structureTypeId ?? structure.type?.id) === normalizedCompanyTypeId;
      const candidates = [structure.id, structure.externalId, structure.name, structure.description]
        .map(normalizeLookupText)
        .filter(Boolean);
      return typeMatches && candidates.includes(normalizedCompanyId);
    }) || [employee.companyId, employee.companyExternalId]
      .map(normalizeLookupText)
      .includes(normalizedCompanyId);
    const normalized = {
      rut: findMainDocument(employee),
      name: [employee.firstName, employee.middleName, employee.lastName, employee.familyName]
        .map(cleanNamePart)
        .filter(Boolean)
        .join(' '),
      companyMatches,
    };
    const keys = [
      employee.id,
      employee.employeeId,
      employee.externalId,
      employee.fileNumber,
      normalized.rut,
    ].map(normalizeLeaveLookupKey).filter(Boolean);

    keys.forEach((key) => lookup.set(key, normalized));
  }

  return lookup;
}

export function buildVismaLeaveTypeLookup(types) {
  const lookup = new Map();

  for (const type of Array.isArray(types) ? types : []) {
    const id = normalizeLeaveLookupKey(type?.id ?? type?.typeLeaveId ?? type?.externalId ?? type?.code);
    const description = cleanValue(type?.description ?? type?.name ?? type?.typeLeaveDescription ?? type?.label);
    if (id && description) {
      lookup.set(id, vismaLabel(description));
    }
  }

  return lookup;
}

export function normalizeVismaLeave(leave, employeeLookup, leaveTypeLookup = new Map()) {
  const data = leave?.data && typeof leave.data === 'object' ? leave.data : {};
  const employee = leave?.employee || leave?.employeeData || leave?.person || {};
  const typeLeaveId = cleanValue(leave?.typeLeaveId ?? data.typeLeaveId ?? leave?.leaveTypeId);
  const employeeKey = normalizeLeaveLookupKey(
    leave?.employeeExternalId
      ?? leave?.employeeId
      ?? data.employeeExternalId
      ?? data.employeeId
      ?? leave?.externalEmployeeId
      ?? leave?.employeeFileNumber
      ?? employee?.externalId
      ?? employee?.id
      ?? leave?.rut
      ?? leave?.documentNumber,
  );
  const employeeInfo = employeeLookup.get(employeeKey) || {};
  const startDate = cleanValue(
    leave?.startDate
      ?? leave?.dateFrom
      ?? data.dateFrom
      ?? leave?.fromDate
      ?? leave?.startingDate
      ?? leave?.beginDate,
  );
  const endDate = cleanValue(
    leave?.endDate
      ?? leave?.dateTo
      ?? data.dateTo
      ?? leave?.toDate
      ?? leave?.endingDate
      ?? leave?.finishDate
      ?? startDate,
  );

  return {
    rut: cleanValue(leave?.rut ?? leave?.employeeRut ?? leave?.documentNumber ?? data.rut ?? data.employeeRut ?? employeeInfo.rut),
    employeeId: cleanValue(leave?.employeeId ?? data.employeeId ?? employee?.id),
    employeeExternalId: cleanValue(leave?.employeeExternalId ?? data.employeeExternalId ?? leave?.externalEmployeeId ?? employee?.externalId),
    name: cleanValue(leave?.employeeName ?? data.employeeName ?? employee?.name ?? employeeInfo.name),
    typeLeaveId,
    type: vismaLabel(
      leave?.leaveType
        ?? leave?.absenceType
        ?? leave?.permissionType
        ?? leave?.typeDescription
        ?? data.typeLeaveDescription
        ?? leaveTypeLookup.get(normalizeLeaveLookupKey(typeLeaveId))
        ?? leave?.description
        ?? leave?.type,
    ),
    status: vismaLabel(leave?.status ?? leave?.state ?? leave?.leaveStatus ?? data.leaveStateDescription ?? data.leaveState),
    startDate,
    endDate,
    fullDay: leave?.fullDay ?? leave?.allDay ?? leave?.isFullDay ?? data.dayType ?? null,
    folio: cleanValue(leave?.folio ?? leave?.folioNumber ?? leave?.licenseNumber ?? data.folio),
    folioDate: cleanValue(leave?.folioDate ?? leave?.licenseDate ?? data.folioDate),
    observations: cleanValue(leave?.observations ?? leave?.observation ?? leave?.comments ?? data.observations),
    companyMatches: employeeInfo.companyMatches === true,
  };
}

function normalizeLeaveLookupKey(value) {
  return normalizeLookupText(String(value ?? '').replace(/[^0-9a-z]/gi, ''));
}

function parseLeaveDate(value) {
  const text = cleanValue(value);
  if (!text) {
    return null;
  }

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  }

  const localDate = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (localDate) {
    return Date.UTC(Number(localDate[3]), Number(localDate[2]) - 1, Number(localDate[1]));
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

export function datesOverlapRange(startDate, endDate, rangeStart, rangeEnd) {
  const start = parseLeaveDate(startDate);
  const end = parseLeaveDate(endDate || startDate);
  const from = parseLeaveDate(rangeStart);
  const to = parseLeaveDate(rangeEnd);
  return start !== null && end !== null && from !== null && to !== null && start <= to && end >= from;
}

export function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function isMedicalLeaveType(type) {
  return normalizeLookupText(type).includes('licencia') || normalizeLookupText(type).includes('medical');
}

export function isPermissionLeaveType(type) {
  return normalizeLookupText(type).includes('permiso');
}

export function isAbsenceLeaveType(type) {
  return normalizeLookupText(type).includes('ausencia') || normalizeLookupText(type).includes('inasistencia');
}
