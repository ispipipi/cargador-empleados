import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  buildGeovictoriaReviewModel,
  buildRexConceptDetailWorkbook,
  caseTypeLabel,
  formatCaseValue,
} from '../lib/geovictoria';
import { todayStamp } from '../lib/utils';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'high', label: 'Destacados' },
  { id: 'overtime', label: 'Horas extra' },
  { id: 'delay', label: 'Atrasos' },
  { id: 'absence', label: 'Inasistencias' },
  { id: 'approved', label: 'Aprobados' },
  { id: 'rejected', label: 'No aprobados' },
];

const PROXY_ENDPOINT = '/api/geovictoria/payroll-preview';

export default function GeovictoriaReview({ onBack, onBusyChange }) {
  const [form, setForm] = useState({
    apiKey: '',
    apiSecret: '',
    startDate: '',
    endDate: '',
  });
  const [model, setModel] = useState(null);
  const [cases, setCases] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const visibleCases = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return cases.filter((item) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'high' && item.severity === 'high') ||
        (activeFilter === 'approved' && item.approved) ||
        (activeFilter === 'rejected' && !item.approved) ||
        item.type === activeFilter;
      const matchesSearch =
        !normalizedSearch ||
        item.employeeName.toLowerCase().includes(normalizedSearch) ||
        item.identifier.toLowerCase().includes(normalizedSearch) ||
        item.concept.toLowerCase().includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, cases, search]);

  const summary = useMemo(() => summarizeCurrentCases(cases, model?.summary), [cases, model]);
  const canQuery = form.apiKey.trim() && form.apiSecret.trim() && form.startDate && form.endDate && !isLoading;
  const canExport = cases.some((item) => item.approved) && !isExporting;

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleQuery = async () => {
    if (!canQuery) {
      return;
    }

    setError('');
    setIsLoading(true);
    onBusyChange?.(true);

    try {
      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: form.apiKey.trim(),
          apiSecret: form.apiSecret,
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || 'No se pudo consultar GeoVictoria.');
      }

      const nextModel = buildGeovictoriaReviewModel({
        users: payload.users,
        attendanceBook: payload.attendanceBook,
        overtime: payload.overtime,
        startDate: form.startDate,
        endDate: form.endDate,
      });

      setModel(nextModel);
      setCases(nextModel.cases);
      setActiveFilter('all');
    } catch (queryError) {
      setModel(null);
      setCases([]);
      setError(queryError instanceof Error ? queryError.message : 'No se pudo consultar GeoVictoria.');
    } finally {
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  const toggleCase = (caseId) => {
    setCases((current) => current.map((item) => (item.id === caseId ? { ...item, approved: !item.approved } : item)));
  };

  const setVisibleApproval = (approved) => {
    const ids = new Set(visibleCases.map((item) => item.id));
    setCases((current) => current.map((item) => (ids.has(item.id) ? { ...item, approved } : item)));
  };

  const handleExport = () => {
    if (!canExport) {
      return;
    }

    setIsExporting(true);

    try {
      const workbook = buildRexConceptDetailWorkbook({ cases });
      const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `REX_geovictoria_conceptos_detalle_${todayStamp()}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'No se pudo generar el archivo Rex+.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-hero-grid soft-grid px-6 py-8 sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-700">GeoVictoria · Rex+</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-950">Consulta asistencia y arma la carga.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
              Las credenciales se envian al proxy backend. La pantalla recibe solo la respuesta normalizada para revisar
              horas extra, atrasos e inasistencias antes de exportar.
            </p>

            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Clave API</span>
                <input
                  value={form.apiKey}
                  onChange={(event) => updateForm('apiKey', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Secreto</span>
                <input
                  value={form.apiSecret}
                  onChange={(event) => updateForm('apiSecret', event.target.value)}
                  type="password"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  autoComplete="off"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Fecha inicio</span>
                  <input
                    value={form.startDate}
                    onChange={(event) => updateForm('startDate', event.target.value)}
                    type="date"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Fecha termino</span>
                  <input
                    value={form.endDate}
                    onChange={(event) => updateForm('endDate', event.target.value)}
                    type="date"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  />
                </label>
              </div>
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
                {isLoading ? 'Consultando...' : 'Traer datos'}
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Analisis</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Usuarios" value={summary.userCount} detail="Activos consultados" />
              <MetricCard label="Casos" value={summary.totalCases} detail={`${summary.approvedCases} aprobados`} />
              <MetricCard label="Extras" value={summary.overtimeHours} detail="Horas detectadas" />
              <MetricCard label="Alertas" value={summary.highRiskCases} detail="Requieren revision" tone="warning" />
            </div>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Conceptos de salida</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                <ConceptPill label="Horas extra" value="hheee50" />
                <ConceptPill label="Atrasos" value="minatrasos" />
                <ConceptPill label="Inasistencias" value="faltaDias" />
              </div>
            </div>

            {error ? (
              <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {model ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setVisibleApproval(true)}
                  disabled={visibleCases.length === 0}
                  className="button-secondary"
                >
                  Aprobar visibles
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleApproval(false)}
                  disabled={visibleCases.length === 0}
                  className="button-secondary"
                >
                  Marcar no aprobados
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!canExport}
                  className="button-primary disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isExporting ? 'Generando...' : 'Descargar Rex+'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {model ? (
        <section className="panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Revision</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">Casos detectados</h3>
              <p className="mt-2 text-sm text-slate-600">
                Los casos destacados aparecen arriba. Aprueba solo lo que debe entrar al archivo de carga Rex+.
              </p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar trabajador, RUT o concepto"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 lg:max-w-sm"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeFilter === filter.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">Estado</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Trabajador</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Valor</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Periodo</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleCases.map((item) => (
                  <tr key={item.id} className={item.severity === 'high' ? 'bg-amber-50/70' : ''}>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={item.approved}
                          onChange={() => toggleCase(item.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        {item.approved ? 'Aprobado' : 'No aprobado'}
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.employeeName}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.identifier} · CC {item.costCenter || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass(item.severity)}`}>
                        {caseTypeLabel(item.type)}
                      </span>
                      <p className="mt-2 font-mono text-xs text-slate-500">{item.concept}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-800">{formatCaseValue(item)}</td>
                    <td className="px-4 py-3 text-slate-600">{item.periodLabel}</td>
                    <td className="max-w-sm px-4 py-3 text-slate-600">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCases.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              No hay casos para el filtro actual.
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function summarizeCurrentCases(cases, baseSummary) {
  const approvedCases = cases.filter((item) => item.approved).length;

  return {
    userCount: baseSummary?.userCount ?? 0,
    totalCases: cases.length,
    approvedCases,
    highRiskCases: cases.filter((item) => item.severity === 'high').length,
    overtimeHours: sumType(cases, 'overtime').toFixed(2).replace(/0+$/, '').replace(/\.$/, '.0'),
  };
}

function sumType(cases, type) {
  return cases.filter((item) => item.type === type).reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function MetricCard({ label, value, detail, tone = 'default' }) {
  return (
    <div className={`rounded-[24px] border p-4 ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function ConceptPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-white bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function toneClass(severity) {
  if (severity === 'high') {
    return 'bg-amber-100 text-amber-800';
  }

  if (severity === 'medium') {
    return 'bg-sky-100 text-sky-800';
  }

  return 'bg-emerald-100 text-emerald-800';
}
