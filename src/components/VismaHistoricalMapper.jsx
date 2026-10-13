import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ConceptSearchPicker from './ConceptSearchPicker';
import {
  buildVismaHistoricalCsv,
  buildVismaHistoricalModel,
  buildVismaHistoricalReportRows,
  getVismaHistoricalEmployeeIds,
  summarizeVismaHistoricalDecisions,
} from '../lib/vismaHistorical';
import { normalizeText, todayStamp } from '../lib/utils';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';

const MAPPING_NAMESPACE = 'visma-historical';

export default function VismaHistoricalMapper({ sourceFile, resource, employeeCatalog = [], mappingScope, batchState, onBatchStateChange, onBack, onBusyChange }) {
  const [model, setModel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isBuilding, setIsBuilding] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [batchSize, setBatchSize] = useState(100);
  const [preparedBatch, setPreparedBatch] = useState(null);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let active = true;
    setIsBuilding(true);
    onBusyChange?.(true);

    const timerId = window.setTimeout(() => {
      const nextModel = buildVismaHistoricalModel({
        sourceRows: sourceFile.rows,
        sourceHeaders: sourceFile.headers,
        resource,
        employeeCatalog,
      });
      const storedDecisions = nextModel.decisions.map((decision) => applyStoredHistoricalMapping(
        MAPPING_NAMESPACE,
        decision,
        { concepts: nextModel.catalog, scope: mappingScope, strictCatalog: true },
      ));

      if (!active) {
        return;
      }

      setModel(nextModel);
      setDecisions(storedDecisions);
      setIsBuilding(false);
      onBusyChange?.(false);
    }, 80);

    return () => {
      active = false;
      window.clearTimeout(timerId);
      onBusyChange?.(false);
    };
  }, [employeeCatalog, mappingScope, onBusyChange, resource, sourceFile]);

  useEffect(() => {
    onBusyChange?.(isBuilding || isDownloading);
  }, [isBuilding, isDownloading, onBusyChange]);

  useEffect(() => {
    rememberConceptMappings(MAPPING_NAMESPACE, decisions, mappingScope);
  }, [decisions, mappingScope]);

  const summary = summarizeVismaHistoricalDecisions(decisions);
  const catalog = model?.catalog ?? [];
  const employeeValidation = model?.employeeValidation ?? { total: 0, matched: 0, issues: [] };
  const batchKey = useMemo(() => [
    'visma-rex-historical',
    mappingScope?.key ?? 'visma:rex',
    sourceFile.uploadId ?? '',
    sourceFile.fileNames?.join(',') ?? sourceFile.fileName ?? '',
    sourceFile.period ?? '',
    sourceFile.rows.length,
  ].join('|'), [mappingScope?.key, sourceFile]);
  const completedEmployeeIds = useMemo(() => new Set(
    batchState?.batchKey === batchKey ? (batchState.completedEmployeeIds ?? []).map(normalizeEmployeeKey) : [],
  ), [batchKey, batchState]);
  const eligibleEmployeeIds = useMemo(() => getVismaHistoricalEmployeeIds({
    sourceRows: sourceFile.rows,
    decisions,
    employeeCatalog,
  }), [decisions, employeeCatalog, sourceFile.rows]);
  const remainingEmployeeIds = useMemo(
    () => eligibleEmployeeIds.filter((employeeId) => !completedEmployeeIds.has(normalizeEmployeeKey(employeeId))),
    [completedEmployeeIds, eligibleEmployeeIds],
  );
  const normalizedBatchSize = Math.max(1, Math.min(10000, Number(batchSize) || 1));
  const nextBatchEmployeeIds = remainingEmployeeIds.slice(0, normalizedBatchSize);
  const isReadyToDownload = summary.pending + summary.proposals === 0
    && employeeValidation.issues.length === 0
    && nextBatchEmployeeIds.length > 0;

  useEffect(() => {
    setPreparedBatch(null);
  }, [batchKey, decisions, mappingScope]);
  const visibleDecisions = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return decisions
      .filter((decision) => {
        const matchesSearch = !normalizedSearch || normalizeText(`${decision.sourceName} ${decision.sourceKey} ${decision.targetId} ${decision.targetName}`).includes(normalizedSearch);
        const matchesFilter = activeFilter === 'all'
          || (activeFilter === 'exact' && decision.matchStatus === 'exact')
          || (activeFilter === 'proposal' && !decision.approved && decision.suggestedMatches.length > 0)
          || (activeFilter === 'pending' && !decision.approved && decision.suggestedMatches.length === 0)
          || (activeFilter === 'excluded' && decision.excluded);

        return matchesSearch && matchesFilter;
      })
      .sort((left, right) => getReviewGroup(left) - getReviewGroup(right) || left.sourceName.localeCompare(right.sourceName));
  }, [activeFilter, decisions, search]);

  const updateDecision = (decisionId, patch) => {
    setDecisions((current) => current.map((decision) => decision.id === decisionId ? { ...decision, ...patch } : decision));
  };

  const assignDecision = (decisionId, targetId) => {
    if (targetId === '__exclude__') {
      updateDecision(decisionId, {
        targetId: '',
        targetName: '',
        targetConcept: null,
        action: 'exclude',
        approved: true,
        excluded: true,
        matchStatus: 'excluded',
        duplicateHeaderReviewed: Boolean(decisions.find((decision) => decision.id === decisionId)?.isDuplicateHeader),
      });
      return;
    }

    const concept = catalog.find((entry) => entry.id === targetId);
    if (!concept) {
      return;
    }

    updateDecision(decisionId, {
      targetId: concept.id,
      targetName: concept.name,
      targetConcept: concept,
      action: 'reuse',
      approved: true,
      excluded: false,
      matchStatus: 'manual',
      duplicateHeaderReviewed: Boolean(decisions.find((decision) => decision.id === decisionId)?.isDuplicateHeader),
    });
  };

  const downloadBatch = (employeeIds, isRetry = false) => {
    if (!isReadyToDownload || isDownloading || !employeeIds?.length) {
      return;
    }

    setIsDownloading(true);
    setDownloadError('');
    window.setTimeout(() => {
      try {
        const csv = buildVismaHistoricalCsv({
          sourceRows: sourceFile.rows,
          decisions,
          period: sourceFile.period,
          resource,
          employeeCatalog,
          employeeIds,
        });
        const cumulativeCount = completedEmployeeIds.size + employeeIds.length;
        downloadBlob(csv, `${cumulativeCount} ${periodFileLabel(sourceFile.period)}.csv`, 'text/csv;charset=utf-8');
        setPreparedBatch({ employeeIds, downloadedAt: new Date().toISOString(), isRetry });
      } catch (error) {
        setDownloadError(error instanceof Error ? error.message : 'No se pudo preparar el CSV.');
      } finally {
        setIsDownloading(false);
      }
    }, 40);
  };

  const handleMarkBatchCompleted = () => {
    if (!preparedBatch?.employeeIds?.length) return;
    const confirmed = window.confirm(
      `¿Confirmas que el lote de ${preparedBatch.employeeIds.length} trabajadores se cargó correctamente en REX+?\n\nAl confirmar, no volverá a incluirse en los siguientes lotes.`,
    );
    if (!confirmed) return;

    onBatchStateChange?.({
      batchKey,
      completedEmployeeIds: [...new Set([...completedEmployeeIds, ...preparedBatch.employeeIds.map(normalizeEmployeeKey)])],
    });
    setPreparedBatch(null);
  };

  const downloadReport = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(buildVismaHistoricalReportRows(decisions));
    XLSX.utils.book_append_sheet(workbook, sheet, 'Mapeo Visma REX');
    if (employeeValidation.issues.length) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employeeValidation.issues.map((employee) => ({
        RUT: employee.id,
        Trabajador: employee.name,
        Archivo: employee.sourceFile,
        Fila: employee.sourceRow,
        Motivo: employee.issue,
      }))), 'Trabajadores pendientes');
    }
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(output, `REX_informe_visma_${sourceFile.period || todayStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  if (isBuilding || !model) {
    return (
      <section className="panel p-8">
        <LoadingCard text="Analizando el libro Visma y comparando sus conceptos con el catálogo REX+…" />
      </section>
    );
  }

  const filters = [
    ['all', 'Todos', decisions.length],
    ['exact', 'Matches exactos', summary.exact],
    ['proposal', 'Propuestas', summary.proposals],
    ['pending', 'Sin propuesta', summary.pending],
    ['excluded', 'Excluidos', summary.excluded],
  ];

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Transformator · Libro histórico</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Visma → REX+ Liquidaciones Detalle</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Revisa los haberes y descuentos detectados, confirma sus conceptos REX+ y descarga el CSV del período {sourceFile.period || 'mensual'}.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              <Metric label="Conceptos" value={summary.total} />
              <Metric label="Matches" value={summary.exact} tone="green" />
              <Metric label="Pendientes" value={summary.proposals + summary.pending} tone="amber" />
              <Metric label="Trabajadores maestro" value={`${employeeValidation.matched}/${employeeValidation.total}`} tone={employeeValidation.issues.length ? 'amber' : 'green'} />
            </div>
          </div>

          <div className="space-y-4 p-6 sm:p-10">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Reglas aplicadas</p>
              <ul className="mt-3 space-y-2">
                <li>RUT como identificador y contrato leído desde `contratoActi` del maestro.</li>
                <li>Fecha de proceso y aplicación: {sourceFile.period || 'AAAA-MM'}.</li>
                <li>Jornada `C`, días trabajados desde Visma y licencias `0`.</li>
                <li>Conceptos contractuales se excluyen: REX+ los recalcula desde contrato y días trabajados.</li>
                <li>La columna Afecto se informa como `0`; el CSV conserva las 20 columnas del template.</li>
              </ul>
            </div>
            <div className={`rounded-3xl border p-5 text-sm ${summary.pending + summary.proposals === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {summary.pending + summary.proposals === 0
                ? 'Todos los conceptos están listos para generar la carga.'
                : `Faltan resolver ${summary.pending + summary.proposals} conceptos antes de descargar.`}
            </div>
          </div>
        </div>
      </section>

      <section className={`panel p-5 sm:p-6 ${employeeValidation.issues.length ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-semibold ${employeeValidation.issues.length ? 'text-rose-800' : 'text-emerald-800'}`}>
              {employeeValidation.issues.length
                ? `${employeeValidation.issues.length.toLocaleString('es-CL')} trabajador(es) no conciliados con el maestro`
                : `Maestro conciliado: ${employeeValidation.matched.toLocaleString('es-CL')} de ${employeeValidation.total.toLocaleString('es-CL')} trabajadores`}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {employeeValidation.issues.length
                ? 'La descarga por lotes queda bloqueada hasta resolver estas diferencias. El informe incluye el RUT, archivo y fila de origen.'
                : 'El contrato para cada carga se toma del campo contratoActi.'}
            </p>
          </div>
          {employeeValidation.issues.length ? (
            <button type="button" onClick={downloadReport} className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100">
              Descargar diferencias
            </button>
          ) : null}
        </div>
        {employeeValidation.issues.length ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-rose-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-rose-50 text-xs uppercase tracking-wide text-rose-800"><tr><th className="px-4 py-3">RUT</th><th className="px-4 py-3">Trabajador</th><th className="px-4 py-3">Libro · fila</th><th className="px-4 py-3">Problema</th></tr></thead>
              <tbody className="divide-y divide-rose-100">{employeeValidation.issues.slice(0, 10).map((employee) => (
                <tr key={`${employee.id}-${employee.sourceFile}-${employee.sourceRow}`}>
                  <td className="px-4 py-3 font-mono text-xs">{employee.id}</td><td className="px-4 py-3">{employee.name || '—'}</td>
                  <td className="px-4 py-3 text-xs">{employee.sourceFile} · {employee.sourceRow}</td><td className="px-4 py-3 text-xs">{employee.issue}</td>
                </tr>
              ))}</tbody>
            </table>
            {employeeValidation.issues.length > 10 ? <p className="px-4 py-3 text-xs text-rose-700">Se muestran 10 de {employeeValidation.issues.length.toLocaleString('es-CL')} pendientes; descarga el informe para verlos todos.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Revisión de mapeo</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Conceptos del libro Visma</h3>
            <p className="mt-2 text-sm text-slate-600">Los matches exactos quedan aprobados. Las propuestas requieren confirmación mediante el buscador.</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar concepto o columna…"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 lg:max-w-sm"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {filters.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveFilter(id)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${activeFilter === id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-brand-200'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        <div className="mt-6 overflow-visible rounded-3xl border border-slate-200">
          <div className="hidden grid-cols-[1.1fr_1.3fr_1.5fr_2fr] gap-4 bg-slate-50 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid">
            <span>Estado</span><span>Concepto Visma</span><span>Propuesta REX+</span><span>Acción</span>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleDecisions.map((decision) => (
              <DecisionRow
                key={decision.id}
                decision={decision}
                catalog={catalog}
                onAssign={assignDecision}
              />
            ))}
            {visibleDecisions.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No hay conceptos para este filtro.</p> : null}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={onBack} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-brand-200 hover:text-brand-700">Volver</button>
          <button type="button" onClick={downloadReport} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-brand-200 hover:text-brand-700">Descargar informe de mapeo</button>
        </div>
      </section>

      <section className="panel border-brand-200 bg-brand-50/40 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Carga controlada</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Descargar siguiente lote para REX+</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Cada lote incluye todos los conceptos aprobados de sus trabajadores. Si la importación falla, descarga el mismo lote otra vez; descuéntalo sólo cuando confirmes que REX+ lo recibió correctamente.</p>
          </div>
          <span className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">{remainingEmployeeIds.length.toLocaleString('es-CL')} restantes</span>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Trabajadores por lote
            <input type="number" min="1" max="10000" value={batchSize} disabled={Boolean(preparedBatch)} onChange={(event) => setBatchSize(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))} className="mt-2 block w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal tracking-normal text-slate-900 disabled:bg-slate-100" />
          </label>
          {[10, 50, 100, 500].map((size) => (
            <button key={size} type="button" disabled={Boolean(preparedBatch)} onClick={() => setBatchSize(size)} className="rounded-full border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{size}</button>
          ))}
        </div>

        {downloadError ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{downloadError}</p> : null}

        {!isReadyToDownload ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {employeeValidation.issues.length
              ? 'La descarga está bloqueada hasta conciliar todos los trabajadores con el maestro.'
              : summary.pending + summary.proposals > 0
                ? 'La descarga está bloqueada hasta resolver todos los conceptos.'
                : 'No hay trabajadores elegibles con montos en los conceptos aprobados.'}
          </p>
        ) : preparedBatch ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Lote preparado: {preparedBatch.employeeIds.length.toLocaleString('es-CL')} trabajadores.</p>
            <p className="mt-1">Si la carga falló en REX+, puedes volver a descargar este mismo lote. Si fue correcta, márcalo como realizado.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadBatch(preparedBatch.employeeIds, true)} disabled={isDownloading} className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60">{isDownloading ? 'Preparando CSV…' : 'Descargar este lote nuevamente'}</button>
              <button type="button" onClick={handleMarkBatchCompleted} disabled={isDownloading} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Marcar lote como realizado</button>
            </div>
          </div>
        ) : remainingEmployeeIds.length ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-white p-4">
            <p className="text-sm text-slate-600">Próximo lote: <strong className="text-slate-900">{nextBatchEmployeeIds.length.toLocaleString('es-CL')} trabajadores</strong>.</p>
            <button type="button" onClick={() => downloadBatch(nextBatchEmployeeIds)} disabled={isDownloading} className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300">{isDownloading ? 'Preparando CSV…' : 'Descargar siguiente lote'}</button>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Todos los trabajadores elegibles fueron marcados como cargados. No quedan lotes pendientes.</p>
        )}
      </section>
    </div>
  );
}

