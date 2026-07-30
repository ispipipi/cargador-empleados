export default function RexTransformResult({
  result,
  activeConfiguration,
  onDownload,
  downloadHref = '',
  downloadName = '',
  isDownloading = false,
  onSaveConfiguration,
  onExportActiveConfiguration,
  onRestart,
}) {
  const isDownloadReady = Boolean(downloadHref && downloadName && !isDownloading);

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1fr_1.04fr]">
          <div className="relative overflow-hidden bg-[#061120] px-6 py-8 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.22),_transparent_28%),radial-gradient(circle_at_85%_20%,_rgba(56,189,248,0.2),_transparent_30%),linear-gradient(180deg,_rgba(8,15,28,1),_rgba(3,7,18,1))]" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Paso 5</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Resultado Meta 4 → REX+</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                El archivo quedó consolidado y listo para descarga después de pasar por la revisión manual de no-match.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard label="Filas exportadas" value={result.summary.totalRows} tone="dark" />
                <MetricCard label="Listas resueltas" value={result.summary.readyRows} tone="success" />
                <MetricCard label="Alertas" value={result.summary.alertCount} tone="warning" />
              </div>
            </div>
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <div className="grid gap-4">
              <ActionCard
                title="Descargar REX+ Empleados"
                subtitle={
                  isDownloading
                    ? 'Estamos preparando el archivo para descargarlo'
                    : isDownloadReady
                      ? 'Incluye todas las filas ya corregidas y ya está listo para bajar'
                      : 'La descarga se habilitará apenas termine la preparación'
                }
                onClick={onDownload}
                href={isDownloadReady ? downloadHref : ''}
                downloadName={isDownloadReady ? downloadName : ''}
                isLoading={isDownloading}
                isDisabled={!isDownloading && !isDownloadReady}
              />

              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Configuración</p>
                <p className="mt-2 text-sm text-slate-700">
                  Guarda esta receta para reutilizarla con el mismo par de transformación en futuras cargas.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onSaveConfiguration(activeConfiguration?.nombre ?? 'Meta 4 → REX+')}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Guardar configuración
                  </button>
                  <button
                    type="button"
                    onClick={onExportActiveConfiguration}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Exportar configuración
                  </button>
                  <button
                    type="button"
                    onClick={onRestart}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Nueva carga
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-950">Resumen de salida</h3>
            <p className="mt-1 text-sm text-slate-600">El archivo quedó bloqueado hasta resolver todos los pendientes, así que esta versión ya es la exportable.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Listo para carga
          </span>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  const toneClassName =
    tone === 'success'
      ? 'bg-emerald-500/10 text-emerald-100'
      : tone === 'warning'
        ? 'bg-amber-400/12 text-amber-100'
        : 'bg-white/10 text-slate-100';

  return (
    <div className={`rounded-[28px] border border-white/10 p-5 ${toneClassName}`}>
      <p className="text-sm">{label}</p>
      <p className="mt-3 text-4xl font-extrabold">{value}</p>
    </div>
  );
}

function ActionCard({ title, subtitle, onClick, href = '', downloadName = '', isLoading = false, isDisabled = false }) {
  const className =
    'rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(248,250,252,1))] px-5 py-5 text-left transition hover:border-brand-300 hover:shadow-sm disabled:cursor-wait disabled:opacity-80';

  if (href && downloadName) {
    return (
      <a href={href} download={downloadName} className={`block ${className}`}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-bold text-slate-950">{title}</p>
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Descargar
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading || isDisabled}
      className={className}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-lg font-bold text-slate-950">{title}</p>
        {isLoading ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50">
            <span className="h-4 w-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
    </button>
  );
}
