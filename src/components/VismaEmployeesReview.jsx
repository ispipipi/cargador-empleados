import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  buildVismaPayrollWorkbook,
  buildVismaSourceFile,
  fetchVismaEmployeesPreview,
  fetchVismaPayrollBookPreview,
  fetchVismaPayrollProcessesPreview,
  summarizeVismaSourceFile,
} from '../lib/vismaEmployees';
import { parseRexCompanyMasterWorkbook } from '../lib/template';
import { cleanCell } from '../lib/utils';
import { useVismaWorkspace, ALL_COMPANIES_VALUE } from './VismaWorkspaceProvider';

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
];

export default function VismaEmployeesReview({ onBack, onContinue, onBusyChange }) {
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
  });
  const [payload, setPayload] = useState(null);
  const [payrollPayload, setPayrollPayload] = useState(null);
  const [payrollBookPayload, setPayrollBookPayload] = useState(null);
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
      setPayload(nextPayload);
      setSourceFile(nextSourceFile);
      setSearch('');
    } catch (queryError) {
      setPayload(null);
      setPayrollPayload(null);
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
      const nextBookPayload = await fetchVismaPayrollBookPreview({
        tenantId: selection.tenantId,
        periodId: process.periodId,
        processId: process.id,
        printable: form.payrollPrintable,
        pageSize: DEFAULT_PAYROLL_PAGE_SIZE,
      });
      const period = payrollPeriods.find((item) => String(item.id) === String(process.periodId)) ?? payrollPeriods[0] ?? null;
      setPayrollBookPayload({ ...nextBookPayload, period, process });
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
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
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
              ) : (
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
                    : 'Traer empleados'}
              </button>
            </div>
            {form.extractionMode === 'employees' && selection.companyId && !rexCompanyMasterResource && !sourceFile ? (
              <p className="mt-3 text-xs font-semibold text-amber-700">La consulta está habilitada. Carga el maestro REX+ cuando quieras generar el archivo final.</p>
            ) : null}
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              {form.extractionMode === 'payroll' ? 'Procesos payroll' : 'Cobertura'}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {form.extractionMode === 'payroll' ? (
                <>
                  <MetricCard label="Procesos" value={payrollProcesses.length} detail="Encontrados" />
                  <MetricCard label="Períodos" value={payrollPeriods.length} detail={`${form.payrollMonth}/${form.payrollYear}`} />
                  <MetricCard label="Libro" value={payrollBookPayload ? 'Listo' : '-'} detail={payrollBookPayload ? `${payrollBookPayload.summary?.concepts ?? 0} conceptos` : 'Selecciona un proceso'} />
                </>
              ) : (
                <>
                  <MetricCard label="Traídos" value={summary.returned} detail={`de ${summary.totalAvailable} disponibles`} />
                  <MetricCard label="RUT" value={summary.withDocument} detail="Con documento" />
                  <MetricCard label="Dirección" value={summary.withAddress} detail="Con domicilio" />
                  <MetricCard label="Banco" value={summary.withBank} detail="Con pago" />
                  <MetricCard label="Estructuras" value={summary.withStructures} detail="Con org." />
                  <MetricCard label="Email" value={summary.withEmail} detail="Contacto" />
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
                <button
                  type="button"
                  onClick={handlePayrollBookDownload}
                  className="mt-4 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Descargar libro completo
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
    </div>
  );
}

function RexCompanyMasterUploader({ fileName, resource, error, isReading, disabled, onFileSelected }) {
  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];

    if (file && !disabled) {
      onFileSelected(file);
    }
  };

  return (
    <section className="rounded-[24px] border border-brand-200 bg-brand-50/60 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Maestro REX+</p>
          <h3 className="mt-2 text-base font-bold text-slate-950">Carga el archivo base para generar REX+</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Puedes consultar empleados desde VISMA sin este archivo. Debes cargarlo antes de generar el archivo final REX+.
          </p>
        </div>
        <span className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
          Para generar
        </span>
      </div>

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed px-4 py-5 text-center transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-70'
            : 'border-brand-300 bg-white hover:border-brand-500 hover:bg-brand-50'
        }`}
      >
        <span className="text-sm font-semibold text-slate-900">
          {isReading ? 'Leyendo archivo...' : fileName || 'Selecciona o arrastra el archivo de carga REX+'}
        </span>
        <span className="mt-1 text-xs text-slate-500">Formato permitido: .xls / .xlsx</span>
        <input
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          disabled={disabled || isReading}
          onChange={(event) => onFileSelected(event.target.files?.[0])}
        />
      </label>

      {!resource && disabled ? (
        <p className="mt-3 text-xs font-semibold text-amber-700">Selecciona primero una empresa o Todas las empresas.</p>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
          {error}
        </div>
      ) : null}

      {resource ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {resource.masters.map((master) => (
            <div key={master.key} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <p className="text-xs font-semibold text-emerald-800">{master.label}</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{master.count.toLocaleString('es-CL')}</p>
              <p className="text-[11px] text-emerald-700">registros disponibles</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EmployeesPreview({ rows, companyName }) {
  return (
    <section className="panel p-6 sm:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Vista previa</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-950">Empleados normalizados</h3>
        <p className="mt-2 text-sm text-slate-600">Empresa seleccionada: {companyName || 'sin nombre'} · Mostrando hasta 20 filas del lote consultado.</p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['CI', 'NOMBRE', 'EMPRESA', 'POSICION', 'UBICACION', 'CENTRO COSTO', 'BANCO'].map((header) => (
                <th key={header} className="px-4 py-3 font-semibold text-slate-700">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={`${row.__sourceRowNumber}-${row.CI}`}>
                {['CI', 'NOMBRE', 'EMPRESA', 'POSICION', 'UBICACION', 'CENTRO COSTO', 'BANCO'].map((header) => (
                  <td key={header} className="px-4 py-3 text-slate-700">{cleanCell(row[header]) || '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PayrollProcessesPreview({ processes, onLoadBook, isLoading, loadedProcessId }) {
  return (
    <section className="panel p-6 sm:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Libros históricos</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-950">Procesos de remuneraciones disponibles</h3>
        <p className="mt-2 text-sm text-slate-600">Selecciona un proceso para traer el libro completo con conceptos y acumuladores.</p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['ID', 'PERÍODO', 'NOMBRE', 'MODELO', 'ESTADO', 'ACCIÓN'].map((header) => (
                <th key={header} className="px-4 py-3 font-semibold text-slate-700">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {processes.map((process, index) => (
              <tr key={`${process.id}-${index}`}>
                <td className="px-4 py-3 text-slate-700">{process.id || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{process.period || [process.dateFrom, process.dateTo].filter(Boolean).join(' - ') || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{process.name || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{process.model || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{process.status || '-'}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onLoadBook(process)}
                    disabled={isLoading}
                    className="rounded-full border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadedProcessId === process.id ? 'Libro cargado' : isLoading ? 'Consultando...' : 'Traer libro'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
