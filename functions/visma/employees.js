import { cleanNamePart, cleanValue, findMainDocument, normalizeLookupText } from './shared.js';
import {
  extractVismaHealthAmount,
  extractVismaSex,
  extractVismaYesNo,
} from './health.js';
import {
  VISMA_REX_STRUCTURE_TYPES,
  findVismaStructureByType,
  getActiveVismaStructures,
  getVismaStructureName,
  getVismaStructureTypeId,
  getVismaStructureTypeName,
} from '../visma-rex-mapping.mjs';

export function normalizeVismaEmployee({
  rowNumber,
  employee,
  tenant,
  searchEmployee,
  address,
  phones,
  phase,
  structures,
  bankAccount,
  emails,
  healthPayElement,
  catalogs,
}) {
  const documentNumber = findMainDocument(employee) || cleanValue(searchEmployee?.document);
  const organization = inferOrganizationFields(structures, catalogs);
  const structureKeys = normalizeVismaEmployeeStructureKeys(structures);
  const positionName = resolvePositionName(organization.position, catalogs.positions);
  const bankName = resolveBankName(bankAccount, catalogs.banks);
  const paymentMethodName = resolvePaymentLabel(bankAccount?.paymentMethod, catalogs.paymentMethods);
  const paymentTypeName = resolvePaymentLabel(bankAccount?.paymentType, catalogs.paymentTypes);
  const primaryEmail = cleanValue(employee.email) || cleanValue(emails.find((item) => item?.description)?.description);
  const primaryPhone = cleanValue(phones.find((item) => item?.number || item?.phoneNumber)?.number ?? phones.find((item) => item?.phoneNumber)?.phoneNumber);
  const street = cleanValue(address?.street);
  const houseNumber = cleanValue(address?.houseNumber);
  const streetAddress = [street, houseNumber].filter(Boolean).join(' ');
  const firstName = cleanNamePart(employee.firstName || searchEmployee?.name);
  const middleName = cleanNamePart(employee.middleName || searchEmployee?.secondName);
  const lastName = cleanNamePart(employee.lastName || searchEmployee?.lastName);
  const familyName = cleanNamePart(employee.familyName || searchEmployee?.secondLastName);
  const sex = extractVismaSex(employee, searchEmployee);
  const healthAmount = extractVismaHealthAmount({
    healthPayElement,
    employee,
    phase,
    healthStructure: organization.healthStructure,
  });
  const unemploymentInsuranceStatus = extractVismaYesNo(organization.unemploymentInsurance);
  const unemploymentInsuranceDate = unemploymentInsuranceStatus === 'S'
    ? cleanValue(
        organization.unemploymentInsurance?.dateFrom ??
        organization.unemploymentInsurance?.startDate ??
        organization.unemploymentInsurance?.validFrom,
      )
    : '';
  const names = [firstName, middleName].filter(Boolean).join(' ');
  const lastNames = [lastName, familyName].filter(Boolean).join(' ');

  return {
    __sourceRowNumber: rowNumber,
    'ID EMPLEADO': cleanValue(employee.externalId || searchEmployee?.fileNumber || employee.id),
    CI: documentNumber,
    NOMBRE: [names, lastNames].filter(Boolean).join(' '),
    SEXO: sex,
    EMPRESA: organization.company || cleanValue(tenant?.name || tenant?.id),
    POSICION: positionName || organization.position,
    'JOB CODE': organization.positionExternalId,
    'FECHA INGRESO': employee.hiringDate || searchEmployee?.hireDate || phase?.startDate || '',
    ESTADO: employee.isActive === false || searchEmployee?.active === false ? 'inactivo' : 'activo',
    'ESTADO CIVIL': employee.maritalStatus?.description || '',
    NACIONALIDAD: findDefaultNationality(employee),
    CELULAR: primaryPhone,
    TELEFONO: primaryPhone,
    DIRECCION: streetAddress,
    COMUNA: cleanValue(address?.city),
    UBICACION: organization.location || cleanValue(address?.city),
    'UBICACION WORKDAY': organization.location,
    'FORMA DE PAGO': paymentMethodName || paymentTypeName,
    BANCO: bankName || bankAccount?.bankCode || '',
    'N° CTA CTE': cleanValue(bankAccount?.accountNumber || bankAccount?.cbuNumber),
    AFP: organization.afp,
    ISAPRE: organization.health,
    'MONTO SALUD UF': healthAmount,
    'CODIGO AFP': '',
    'CENTRO COSTO': organization.costCenter,
    'UNIDAD DE NEGOCIOS': organization.area || organization.department,
    SINDICATO: organization.union,
    'MOTIVO RETIRO': phase?.decouplingCause?.description || phase?.decouplingCause || '',
    'TIPO REBAJA ZONA': '',
    JUBILADO: '',
    'FECHA NACIMIENTO': employee.dateOfBirth || '',
    'NOMBRE CONTRATO': phase?.status?.description || phase?.status || 'Contrato VISMA',
    'FEC FIN CONTRATO': phase?.endDate || '',
    'SUELDO BASE': extractSalaryValue(phase?.salary),
    'HORAS JORNADA': extractWeeklyHours(phase),
    'SEGURO CESANTIA': unemploymentInsuranceStatus,
    'FECHA SEGURO CESANTIA': unemploymentInsuranceDate,
    'FECHA ANTIGUEDAD': phase?.recognizedStartDate || employee.hiringDate || '',
    EMAIL: primaryEmail,
    __visma: {
      employeeId: employee.id,
      fileNumber: employee.externalId || searchEmployee?.fileNumber || '',
      companyId: organization.companyId || cleanValue(tenant?.id),
      companyExternalId: organization.companyExternalId,
      paymentMethod: paymentMethodName,
      paymentType: paymentTypeName,
      structures: structures.length,
      structureKeys,
      nameParts: {
        firstName,
        middleName,
        lastName,
        familyName,
      },
      sex,
      healthAmount,
      unemploymentInsuranceStatus,
      unemploymentInsuranceDate,
    },
  };
}

