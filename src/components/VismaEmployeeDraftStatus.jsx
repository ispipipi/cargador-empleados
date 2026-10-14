export default function VismaEmployeeDraftStatus({ draft, templateReady, onDownload, onDownloadReport, error }) {
  const unresolvedFields = [...new Set(draft.incomplete.flatMap((item) => item.fields))];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-700">
          <strong>{draft.rowEntries.length.toLocaleString('es-CL')}</strong> RUT encontrados en el maestro VISMA.
          {draft.incomplete.length
            ? ` ${draft.incomplete.length.toLocaleString('es-CL')} todavía necesitan datos obligatorios.`
            : draft.rowEntries.length ? ' Todos los campos requeridos están completos.' : ' No hay altas preparadas para descargar.'}
          {draft.skipped.length ? ` ${draft.skipped.length.toLocaleString('es-CL')} no se pudieron preparar.` : ''}
        </p>
        <button
          type="button"
          onClick={onDownload}
          disabled={!templateReady || !draft.rowEntries.length || draft.incomplete.length > 0 || draft.missingHeaders.length > 0}
          className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Descargar CSV de altas ({draft.rowEntries.length.toLocaleString('es-CL')})
        </button>
      </div>

      {draft.missingHeaders.length ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800">
          La plantilla de empleados no corresponde al formato oficial vigente. Faltan encabezados: {draft.missingHeaders.join(', ')}.
        </p>
      ) : null}

      {draft.incomplete.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs leading-5 text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p><strong>Descarga bloqueada:</strong> REX+ rechaza el archivo completo si una fila obligatoria viene vacía o con un ID fuera de catálogo.</p>
            <button type="button" onClick={onDownloadReport} className="rounded-full border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-900 hover:bg-amber-100">
              Descargar campos pendientes
            </button>
          </div>
          <p className="mt-2">Campos por resolver: {unresolvedFields.join(', ')}.</p>
          <p className="mt-1 text-amber-800">Los campos opcionales pueden quedar vacíos; no se usarán los datos ficticios de la fila de ejemplo como valores para las personas.</p>
        </div>
      ) : null}

      {draft.skipped.length ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Pendientes: {draft.skipped.slice(0, 5).map((item) => `${item.id}: ${item.reason}`).join(' · ')}
          {draft.skipped.length > 5 ? ` · y ${draft.skipped.length - 5} más.` : ''}
        </p>
      ) : null}

      {draft.rowEntries.length ? (
        <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
          La exportación usa los encabezados de la plantilla oficial REX+ vigente en CSV UTF-8. Los IDs se validan contra sus catálogos y el número de contrato se informa como C, según la nota del ejemplo.
        </p>
      ) : null}
      {error ? <p className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800">{error}</p> : null}
    </div>
  );
}
