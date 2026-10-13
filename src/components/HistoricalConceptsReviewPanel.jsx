import { DownloadButton, HistoricalConceptRow } from './HistoricalConceptsMapperParts';

export default function HistoricalConceptsReviewPanel({ search, setSearch, activeFilter, setActiveFilter, allVisibleSelected, handleSelectAll, bulkTarget, setBulkTarget, catalogOptions, selectedIds, handleBulkApply, visibleDecisions, decisions, handleSelect, assignDecision, isPreparing, summary, selectedCreatedCount, handleDownload, employeeValidation, hasReconciliationBlockers, reconciliation, hasExportBlockers, rexValidation, selectedExportDecisions, selectedExportPending }) {
  return (
        <section className="panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Revisión de mapeo</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">Haberes, descuentos y aportes patronales</h3>
              <p className="mt-2 text-sm text-slate-600">Se incluyen también leyes sociales, salud, SIS y conceptos REX+ tipo 5A. Las provisiones y Renta Imponible RIMA quedan fuera por regla.</p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar concepto…"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm lg:w-80"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              ['all', 'Todos'],
              ['exact', 'Matches perfectos'],
              ['proposal', 'Propuestas'],
              ['no-proposal', 'Sin propuesta'],
              ['pending', 'Pendientes'],
              ['assigned', 'Asignados'],
              ['excluded', 'Excluidos'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  activeFilter === key
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-brand-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={allVisibleSelected} onChange={handleSelectAll} />
              Seleccionar visibles
            </label>
            <select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)} className="max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Asignación masiva…</option>
              {catalogOptions.map((concept) => (
                <option key={concept.id} value={concept.id}>{concept.id} · {concept.name}</option>
              ))}
            </select>
            <button type="button" onClick={handleBulkApply} disabled={!bulkTarget || selectedIds.length === 0} className="button-primary disabled:cursor-not-allowed disabled:bg-slate-300">
              Aplicar a {selectedIds.length} seleccionados
            </button>
            <span className="text-xs text-slate-500">Mostrando {visibleDecisions.length} de {decisions.length}</span>
          </div>

          <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-[1250px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-4"> </th>
                  <th className="px-4 py-4">Estado</th>
                  <th className="px-4 py-4">Concepto Meta4</th>
                  <th className="px-4 py-4">Uso</th>
                  <th className="px-4 py-4">Propuesta / match REX+</th>
                  <th className="px-4 py-4">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleDecisions.map((decision) => (
                  <HistoricalConceptRow
                    key={decision.id}
                    decision={decision}
                    catalog={catalogOptions}
                    selected={selectedIds.includes(decision.id)}
                    disabled={decision.excluded}
                    onSelect={() => handleSelect(decision.id)}
                    onAssign={(targetId) => assignDecision(decision.id, targetId)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {isPreparing ? (
            <div className="mt-6 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-700">
              <div className="flex items-center gap-3 font-semibold"><span className="loader-orb h-2.5 w-2.5 rounded-full bg-sky-500" /><span className="loader-orb h-2.5 w-2.5 rounded-full bg-cyan-500" />Preparando el archivo histórico…</div>
              <p className="mt-2">Estamos construyendo las filas del CSV y validando el orden de las columnas.</p>
            </div>
          ) : null}

          <section className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50/70 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Altas de conceptos</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">Conceptos que se crearán en REX+</h3>
                <p className="mt-2 text-sm text-slate-600">Este listado alimenta el archivo separado de creación de conceptos.</p>
              </div>
              <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                {summary.createdApproved} altas aprobadas
              </span>
            </div>
            {summary.createdApproved > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-amber-200 bg-white">
                <table className="min-w-[680px] w-full text-left text-sm">
                  <thead className="bg-amber-100/60 text-xs uppercase tracking-[0.16em] text-amber-800">
                    <tr>
                      <th className="px-4 py-3">Concepto Meta4</th>
                      <th className="px-4 py-3">ID nuevo</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">LRE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {decisions.filter((decision) => decision.action === 'create' && decision.approved && !decision.excluded).map((decision) => (
                      <tr key={`historical-creation-${decision.id}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{decision.sourceName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{decision.targetId}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{decision.type || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{decision.lreField || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-white/70 px-4 py-4 text-sm text-slate-600">
                Todavía no hay conceptos aprobados para crear. Las propuestas pendientes aparecen destacadas en la tabla.
              </p>
            )}
          </section>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <DownloadButton
              title="Descargar altas de conceptos"
              detail={`${selectedCreatedCount} conceptos nuevos seleccionados para crear en REX+`}
              onClick={() => handleDownload('create')}
              disabled={selectedCreatedCount === 0 || isPreparing}
            />
            <DownloadButton
              title="Descargar archivo de carga a REX+"
              detail={employeeValidation.missing.length
                ? `Faltan ${employeeValidation.missing.length} colaboradores en el listado REX+`
                : hasReconciliationBlockers
                  ? reconciliation.source.status === 'blocked'
                    ? `Hay ${reconciliation.source.differenceRows.toLocaleString('es-CL')} diferencias de líquido en Meta4`
                    : 'Faltan totales para comprobar el líquido'
                : hasExportBlockers
                  ? !rexValidation.valid
                    ? `Hay ${rexValidation.issues.length} validaciones REX+ pendientes`
                    : selectedExportDecisions.length === 0
                    ? 'Selecciona conceptos para generar el archivo'
                    : `Hay ${selectedExportPending.length} conceptos seleccionados por resolver`
                  : 'CSV de Liquidaciones en Detalle listo para cargar en REX+'}
              onClick={() => handleDownload('output')}
              disabled={hasExportBlockers || isPreparing}
              primary
            />
            <DownloadButton
              title="Descargar informe completo"
              detail="Incluye exactos, propuestas, asignaciones y exclusiones"
              onClick={() => handleDownload('report')}
              disabled={isPreparing}
            />
            <DownloadButton
              title="Descargar pendientes"
              detail="Entrega sólo los conceptos que requieren decisión"
              onClick={() => handleDownload('pending')}
              disabled={summary.pending === 0 || isPreparing}
            />
          </div>
        </section>
  );
}
