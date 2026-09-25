import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ConceptSearchPicker from './ConceptSearchPicker';
import {
  buildTalanaHistoricalModel,
  buildTalanaHistoricalAnalysis,
  buildTalanaHistoricalReconciliation,
  buildTalanaHistoricalReportRows,
  buildTalanaHistoricalRuleReportRows,
  buildTalanaHistoricalWorkbook,
  getTalanaHistoricalEmployeeIds,
  getTalanaHistoricalCatalog,
  summarizeTalanaHistoricalReconciliation,
  summarizeTalanaHistoricalDecisions,
} from '../lib/talanaHistorical';
import { normalizeText, todayStamp } from '../lib/utils';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';

const MAPPING_NAMESPACE = 'talana-buk-historical';

export default function TalanaHistoricalMapper({ sourceFile, mappingScope, batchState, onBatchStateChange, onBack, onBusyChange }) {
  const [model, setModel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isBuilding, setIsBuilding] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [preparedBatch, setPreparedBatch] = useState(null);

  useEffect(() => {
    let active = true;
    setIsBuilding(true);
    onBusyChange?.(true);

    const timerId = window.setTimeout(() => {
      const nextModel = buildTalanaHistoricalModel({
        sourceRows: sourceFile.rows,
        sourceHeaders: sourceFile.headers,
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
  }, [mappingScope, onBusyChange, sourceFile]);

  useEffect(() => {
    onBusyChange?.(isBuilding || isDownloading);
  }, [isBuilding, isDownloading, onBusyChange]);

  useEffect(() => {
    rememberConceptMappings(MAPPING_NAMESPACE, decisions, mappingScope);
  }, [decisions, mappingScope]);

  const summary = summarizeTalanaHistoricalDecisions(decisions);
  const catalog = model?.catalog ?? getTalanaHistoricalCatalog();
  const reconciliationRows = useMemo(() => buildTalanaHistoricalReconciliation({
    sourceRows: sourceFile.rows,
    decisions,
  }), [decisions, sourceFile.rows]);
  const reconciliation = summarizeTalanaHistoricalReconciliation(reconciliationRows);
  const unresolvedConcepts = summary.proposals + summary.pending;
  const analysis = buildTalanaHistoricalAnalysis({ decisions, reconciliation, mappingScope });
  const isReadyToDownload = analysis.isReady;
  const batchKey = useMemo(
    () => [
      'talana-buk-historical',
      mappingScope?.key ?? 'talana:buk',
      sourceFile.fileName ?? '',
      sourceFile.period ?? '',
      sourceFile.rows.length,
    ].join('|'),
    [mappingScope?.key, sourceFile.fileName, sourceFile.period, sourceFile.rows.length],
  );
  const completedEmployeeIds = useMemo(
    () => new Set(
      batchState?.batchKey === batchKey
        ? (batchState.completedEmployeeIds ?? []).map(normalizeEmployeeId).filter(Boolean)
        : [],
    ),
    [batchKey, batchState],
  );
  const eligibleEmployeeIds = useMemo(
    () => (isReadyToDownload ? getTalanaHistoricalEmployeeIds(sourceFile.rows) : []),
    [isReadyToDownload, sourceFile.rows],
  );
  const remainingEmployeeIds = useMemo(
    () => eligibleEmployeeIds.filter((employeeId) => !completedEmployeeIds.has(employeeId)),
    [completedEmployeeIds, eligibleEmployeeIds],
  );
  const normalizedBatchSize = Math.max(1, Math.min(10000, Number(batchSize) || 1));
  const nextBatchEmployeeIds = remainingEmployeeIds.slice(0, normalizedBatchSize);
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
        sheet: '',
        taxable: false,
        action: 'exclude',
        approved: true,
        excluded: true,
        matchStatus: 'excluded',
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
      sheet: concept.sheet,
      taxable: concept.taxable,
      action: 'reuse',
      approved: true,
      excluded: false,
      matchStatus: 'manual',
    });
  };

  useEffect(() => {
    setPreparedBatch(null);
  }, [batchKey, decisions, mappingScope]);

  const handleMarkBatchCompleted = () => {
    if (!preparedBatch?.employeeIds?.length) {
      return;
    }

    const confirmed = window.confirm(
      `¿Confirmas que el lote de ${preparedBatch.employeeIds.length} trabajadores fue cargado correctamente en BUK?\n\nAl confirmar, no volverá a incluirse en los siguientes lotes.`,
    );
    if (!confirmed) {
      return;
    }

    onBatchStateChange?.({
      batchKey,
      completedEmployeeIds: [...new Set([
        ...completedEmployeeIds,
        ...preparedBatch.employeeIds,
      ])],
    });
    setPreparedBatch(null);
  };

  const downloadWorkbook = (employeeIds, fileLabel = 'carga') => {
    if (!isReadyToDownload || isDownloading || !employeeIds?.length) {
      return;
    }

    setIsDownloading(true);
    window.setTimeout(() => {
      try {
        const workbook = buildTalanaHistoricalWorkbook({
          sourceRows: sourceFile.rows,
          decisions,
          employeeIds,
        });
        downloadBlob(
          XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
          `BUK_liquidaciones_historicas_${fileLabel}_${sourceFile.period || todayStamp()}.xlsx`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        setPreparedBatch({
          employeeIds,
          downloadedAt: new Date().toISOString(),
        });
      } finally {
        setIsDownloading(false);
      }
    }, 40);
  };

  const handleDownloadBatch = () => {
    const employeeIds = preparedBatch?.employeeIds ?? nextBatchEmployeeIds;
    downloadWorkbook(employeeIds, 'lote');
  };

  const downloadReport = () => {
    const workbook = XLSX.utils.book_new();
    const mappingSheet = XLSX.utils.json_to_sheet(buildTalanaHistoricalReportRows(decisions));
    XLSX.utils.book_append_sheet(workbook, mappingSheet, 'Mapeo Talana BUK');
    const reconciliationSheet = XLSX.utils.json_to_sheet(reconciliationRows);
    XLSX.utils.book_append_sheet(workbook, reconciliationSheet, 'Conciliación por RUT');
    const summarySheet = XLSX.utils.json_to_sheet([{
      Período: sourceFile.period || '',
      Trabajadores: reconciliation.employees,
      'Líquidos cuadrados': reconciliation.liquidMatched,
      'Diferencias de líquido': reconciliation.liquidDifferences,
      'Diferencia líquida total': reconciliation.liquidDifferenceTotal,
      'Haberes cuadrados': reconciliation.totalMatched,
      'Diferencias de haberes': reconciliation.totalDifferences,
      'Diferencia de haberes total': reconciliation.totalDifferenceTotal,
      'Descuentos cuadrados': reconciliation.discountsMatched,
      'Diferencias de descuentos': reconciliation.discountDifferences,
      'Diferencia de descuentos total': reconciliation.discountDifferenceTotal,
      'Conceptos sin resolver': unresolvedConcepts,
      Estado: isReadyToDownload ? 'Listo para cargar' : 'Requiere revisión',
    }]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen conciliación');
    const rulesSheet = XLSX.utils.json_to_sheet(buildTalanaHistoricalRuleReportRows(analysis));
    XLSX.utils.book_append_sheet(workbook, rulesSheet, 'Reglas aplicadas');
    downloadBlob(
      XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
      `BUK_informe_libro_historico_${sourceFile.period || todayStamp()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  const downloadErrorReport = () => {
    const errorRows = reconciliationRows.filter((row) => row.Estado !== 'Cuadrado');
    const workbook = XLSX.utils.book_new();
    const errorsSheet = XLSX.utils.json_to_sheet(errorRows);
    XLSX.utils.book_append_sheet(workbook, errorsSheet, 'Errores de cuadratura');
    const summarySheet = XLSX.utils.json_to_sheet([{
      Período: sourceFile.period || '',
      'Trabajadores con error': errorRows.length,
      'Diferencias de líquido': reconciliation.liquidDifferences,
      'Diferencia líquida total': reconciliation.liquidDifferenceTotal,
      'Diferencias de haberes': reconciliation.totalDifferences,
      'Diferencia de haberes total': reconciliation.totalDifferenceTotal,
      'Diferencias de descuentos': reconciliation.discountDifferences,
      'Diferencia de descuentos total': reconciliation.discountDifferenceTotal,
      'Conceptos sin resolver': unresolvedConcepts,
      Estado: 'Requiere revisión',
    }]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen errores');
    const rulesSheet = XLSX.utils.json_to_sheet(buildTalanaHistoricalRuleReportRows(analysis));
    XLSX.utils.book_append_sheet(workbook, rulesSheet, 'Reglas aplicadas');
    downloadBlob(
      XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
      `BUK_errores_liquidaciones_${sourceFile.period || todayStamp()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  if (isBuilding || !model) {
    return (
      <section className="panel p-8">
        <LoadingCard text="Analizando el libro Talana y comparando sus conceptos con el formato BUK…" />
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
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Maper · Libro histórico</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Talana → BUK Liquidaciones Históricas</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Revisa los haberes y descuentos del período {sourceFile.period || 'mensual'} y genera el libro Excel con las pestañas que BUK necesita.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              <Metric label="Conceptos" value={summary.total} />
              <Metric label="Matches" value={summary.exact} tone="green" />
              <Metric label="Propuestas" value={summary.proposals} tone="amber" />
              <Metric label="Excluidos" value={summary.autoExcluded} />
            </div>
          </div>

          <div className="space-y-4 p-6 sm:p-10">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Reglas registradas</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {analysis.scopeLabel ? `Contexto: ${analysis.scopeLabel}.` : 'Estas reglas se aplican a este proceso.'}
              </p>
              <ul className="mt-3 space-y-2">
                {analysis.rules.slice(0, 4).map((rule) => <li key={rule.id}>{rule.description}</li>)}
              </ul>
            </div>
            <div className={`rounded-3xl border p-5 text-sm ${isReadyToDownload ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {unresolvedConcepts > 0
                ? `Faltan resolver ${unresolvedConcepts} conceptos antes de descargar.`
                : reconciliation.isBalanced
                  ? 'Todos los conceptos están listos y el líquido a pago cuadra con Talana.'
                  : `Hay ${reconciliation.liquidDifferences} diferencias de líquido, ${reconciliation.totalDifferences} de haberes y ${reconciliation.discountDifferences} de descuentos.`}
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Análisis previo</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Reglas y controles antes de descargar</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Este resumen avisa qué reglas se aplicaron y qué condiciones todavía bloquean el archivo de carga BUK.</p>
          </div>
          <span className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${analysis.isReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {analysis.isReady ? 'Listo para descargar' : `${analysis.blockers.length} control(es) bloquean`}
          </span>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {analysis.checks.map((check) => <AnalysisCheck key={check.id} check={check} />)}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="font-semibold text-slate-900">Registro de reglas</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {analysis.rules.map((rule) => <RuleItem key={rule.id} rule={rule} />)}
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Conciliación BUK</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Control del líquido a pago</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Compara por RUT el líquido informado por Talana contra la fórmula del archivo BUK: haberes menos descuentos legales y otros descuentos, incluyendo el impuesto.</p>
          </div>
          <span className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${reconciliation.isBalanced ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {reconciliation.isBalanced ? 'Cuadrado' : 'Requiere revisión'}
          </span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ReconciliationMetric label="Trabajadores" value={reconciliation.employees} />
          <ReconciliationMetric label="Líquidos cuadrados" value={reconciliation.liquidMatched} tone="green" />
          <ReconciliationMetric label="Diferencias de líquido" value={reconciliation.liquidDifferences} tone={reconciliation.liquidDifferences ? 'amber' : 'green'} />
          <ReconciliationMetric label="Diferencias de haberes" value={reconciliation.totalDifferences} tone={reconciliation.totalDifferences ? 'amber' : 'green'} />
          <ReconciliationMetric label="Diferencias de descuentos" value={reconciliation.discountDifferences} tone={reconciliation.discountDifferences ? 'amber' : 'green'} />
        </div>
        {!reconciliation.isBalanced ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <p>La descarga de carga BUK queda bloqueada hasta cuadrar estas diferencias.</p>
            <button
              type="button"
              onClick={downloadErrorReport}
              disabled={isDownloading}
              className="shrink-0 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-800 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Descargar errores
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel border-brand-200 bg-brand-50/40 p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Carga controlada</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Descargar siguiente lote para BUK</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Cada lote contiene Liquidaciones y todos sus detalles por trabajador. Si BUK rechaza la carga, descarga nuevamente el mismo lote; si fue correcta, márcalo como realizado para descontarlo y no duplicarlo.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
            {remainingEmployeeIds.length.toLocaleString('es-CL')} restantes
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            Trabajadores por lote
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

        {!isReadyToDownload ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            La carga por lotes queda bloqueada hasta resolver el mapeo y cuadrar la conciliación.
          </p>
        ) : preparedBatch ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Lote preparado: {preparedBatch.employeeIds.length.toLocaleString('es-CL')} trabajadores.</p>
            <p className="mt-1">Si la carga falló en BUK, puedes descargar nuevamente este mismo lote. Si fue correcta, márcalo como realizado.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleDownloadBatch} disabled={isDownloading} className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
                {isDownloading ? 'Preparando lote…' : 'Descargar este lote nuevamente'}
              </button>
              <button type="button" onClick={handleMarkBatchCompleted} disabled={isDownloading} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
                Marcar lote como realizado
              </button>
            </div>
          </div>
        ) : remainingEmployeeIds.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Próximo lote: <strong className="text-slate-900">{nextBatchEmployeeIds.length.toLocaleString('es-CL')} trabajadores</strong>. Se generará un Excel listo para cargar en BUK.
            </p>
            <button type="button" onClick={handleDownloadBatch} disabled={isDownloading} className="button-primary shrink-0">
              {isDownloading ? 'Preparando lote…' : 'Descargar siguiente lote'}
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Todos los trabajadores ya fueron marcados como cargados. No quedan registros para volver a descargar.
          </p>
        )}
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Revisión de mapeo</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Conceptos del libro Talana</h3>
            <p className="mt-2 text-sm text-slate-600">Los conceptos reconocidos quedan aprobados. Las propuestas y los no reconocidos deben revisarse con el buscador.</p>
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
            <span>Estado</span><span>Concepto Talana</span><span>Propuesta BUK</span><span>Acción</span>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleDecisions.map((decision) => (
              <DecisionRow key={decision.id} decision={decision} catalog={catalog} onAssign={assignDecision} />
            ))}
            {visibleDecisions.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No hay conceptos para este filtro.</p> : null}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={onBack} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-brand-200 hover:text-brand-700">Volver</button>
          <button type="button" onClick={downloadReport} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-brand-200 hover:text-brand-700">Descargar informe de mapeo</button>
        </div>
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
        <p className="mt-1 font-mono text-xs text-slate-500">{decision.sourceKey}</p>
        <p className="mt-1 text-xs text-slate-500">Muestra: {decision.sampleValue}</p>
      </div>
      <div>
        <p className="font-semibold text-slate-900">{decision.targetName || 'Sin concepto asignado'}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">{decision.targetId || `Propuesta: ${decision.proposedId || 'buscar'}`}</p>
        {decision.sheet ? <p className="mt-1 text-xs text-slate-500">{decision.sheet}</p> : null}
      </div>
      <div className="min-w-0">
        <ConceptSearchPicker
          selectedId={decision.targetId}
          selectedLabel={decision.targetId ? `${decision.targetName} (${decision.targetId})` : 'Buscar concepto BUK'}
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
  return <div className={`rounded-2xl px-4 py-3 ${toneClass}`}><p className="text-xs uppercase tracking-[0.16em] opacity-75">{label}</p><p className="mt-1 text-2xl font-bold">{value.toLocaleString('es-CL')}</p></div>;
}

function ReconciliationMetric({ label, value, tone = 'slate' }) {
  const toneClass = tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700';
  return <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}><p className="text-xs uppercase tracking-[0.16em] opacity-75">{label}</p><p className="mt-1 text-2xl font-bold">{value.toLocaleString('es-CL')}</p></div>;
}

function LoadingCard({ text }) {
  return <div className="flex items-center gap-3 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-5 text-sm text-sky-700"><div className="flex items-center gap-2"><span className="loader-orb h-2.5 w-2.5 rounded-full bg-sky-500" /><span className="loader-orb h-2.5 w-2.5 rounded-full bg-cyan-500" /><span className="loader-orb h-2.5 w-2.5 rounded-full bg-emerald-500" /></div><span className="font-semibold">{text}</span></div>;
}

function AnalysisCheck({ check }) {
  const isBlocked = check.status === 'blocked';
  const isApplied = check.status === 'applied';
  const statusLabel = isBlocked ? 'Bloquea' : isApplied ? 'Aplicada' : 'OK';
  const statusClass = isBlocked
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : isApplied
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-slate-900">{check.title}</p>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClass}`}>{statusLabel}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p>
    </div>
  );
}

function RuleItem({ rule }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">{rule.title}</p>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{rule.scope}</span>
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{rule.description}</p>
    </div>
  );
}

function normalizeEmployeeId(value) {
  return String(value ?? '').replace(/[.\s]/g, '').toUpperCase();
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