function DecisionRow({ decision, catalog, onAssign }) {
  const status = decision.autoExcluded ? 'Excluido automático' : decision.excluded ? 'Excluido' : decision.matchStatus === 'exact' ? 'Match exacto' : decision.approved ? 'Pareado manual' : decision.suggestedMatches.length ? 'Propuesta' : 'Sin propuesta';
  const statusClass = decision.excluded ? 'border-slate-200 bg-slate-50 text-slate-600' : decision.approved ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className={`grid gap-4 px-5 py-5 lg:grid-cols-[1.1fr_1.3fr_1.5fr_2fr] ${decision.approved ? 'bg-white' : 'bg-amber-50/40'}`}>
      <div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}>{status}</span>
        <p className="mt-3 text-xs text-slate-500">{decision.nonZeroCount.toLocaleString('es-CL')} filas con monto</p>
        {decision.exclusionReason ? <p className="mt-2 text-xs leading-5 text-slate-500">{decision.exclusionReason}</p> : null}
      </div>
      <div>
        <p className="font-semibold text-slate-900">{decision.sourceName}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">Columna {decision.sourceColumn} · {decision.sourceKey}</p>
        {decision.isDuplicateHeader ? <p className="mt-1 text-xs font-semibold text-amber-700">Encabezado repetido: confirma si debe mapearse o excluirse.</p> : null}
        <p className="mt-1 text-xs text-slate-500">Muestra: {decision.sampleValue}</p>
      </div>
      <div>
        <p className="font-semibold text-slate-900">{decision.targetName || 'Sin concepto asignado'}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">{decision.targetId || `Propuesta: ${decision.proposedId}`}</p>
      </div>
      <div className="min-w-0">
        <ConceptSearchPicker
          selectedId={decision.targetId}
          selectedLabel={decision.targetId ? `${decision.targetName} (${decision.targetId})` : 'Buscar concepto REX+'}
          concepts={catalog}
          suggestedConcepts={decision.suggestedMatches}
          onSelect={(targetId) => onAssign(decision.id, targetId)}
          onExclude={() => onAssign(decision.id, '__exclude__')}
        />
        {!decision.approved ? <p className="mt-2 text-xs text-amber-700">Confirma una opción o excluye este concepto antes de descargar.</p> : null}
      </div>
    </div>
  );
}

