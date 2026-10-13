import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  buildVismaLeavesCsv,
  buildVismaPayrollWorkbook,
  buildVismaRexConceptDetailCsv,
  buildVismaSourceFile,
  fetchVismaEmployeesPreview,
  fetchVismaLeavesPreview,
  fetchVismaPayrollBookPreview,
  fetchVismaPayrollProcessesPreview,
  summarizeVismaSourceFile,
} from '../lib/vismaEmployees';
import { parseRexCompanyMasterWorkbook } from '../lib/template';
import { cleanCell } from '../lib/utils';
import { useVismaWorkspace, ALL_COMPANIES_VALUE } from './VismaWorkspaceProvider';
import {
  EmployeesPreview,
  LeavesPreview,
  MetricCard,
  PayrollProcessesPreview,
  RexCompanyMasterUploader,
  triggerTextDownload,
} from './VismaEmployeesReviewParts';

const DEFAULT_PAYROLL_PAGE_SIZE = 500;
const EXTRACTION_MODES = [
  {
    id: 'employees',
    label: 'Empleados',
    detail: 'Ficha, contrato, estructuras, dirección, banco y contacto.',
  },
  {
    id: 'payroll',
    label: 'Libros históricos',
    detail: 'Remuneraciones, conceptos, aportes y leyes sociales.',
  },
  {
    id: 'leaves',
    label: 'Licencias y ausencias',
    detail: 'Licencias médicas, permisos y ausencias del período.',
  },
];

