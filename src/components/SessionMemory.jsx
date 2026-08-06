const MODULE_LABELS = {
  empleados: 'Empleados',
  conceptos: 'Conceptos',
  'conceptos-historicos': 'Conceptos históricos',
};

export default function SessionMemory({ sessions, onResume, onDelete }) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Memoria local</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Archivos y mapeos guardados</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Las cargas se guardan en este navegador. Puedes retomarlas después de recargar sin volver a seleccionar el archivo.
            Las decisiones de mapeo de Conceptos y Conceptos históricos se reutilizan automáticamente en futuras cargas.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {sessions.length} {sessions.length === 1 ? 'carga' : 'cargas'}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
          Cuando cargues un archivo aparecerá aquí junto con su avance y sus decisiones de mapeo.
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {sessions.map((session) => (
            <article
              key={session.id}
              className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 transition hover:border-brand-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950">{session.fileName || 'Archivo sin nombre'}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {MODULE_LABELS[session.selectedModule] ?? session.selectedModule} · {session.rowCount.toLocaleString('es-CL')} filas
                </p>
                <p className="mt-1 text-xs text-slate-400">Actualizado {formatDate(session.updatedAt)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => onResume(session.id)} className="button-primary">
                  Retomar carga
                </button>
                <button type="button" onClick={() => onDelete(session)} className="button-secondary">
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value) {
  if (!value) {
    return 'sin fecha';
  }

  try {
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'sin fecha';
  }
}
