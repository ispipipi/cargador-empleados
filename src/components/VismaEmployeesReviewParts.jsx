import { cleanCell } from '../lib/utils';

export function RexCompanyMasterUploader({ fileName, resource, error, isReading, disabled, onFileSelected }) {
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
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {resource.masters.map((master) => (
              <div key={master.key} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="text-xs font-semibold text-emerald-800">{master.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-950">{master.count.toLocaleString('es-CL')}</p>
                <p className="text-[11px] text-emerald-700">registros disponibles</p>
              </div>
            ))}
          </div>
          {resource.missingOptionalMasters?.length ? (
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Esta plantilla no incluye una lista separada de {resource.missingOptionalMasters.join(', ').toLowerCase()}. Se utilizará el valor recibido directamente desde VISMA.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function EmployeesPreview({ rows, companyName }) {
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
              {['CI', 'NOMBRE', 'EMPRESA', 'POSICION', 'UBICACION', 'CENTRO COSTO', 'BANCO', 'ISAPRE', 'MONTO SALUD UF'].map((header) => (
                <th key={header} className="px-4 py-3 font-semibold text-slate-700">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={`${row.__sourceRowNumber}-${row.CI}`}>
                {['CI', 'NOMBRE', 'EMPRESA', 'POSICION', 'UBICACION', 'CENTRO COSTO', 'BANCO', 'ISAPRE', 'MONTO SALUD UF'].map((header) => (
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

export function LeavesPreview({ leaves, companyName }) {
  return (
    <section className="panel p-6 sm:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Vista previa</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-950">Licencias, permisos y ausencias</h3>
        <p className="mt-2 text-sm text-slate-600">Empresa seleccionada: {companyName || 'todas'} · Mostrando hasta 100 registros.</p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['RUT', 'NOMBRE', 'TIPO', 'DESDE', 'HASTA', 'DÍAS', 'ESTADO', 'FOLIO'].map((header) => (
                <th key={header} className="px-4 py-3 font-semibold text-slate-700">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {leaves.slice(0, 100).map((leave, index) => (
              <tr key={`${leave.employeeId}-${leave.startDate}-${index}`}>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.rut) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.name) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.type) || cleanCell(leave.typeLeaveId) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.startDate) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.endDate) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{countInclusiveDays(leave.startDate, leave.endDate) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.status) || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{cleanCell(leave.folio) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function countInclusiveDays(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate || startDate);
  if (!start || !end || end < start) {
    return '';
  }

  return Math.floor((end - start) / 86400000) + 1;
}

function parseIsoDate(value) {
  const match = cleanCell(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function PayrollProcessesPreview({ processes, onLoadBook, isLoading, loadedProcessId }) {
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

export function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function triggerTextDownload(contents, fileName) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
