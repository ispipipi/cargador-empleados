import ConfigManager from './ConfigManager';
import SessionMemory from './SessionMemory';

const SYSTEM_OPTIONS = {
  origins: [
    { id: 'talana', name: 'Talana' },
    { id: 'meta4', name: 'Meta 4' },
    { id: 'visma', name: 'Visma' },
    { id: 'geovictoria', name: 'GeoVictoria' },
  ],
  destinations: [
    { id: 'buk', name: 'BUK' },
    { id: 'rex', name: 'REX+' },
  ],
};

const MODULE_OPTIONS = [
  { id: 'empleados', name: 'Empleados', detail: 'Meta 4 → REX+ Empleados' },
  { id: 'conceptos', name: 'Conceptos', detail: 'Meta 4 → REX+ Conceptos' },
  { id: 'conceptos-historicos', name: 'Conceptos históricos', detail: 'Meta 4 → REX+ Concepto Detalle' },
  { id: 'libros-historicos', name: 'Carga de libros históricos', detail: 'Visma → REX+ Liquidaciones Detalle' },
  { id: 'geovictoria', name: 'GeoVictoria', detail: 'GeoVictoria → REX+ Concepto Detalle' },
];

export default function FormatSelector({
  selectedOrigin,
  selectedDestination,
  mappingCompany,
  selectedModule,
  onChangeOrigin,
  onChangeDestination,
  onChangeMappingCompany,
  onChangeModule,
  onContinue,
  templateStatus,
  conceptCatalogCount,
  isUpdatingConceptCatalog,
  onCatalogSelected,
  pairKey,
  isSupportedPair,
  configurations,
  activeConfigurationId,
  onActivateConfiguration,
  onDeleteConfiguration,
  onImportConfiguration,
  onExportActiveConfiguration,
  sessions,
  onResumeSession,
  onDeleteSession,
}) {
  const templateReady = templateStatus === 'ready';
  const canContinue = templateReady && isSupportedPair;

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-hero-grid soft-grid px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Maper · Paso 1</p>
            <h2 className="mt-3 max-w-xl text-3xl font-extrabold text-slate-950 sm:text-4xl">
              Elige qué quieres transformar.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Maper reúne los flujos de Empleados y Conceptos en un solo lugar, con revisión antes de descargar.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULE_OPTIONS.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => onChangeModule(module.id)}
                  className={`rounded-[24px] border p-5 text-left transition ${
                    selectedModule === module.id
                      ? 'border-brand-500 bg-brand-50 shadow-sm'
                      : 'border-white/70 bg-white/90 hover:border-brand-200'
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Módulo</span>
                  <p className="mt-2 text-xl font-bold text-slate-950">{module.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{module.detail}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

            {['conceptos', 'conceptos-historicos', 'libros-historicos'].includes(selectedModule) ? (
              <label className="mt-4 block rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                <span className="text-sm font-semibold text-slate-900">Empresa de la memoria de mapeos</span>
                <input
                  value={mappingCompany}
                  onChange={(event) => onChangeMappingCompany(event.target.value.toUpperCase())}
                  placeholder="FINNING"
                  className="mt-3 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
                <span className="mt-2 block text-xs leading-5 text-slate-600">
                  Los pareos se reutilizan únicamente para {selectedOrigin} → {selectedDestination} → {mappingCompany || 'esta empresa'}.
                </span>
              </label>
            ) : null}

            <div className="mt-4 flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Catálogo REX+ de conceptos</p>
                <p className="mt-1 text-xs text-slate-500">
                  {conceptCatalogCount > 0
                    ? `${conceptCatalogCount.toLocaleString('es-CL')} conceptos disponibles en memoria`
                    : 'Carga el listado actualizado antes de procesar conceptos históricos.'}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-400 hover:bg-brand-100">
                {isUpdatingConceptCatalog ? 'Actualizando…' : 'Cargar catálogo'}
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  className="sr-only"
                  onChange={(event) => {
                    onCatalogSelected(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  disabled={isUpdatingConceptCatalog}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6 px-6 py-8 sm:px-10 sm:py-10">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Estado de los recursos</p>
              <p className="mt-2 text-sm text-slate-600">
                {templateStatus === 'loading' && 'Cargando los templates embebidos y las listas controladas…'}
                {templateStatus === 'ready' && 'Templates y catálogos listos para la transformación seleccionada.'}
                {templateStatus === 'error' && 'No se pudieron cargar los templates. Revisa los assets embebidos.'}
              </p>
            </div>

            <div className="rounded-[24px] border border-brand-100 bg-brand-50 p-5">
              <p className="text-sm font-semibold text-brand-700">Pair activo</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>
                  {selectedModule === 'libros-historicos'
                    ? 'Lee un libro mensual de Visma y genera Liquidaciones Detalle para REX+.'
                    : selectedModule === 'conceptos-historicos'
                    ? 'Lee la remuneración de Meta 4 y genera el CSV mensual de Concepto Detalle.'
                    : selectedModule === 'conceptos'
                      ? 'Usa los maestros de conceptos, propone altas y genera el archivo de importación REX+.'
                    : selectedModule === 'geovictoria'
                      ? 'Consulta asistencia por API y genera la carga Rex+ con horas extra, atrasos e inasistencias.'
                    : pairKey === 'talana:buk'
                      ? 'Genera 2 archivos: Colaboradores + Trabajos.'
                      : 'Genera 1 archivo final REX+ Empleados.'}
                </li>
                <li>
                  {selectedModule === 'libros-historicos'
                    ? 'Pareará haberes y descuentos contra el catálogo del template REX+.'
                    : selectedModule === 'conceptos-historicos'
                    ? 'Permite asignar matches individuales o masivos y descargar pendientes.'
                    : selectedModule === 'conceptos'
                      ? 'Incluye informe final de matches, altas y advertencias.'
                    : selectedModule === 'geovictoria'
                      ? 'Destaca extras mayores a 10 horas semanales y los mayores atrasos e inasistencias.'
                    : pairKey === 'talana:buk'
                      ? 'Usa wizard y matching contra listas BUK.'
                      : 'Incluye revisión manual de no-match antes de descargar.'}
                </li>
                <li>{isSupportedPair ? 'El par seleccionado está soportado por la app.' : 'Este par aún no está habilitado.'}</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue}
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {selectedModule === 'conceptos'
                ? 'Abrir mapeo de conceptos'
                : selectedModule === 'geovictoria'
                  ? 'Conectar GeoVictoria'
                  : 'Continuar a carga de archivo'}
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
      <SessionMemory sessions={sessions} onResume={onResumeSession} onDelete={onDeleteSession} />
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