export default function VismaEmployeesReview({ conceptsResource, onBack, onContinue, onBusyChange }) {
  const {
    connection,
    connectionError,
    companyOptions,
    isLoadingConnection,
    selectedCompany,
    selectedOrganizationGroup,
    selectedTenant,
    selection,
  } = useVismaWorkspace();
  const [form, setForm] = useState({
    extractionMode: 'employees',
    payrollYear: new Date().getFullYear(),
    payrollMonth: new Date().getMonth() + 1,
    payrollPrintable: false,
    leavesYear: new Date().getFullYear(),
    leavesMonth: new Date().getMonth() + 1,
  });
  const [payload, setPayload] = useState(null);
  const [payrollPayload, setPayrollPayload] = useState(null);
  const [payrollBookPayload, setPayrollBookPayload] = useState(null);
  const [payrollDetailSummary, setPayrollDetailSummary] = useState(null);
  const [leavesPayload, setLeavesPayload] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rexCompanyMasterResource, setRexCompanyMasterResource] = useState(null);
  const [rexCompanyMasterFileName, setRexCompanyMasterFileName] = useState('');
  const [rexCompanyMasterError, setRexCompanyMasterError] = useState('');
  const [isReadingRexCompanyMaster, setIsReadingRexCompanyMaster] = useState(false);
  const [search, setSearch] = useState('');
  const isAllCompanies = selection.companyId === ALL_COMPANIES_VALUE;
  const payrollProcesses = payrollPayload?.payrollProcesses ?? [];
  const payrollPeriods = payrollPayload?.periods ?? [];
  const leaveSummary = leavesPayload?.summary ?? {};
  const summary = useMemo(() => summarizeVismaSourceFile(sourceFile, payload?.summary), [payload, sourceFile]);
  const visibleRows = useMemo(() => {
    const rows = sourceFile?.rows ?? [];
    const query = search.trim().toLowerCase();

    if (!query) {
      return rows.slice(0, 20);
    }

    return rows
      .filter((row) =>
        [row.CI, row.NOMBRE, row.EMPRESA, row.POSICION, row.UBICACION, row['CENTRO COSTO']]
          .some((value) => cleanCell(value).toLowerCase().includes(query)),
      )
      .slice(0, 20);
  }, [search, sourceFile]);
  const canQuery = !isLoading && !isLoadingConnection && Boolean(selection.tenantId)
    && (form.extractionMode === 'payroll' || Boolean(selection.companyId));
  const canContinue = form.extractionMode === 'employees'
    && Boolean(sourceFile?.rows?.length)
    && Boolean(rexCompanyMasterResource);

  useEffect(() => {
    setRexCompanyMasterResource(null);
    setRexCompanyMasterFileName('');
    setRexCompanyMasterError('');
    setPayload(null);
    setPayrollPayload(null);
    setPayrollBookPayload(null);
    setPayrollDetailSummary(null);
    setLeavesPayload(null);
    setSourceFile(null);
    setSearch('');
  }, [selection.companyId, selection.companyTypeId, selection.tenantId]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');

    if (field === 'extractionMode') {
      setRexCompanyMasterResource(null);
      setRexCompanyMasterFileName('');
      setRexCompanyMasterError('');
      setPayload(null);
      setPayrollPayload(null);
      setPayrollBookPayload(null);
      setPayrollDetailSummary(null);
      setLeavesPayload(null);
      setSourceFile(null);
      setSearch('');
    }
  };

  const handleRexCompanyMasterSelected = async (file) => {
    if (!file) {
      return;
    }

    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setRexCompanyMasterResource(null);
      setRexCompanyMasterFileName('');
      setRexCompanyMasterError('El archivo de carga REX+ debe ser .xls o .xlsx.');
      return;
    }

    setIsReadingRexCompanyMaster(true);
    setRexCompanyMasterResource(null);
    setRexCompanyMasterFileName(file.name);
    setRexCompanyMasterError('');

    try {
      const parsedResource = parseRexCompanyMasterWorkbook(await file.arrayBuffer(), file.name);
      setRexCompanyMasterResource(parsedResource);
    } catch (masterError) {
      setRexCompanyMasterFileName('');
      setRexCompanyMasterResource(null);
      setRexCompanyMasterError(masterError instanceof Error ? masterError.message : 'No se pudo leer el archivo de carga REX+.');
    } finally {
      setIsReadingRexCompanyMaster(false);
    }
  };

  const handleQuery = async () => {
    if (!canQuery) {
      return;
    }

    setError('');
    setIsLoading(true);
    onBusyChange?.(true);

    try {
      if (form.extractionMode === 'payroll') {
        const nextPayrollPayload = await fetchVismaPayrollProcessesPreview({
          tenantId: selection.tenantId,
          year: form.payrollYear,
          month: form.payrollMonth,
          pageSize: DEFAULT_PAYROLL_PAGE_SIZE,
        });

        setPayload(null);
        setSourceFile(null);
        setPayrollPayload(nextPayrollPayload);
        setPayrollBookPayload(null);
        setPayrollDetailSummary(null);
        setSearch('');
        return;
      }

      if (form.extractionMode === 'leaves') {
        const nextLeavesPayload = await fetchVismaLeavesPreview({
          tenantId: selection.tenantId,
          companyId: isAllCompanies ? '' : selection.companyId,
          companyTypeId: selection.companyTypeId,
          year: form.leavesYear,
          month: form.leavesMonth,
        });

        setPayload(null);
        setSourceFile(null);
        setPayrollPayload(null);
        setPayrollBookPayload(null);
        setPayrollDetailSummary(null);
        setLeavesPayload(nextLeavesPayload);
        setSearch('');
        return;
      }

      const nextPayload = await fetchVismaEmployeesPreview({
        tenantId: selection.tenantId,
        companyId: isAllCompanies ? '' : selection.companyId,
        companyTypeId: selection.companyTypeId,
      });
      const nextSourceFile = buildVismaSourceFile(nextPayload, {
        tenant: selectedTenant,
        company: isAllCompanies
          ? { id: ALL_COMPANIES_VALUE, name: 'Todas las empresas' }
          : selectedCompany,
      });

      if (!nextSourceFile.rows.length) {
        throw new Error('VISMA no retornó empleados para el lote solicitado.');
      }

      setPayrollPayload(null);
      setPayrollBookPayload(null);
      setPayrollDetailSummary(null);
      setLeavesPayload(null);
      setPayload(nextPayload);
      setSourceFile(nextSourceFile);
      setSearch('');
    } catch (queryError) {
      setPayload(null);
      setPayrollPayload(null);
      setLeavesPayload(null);
      setSourceFile(null);
      setError(queryError instanceof Error ? queryError.message : 'No se pudo consultar VISMA.');
    } finally {
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  const handlePayrollBookQuery = async (process) => {
    if (!process?.id || !selection.tenantId || isLoading) {
      return;
    }

    setError('');
    setIsLoading(true);
    onBusyChange?.(true);

    try {
      const [nextBookPayload, employeePayload] = await Promise.all([
        fetchVismaPayrollBookPreview({
          tenantId: selection.tenantId,
          periodId: process.periodId,
          processId: process.id,
          printable: form.payrollPrintable,
          pageSize: DEFAULT_PAYROLL_PAGE_SIZE,
        }),
        fetchVismaEmployeesPreview({
          tenantId: selection.tenantId,
          companyId: isAllCompanies ? '' : selection.companyId,
          companyTypeId: selection.companyTypeId,
          includeInactive: true,
        }).catch(() => ({ employees: [] })),
      ]);
      const period = payrollPeriods.find((item) => String(item.id) === String(process.periodId)) ?? payrollPeriods[0] ?? null;
      setPayrollBookPayload({
        ...nextBookPayload,
        period,
        process,
        company: isAllCompanies ? null : selectedCompany,
        employeeRows: employeePayload.employees ?? [],
      });
      setPayrollDetailSummary(null);
    } catch (queryError) {
      setPayrollBookPayload(null);
      setError(queryError instanceof Error ? queryError.message : 'No se pudo traer el libro de remuneraciones.');
    } finally {
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  const handlePayrollBookDownload = () => {
    if (!payrollBookPayload) {
      return;
    }

    const workbook = buildVismaPayrollWorkbook({ book: payrollBookPayload });
    const filename = `VISMA_LIBRO_REMUNERACIONES_${payrollBookPayload.processId}_${payrollBookPayload.periodId}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const handlePayrollDetailDownload = () => {
    if (!payrollBookPayload) {
      return;
    }

    const detail = buildVismaRexConceptDetailCsv({ book: payrollBookPayload, conceptsResource });
    const filename = `REX_CONCEPTOS_DETALLE_${payrollBookPayload.processId}_${payrollBookPayload.periodId}.csv`;
    triggerTextDownload(detail.csv, filename);
    setPayrollDetailSummary(detail.summary);
  };

  const handleLeavesDownload = () => {
    if (!leavesPayload) {
      return;
    }

    const periodLabel = `${form.leavesYear}-${String(form.leavesMonth).padStart(2, '0')}`;
    const csv = buildVismaLeavesCsv({
      leaves: leavesPayload.leaves,
      companyName: isAllCompanies ? 'Todas las empresas' : selectedCompany?.name,
      periodLabel,
    });
    triggerTextDownload(csv, `VISMA_AUSENCIAS_${periodLabel}.csv`);
  };

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }

    onContinue(sourceFile, {
      isValid: true,
      missingColumns: [],
      formatIssues: [],
      formatName: 'VISMA API',
      message: `VISMA API listo. Se detectaron ${sourceFile.rows.length.toLocaleString('es-CL')} empleados.`,
    }, rexCompanyMasterResource);
  };

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-hero-grid soft-grid px-6 py-8 sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-700">VISMA API · REX+</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-950">Genera la carga REX+ de una o todas las empresas.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
              Las claves VISMA se usan desde el backend. Selecciona una empresa o todas las empresas, trae sus empleados y genera el archivo
              listo para revisar y cargar en REX+.
            </p>

            <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Conexión guardada</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {isLoadingConnection ? 'Validando claves VISMA...' : 'Credenciales administradas por backend'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Usuario, password y subscription key no viajan desde el navegador.
                  </p>
                  <p className="mt-2 text-xs font-semibold text-emerald-800">
                    {connection?.mappingProfile?.label || 'VISMA -> REX+ base'} · reutilizable para todas las empresas
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[20px] border border-brand-100 bg-brand-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-700">Empresa activa</p>
                <p className="mt-1 text-sm text-slate-600">
                  {isAllCompanies ? 'Todas las empresas' : selectedCompany?.name || 'Selecciona una empresa en el menú lateral.'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  La selección del menú lateral se aplica a esta carga y a los maestros VISMA.
                </p>
                {!selection.companyId && form.extractionMode === 'employees' ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">Selecciona una empresa o Todas las empresas para habilitar la consulta.</p>
                ) : null}
              </div>

              {form.extractionMode === 'employees' ? (
                <RexCompanyMasterUploader
                  fileName={rexCompanyMasterFileName}
                  resource={rexCompanyMasterResource}
                  error={rexCompanyMasterError}
                  isReading={isReadingRexCompanyMaster}
                  disabled={!selection.companyId || isLoading || isLoadingConnection}
                  onFileSelected={handleRexCompanyMasterSelected}
                />
              ) : null}

              <fieldset>
                <legend className="text-sm font-semibold text-slate-700">Qué quieres traer</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {EXTRACTION_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => updateForm('extractionMode', mode.id)}
                      className={`rounded-[20px] border px-4 py-4 text-left transition ${
                        form.extractionMode === mode.id
                          ? 'border-brand-500 bg-brand-50 text-slate-950 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200'
                      }`}
                    >
                      <span className="block text-sm font-bold">{mode.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{mode.detail}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {form.extractionMode === 'employees' ? (
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-700">Trabajadores a traer</p>
                  <p className="mt-1 text-sm text-slate-600">Se traerá la totalidad de los trabajadores activos disponibles en VISMA.</p>
                  </div>
              ) : form.extractionMode === 'payroll' ? (
                <div className="space-y-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Año</span>
                      <input
                        value={form.payrollYear}
                        onChange={(event) => updateForm('payrollYear', event.target.value)}
                        type="number"
                        min="2000"
                        max="2100"
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Mes</span>
                      <input
                        value={form.payrollMonth}
                        onChange={(event) => updateForm('payrollMonth', event.target.value)}
                        type="number"
                        min="1"
                        max="12"
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      />
                    </label>
                  </div>
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      checked={form.payrollPrintable}
                      onChange={(event) => updateForm('payrollPrintable', event.target.checked)}
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span>
                      <span className="block font-semibold">Traer solo lo imprimible</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">Desmárcalo para incluir también aportes, leyes sociales, bases y acumuladores no impresos en el recibo.</span>
                    </span>
                  </label>
                </div>
              ) : (
                <div className="space-y-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Año</span>
                      <input
                        value={form.leavesYear}
                        onChange={(event) => updateForm('leavesYear', event.target.value)}
                        type="number"
                        min="2000"
                        max="2100"
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Mes</span>
                      <input
                        value={form.leavesMonth}
                        onChange={(event) => updateForm('leavesMonth', event.target.value)}
                        type="number"
                        min="1"
                        max="12"
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      />
                    </label>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    La consulta usa el endpoint VISMA de licencias con `dateFrom` del primer día del mes y trae licencias médicas, permisos y ausencias que se crucen con el período.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-300"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleQuery}
                disabled={!canQuery}
                className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isLoading
                  ? 'Consultando...'
                  : form.extractionMode === 'payroll'
                    ? 'Buscar procesos'
                    : form.extractionMode === 'leaves'
                      ? 'Buscar ausencias'
                    : 'Traer empleados'}
              </button>
            </div>
            {form.extractionMode === 'employees' && selection.companyId && !rexCompanyMasterResource && !sourceFile ? (
              <p className="mt-3 text-xs font-semibold text-amber-700">La consulta está habilitada. Carga el maestro REX+ cuando quieras generar el archivo final.</p>
            ) : null}
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              {form.extractionMode === 'payroll' ? 'Procesos payroll' : form.extractionMode === 'leaves' ? 'Ausentismos del período' : 'Cobertura'}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {form.extractionMode === 'payroll' ? (
                <>
                  <MetricCard label="Procesos" value={payrollProcesses.length} detail="Encontrados" />
                  <MetricCard label="Períodos" value={payrollPeriods.length} detail={`${form.payrollMonth}/${form.payrollYear}`} />
                  <MetricCard label="Libro" value={payrollBookPayload ? 'Listo' : '-'} detail={payrollBookPayload ? `${payrollBookPayload.summary?.concepts ?? 0} conceptos` : 'Selecciona un proceso'} />
                </>
              ) : form.extractionMode === 'leaves' ? (
                <>
                  <MetricCard label="Registros" value={leaveSummary.returned ?? 0} detail={`de ${leaveSummary.totalAvailable ?? 0} disponibles`} />
                  <MetricCard label="Licencias" value={leaveSummary.medicalLicenses ?? 0} detail="Médicas" />
                  <MetricCard label="Permisos" value={leaveSummary.permissions ?? 0} detail="Administrativos" />
                  <MetricCard label="Ausencias" value={leaveSummary.absences ?? 0} detail="Inasistencias" />
                  <MetricCard label="Tipos" value={leavesPayload?.leaveTypes?.length ?? 0} detail="Catálogo VISMA" />
                </>
              ) : (
                <>
                  <MetricCard label="Traídos" value={summary.returned} detail={`de ${summary.totalAvailable} disponibles`} />
                  <MetricCard label="RUT" value={summary.withDocument} detail="Con documento" />
                  <MetricCard label="Dirección" value={summary.withAddress} detail="Con domicilio" />
                  <MetricCard label="Banco" value={summary.withBank} detail="Con pago" />
                  <MetricCard label="Estructuras" value={summary.withStructures} detail="Con org." />
                  <MetricCard label="Email" value={summary.withEmail} detail="Contacto" />
                  <MetricCard label="Plan UF" value={summary.withHealthAmount} detail="Concepto 06622" />
                </>
              )}
            </div>

            {selectedTenant ? (
              <div className="mt-6 rounded-[24px] border border-brand-100 bg-brand-50/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Alcance seleccionado</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{isAllCompanies ? 'Todas las empresas' : selectedCompany?.name || 'Selecciona una empresa para continuar'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {isAllCompanies ? `${companyOptions.length} empresas incluidas` : `${selectedOrganizationGroup?.name || 'Estructura'} ${selectedCompany?.id || 'sin filtro'}`} · Tenant {selectedTenant.id} · API {selectedTenant.webApiEnabled ? 'habilitada' : 'por validar'}
                </p>
              </div>
            ) : null}

            {payrollPayload?.detailStatus ? (
              <div className={`mt-6 rounded-[24px] border px-5 py-4 text-sm ${payrollPayload.detailStatus.available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {payrollPayload.detailStatus.message}
              </div>
            ) : null}

            {payrollBookPayload ? (
              <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-sm font-semibold text-emerald-900">Libro de remuneraciones listo</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  Incluye {payrollBookPayload.summary?.employees ?? 0} trabajadores, {payrollBookPayload.summary?.concepts ?? 0} conceptos y {payrollBookPayload.summary?.accumulators ?? 0} acumuladores.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handlePayrollBookDownload}
                    className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Descargar libro VISMA RG
                  </button>
                  <button
                    type="button"
                    onClick={handlePayrollDetailDownload}
                    disabled={!conceptsResource}
                    className="rounded-full border border-emerald-700 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Descargar Concepto Detalle REX+
                  </button>
                </div>
                {payrollDetailSummary ? (
                  <p className="mt-3 text-xs leading-5 text-emerald-800">
                    Archivo REX+ generado con {payrollDetailSummary.rows.toLocaleString('es-CL')} filas y {payrollDetailSummary.matchedConcepts.toLocaleString('es-CL')} conceptos mapeados.
                    {payrollDetailSummary.pendingConcepts.length ? ` Quedaron ${payrollDetailSummary.pendingConcepts.length} conceptos sin mapeo.` : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            {leavesPayload ? (
              <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-sm font-semibold text-emerald-900">Ausentismos listos</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  Se encontraron {leavesPayload.leaves?.length ?? 0} registros para {leavesPayload.from} a {leavesPayload.to}.
                </p>
                <button
                  type="button"
                  onClick={handleLeavesDownload}
                  className="mt-4 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Descargar ausentismos CSV
                </button>
              </div>
            ) : null}

            {error || connectionError ? (
              <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {error || connectionError}
              </div>
            ) : null}

            {sourceFile ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="button-primary disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Generar archivo de carga REX+
                </button>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar en la muestra"
                  className="min-w-64 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900"
                />
              </div>
            ) : null}

            {sourceFile && !rexCompanyMasterResource ? (
              <p className="mt-3 text-xs font-semibold text-amber-700">
                Consulta completada. Carga el maestro REX+ para habilitar la generación del archivo final.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {sourceFile ? (
        <EmployeesPreview rows={visibleRows} companyName={sourceFile.companyName} />
      ) : null}

      {payrollProcesses.length ? (
        <PayrollProcessesPreview
          processes={payrollProcesses}
          onLoadBook={handlePayrollBookQuery}
          isLoading={isLoading}
          loadedProcessId={payrollBookPayload?.processId}
        />
      ) : null}

      {leavesPayload ? (
        <LeavesPreview leaves={leavesPayload.leaves ?? []} companyName={isAllCompanies ? 'Todas las empresas' : selectedCompany?.name} />
      ) : null}
    </div>
  );
}