function getReviewGroup(decision) {
  if (decision.matchStatus === 'exact') return 0;
  if (decision.approved) return 1;
  if (decision.suggestedMatches.length > 0) return 2;
  return 3;
}

function Metric({ label, value, tone = 'slate' }) {
  const toneClass = tone === 'green' ? 'bg-emerald-400/15 text-emerald-200' : tone === 'amber' ? 'bg-amber-300/15 text-amber-100' : 'bg-white/10 text-white';
  const formattedValue = typeof value === 'number' ? value.toLocaleString('es-CL') : value;
  return <div className={`rounded-2xl px-4 py-3 ${toneClass}`}><p className="text-xs uppercase tracking-[0.16em] opacity-75">{label}</p><p className="mt-1 text-2xl font-bold">{formattedValue}</p></div>;
}

function LoadingCard({ text }) {
  return <div className="flex items-center gap-3 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-5 text-sm text-sky-700"><div className="flex items-center gap-2"><span className="loader-orb h-2.5 w-2.5 rounded-full bg-sky-500" /><span className="loader-orb h-2.5 w-2.5 rounded-full bg-cyan-500" /><span className="loader-orb h-2.5 w-2.5 rounded-full bg-emerald-500" /></div><span className="font-semibold">{text}</span></div>;
}

function downloadBlob(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeEmployeeKey(value) {
  return String(value ?? '').replace(/[.\s-]/g, '').toUpperCase();
}

function periodFileLabel(period) {
  const [year, month] = String(period ?? '').split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const monthLabel = months[Number(month) - 1] ?? 'mes';
  return `${monthLabel} ${year.slice(-2)}`;
}
