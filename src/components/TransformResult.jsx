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
  const totalWarnings =
    colaboradoresResult.summary.warningRows +
    trabajosResult.summary.warningRows +
    (colaboradoresResult.summary.alertCount ?? 0);

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
        <div className="grid gap-0 lg:grid-cols-[1fr_1.08fr]">
          <div className="relative overflow-hidden bg-[#040816] px-6 py-8 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_transparent_30%),radial-gradient(circle_at_85%_25%,_rgba(34,197,94,0.18),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]" />
            <div className="absolute inset-0 opacity-30 soft-grid" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Paso 4</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold sm:text-4xl">Resultado de la transformación</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                La transformación terminó. Descarga los archivos finales, revisa los errores de matching y guarda esta
                configuración como una receta reutilizable.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Colaboradores"
                  value={colaboradoresResult.summary.totalRows}
                  hint={`${colaboradoresResult.summary.cleanRows} filas limpias`}
                  tone="dark"
                />
                <MetricCard
                  label="Trabajos"
                  value={trabajosResult.summary.totalRows}
                  hint={`${trabajosResult.summary.cleanRows} filas limpias`}
                  tone="success"
                />
                <MetricCard
                  label="Advertencias"
                  value={totalWarnings}
                  hint="Errores más alertas"
                  tone="warning"
                />
              </div>
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,_rgba(248,250,252,0.88),_rgba(255,255,255,1))] px-6 py-8 sm:px-8">
            <div className="grid gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Descargas</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DownloadCard
                    title="BUK Colaboradores"
                    subtitle="Archivo completo listo para carga"
                    detail={`${colaboradoresResult.summary.totalRows} filas incluidas`}
                    accent="cyan"
                    icon={<SpreadsheetIcon />}
                    onClick={onDownloadColaboradoresAll}
                  />
                  <DownloadCard
                    title="BUK Trabajos"
                    subtitle="Archivo completo listo para carga"
                    detail={`${trabajosResult.summary.totalRows} filas incluidas`}
                    accent="emerald"
                    icon={<BriefcaseIcon />}
                    onClick={onDownloadTrabajosAll}
                  />
                  <DownloadCard
                    title="Colaboradores limpios"
                    subtitle="Solo filas sin errores de matching"
                    detail={`${colaboradoresResult.summary.cleanRows} filas disponibles`}
                    accent="sky"
                    icon={<ShieldCheckIcon />}
                    onClick={onDownloadColaboradoresClean}
                    disabled={colaboradoresResult.summary.cleanRows === 0}
                  />
                  <DownloadCard
                    title="Trabajos limpios"
                    subtitle="Solo filas sin errores de matching"
                    detail={`${trabajosResult.summary.cleanRows} filas disponibles`}
                    accent="amber"
                    icon={<ShieldCheckIcon />}
                    onClick={onDownloadTrabajosClean}
                    disabled={trabajosResult.summary.cleanRows === 0}
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Utilidades</p>
                    <h3 className="mt-2 text-lg font-bold text-slate-950">Guarda o reutiliza esta configuración</h3>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-3 text-white">
                    <SparkIcon />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <UtilityButton
                    label="Guardar"
                    detail="Graba esta receta en localStorage"
                    onClick={() => setShowSavePanel((current) => !current)}
                    icon={<SaveIcon />}
                  />
                  <UtilityButton
                    label="Exportar JSON"
                    detail="Descarga la configuración activa"
                    onClick={onExportActiveConfiguration}
                    disabled={!activeConfiguration}
                    icon={<ExportIcon />}
                  />
                  <UtilityButton
                    label="Nueva carga"
                    detail="Reinicia el flujo sin perder recetas"
                    onClick={onRestart}
                    icon={<RefreshIcon />}
                  />
                </div>

                {showSavePanel ? (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Nombre de la configuración</span>
                      <input
                        value={configName}
                        onChange={(event) => setConfigName(event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                        placeholder="Talana → BUK SSAA"
                      />
                    </label>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleSave}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Guardar configuración
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

function MetricCard({ label, value, hint, tone }) {
  const tones = {
    dark: 'border-white/10 bg-white/8 text-white',
    success: 'border-emerald-300/10 bg-emerald-400/15 text-emerald-100',
    warning: 'border-amber-200/10 bg-amber-300/20 text-amber-100',
  };

  return (
    <div className={`rounded-[26px] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${tones[tone]}`}>
      <p className="text-sm text-white/80">{label}</p>
      <p className="mt-3 text-3xl font-extrabold">{value}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/55">{hint}</p>
    </div>
  );
}

function DownloadCard({ title, subtitle, detail, accent, icon, onClick, disabled = false }) {
  const accents = {
    cyan: 'from-cyan-500 to-sky-600 shadow-cyan-500/20',
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/20',
    sky: 'from-sky-500 to-blue-600 shadow-sky-500/20',
    amber: 'from-amber-500 to-orange-500 shadow-amber-500/20',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-none`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accents[accent]}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-extrabold text-slate-950">{title}</p>
          <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p>
        </div>
        <div className={`rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg ${accents[accent]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{detail}</p>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-slate-700 transition group-hover:border-slate-300 group-hover:text-slate-950">
          Descargar
          <ArrowDownIcon />
        </span>
      </div>
    </button>
  );
}

function UtilityButton({ label, detail, onClick, icon, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-2.5 text-slate-700 shadow-sm">{icon}</div>
        <div>
          <p className="text-sm font-bold text-slate-900">{label}</p>
          <p className="mt-1 text-sm text-slate-600">{detail}</p>
        </div>
      </div>
    </button>
  );
}

function SpreadsheetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3.75h6.5L20.25 9.5V19A1.25 1.25 0 0 1 19 20.25H8A1.25 1.25 0 0 1 6.75 19V5A1.25 1.25 0 0 1 8 3.75Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14.5 3.75V9.5h5.75" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 12h7M9.5 15.5h7M9.5 19h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 6.25h7a1 1 0 0 1 1 1v1.5h2.75A1.75 1.75 0 0 1 21 10.5v7.25a1.75 1.75 0 0 1-1.75 1.75H4.75A1.75 1.75 0 0 1 3 17.75V10.5a1.75 1.75 0 0 1 1.75-1.75H7.5v-1.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 8.75v-1h5v1M3 13.25h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.75 18.25 6v5.5c0 4.13-2.73 7.35-6.25 8.75-3.52-1.4-6.25-4.62-6.25-8.75V6L12 3.75Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m9.25 12.25 1.75 1.75 3.75-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 4.75h11.75L20 8v11.25A1.75 1.75 0 0 1 18.25 21H5.75A1.75 1.75 0 0 1 4 19.25V6.5A1.75 1.75 0 0 1 5.75 4.75Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 4.75v5h7v-5M8.5 16.5h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4.75v9.5M8.5 10.75 12 14.25l3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 15.75v2.5A1.75 1.75 0 0 0 7.5 20h9a1.75 1.75 0 0 0 1.75-1.75v-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19.25 12A7.25 7.25 0 1 1 17 6.75M19.25 4.75v4.5h-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3.75 1.8 4.7 4.7 1.8-4.7 1.8L12 16.75l-1.8-4.7-4.7-1.8 4.7-1.8L12 3.75ZM18.5 15.5l.9 2.35 2.35.9-2.35.9-.9 2.35-.9-2.35-2.35-.9 2.35-.9.9-2.35ZM6 16l.65 1.7 1.7.65-1.7.65L6 20.7l-.65-1.7-1.7-.65 1.7-.65L6 16Z" fill="currentColor" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5.75v10.5M7.75 12l4.25 4.25L16.25 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
