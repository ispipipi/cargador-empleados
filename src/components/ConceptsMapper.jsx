import { useState } from 'react';
import { parseConceptCatalogWorkbook } from '../lib/concepts';

function Metric({ label, value, tone = 'light' }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'dark' ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white/80'}`}>
      <p className={`text-xs uppercase tracking-[0.2em] ${tone === 'dark' ? 'text-cyan-200' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === 'dark' ? 'text-white' : 'text-slate-950'}`}>{value}</p>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5m0-16v16m0-16H19M9 7h6M9 11h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

export default function ConceptsMapper({
  resource,
  isReadingMonthlyBook,
  isUpdatingCatalog,
  onBack,
  onMonthlyBookSelected,
  onCatalogUpdated,
}) {
  const [catalogError, setCatalogError] = useState('');
  const mappingCount = resource?.mappingRows?.length ?? 0;
  const conceptCount = resource?.concepts?.length ?? 0;

  const handleCatalogChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setCatalogError('');
    try {
      const catalog = await parseConceptCatalogWorkbook(file);
      onCatalogUpdated(catalog);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'No fue posible leer el listado de conceptos.');
    }
  };

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative overflow-hidden bg-slate-950 p-7 text-white sm:p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative">
              <p className="eyebrow text-cyan-300">Maper · Biblioteca de conceptos</p>
              <h1 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Mantenemos el mapeo listo para comparar
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                Los pareos guardados y el catálogo REX+ quedan disponibles como memoria de trabajo. La comparación no se ejecuta en esta pantalla: comienza únicamente cuando cargas el libro de remuneraciones del mes.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Metric label="Mapeos guardados" value={mappingCount} tone="dark" />
                <Metric label="Conceptos REX+" value={conceptCount} tone="dark" />
                <Metric label="Revisión mensual" value="Al cargar libro" tone="dark" />
              </div>
            </div>
          </div>

          <div className="bg-white p-7 sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-blue-700">Preparación</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Biblioteca lista</h2>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Memoria activa
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Actualiza el catálogo cuando REX+ entregue una nueva versión. Después, carga el libro mensual para iniciar el pareo y revisar sus resultados.
            </p>

            <div className="mt-7 space-y-3">
              <label className="group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50/50">
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-white p-2 text-blue-700 shadow-sm"><UploadIcon /></span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">Actualizar catálogo REX+</span>
                    <span className="mt-1 block text-xs text-slate-500">Guarda los conceptos disponibles para futuros pareos</span>
                  </span>
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">Elegir archivo</span>
                <input type="file" accept=".xls,.xlsx" className="sr-only" onChange={handleCatalogChange} disabled={isUpdatingCatalog} />
              </label>

              <label className="group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 transition hover:border-blue-500 hover:bg-blue-100/70">
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-white p-2 text-blue-700 shadow-sm"><BookIcon /></span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">Cargar libro mensual</span>
                    <span className="mt-1 block text-xs text-slate-600">Activa la comparación y abre la revisión de conceptos</span>
                  </span>
                </span>
                <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">Comenzar</span>
                <input type="file" accept=".xls,.xlsx" className="sr-only" onChange={(event) => onMonthlyBookSelected(event.target.files?.[0])} disabled={isReadingMonthlyBook} />
              </label>
            </div>

            {(isUpdatingCatalog || isReadingMonthlyBook) && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                {isUpdatingCatalog ? 'Actualizando el catálogo REX+…' : 'Leyendo el libro mensual…'}
              </div>
            )}
            {catalogError && <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{catalogError}</p>}

            <button type="button" className="button-secondary mt-7" onClick={onBack}>Volver a módulos</button>
          </div>
        </div>
      </section>

      <section className="panel p-7 sm:p-10">
        <div className="max-w-2xl">
          <p className="eyebrow text-blue-700">Cómo funciona</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">La revisión aparece después de cargar el libro</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Así se evita revisar toda la biblioteca sin contexto. Maper compara solamente los conceptos que vienen en el período que estás procesando.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">01 · Match</p>
            <h3 className="mt-3 font-semibold text-slate-950">Busca primero en memoria</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Los pareos confirmados anteriormente se aplican como match perfecto.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">02 · Propuestas</p>
            <h3 className="mt-3 font-semibold text-slate-950">Muestra sugerencias</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Los casos nuevos se agrupan y puedes confirmar o buscar el concepto correcto.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">03 · Sin propuesta</p>
            <h3 className="mt-3 font-semibold text-slate-950">Deja los casos para decisión</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Los conceptos sin sugerencia quedan visibles para hacer el pareo con buscador.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
