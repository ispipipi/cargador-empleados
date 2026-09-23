import ConfigManager from './ConfigManager';
import SessionMemory from './SessionMemory';

const SYSTEM_OPTIONS = {
  origins: [
    { id: 'talana', name: 'Talana' },
    { id: 'meta4', name: 'Meta 4' },
    { id: 'visma', name: 'Visma' },
  ],
  destinations: [
    { id: 'buk', name: 'BUK' },
    { id: 'rex', name: 'REX+' },
  ],
};

const MODULE_GROUPS = [
  {
    id: 'empleados',
    number: '01',
    name: 'Carga de empleados',
    eyebrow: 'Personas y estructura',
    description: 'Crea, actualiza y prepara colaboradores para el sistema destino.',
    instruction: 'Usa este grupo para cargar empleados, revisar maestros de origen o preparar una empresa completa desde Visma.',
    modules: ['visma-maestros', 'visma-empleados', 'empleados'],
  },
  {
    id: 'historicos',
    number: '02',
    name: 'Carga de libros históricos',
    eyebrow: 'Procesos mensuales',
    description: 'Convierte libros de remuneraciones y conserva la trazabilidad de cada periodo.',
    instruction: 'Usa este grupo cuando debas cargar un libro mensual y generar liquidaciones históricas o conceptos detalle.',
    modules: ['libros-historicos', 'talana-libros-historicos', 'conceptos-historicos'],
  },
  {
    id: 'conceptos',
    number: '03',
    name: 'Carga de conceptos',
    eyebrow: 'Catálogos y mapeos',
    description: 'Mapea conceptos, actualiza catálogos y prepara altas para REX+.',
    instruction: 'Usa este grupo para revisar el catálogo de conceptos y definir qué conceptos deben reutilizarse o crearse.',
    modules: ['conceptos'],
  },
];

const MODULE_OPTIONS = [
  {
    id: 'visma-maestros',
    group: 'empleados',
    number: '01',
    name: 'Maestros VISMA',
    detail: 'Consulta y copia cargos, sedes y organizaciones',
    instruction: 'Revisa los maestros disponibles en VISMA antes de preparar la carga de empleados.',
    actionLabel: 'Consultar maestros VISMA',
  },
  {
    id: 'visma-empleados',
    group: 'empleados',
    number: '02',
    name: 'Empleados VISMA',
    detail: 'Elige empresa y genera REX+ Empleados',
    instruction: 'Carga una empresa de VISMA y genera el archivo de empleados con identidad, estructura, dirección y datos bancarios.',
    actionLabel: 'Conectar VISMA',
  },
  {
    id: 'empleados',
    group: 'empleados',
    number: '03',
    name: 'Empleados Meta 4',
    detail: 'Meta 4 → REX+ Empleados',
    instruction: 'Carga el Excel de Meta 4, resuelve los no-match y revisa las alertas antes de descargar.',
    actionLabel: 'Continuar a carga de archivo',
  },
  {
    id: 'libros-historicos',
    group: 'historicos',
    number: '01',
    name: 'Libro histórico VISMA',
    detail: 'Visma → REX+ Liquidaciones Detalle',
    instruction: 'Convierte un libro mensual de VISMA y genera el archivo de liquidaciones detalle para REX+.',
    actionLabel: 'Continuar a carga de archivo',
  },
  {
    id: 'talana-libros-historicos',
    group: 'historicos',
    number: '02',
    name: 'Libro histórico Talana',
    detail: 'Talana → BUK Liquidaciones Históricas',
    instruction: 'Convierte un libro mensual de Talana y genera el archivo de liquidaciones históricas para BUK.',
    actionLabel: 'Continuar a carga de archivo',
  },
  {
    id: 'conceptos-historicos',
    group: 'historicos',
    number: '03',
    name: 'Concepto detalle histórico',
    detail: 'Meta 4 → REX+ Concepto Detalle',
    instruction: 'Lee la remuneración mensual de Meta 4, reutiliza los mapeos guardados y prepara un CSV de Concepto Detalle.',
    actionLabel: 'Continuar a carga de archivo',
  },
  {
    id: 'conceptos',
    group: 'conceptos',
    number: '01',
    name: 'Mapeo de conceptos',
    detail: 'Meta 4 → REX+ Conceptos',
    instruction: 'Usa los catálogos guardados para encontrar matches, proponer altas y generar el archivo de importación de conceptos.',
    actionLabel: 'Abrir mapeo de conceptos',
  },
];

