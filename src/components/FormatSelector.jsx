import ConfigManager from './ConfigManager';

const SYSTEM_OPTIONS = {
  origins: [{ id: 'talana', name: 'Talana' }],
  destinations: [{ id: 'buk', name: 'BUK' }],
};

export default function FormatSelector({
  selectedOrigin,
  selectedDestination,
  onChangeOrigin,
  onChangeDestination,
  onContinue,
  templateStatus,
  configurations,
  activeConfigurationId,
  onActivateConfiguration,
  onDeleteConfiguration,
  onImportConfiguration,
  onExportActiveConfiguration,
}) {
  const templateReady = templateStatus === 'ready';

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-hero-grid soft-grid px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Paso 1</p>
            <h2 className="mt-3 max-w-xl text-3xl font-extrabold text-slate-950 sm:text-4xl">
              Define el par de transformación y prepara la carga.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              El MVP parte con Talana → BUK, pero el motor queda preparado para extenderse a más orígenes y destinos.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <SelectorCard
                label="Sistema origen"
                value={selectedOrigin}
                options={SYSTEM_OPTIONS.origins}
                onChange={onChangeOrigin}
              />
              <SelectorCard
                label="Sistema destino"
                value={selectedDestination}
                options={SYSTEM_OPTIONS.destinations}
                onChange={onChangeDestination}
              />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6 px-6 py-8 sm:px-10 sm:py-10">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Estado de los templates BUK</p>
              <p className="mt-2 text-sm text-slate-600">
                {templateStatus === 'loading' && 'Cargando los templates embebidos y las listas controladas…'}
                {templateStatus === 'ready' && 'Templates listos. Se usarán para listas, headers y exportación final.'}
                {templateStatus === 'error' && 'No se pudieron cargar los templates. Revisa los assets embebidos.'}
              </p>
            </div>

            <div className="rounded-[24px] border border-brand-100 bg-brand-50 p-5">
              <p className="text-sm font-semibold text-brand-700">Incluye en esta versión</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>Validación de columnas Talana</li>
                <li>Wizard de 3 preguntas</li>
                <li>Matching contra hoja Listas del template</li>
                <li>Este destino genera 2 archivos: Colaboradores + Trabajos</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onContinue}
              disabled={!templateReady}
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Continuar a carga de archivo
            </button>
          </div>
        </div>
      </section>

      <ConfigManager
        configurations={configurations}
        activeConfigurationId={activeConfigurationId}
        onActivate={onActivateConfiguration}
        onDelete={onDeleteConfiguration}
        onImportFile={onImportConfiguration}
        onExportActive={onExportActiveConfiguration}
        hasExportableConfig={Boolean(activeConfigurationId)}
      />
    </div>
  );
}

function SelectorCard({ label, value, options, onChange }) {
  return (
    <label className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-sm">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