export function normalizeVismaEmployeeStructureKeys(structures) {
  return structures
    .map((structure) => ({
      typeId: getVismaStructureTypeId(structure),
      typeName: getVismaStructureTypeName(structure),
      id: cleanValue(structure.structureId ?? structure.id ?? structure.description),
      externalId: cleanValue(structure.externalId ?? structure.externalCode),
      name: getVismaStructureName(structure),
    }))
    .filter((structure) => structure.typeId || structure.id || structure.externalId || structure.name);
}

export function inferOrganizationFields(structures, catalogs) {
  const activeStructures = getActiveVismaStructures(structures);
  const byType = (typeIds, keywords = []) => findVismaStructureByType(activeStructures, typeIds, keywords);
  const company = byType(VISMA_REX_STRUCTURE_TYPES.company, ['empresa', 'razon social', 'compania', 'sociedad']);
  const location = byType(VISMA_REX_STRUCTURE_TYPES.location, ['sede', 'ubicacion', 'sucursal', 'localidad', 'lugar']);
  const costCenter = byType(VISMA_REX_STRUCTURE_TYPES.costCenter, ['centro costo', 'centro de costo', 'cost center', 'ceco']);
  const area = byType(VISMA_REX_STRUCTURE_TYPES.area, ['area', 'unidad negocio', 'unidad de negocios', 'business unit']);
  const department = byType(VISMA_REX_STRUCTURE_TYPES.department, ['departamento', 'gerencia', 'division']);
  const union = byType(VISMA_REX_STRUCTURE_TYPES.union, ['sindicato']);
  const afp = byType(VISMA_REX_STRUCTURE_TYPES.afp, ['fondos pension', 'afp']);
  const health = byType(VISMA_REX_STRUCTURE_TYPES.health, ['institucion de salud', 'salud']);
  const unemploymentInsurance = byType(
    VISMA_REX_STRUCTURE_TYPES.unemploymentInsurance,
    ['afc', 'seguro cesantia', 'seguro de cesantia'],
  );
  const position = byType(VISMA_REX_STRUCTURE_TYPES.position, ['cargo', 'posicion', 'puesto']) ||
    activeStructures.find((structure) => catalogs.positions.some((item) => String(item.structureId) === String(structure.structureId)));

  return {
    company: getVismaStructureName(company),
    companyId: cleanValue(company?.structureId || company?.id || company?.description),
    companyExternalId: cleanValue(company?.externalId),
    location: getVismaStructureName(location),
    costCenter: getVismaStructureName(costCenter),
    area: getVismaStructureName(area),
    department: getVismaStructureName(department),
    union: getVismaStructureName(union),
    afp: getVismaStructureName(afp),
    health: getVismaStructureName(health),
    healthStructure: health,
    unemploymentInsurance,
    position: getVismaStructureName(position),
    positionExternalId: cleanValue(position?.externalId),
  };
}

