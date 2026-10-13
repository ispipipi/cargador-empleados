import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  VISMA_REX_MAPPING_PROFILE,
} from '../visma-rex-mapping.mjs';
import {
  discoverVismaOrganizationGroups,
  fetchOrganizationMasterLists,
  filterVismaEmployeesByCompany,
  normalizeVismaPayrollEmployee,
  normalizeVismaPayrollPeriods,
  normalizeVismaPayrollProcesses,
  normalizeVismaTenants,
  selectPreferredOrganizationGroup,
  selectVismaTenant,
  tenantToCompanyOption,
  tenantToOrganizationGroup,
} from './organizations.js';
import {
  getVismaAdminJson,
  getVismaLeavesJson,
  getVismaRaetJson,
  getVismaTenantJson,
  loginToVisma,
} from './api.js';
import {
  buildSearchEmployeeLookup,
  normalizeVismaEmployee,
} from './employees.js';
import {
  buildVismaLeaveEmployeeLookup,
  buildVismaLeaveTypeLookup,
  datesOverlapRange,
  formatIsoDate,
  isAbsenceLeaveType,
  isMedicalLeaveType,
  isPermissionLeaveType,
  normalizeVismaLeave,
} from './leaves.js';
import {
  fetchAllVismaPages,
  mapWithConcurrency,
  safeCatalog,
  summarizeVismaEmployees,
} from './paging.js';
import {
  arrayValues,
  cleanValue,
  firstItem,
  getSecretValue,
  setCorsHeaders,
} from './shared.js';

const vismaUsername = defineSecret('VISMA_USERNAME');
const vismaPassword = defineSecret('VISMA_PASSWORD');
const vismaSubscriptionKey = defineSecret('VISMA_SUBSCRIPTION_KEY');
const VISMA_EMPLOYEE_PAGE_SIZE = 500;
const VISMA_CONCURRENCY = 8;
const VISMA_LEAVE_PAGE_SIZE = 500;
const VISMA_HEALTH_PLAN_CONCEPT_ID = '06622';

