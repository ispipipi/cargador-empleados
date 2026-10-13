import { canIncludeInHistoricalOutput, DownloadButton, formatHistoricalMoney, getConceptGroup, buildHistoricalLoadFileName } from './HistoricalConceptsMapperParts';

export default function HistoricalConceptsExportPanel({ selectedExportIdsInGroup, exportGroup, setExportGroup, decisions, exportGroupDecisions, allExportGroupSelected, handleExportGroupSelectAll, exportSelectedIds, handleExportSelect, remainingEmployeeIds, batchSize, setBatchSize, preparedBatch, hasExportBlockers, employeeValidation, hasReconciliationBlockers, reconciliation, rexValidation, selectedExportDecisions, selectedExportPending, nextBatchEmployeeIds, completedEmployeeIds, sourceFile, handleDownload, handleMarkBatchCompleted, isPreparing, selectedCreatedCount, onBack, handleApproveExact, handleApproveCreations }) {
  return (
    <>
              <section className="mt-5 rounded-[28px] border border-indigo-200 bg-indigo-50/70 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">Archivo de carga</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">Elige qué conceptos incluir</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      El archivo puede contener haberes y descuentos. Puedes revisar por grupo y marcar los conceptos que quieres incluir en el CSV de Liquidaciones en Detalle.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                    {selectedExportIdsInGroup.length} seleccionados
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setExportGroup('all')}
                    className={`rounded-2xl border p-4 text-left transition ${exportGroup === 'all' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}
                  >
                    <div className="flex items-center justify-between gap-3"><span className="font-semibold">Todos</span><span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">{decisions.length}</span></div>
                    <p className="mt-2 text-xs opacity-80">Haberes, descuentos y leyes del libro</p>
                  </button>
                  {[
                    ['haber', 'Haberes', 'Conceptos pagados o devengados', 'border-emerald-300 bg-emerald-50 text-emerald-800'],
                    ['descuento', 'Descuentos', 'Descuentos del colaborador', 'border-amber-300 bg-amber-50 text-amber-800'],
                    ['aporte', 'Aportes patronales', 'SIS, mutuales y aportes del empleador', 'border-sky-300 bg-sky-50 text-sky-800'],
                  ].map(([groupId, label, detail, activeClass]) => {
                    const groupCount = decisions.filter((decision) => getConceptGroup(decision) === groupId).length;
                    const isActive = exportGroup === groupId;

                    return (
                      <button
                        key={groupId}
                        type="button"
                        onClick={() => setExportGroup(groupId)}
                        className={`rounded-2xl border p-4 text-left transition ${isActive ? activeClass : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold">{label}</span>
                          <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">{groupCount}</span>
                        </div>
                        <p className="mt-2 text-xs opacity-80">{detail}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-indigo-100 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={allExportGroupSelected} onChange={handleExportGroupSelectAll} />
                      Seleccionar todos los {exportGroup === 'all' ? 'conceptos disponibles' : exportGroup === 'haber' ? 'haberes' : exportGroup === 'descuento' ? 'descuentos disponibles' : 'aportes patronales disponibles'}
                    </label>
                    <span className="text-xs text-slate-500">
                      {exportGroupDecisions.length} conceptos del grupo · {selectedExportIdsInGroup.length} incluidos
                    </span>
                  </div>

                  <div className="mt-4 grid max-h-96 gap-2 overflow-y-auto pr-1">
                    {exportGroupDecisions.map((decision) => {
                      const canInclude = canIncludeInHistoricalOutput(decision);
                      const hasNonZeroAmount = Number(decision.nonZeroCount) > 0;
                      const status = decision.excluded
                        ? 'Excluido'
                        : !hasNonZeroAmount
                          ? 'Sin valores distintos de cero'
                        : canInclude
                          ? 'Listo para incluir'
                          : 'Pendiente de mapeo';

                      return (
                        <label
                          key={`export-${decision.id}`}
                          className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm ${canInclude ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-slate-100/70 text-slate-500'}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={exportSelectedIds.includes(decision.id)}
                            disabled={!canInclude}
                            onChange={() => handleExportSelect(decision)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-semibold leading-5 text-slate-900">{decision.sourceName}</span>
                            <span className="mt-1 block break-words text-xs leading-5 text-slate-500">
                              {decision.targetName ? `${decision.targetName} (${decision.targetId})` : 'Sin concepto REX+ asignado'}
                            </span>
                            <span className={`mt-1 block text-[11px] font-semibold ${canInclude ? 'text-emerald-700' : 'text-amber-700'}`}>{status}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>
              <section className="mt-5 rounded-[28px] border border-brand-200 bg-brand-50 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Carga controlada</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">Descargar siguiente lote para REX+</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Se incluyen los conceptos seleccionados de todo el libro para cada colaborador del lote. El archivo se descarga como CSV y usa el acumulado de trabajadores cargados en el nombre. Cuando REX+ confirme la carga, marca el lote como realizado para descontarlo y no duplicarlo.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                    {remainingEmployeeIds.length.toLocaleString('es-CL')} restantes
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Colaboradores por lote
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={batchSize}
                      disabled={Boolean(preparedBatch)}
                      onChange={(event) => setBatchSize(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))}
                      className="mt-2 block w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal tracking-normal text-slate-900 disabled:bg-slate-100"
                    />
                  </label>
                  {[10, 50, 100, 500].map((size) => (
                    <button
                      key={size}
                      type="button"
                      disabled={Boolean(preparedBatch)}
                      onClick={() => setBatchSize(size)}
                      className="rounded-full border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {size}
                    </button>
                  ))}
                </div>

                {hasExportBlockers ? (
                  <>
                    <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {employeeValidation.missing.length > 0
                        ? `Faltan ${employeeValidation.missing.length} colaboradores en el listado REX+.`
                        : hasReconciliationBlockers
                          ? reconciliation.source.status === 'blocked'
                            ? `El libro Meta4 tiene ${reconciliation.source.differenceRows.toLocaleString('es-CL')} diferencias de líquido.`
                            : 'No se puede comprobar el líquido porque faltan totales en el libro Meta4.'
                        : !rexValidation.valid
                          ? `Hay ${rexValidation.issues.length} filas que no cumplen las validaciones de REX+. Corrígelas antes de descargar.`
                        : selectedExportDecisions.length === 0
                          ? 'Selecciona al menos un concepto listo para incluir en el archivo.'
                          : `Hay ${selectedExportPending.length} conceptos seleccionados que todavía requieren mapeo.`}
                    </p>
                    {!rexValidation.valid ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                        <p className="font-semibold">Detalle de validación REX+</p>
                        <ul className="mt-2 space-y-1 text-xs leading-5">
                          {rexValidation.issues.slice(0, 5).map((issue) => (
                            <li key={`${issue.row}-${issue.employeeId}-${issue.conceptId}`}>
                              Fila {issue.row} · {issue.employeeId} · {issue.conceptId}: {issue.message || issue.institutionId || 'vacío'}
                              {issue.amount !== undefined ? ` (${formatHistoricalMoney(issue.amount)})` : ''}
                            </li>
                          ))}
                        </ul>
                        {rexValidation.issues.length > 5 ? <p className="mt-2 text-xs">Se muestran 5 de {rexValidation.issues.length} observaciones.</p> : null}
                      </div>
                    ) : null}
                  </>
                ) : preparedBatch ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <p className="font-semibold">Lote preparado: {preparedBatch.employeeIds.length.toLocaleString('es-CL')} colaboradores.</p>
                    <p className="mt-1">Archivo: <strong>{preparedBatch.fileName}</strong>. Si la carga falló en REX+, puedes descargar nuevamente el mismo lote. Si fue correcta, márcalo como realizado.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleDownload('batch')} className="button-secondary border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
                        Descargar este lote nuevamente
                      </button>
                      <button type="button" onClick={handleMarkBatchCompleted} className="button-primary bg-emerald-700 hover:bg-emerald-800">
                        Marcar lote como realizado
                      </button>
                    </div>
                  </div>
                ) : remainingEmployeeIds.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-600">
                      Próximo lote: <strong className="text-slate-900">{nextBatchEmployeeIds.length.toLocaleString('es-CL')} colaboradores</strong>. Archivo: <strong className="text-slate-900">{buildHistoricalLoadFileName(completedEmployeeIds.size + nextBatchEmployeeIds.length, sourceFile.period)}</strong>.
                    </p>
                    <button type="button" onClick={() => handleDownload('batch')} className="button-primary shrink-0" disabled={isPreparing}>
                      Descargar siguiente lote
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Todos los colaboradores elegibles ya fueron marcados como realizados. No quedan registros para volver a descargar.
                  </p>
                )}
              </section>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DownloadButton
                  title="Descargar archivo de carga a REX+"
                  detail={employeeValidation.missing.length
                    ? `Bloqueado: faltan ${employeeValidation.missing.length} colaboradores REX+`
                    : hasReconciliationBlockers
                      ? reconciliation.source.status === 'blocked'
                        ? `Bloqueado: ${reconciliation.source.differenceRows.toLocaleString('es-CL')} diferencias de líquido`
                        : 'Bloqueado: no se pudo comprobar el líquido del libro'
                    : !rexValidation.valid
                      ? `Bloqueado: ${rexValidation.issues.length} validaciones REX+ pendientes`
                    : hasExportBlockers
                      ? selectedExportDecisions.length === 0
                        ? 'Selecciona conceptos para generar el archivo'
                        : `Hay ${selectedExportPending.length} conceptos seleccionados por resolver`
                      : 'CSV de Liquidaciones en Detalle listo para cargar en REX+'}
                  onClick={() => handleDownload('output')}
                  disabled={hasExportBlockers || isPreparing}
                  primary
                />
                <DownloadButton
                  title="Descargar altas de conceptos"
                  detail={`${selectedCreatedCount} conceptos nuevos seleccionados para crear en REX+`}
                  onClick={() => handleDownload('create')}
                  disabled={selectedCreatedCount === 0 || isPreparing}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={onBack} className="button-secondary">Volver a módulos</button>
                <button type="button" onClick={handleApproveExact} className="button-primary">Aprobar matches perfectos</button>
                <button type="button" onClick={handleApproveCreations} className="button-secondary">Aprobar creaciones ({decisions.filter((decision) => decision.action === 'create' && !decision.approved).length})</button>
              </div>
    </>
  );
}