export function resolvePositionName(positionValue, positions) {
  const normalizedValue = normalizeLookupText(positionValue);
  if (!normalizedValue) {
    return '';
  }

  return cleanValue(
    positions.find((item) => normalizeLookupText(item.description) === normalizedValue || normalizeLookupText(item.structureId) === normalizedValue)?.description,
  );
}

export function resolveBankName(bankAccount, banks) {
  const candidates = [
    bankAccount?.bankCode,
    bankAccount?.branchCode,
    bankAccount?.branch,
    bankAccount?.debitAccountCompany,
  ].map(cleanValue).filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeLookupText(candidate);
    const bank = banks.find((item) =>
      [item.id, item.externalCode, item.description, item.abbreviated, item.branchName]
        .map(normalizeLookupText)
        .some((value) => value && value === normalizedCandidate),
    );

    if (bank) {
      return cleanValue(bank.description || bank.abbreviated || bank.branchName);
    }
  }

  return '';
}

export function resolvePaymentLabel(value, catalog) {
  const normalizedValue = normalizeLookupText(value);
  if (!normalizedValue) {
    return '';
  }

  return cleanValue(
    catalog.find((item) =>
      [item.id, item.description, item.initials]
        .map(normalizeLookupText)
        .some((candidate) => candidate && candidate === normalizedValue),
    )?.description || value,
  );
}

export function findDefaultNationality(employee) {
  const nationalities = Array.isArray(employee.nationalities) ? employee.nationalities : [];
  const nationality = nationalities.find((item) => item.isDefault) ?? nationalities[0];
  return cleanValue(nationality?.description || nationality?.externalDescription);
}

export function extractSalaryValue(salary) {
  if (salary && typeof salary === 'object') {
    return cleanValue(salary.amount || salary.value || salary.baseSalary || salary.salary);
  }

  return typeof salary === 'string' || typeof salary === 'number' ? cleanValue(salary) : '';
}

export function extractWeeklyHours(phase) {
  const candidates = [
    phase?.real?.hoursPerWeek,
    phase?.real?.weeklyHours,
    phase?.holidays?.weeklyHours,
    phase?.weeklyHours,
  ];

  return cleanValue(candidates.find((value) => value !== undefined && value !== null) ?? '');
}

export function buildSearchEmployeeLookup(payload) {
  const employees = Array.isArray(payload?.paginationList) ? payload.paginationList : [];
  return new Map(
    employees
      .map((employee) => [String(employee.additionalAttributes?.IdEmployee || employee.idEmployee || employee.idPerson || ''), employee])
      .filter(([key]) => key),
  );
}

export function firstItem(payload) {
  return arrayValues(payload)[0] ?? null;
}

export function arrayValues(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.values)) {
    return payload.values;
  }

  if (Array.isArray(payload?.paginationList)) {
    return payload.paginationList;
  }

  if (Array.isArray(payload?.paginatedList)) {
    return payload.paginatedList;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.result)) {
    return payload.result;
  }

  if (Array.isArray(payload?.payElements)) {
    return payload.payElements;
  }

  return [];
}