export const vismaProxy = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [vismaUsername, vismaPassword, vismaSubscriptionKey],
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).json({ ok: false, message: 'Metodo no permitido.' });
      return;
    }

    try {
      const body = typeof request.body === 'object' && request.body ? request.body : {};
      const action = String(body.action || 'employees-preview').trim();
      const supportedActions = new Set([
        'connection-context',
        'employees-preview',
        'leaves-preview',
        'payroll-processes-preview',
        'payroll-book-preview',
        'organization-lists-preview',
      ]);

      if (!supportedActions.has(action)) {
        response.status(400).json({ ok: false, message: 'Accion VISMA no soportada.' });
        return;
      }

      const username = String(getSecretValue(vismaUsername) || '').trim();
      const password = String(getSecretValue(vismaPassword) || '').trim();
      const subscriptionKey = String(getSecretValue(vismaSubscriptionKey) || '').trim();
      const requestedLimit = Number(body.limit);

      if (!username || !password) {
        response.status(400).json({ ok: false, message: 'Faltan credenciales VISMA guardadas en el backend.' });
        return;
      }

      const auth = await loginToVisma({ username, password });
      const token = auth.access_token;

      if (!token) {
        response.status(502).json({ ok: false, message: 'VISMA no retorno token de autenticacion.' });
        return;
      }

      const tenants = normalizeVismaTenants(
        await getVismaAdminJson({ token, path: '/vlwebapiadmin/account/tenants?onlyWithAdminAccess=false' }),
      );
      const tenant = selectVismaTenant(tenants, body.tenantId);

      if (!tenant?.id) {
        response.status(502).json({ ok: false, message: 'No se encontro tenant VISMA habilitado para Web API.' });
        return;
      }

      const tenantId = String(tenant.id);
      const organizationGroups = subscriptionKey
        ? await discoverVismaOrganizationGroups({ token, tenantId, subscriptionKey, tenant }).catch(() => [tenantToOrganizationGroup(tenant)])
        : [tenantToOrganizationGroup(tenant)];
      const selectedOrganizationGroup = selectPreferredOrganizationGroup(organizationGroups);
      const companies = selectedOrganizationGroup?.options?.length
        ? selectedOrganizationGroup.options
        : [tenantToCompanyOption(tenant)];

      if (action === 'connection-context') {
        response.status(200).json({
          ok: true,
          tenants,
          selectedTenantId: tenantId,
          organizationGroups,
          selectedCompanyTypeId: selectedOrganizationGroup?.id || '',
          companies,
          selectedCompanyId: '',
          credentials: {
            username: true,
            password: true,
            subscriptionKey: Boolean(subscriptionKey),
          },
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          capabilities: {
            employees: true,
            payrollProcesses: Boolean(subscriptionKey),
            historicalBooksDetail: false,
          },
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (action === 'payroll-processes-preview') {
        if (!subscriptionKey) {
          response.status(400).json({ ok: false, message: 'Falta VISMA_SUBSCRIPTION_KEY guardada en el backend para consultar Payroll.' });
          return;
        }

        const requestedYear = Number(body.year);
        const requestedMonth = Number(body.month);
        const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
          ? requestedYear
          : new Date().getFullYear();
        const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
          ? requestedMonth
          : new Date().getMonth() + 1;
        const periodPageSize = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) && requestedLimit > 0
          ? Math.trunc(requestedLimit)
          : 500));
        const periodsPayload = await getVismaRaetJson({
          token,
          tenantId,
          subscriptionKey,
          path: `/vlwebapi/payrolls/periods?year=${year}&month=${month}&pageSize=${periodPageSize}`,
        });
        const periods = normalizeVismaPayrollPeriods(periodsPayload);
        const periodId = cleanValue(body.periodId || periods[0]?.id);
        const processesPayload = periodId
          ? await getVismaRaetJson({
              token,
              tenantId,
              subscriptionKey,
              path: `/vlwebapi/payrolls/processes?periodId=${encodeURIComponent(periodId)}`,
            })
          : [];
        const payrollProcesses = normalizeVismaPayrollProcesses(processesPayload, periodId);

        response.status(200).json({
          ok: true,
          tenant,
          year,
          month,
          periods,
          payrollProcesses,
          detailStatus: {
            available: Boolean(payrollProcesses.length),
            message: payrollProcesses.length
              ? 'Selecciona un proceso para traer el libro completo de remuneraciones.'
              : 'No se encontraron procesos de remuneraciones para el período seleccionado.',
          },
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (action === 'payroll-book-preview') {
        if (!subscriptionKey) {
          response.status(400).json({ ok: false, message: 'Falta VISMA_SUBSCRIPTION_KEY guardada en el backend para consultar Payroll.' });
          return;
        }

        const periodId = cleanValue(body.periodId);
        const processId = cleanValue(body.processId);
        if (!periodId || !processId) {
          response.status(400).json({ ok: false, message: 'Faltan periodId y processId para consultar el libro de remuneraciones.' });
          return;
        }

        const pageSize = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) && requestedLimit > 0
          ? Math.trunc(requestedLimit)
          : 500));
        const printable = body.printable === true || body.printable === 'true';
        const conceptPath = `/vlwebapi/payrolls/process-concepts?periodId=${encodeURIComponent(periodId)}&processId=${encodeURIComponent(processId)}&printable=${printable}&pageSize=${pageSize}&page=`;
        const [conceptsPayload, accumulatorsPayload, employeesPayload] = await Promise.all([
          fetchAllVismaPages(({ page }) => getVismaRaetJson({
            token,
            tenantId,
            subscriptionKey,
            path: `${conceptPath}${page}`,
          }), pageSize),
          fetchAllVismaPages(({ page }) => getVismaRaetJson({
            token,
            tenantId,
            subscriptionKey,
            path: `/vlwebapi/payrolls/process-acumulators?periodId=${encodeURIComponent(periodId)}&processId=${encodeURIComponent(processId)}&printable=${printable}&page=${page}&pageSize=${pageSize}`,
          }), pageSize),
          fetchAllVismaPages(({ page, pageSize: employeePageSize }) => getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees?page=${page}&pageSize=${employeePageSize}`,
          }), VISMA_EMPLOYEE_PAGE_SIZE),
        ]);
        const processEmployeeIds = new Set([
          ...conceptsPayload.values,
          ...accumulatorsPayload.values,
        ].map((row) => cleanValue(row.employeeId)));
        const processEmployees = employeesPayload.values.filter((employee) => {
          const employeeIds = [employee.id, employee.externalId].map(cleanValue).filter(Boolean);
          return !processEmployeeIds.size || employeeIds.some((employeeId) => processEmployeeIds.has(employeeId));
        });
        const employeeRoster = await mapWithConcurrency(processEmployees, VISMA_CONCURRENCY, async (employee) => {
          const employeeRef = employee.externalId || `rh-${employee.id}`;
          const detail = await getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}`,
          }).catch(() => employee);

          return normalizeVismaPayrollEmployee({ ...employee, ...detail });
        });

        response.status(200).json({
          ok: true,
          tenant,
          periodId,
          processId,
          printable,
          employees: employeeRoster,
          concepts: conceptsPayload.values,
          accumulators: accumulatorsPayload.values,
          summary: {
            employees: employeeRoster.length,
            concepts: conceptsPayload.values.length,
            accumulators: accumulatorsPayload.values.length,
            printable,
            conceptsTotal: conceptsPayload.totalCount,
            accumulatorsTotal: accumulatorsPayload.totalCount,
          },
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (action === 'organization-lists-preview') {
        if (!subscriptionKey) {
          response.status(400).json({ ok: false, message: 'Falta VISMA_SUBSCRIPTION_KEY guardada en el backend para consultar los maestros VISMA.' });
          return;
        }

        const lists = await fetchOrganizationMasterLists({ token, tenantId, subscriptionKey });
        response.status(200).json({
          ok: true,
          tenant,
          lists,
          mappingProfile: VISMA_REX_MAPPING_PROFILE,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (action === 'leaves-preview') {
        const requestedLeaveCompanyId = cleanValue(body.companyId);
        const requestedLeaveCompanyTypeId = cleanValue(body.companyTypeId);

        const requestedYear = Number(body.year);
        const requestedMonth = Number(body.month);
        const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
          ? requestedYear
          : new Date().getFullYear();
        const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
          ? requestedMonth
          : new Date().getMonth() + 1;
        const rangeStart = cleanValue(body.from || `${year}-${String(month).padStart(2, '0')}-01`);
        const rangeEnd = cleanValue(body.to || formatIsoDate(new Date(Date.UTC(year, month, 0))));
        const employeesPayload = await fetchAllVismaPages(({ page, pageSize }) => getVismaRaetJson({
          token,
          tenantId,
          path: `/vlwebapi/employees?page=${page}&pageSize=${pageSize}&active=true`,
        }), VISMA_EMPLOYEE_PAGE_SIZE);
        const employeesWithStructures = await mapWithConcurrency(
          employeesPayload.values,
          VISMA_CONCURRENCY,
          async (employee) => {
            const employeeRef = employee.externalId || `rh-${employee.id}`;
            const structures = await getVismaRaetJson({
              token,
              tenantId,
              path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/structures?page=1&pageSize=80`,
            }).catch(() => []);
            return { ...employee, __structures: arrayValues(structures) };
          },
        );
        const employeeLookup = buildVismaLeaveEmployeeLookup(
          employeesWithStructures,
          requestedLeaveCompanyId,
          requestedLeaveCompanyTypeId,
        );
        const requestedEmployeeId = cleanValue(body.employeeId);
        const requestedTypeLeaveId = cleanValue(body.typeLeaveId);
        const leavePageSize = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) && requestedLimit > 0
          ? Math.trunc(requestedLimit)
          : VISMA_LEAVE_PAGE_SIZE));
        const leaveTypesPayload = await getVismaLeavesJson({
          token,
          tenantId,
          subscriptionKey,
          path: '/vlwebapi/leaves/master-leaves-types?pageSize=500',
        }).catch(() => []);
        const leaveTypeLookup = buildVismaLeaveTypeLookup(arrayValues(leaveTypesPayload));
        const leavesPayload = await fetchAllVismaPages(({ page, pageSize }) => getVismaLeavesJson({
          token,
          tenantId,
          subscriptionKey,
          path: `/vlwebapi/leaves?dateFrom=${encodeURIComponent(rangeStart)}&pageSize=${pageSize}&page=${page}${requestedEmployeeId ? `&employeeId=${encodeURIComponent(requestedEmployeeId)}` : ''}${requestedTypeLeaveId ? `&typeLeaveId=${encodeURIComponent(requestedTypeLeaveId)}` : ''}`,
        }), leavePageSize);
        const leaves = leavesPayload.values
          .map((leave) => normalizeVismaLeave(leave, employeeLookup, leaveTypeLookup))
          .filter((leave) => leave.companyMatches && datesOverlapRange(leave.startDate, leave.endDate, rangeStart, rangeEnd));

        response.status(200).json({
          ok: true,
          tenant,
          year,
          month,
          from: rangeStart,
          to: rangeEnd,
          leaveTypes: arrayValues(leaveTypesPayload),
          leaves,
          summary: {
            totalAvailable: leavesPayload.totalCount ?? leavesPayload.values.length,
            returned: leaves.length,
            medicalLicenses: leaves.filter((leave) => isMedicalLeaveType(leave.type)).length,
            permissions: leaves.filter((leave) => isPermissionLeaveType(leave.type)).length,
            absences: leaves.filter((leave) => isAbsenceLeaveType(leave.type)).length,
          },
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      const requestedCompanyId = cleanValue(body.companyId);
      const requestedCompanyTypeId = cleanValue(body.companyTypeId);
      const includeInactive = body.includeInactive === true || body.includeInactive === 'true';
      const [employeesPayload, searchEmployeesPayload, structureTypes, positions, paymentMethods, paymentTypes, banks] = await Promise.all([
        fetchAllVismaPages(({ page, pageSize }) => getVismaRaetJson({
          token,
          tenantId,
          path: `/vlwebapi/employees?page=${page}&pageSize=${pageSize}${includeInactive ? '' : '&active=true'}`,
        }), VISMA_EMPLOYEE_PAGE_SIZE),
        subscriptionKey
          ? fetchAllVismaPages(({ page, pageSize }) => getVismaTenantJson({
            token,
            tenantId,
            subscriptionKey,
            path: `/search/api/search-engines/employees?Page=${page}&PageSize=${pageSize}`,
          }).catch(() => null), VISMA_EMPLOYEE_PAGE_SIZE)
          : { values: [], totalCount: null },
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/structure-types?HasManager=false' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/position' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/payment-methods' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/payment-types' }).catch(() => [])
          : [],
        subscriptionKey
          ? getVismaTenantJson({ token, tenantId, subscriptionKey, path: '/organization/api/structures/41/Structures' }).catch(() => [])
          : [],
      ]);

      const baseEmployees = employeesPayload.values;
      const searchByEmployeeId = buildSearchEmployeeLookup({ paginationList: searchEmployeesPayload.values });
      const enrichedEmployees = await mapWithConcurrency(baseEmployees, VISMA_CONCURRENCY, async (employee, index) => {
        const employeeRef = employee.externalId || `rh-${employee.id}`;
        const searchEmployee = searchByEmployeeId.get(String(employee.id)) ?? null;
        const detail = await getVismaRaetJson({
          token,
          tenantId,
          path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}`,
        }).catch(() => employee);

        const [addresses, phones, phases, structures, bankAccounts, emails, healthPayElement] = await Promise.all([
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/addresses?page=1&pageSize=5`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phones?page=1&pageSize=5`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/phases?page=1&pageSize=5&active=true`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/structures?page=1&pageSize=80`,
          }).catch(() => null),
          getVismaRaetJson({
            token,
            tenantId,
            path: `/vlwebapi/employees/${encodeURIComponent(employeeRef)}/bank-accounts?active=true`,
          }).catch(() => null),
          subscriptionKey && employee.id
            ? getVismaTenantJson({
                token,
                tenantId,
                subscriptionKey,
                path: `/contact/api/emails?idEntity=${encodeURIComponent(employee.id)}&idEntityType=1`,
              }).catch(() => [])
            : [],
          employee.externalId
            ? getVismaRaetJson({
                token,
                tenantId,
                subscriptionKey,
                path: `/vlwebapi/pay-elements/individual?employeeExternalId=${encodeURIComponent(employee.externalId)}&conceptExternalId=${VISMA_HEALTH_PLAN_CONCEPT_ID}`,
              }).catch(() => null)
            : null,
        ]);

        return normalizeVismaEmployee({
          rowNumber: index + 2,
          employee: { ...employee, ...detail },
          tenant,
          searchEmployee,
          address: firstItem(addresses),
          phones: arrayValues(phones),
          phase: firstItem(phases),
          structures: arrayValues(structures),
          bankAccount: firstItem(bankAccounts),
          emails: Array.isArray(emails) ? emails : [],
          healthPayElement,
          catalogs: { structureTypes, positions, paymentMethods, paymentTypes, banks },
        });
      });

      const filteredEmployees = filterVismaEmployeesByCompany(enrichedEmployees, requestedCompanyId, requestedCompanyTypeId);
      const scopedEmployees = filteredEmployees;

      response.status(200).json({
        ok: true,
        tenant,
        tenants,
        organizationGroups,
        selectedCompanyTypeId: requestedCompanyTypeId || selectedOrganizationGroup?.id || '',
        companies,
        selectedCompanyId: requestedCompanyId,
        employees: scopedEmployees,
        catalogs: {
          structureTypes: safeCatalog(structureTypes),
          positions: safeCatalog(positions),
          paymentMethods: safeCatalog(paymentMethods),
          paymentTypes: safeCatalog(paymentTypes),
          banks: safeCatalog(banks),
        },
        mappingProfile: VISMA_REX_MAPPING_PROFILE,
        summary: summarizeVismaEmployees(scopedEmployees, requestedCompanyId ? filteredEmployees.length : employeesPayload.totalCount),
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      response.status(error.status || 502).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar VISMA.',
      });
    }
  },
);
