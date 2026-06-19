import { useRef } from 'react';

export default function ConfigManager({
  configurations,
  activeConfigurationId,
  onActivate,
  onDelete,
  onImportFile,
  onExportActive,
  hasExportableConfig,
}) {
  const fileInputRef = useRef(null);

  return (
    <div className="panel p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Configuraciones</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">Biblioteca local</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Guarda parámetros frecuentes en tu navegador, reutilízalos y compártelos vía JSON.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
          >
            Importar JSON
          </button>
          <button
            type="button"
            onClick={onExportActive}
            disabled={!hasExportableConfig}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Exportar activa
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => onImportFile(event.target.files?.[0])}
      />

      <div className="mt-6 space-y-3">
        {configurations.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            Aún no hay configuraciones guardadas. Después de una transformación podrás guardar una y reutilizarla.
          </div>
        ) : (
          configurations.map((configuration) => {
            const isActive = configuration.id === activeConfigurationId;

            return (
              <div
                key={configuration.id}
                className={`rounded-3xl border p-4 transition ${
                  isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{configuration.nombre}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {configuration.origen} → {configuration.destino} · {configuration.fechaCreacion}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onActivate(configuration)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-200 text-slate-700 hover:border-brand-200 hover:text-brand-700'
                      }`}
                    >
                      {isActive ? 'Activa' : 'Usar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(configuration)}
                      className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
