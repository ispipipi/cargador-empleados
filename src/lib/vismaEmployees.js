import { cleanCell, sanitizeFilenameSegment } from './utils';

const PROXY_ENDPOINT = '/api/visma';
const VISMA_API_BASE_URL = String(import.meta.env.VITE_VISMA_API_BASE_URL ?? '').replace(/\/+$/, '');
export const vismaEmployeesEndpoint = VISMA_API_BASE_URL
  ? VISMA_API_BASE_URL
  : PROXY_ENDPOINT;
export const VISMA_REX_MAPPING_PROFILE_ID = 'VISMA_REX_BASE_V1';

export const VISMA_EMPLOYEE_HEADERS = [
  'ID EMPLEADO',
  'CI',
  'NOMBRE',
  'EMPRESA',
  'POSICION',
  'SEXO',
  'FECHA INGRESO',
  'ESTADO',
  'ESTADO CIVIL',
  'NACIONALIDAD',
  'CELULAR',
  'TELEFONO',
  'DIRECCION',
  'COMUNA',
  'UBICACION',
  'FORMA DE PAGO',
  'BANCO',
  'N° CTA CTE',
  'AFP',
  'ISAPRE',
  'CENTRO COSTO',
  'UNIDAD DE NEGOCIOS',
  'SINDICATO',
  'FECHA NACIMIENTO',
  'NOMBRE CONTRATO',
  'FEC FIN CONTRATO',
  'SUELDO BASE',
  'HORAS JORNADA',
  'FECHA ANTIGUEDAD',
  'EMAIL',
];

async function postToVismaProxy(body) {
  const response = await fetch(vismaEmployeesEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    if (response.status === 405) {
      throw new Error(
        'La URL actual no tiene backend VISMA. En GitHub Pages debes configurar VITE_VISMA_API_BASE_URL con la Function desplegada.',
      );
    }

    throw new Error(payload?.message || 'No se pudo consultar VISMA.');
  }

  return payload;
}

export function fetchVismaConnectionContext({ tenantId } = {}) {
  return postToVismaProxy({
    action: 'connection-context',
    tenantId: cleanCell(tenantId),
  });
}

export function fetchVismaEmployeesPreview({ tenantId, companyId, companyTypeId }) {
  return postToVismaProxy({
    action: 'employees-preview',
    allEmployees: true,
    tenantId: cleanCell(tenantId),
    companyId: cleanCell(companyId),
    companyTypeId: cleanCell(companyTypeId),
  });
}

export function fetchVismaPayrollProcessesPreview({ tenantId, limit }) {
  return postToVismaProxy({
    action: 'payroll-processes-preview',
    tenantId: cleanCell(tenantId),
    limit: Number(limit) || 50,
  });
}

export function fetchVismaOrganizationLists({ tenantId, companyId, companyTypeId }) {
  return postToVismaProxy({
    action: 'organization-lists-preview',
    tenantId: cleanCell(tenantId),
    companyId: cleanCell(companyId),
    companyTypeId: cleanCell(companyTypeId),
  });
}

export function buildVismaSourceFile(payload, metadata = {}) {
  const rows = Array.isArray(payload?.employees) ? payload.employees.map((row, index) => ({
    __sourceRowNumber: index + 2,
    ...row,
  })) : [];
  const company = metadata.company ?? {};
  const companyName = cleanCell(company.name || payload?.selectedCompanyName);
  const today = new Date().toISOString().slice(0, 10);

  return {
    fileName: `VISMA_API_${sanitizeFilenameSegment(companyName || 'empresa')}_${today}.json`,
    workbookName: 'VISMA API',
    tenantId: cleanCell(metadata.tenant?.id || payload?.selectedTenantId),
    companyId: cleanCell(company.id || payload?.selectedCompanyId),
    companyName,
    mappingProfile: payload?.mappingProfile ?? {
      id: VISMA_REX_MAPPING_PROFILE_ID,
      label: 'VISMA -> REX+ base',
      appliesTo: 'all-companies',
    },
    headers: VISMA_EMPLOYEE_HEADERS,
    rows,
    previewRows: rows.slice(0, 8).map((row) =>
      VISMA_EMPLOYEE_HEADERS.reduce((previewRow, header) => {
        previewRow[header] = cleanCell(row[header]);
        return previewRow;
      }, {}),
    ),
    period: '',
  };
}

export function summarizeVismaSourceFile(sourceFile, apiSummary) {
  const rows = sourceFile?.rows ?? [];

  return {
    totalAvailable: apiSummary?.totalAvailable ?? rows.length,
    returned: rows.length,
    withDocument: apiSummary?.withDocument ?? rows.filter((row) => cleanCell(row.CI)).length,
    withAddress: apiSummary?.withAddress ?? rows.filter((row) => cleanCell(row.DIRECCION) || cleanCell(row.COMUNA)).length,
    withBank: apiSummary?.withBank ?? rows.filter((row) => cleanCell(row.BANCO) || cleanCell(row['N° CTA CTE'])).length,
    withStructures: apiSummary?.withStructures ?? rows.filter((row) => Number(row.__visma?.structures) > 0).length,
    withEmail: apiSummary?.withEmail ?? rows.filter((row) => cleanCell(row.EMAIL)).length,
  };
}
