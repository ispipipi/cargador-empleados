import { useVismaWorkspace, ALL_COMPANIES_VALUE } from './VismaWorkspaceProvider';
import VismaMasterListsSection from './VismaMasterListsSection';

export default function VismaMastersReview({ onBack, onBusyChange }) {
  const {
    connection,
    connectionError,
    isLoadingConnection,
    refreshConnection,
    selectedCompany,
    selectedTenant,
    selection,
  } = useVismaWorkspace();
  const companyLabel = selection.companyId === ALL_COMPANIES_VALUE
    ? 'Todas las empresas'
    : selectedCompany?.name || 'Sin empresa seleccionada';

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="bg-hero-grid soft-grid px-6 py-8 sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-700">VISMA · Paso 1</p>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-950">Prepara los maestros VISMA.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
              Consulta y copia los cargos, sedes, áreas, empresas y centros de costo de la conexión seleccionada antes de generar una carga.
            </p>
            <div className="mt-5 rounded-[20px] border border-brand-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Empresa activa</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{companyLabel}</p>
              <p className="mt-1 text-xs text-slate-500">La selección se comparte con Generar archivos de carga.</p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="mt-6 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-300"
            >
              Generar archivos de carga
            </button>
          </div>

          <div className="flex flex-col justify-center gap-4 px-6 py-8 sm:px-8">
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Conexión guardada</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {isLoadingConnection ? 'Validando conexión...' : selectedTenant?.name || 'Credenciales administradas por backend'}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Las credenciales VISMA no se solicitan ni se exponen en el navegador.
              </p>
            </div>

            <button
              type="button"
              onClick={() => refreshConnection(selection.tenantId)}
              disabled={isLoadingConnection}
              className="self-start rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Actualizar conexión
            </button>
          </div>
        </div>
      </section>

      {connectionError ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {connectionError}
        </div>
      ) : null}

      <VismaMasterListsSection
        tenantId={selection.tenantId}
        companyId={selection.companyId}
        companyTypeId={selection.companyTypeId}
        companyName={companyLabel}
        onBusyChange={(isBusy) => {
          onBusyChange?.(isBusy);
        }}
      />
    </div>
  );
}
