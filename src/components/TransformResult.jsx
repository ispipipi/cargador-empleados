import { useDeferredValue, useMemo, useState } from 'react';

export default function TransformResult({
  colaboradoresResult,
  trabajosResult,
  activeConfiguration,
  onDownloadColaboradoresAll,
  onDownloadColaboradoresClean,
  onDownloadTrabajosAll,
  onDownloadTrabajosClean,
  onSaveConfiguration,
  onExportActiveConfiguration,
  onRestart,
}) {
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [configName, setConfigName] = useState(activeConfiguration?.nombre ?? 'Talana → BUK');
  const deferredColaboradoresErrors = useDeferredValue(colaboradoresResult.errors);
  const deferredColaboradoresAlerts = useDeferredValue(colaboradoresResult.alerts ?? []);
  const deferredTrabajosErrors = useDeferredValue(trabajosResult.errors);

  const visibleColaboradoresErrors = useMemo(
    () => deferredColaboradoresErrors.slice(0, 150),
    [deferredColaboradoresErrors],
  );
  const visibleColaboradoresAlerts = useMemo(
    () => deferredColaboradoresAlerts.slice(0, 150),
    [deferredColaboradoresAlerts],
  );
  const visibleTrabajosErrors = useMemo(
    () => deferredTrabajosErrors.slice(0, 150),
    [deferredTrabajosErrors],
  );

  const handleSave = () => {
    if (!configName.trim()) {
      return;
    }

    onSaveConfiguration(configName);
    setShowSavePanel(false);
  };

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-slate-950 px-6 py-8 text-white sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Paso 4</p>
            <h2 className="mt-3 text-3xl font-extrabold">Resultado de la transformación</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              La transformación terminó. Puedes descargar BUK Colaboradores y BUK Trabajos por separado, incluyendo
              versión completa o solo filas limpias cuando aplique.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <MetricCard label="Colaboradores" value={colaboradoresResult.summary.totalRows} tone="dark" />
              <MetricCard label="Trabajos" value={trabajosResult.summary.totalRows} tone="success" />
              <MetricCard
                label="Advertencias totales"
                value={
                  colaboradoresResult.summary.warningRows +
                  trabajosResult.summary.warningRows +
                  (colaboradoresResult.summary.alertCount ?? 0)
                }
                tone="warning"
              />
            </div>
          </div>

          <div className="px-6 py-8 sm:px-8">
            <div className="grid gap-3">
              <ActionButton
                label="Descargar BUK Colaboradores"
                detail="Incluye todas las filas del archivo de colaboradores"
                onClick={onDownloadColaboradoresAll}
              />
              <ActionButton
                label="Descargar BUK Colaboradores sin errores"
                detail="Genera colaboradores solo con filas completamente resueltas"
                onClick={onDownloadColaboradoresClean}
                disabled={colaboradoresResult.summary.cleanRows === 0}
              />
              <ActionButton
                label="Descargar BUK Trabajos"
                detail="Incluye todas las filas del archivo de trabajos"
                onClick={onDownloadTrabajosAll}
              />
              <ActionButton
                label="Descargar BUK Trabajos sin errores"
                detail="Genera trabajos solo con filas completamente resueltas"
                onClick={onDownloadTrabajosClean}
                disabled={trabajosResult.summary.cleanRows === 0}
              />
              <ActionButton
                label="Guardar configuración"
                detail="Guarda origen, destino y respuestas del wizard en localStorage"
                onClick={() => setShowSavePanel((current) => !current)}
              />
              <ActionButton
                label="Exportar configuración activa"
                detail="Descarga la configuración actual en JSON"
                onClick={onExportActiveConfiguration}
                disabled={!activeConfiguration}
              />
              <ActionButton
                label="Nueva transformación"
                detail="Vuelve al inicio sin perder configuraciones guardadas"
                onClick={onRestart}
              />
            </div>

            {showSavePanel ? (
              <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Nombre de la configuración</span>
                  <input
                    value={configName}
                    onChange={(event) => setConfigName(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                    placeholder="Talana → BUK SSAA"
                  />
                </label>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSavePanel(false)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <ResultDetailsSection
        title="BUK Colaboradores"
        subtitle="Resultado del archivo de colaboradores y su reporte de matching contra Listas."
        result={colaboradoresResult}
        visibleErrors={visibleColaboradoresErrors}
        visibleAlerts={visibleColaboradoresAlerts}
      />

      <ResultDetailsSection
        title="BUK Trabajos"
        subtitle="Resultado del archivo de trabajos y su reporte de matching contra Cargos, Sub-áreas y Empresas."
        result={trabajosResult}
        visibleErrors={visibleTrabajosErrors}
      />
    </div>
  );
}

function ResultDetailsSection({ title, subtitle, result, visibleErrors, visibleAlerts = [] }) {
  return (
    <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </div>
          <p className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            {result.errors.length} errores
          </p>
        </div>

        {result.errors.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">
            No se detectaron errores de matching. Puedes descargar cualquiera de las dos variantes.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">Fila</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Campo</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Valor original</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 bg-white">
                {visibleErrors.map((error, index) => (
                  <tr key={`${error.row}-${error.field}-${index}`} className="bg-amber-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{error.row}</td>
                    <td className="px-4 py-3 text-slate-800">{error.field}</td>
                    <td className="px-4 py-3 text-slate-600">{error.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.errors.length > visibleErrors.length ? (
          <p className="mt-4 text-sm text-slate-500">
            Mostrando las primeras {visibleErrors.length} advertencias de {result.errors.length}.
          </p>
        ) : null}

        {visibleAlerts.length > 0 ? (
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-amber-900">Alertas automáticas</h4>
                <p className="mt-1 text-sm text-amber-800">
                  El sistema completó valores por defecto. También se exportan en la hoja `Alertas`.
                </p>
              </div>
              <p className="rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-900">
                {result.alerts?.length ?? visibleAlerts.length} alertas
              </p>
            </div>

            <div className="mt-4 overflow-x-auto rounded-[20px] border border-amber-200">
              <table className="min-w-full divide-y divide-amber-200 text-left text-sm">
                <thead className="bg-amber-100/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-amber-950">Fila</th>
                    <th className="px-4 py-3 font-semibold text-amber-950">Campo</th>
                    <th className="px-4 py-3 font-semibold text-amber-950">Valor aplicado</th>
                    <th className="px-4 py-3 font-semibold text-amber-950">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 bg-white">
                  {visibleAlerts.map((alert, index) => (
                    <tr key={`${alert.row}-${alert.field}-${index}`} className="bg-amber-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{alert.row}</td>
                      <td className="px-4 py-3 text-slate-800">{alert.field}</td>
                      <td className="px-4 py-3 text-slate-700">{alert.appliedValue}</td>
                      <td className="px-4 py-3 text-slate-600">{alert.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.alerts && result.alerts.length > visibleAlerts.length ? (
              <p className="mt-4 text-sm text-amber-800">
                Mostrando las primeras {visibleAlerts.length} alertas de {result.alerts.length}.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
  );
}

function MetricCard({ label, value, tone }) {
  const tones = {
    dark: 'bg-white/8 text-white',
    success: 'bg-emerald-400/15 text-emerald-100',
    warning: 'bg-amber-300/20 text-amber-100',
  };

  return (
    <div className={`rounded-[24px] p-5 ${tones[tone]}`}>
      <p className="text-sm text-white/80">{label}</p>
      <p className="mt-3 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function ActionButton({ label, detail, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[24px] border border-slate-200 px-5 py-4 text-left transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <p className="text-sm font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </button>
  );
}