const CONCEPT_CATALOG_MODULES = ['conceptos', 'conceptos-historicos', 'libros-historicos', 'talana-libros-historicos'];

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
  const activeModule = MODULE_OPTIONS.find((module) => module.id === selectedModule) || MODULE_OPTIONS[0];
  const activeGroup = MODULE_GROUPS.find((group) => group.id === activeModule.group) || MODULE_GROUPS[0];
  const groupModules = MODULE_OPTIONS.filter((module) => module.group === activeGroup.id);
  const needsMappingCompany = CONCEPT_CATALOG_MODULES.includes(selectedModule);
  const pairLabel = `${selectedOrigin} → ${selectedDestination}`;

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="bg-hero-grid soft-grid px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-700">Maper · Paso 1</p>
              <span className="rounded-full border border-brand-100 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700">
                Selección de solución
              </span>
            </div>
            <h2 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Elige qué necesitas cargar.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Encuentra la solución por tarea. Las instrucciones están disponibles en cada icono de ayuda para mantener la pantalla limpia.
            </p>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {MODULE_GROUPS.map((group) => {
                const isActive = group.id === activeGroup.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onChangeModule(group.modules[0])}
                    aria-pressed={isActive}
                    className={`group rounded-[22px] border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                      isActive
                        ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : 'border-white/80 bg-white/85 hover:border-brand-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {group.number}
                      </span>
                      <Tooltip text={group.instruction} label={`Instrucciones de ${group.name}`} />
                    </div>
                    <p className="mt-4 text-base font-bold text-slate-950">{group.name}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{group.eyebrow}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{group.description}</p>
                    <p className={`mt-4 text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-slate-500'}`}>
                      {group.modules.length} {group.modules.length === 1 ? 'solución disponible' : 'soluciones disponibles'}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-[26px] border border-white/80 bg-white/75 p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">{activeGroup.eyebrow}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{activeGroup.name}</p>
                </div>
                <Tooltip text={activeGroup.instruction} label={`Cómo usar ${activeGroup.name}`} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {groupModules.map((module) => {
                  const isSelected = module.id === selectedModule;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => onChangeModule(module.id)}
                      aria-pressed={isSelected}
                      className={`rounded-2xl border px-4 py-4 text-left transition focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                        isSelected
                          ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                          : 'border-slate-200 bg-white hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-950'}`}>{module.name}</p>
                          <p className={`mt-1 text-xs ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>{module.detail}</p>
                        </div>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-brand-200' : 'text-brand-700'}`}>{module.number}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className={`text-xs leading-5 ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>{module.instruction}</p>
                        <Tooltip text={module.instruction} label={`Instrucciones de ${module.name}`} dark={isSelected} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-white/80 bg-white/75 p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Conexión de la carga</p>
                  <p className="mt-1 text-xs text-slate-500">Define el origen y destino antes de avanzar.</p>
                </div>
                <Tooltip text="Selecciona el sistema desde el que provienen los datos y el sistema donde se generará el archivo." label="Ayuda sobre la conexión" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

            {needsMappingCompany ? (
              <label className="mt-5 block rounded-[26px] border border-amber-200 bg-amber-50/80 p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Empresa de la memoria de mapeos</span>
                  <Tooltip text="Los pareos se reutilizan solo cuando coinciden origen, destino y empresa. Por ejemplo: Meta 4 → REX+ → FINNING." label="Ayuda sobre la memoria de mapeos" />
                </div>
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

            {needsMappingCompany ? (
              <div className="mt-5 flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">↗</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Catálogo REX+ de conceptos</p>
                      <Tooltip text="Carga el listado actualizado de conceptos de REX+ para reconocer matches y evitar crear conceptos que ya existen." label="Ayuda sobre el catálogo REX+" />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {conceptCatalogCount > 0
                        ? `${conceptCatalogCount.toLocaleString('es-CL')} conceptos disponibles en memoria`
                        : 'Carga el listado actualizado antes de procesar conceptos históricos.'}
                    </p>
                  </div>
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
            ) : null}
          </div>

          <div className="flex flex-col gap-5 border-t border-slate-200 bg-white px-6 py-8 sm:px-10 sm:py-10 lg:border-l lg:border-t-0">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Estado de recursos</p>
                <span className={`h-2.5 w-2.5 rounded-full ${templateStatus === 'ready' ? 'bg-emerald-500' : templateStatus === 'error' ? 'bg-rose-500' : 'bg-amber-400'}`} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {templateStatus === 'loading' && 'Cargando templates y listas controladas…'}
                {templateStatus === 'ready' && 'Templates y catálogos listos para la solución seleccionada.'}
                {templateStatus === 'error' && 'No se pudieron cargar los templates. Revisa los assets embebidos.'}
              </p>
            </div>

            <div className="rounded-[24px] border border-brand-100 bg-brand-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Siguiente paso</p>
                  <p className="mt-2 text-xl font-bold text-slate-950">{activeModule.name}</p>
                </div>
                <Tooltip text={activeModule.instruction} label={`Instrucciones de ${activeModule.name}`} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{activeModule.instruction}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white px-3 py-1 text-brand-700">{pairLabel}</span>
                <span className={`rounded-full px-3 py-1 ${isSupportedPair ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {isSupportedPair ? 'Par habilitado' : 'Par no habilitado'}
                </span>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Memoria y trazabilidad</p>
                <Tooltip text="Las configuraciones y sesiones guardadas quedan disponibles para retomarlas sin repetir decisiones." label="Ayuda sobre memoria y trazabilidad" />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Tus mapeos se reutilizan cuando el origen, destino y empresa son los mismos.</p>
            </div>

            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue}
              className="mt-auto rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {activeModule.actionLabel}
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
    <label className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
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

function Tooltip({ text, label, dark = false }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          dark
            ? 'border-slate-600 bg-slate-800 text-slate-200 hover:border-brand-300 hover:text-white'
            : 'border-slate-300 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-700'
        }`}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-64 translate-y-1 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
