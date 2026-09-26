import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  buildConceptExportWorkbook,
} from '../lib/concepts';
import {
  buildHistoricalConceptModel,
  buildHistoricalRexLiquidationWorkbook,
  buildHistoricalReportRows,
  getHistoricalEmployeeIds,
  HISTORICAL_FUNCTIONS,
  loadHistoricalRexLiquidationTemplate,
  summarizeHistoricalDecisions,
} from '../lib/historicalConcepts';
import { normalizeText } from '../lib/utils';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';
import ConceptSearchPicker from './ConceptSearchPicker';

const EXCLUDE_VALUE = '__exclude__';
const CREATE_VALUE = '__create__';
const BATCH_KEY = 'meta4-rex-concepts';

export default function HistoricalConceptsMapper({ conceptsResource, sourceFile, mappingScope, batchState, onBatchStateChange, onBack, onOpenMissingEmployees, onBusyChange }) {
  const isFinningCatalog = !mappingScope || mappingScope.company === 'finning';
  const concepts = useMemo(
    () => (isFinningCatalog ? conceptsResource?.historicalConcepts ?? conceptsResource?.concepts ?? [] : conceptsResource?.concepts ?? []),
    [conceptsResource, isFinningCatalog],
  );
  const fullConcepts = useMemo(() => conceptsResource?.concepts ?? [], [conceptsResource]);
  const [model, setModel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [isBuilding, setIsBuilding] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [exportGroup, setExportGroup] = useState('all');
  const [exportSelectedIds, setExportSelectedIds] = useState([]);
  const [bulkTarget, setBulkTarget] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [preparedBatch, setPreparedBatch] = useState(null);
  const employeeCatalog = useMemo(
    () => (isFinningCatalog
      ? conceptsResource?.finningEmployeeCatalog ?? conceptsResource?.employeeCatalog ?? []
      : conceptsResource?.employeeCatalog ?? []),
    [conceptsResource, isFinningCatalog],
  );

  useEffect(() => {
    let active = true;
    setIsBuilding(true);
    onBusyChange?.(true);

    const timerId = window.setTimeout(() => {
      const nextModel = buildHistoricalConceptModel({
        sourceRows: sourceFile.rows,
        sourceHeaders: sourceFile.headers,
        concepts: fullConcepts,
        historicalConcepts: concepts,
        mappingRows: conceptsResource?.mappingRows ?? [],
        employeeCatalog,
        mappingScope,
      });
      const storedDecisions = nextModel.decisions.map((decision) =>
        applyStoredHistoricalMapping('historical-concepts', decision, { concepts: nextModel.catalog, scope: mappingScope, strictCatalog: true }),
      );

      if (!active) {
        return;
      }

      setModel(nextModel);
      setDecisions(storedDecisions);
      setExportGroup('all');
      setExportSelectedIds(storedDecisions
        .filter(canIncludeInHistoricalOutput)
        .map((decision) => decision.id));
      setIsBuilding(false);
      onBusyChange?.(false);
    }, 60);

    return () => {
      active = false;
      window.clearTimeout(timerId);
      onBusyChange?.(false);
    };
  }, [concepts, conceptsResource, employeeCatalog, fullConcepts, mappingScope, onBusyChange, sourceFile]);

  useEffect(() => {
    onBusyChange?.(isBuilding || isPreparing);
  }, [isBuilding, isPreparing, onBusyChange]);

  useEffect(() => {
    rememberConceptMappings('historical-concepts', decisions, mappingScope);
  }, [decisions, mappingScope]);

  useEffect(() => {
    setPreparedBatch(null);
  }, [exportGroup, exportSelectedIds, mappingScope, sourceFile]);

  const summary = summarizeHistoricalDecisions(decisions);
  const employeeValidation = model?.employeeValidation ?? { total: 0, matched: 0, missing: [], excludedCount: 0 };
  const excludedConcepts = model?.excludedConcepts ?? [];
  const exportGroupDecisions = useMemo(
    () => decisions
      .filter((decision) => exportGroup === 'all' || getConceptGroup(decision) === exportGroup)
      .sort((left, right) => (left.sourceColumnIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceColumnIndex ?? Number.MAX_SAFE_INTEGER)),
    [decisions, exportGroup],
  );
  const selectedExportDecisions = useMemo(
    () => decisions.filter((decision) => exportSelectedIds.includes(decision.id)),
    [decisions, exportSelectedIds],
  );
  const selectedExportIdsInGroup = useMemo(
    () => exportGroupDecisions.map((decision) => decision.id).filter((id) => exportSelectedIds.includes(id)),
    [exportGroupDecisions, exportSelectedIds],
  );
  const selectableExportGroupDecisions = exportGroupDecisions.filter(canIncludeInHistoricalOutput);
  const allExportGroupSelected = selectableExportGroupDecisions.length > 0 && selectableExportGroupDecisions
    .every((decision) => exportSelectedIds.includes(decision.id));
  const selectedExportPending = selectedExportDecisions.filter((decision) => !canIncludeInHistoricalOutput(decision));
  const unresolvedDecisions = decisions.filter((decision) => !decision.excluded && !canIncludeInHistoricalOutput(decision));
  const hasExportBlockers = selectedExportDecisions.length === 0 || selectedExportPending.length > 0 || unresolvedDecisions.length > 0 || employeeValidation.missing.length > 0;
  const completedEmployeeIds = useMemo(
    () => new Set(
      (!batchState?.batchKey || batchState.batchKey === BATCH_KEY
        ? (batchState.completedEmployeeIds ?? [])
        : []
      ).map((employeeId) => normalizeText(employeeId).replace(/[.\s]/g, '').toUpperCase()),
    ),
    [batchState],
  );
  const eligibleEmployeeIds = useMemo(
    () => (!hasExportBlockers
      ? getHistoricalEmployeeIds({
          sourceRows: sourceFile.rows,
          decisions: selectedExportDecisions,
          employeeCatalog,
          mappingScope,
        })
      : []),
    [employeeCatalog, hasExportBlockers, mappingScope, selectedExportDecisions, sourceFile.rows],
  );
  const remainingEmployeeIds = useMemo(
    () => eligibleEmployeeIds.filter((employeeId) => !completedEmployeeIds.has(employeeId)),
    [completedEmployeeIds, eligibleEmployeeIds],
  );
  const normalizedBatchSize = Math.max(1, Math.min(10000, Number(batchSize) || 1));
  const nextBatchEmployeeIds = remainingEmployeeIds.slice(0, normalizedBatchSize);
  const catalog = useMemo(() => model?.catalog ?? [], [model]);
  const catalogOptions = useMemo(
    () =>
      [...catalog].sort((left, right) => {
        const leftVariable = normalizeText(left.behavior).includes('variable') ? 0 : 1;
        const rightVariable = normalizeText(right.behavior).includes('variable') ? 0 : 1;
        return leftVariable - rightVariable || left.name.localeCompare(right.name);
      }),
    [catalog],
  );
  const selectedCreatedCount = selectedExportDecisions.filter((decision) => decision.action === 'create').length;

  const visibleDecisions = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return decisions.filter((decision) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(decision.sourceName).includes(normalizedSearch) ||
        normalizeText(decision.targetName).includes(normalizedSearch) ||
        normalizeText(decision.targetId).includes(normalizedSearch);
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'pending' && !decision.approved) ||
        (activeFilter === 'exact' && getReviewGroup(decision) === 0) ||
        (activeFilter === 'proposal' && getReviewGroup(decision) === 1) ||
        (activeFilter === 'no-proposal' && getReviewGroup(decision) === 2) ||
        (activeFilter === 'assigned' && decision.approved && !decision.exactMatch && !decision.excluded) ||
        (activeFilter === 'excluded' && decision.excluded);

      return matchesSearch && matchesFilter;
    }).sort((left, right) => getReviewGroup(left) - getReviewGroup(right) || left.sourceName.localeCompare(right.sourceName));
  }, [activeFilter, decisions, search]);

  const visibleIds = visibleDecisions.map((decision) => decision.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const updateDecision = (decisionId, patch) => {
    setDecisions((current) =>
      current.map((decision) => (decision.id === decisionId ? { ...decision, ...patch } : decision)),
    );
  };

  const assignDecision = (decisionId, targetId) => {
    if (targetId === EXCLUDE_VALUE) {
      updateDecision(decisionId, {
        approved: true,
        excluded: true,
        action: 'exclude',
        targetId: '',
        targetName: '',
        targetConcept: null,
        matchStatus: 'excluded',
      });
      setExportSelectedIds((current) => current.filter((id) => id !== decisionId));
      return;
    }

    if (targetId === CREATE_VALUE) {
      const currentDecision = decisions.find((decision) => decision.id === decisionId);
      if (!currentDecision) {
        return;
      }

      updateDecision(decisionId, {
        approved: false,
        excluded: false,
        action: 'create',
        matchStatus: 'proposal',
        targetId: currentDecision.proposedId,
        targetName: currentDecision.sourceName,
        targetConcept: null,
        sequence: currentDecision.proposedSequence,
      });
      setExportSelectedIds((current) => current.filter((id) => id !== decisionId));
      return;
    }

    const targetConcept = catalog.find((concept) => concept.id === targetId);
    if (!targetConcept) {
      updateDecision(decisionId, {
        approved: false,
        excluded: false,
        action: 'pending',
        targetId: '',
        targetName: '',
        targetConcept: null,
        matchStatus: 'pending',
      });
      setExportSelectedIds((current) => current.filter((id) => id !== decisionId));
      return;
    }

    updateDecision(decisionId, {
      approved: true,
      excluded: false,
      action: 'reuse',
      targetId: targetConcept.id,
      targetName: targetConcept.name,
      targetConcept,
      matchStatus: 'assigned',
    });
    setExportSelectedIds((current) => current.includes(decisionId) ? current : [...current, decisionId]);
  };

  const handleBulkApply = () => {
    if (!bulkTarget || selectedIds.length === 0) {
      return;
    }

    selectedIds.forEach((decisionId) => assignDecision(decisionId, bulkTarget));
    setSelectedIds([]);
    setBulkTarget('');
  };

  const handleApproveExact = () => {
    setDecisions((current) => {
      const next = current.map((decision) =>
        decision.exactMatch && !decision.excluded
          ? { ...decision, approved: true, matchStatus: 'exact' }
          : decision,
      );
      setExportSelectedIds((selected) => [...new Set([
        ...selected,
        ...next.filter((decision) => decision.exactMatch && !decision.excluded).map((decision) => decision.id),
      ])]);
      return next;
    });
  };

  const handleApproveCreations = () => {
    setDecisions((current) => {
      const next = current.map((decision) =>
        decision.action === 'create' && !decision.excluded
          ? { ...decision, approved: true, matchStatus: 'proposal' }
          : decision,
      );
      setExportSelectedIds((selected) => [...new Set([
        ...selected,
        ...next.filter((decision) => decision.action === 'create' && !decision.excluded).map((decision) => decision.id),
      ])]);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  };

  const handleSelect = (decisionId) => {
    setSelectedIds((current) =>
      current.includes(decisionId) ? current.filter((id) => id !== decisionId) : [...current, decisionId],
    );
  };

  const handleExportGroupSelectAll = () => {
    const selectableIds = selectableExportGroupDecisions.map((decision) => decision.id);
    setExportSelectedIds((current) => allExportGroupSelected
      ? current.filter((id) => !selectableIds.includes(id))
      : [...new Set([...current, ...selectableIds])]);
  };

  const handleExportSelect = (decision) => {
    if (!canIncludeInHistoricalOutput(decision)) {
      return;
    }

    setExportSelectedIds((current) => current.includes(decision.id)
      ? current.filter((id) => id !== decision.id)
      : [...current, decision.id]);
  };

  const handleMarkBatchCompleted = () => {
    if (!preparedBatch?.employeeIds?.length) {
      return;
    }

    const confirmed = window.confirm(
      `¿Confirmas que el lote de ${preparedBatch.employeeIds.length} colaboradores fue cargado correctamente en REX+?\n\nAl confirmar, no volverá a incluirse en los siguientes lotes.`,
    );
    if (!confirmed) {
      return;
    }

    const nextCompletedEmployeeIds = [...new Set([
      ...completedEmployeeIds,
      ...preparedBatch.employeeIds,
    ])];

    onBatchStateChange?.({ batchKey: BATCH_KEY, completedEmployeeIds: nextCompletedEmployeeIds });
    setPreparedBatch(null);
  };

  const handleDownload = async (kind) => {
    if (
      isPreparing ||
      (kind === 'output' && hasExportBlockers) ||
      (kind === 'batch' && (hasExportBlockers || (!preparedBatch && !nextBatchEmployeeIds.length)))
    ) {
      return;
    }

    setIsPreparing(true);
    await waitForPaint();

    try {
      if (kind === 'create') {
        const workbook = buildConceptExportWorkbook({
          resource: conceptsResource,
          decisions: selectedExportDecisions.filter((decision) => decision.action === 'create'),
        });
        triggerWorkbookDownload(workbook, `REX_altas_conceptos_${exportGroupSlug(exportGroup)}_${todayStamp()}.xlsx`);
      } else if (kind === 'output') {
        const workbook = buildHistoricalRexLiquidationWorkbook({
          templateWorkbook: await loadHistoricalRexLiquidationTemplate(),
          sourceRows: sourceFile.rows,
          decisions: selectedExportDecisions,
          employeeCatalog,
          mappingScope,
          period: sourceFile.period,
        });
        triggerWorkbookDownload(workbook, `REX_liquidaciones_detalle_${todayStamp()}.xlsx`);
      } else if (kind === 'batch') {
        const employeeIds = preparedBatch?.employeeIds ?? nextBatchEmployeeIds;
        const workbook = buildHistoricalRexLiquidationWorkbook({
          templateWorkbook: await loadHistoricalRexLiquidationTemplate(),
          sourceRows: sourceFile.rows,
          decisions: selectedExportDecisions,
          employeeCatalog,
          mappingScope,
          period: sourceFile.period,
          employeeIds,
        });
        triggerWorkbookDownload(workbook, `REX_liquidaciones_detalle_lote_${todayStamp()}.xlsx`);
        setPreparedBatch({
          employeeIds,
          downloadedAt: new Date().toISOString(),
        });
      } else if (kind === 'employee-pending') {
        const reportRows = employeeValidation.missing.map((employee) => ({
          Fila: employee.sourceRowNumber,
          CI: employee.id,
          Nombre: employee.name,
          Estado: 'No existe en el listado de empleados REX+',
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportRows), 'Colaboradores pendientes');
        triggerWorkbookDownload(workbook, `REX_pendientes_colaboradores_historicos_${todayStamp()}.xlsx`);
      } else {
        const reportRows = buildHistoricalReportRows(
          kind === 'pending'
            ? decisions.filter((decision) => !decision.approved)
            : decisions,
        );
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(reportRows);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Informe');
        triggerWorkbookDownload(
          workbook,
          kind === 'pending'
            ? `REX_pendientes_conceptos_historicos_${todayStamp()}.xlsx`
            : `REX_informe_conceptos_historicos_${todayStamp()}.xlsx`,
        );
      }
    } finally {
      setIsPreparing(false);
    }
  };

  if (isBuilding || !model) {
    return (
      <section className="panel p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Paso 3</p>
        <h2 className="mt-3 text-3xl font-extrabold text-slate-950">Analizando libro histórico</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          Estamos leyendo las columnas monetarias, detectando montos y preparando las propuestas de match contra REX+.
        </p>
        <div className="mt-8 flex items-center gap-3 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold text-sky-700">
          <span className="loader-orb h-3 w-3 rounded-full bg-sky-500" />
          <span className="loader-orb h-3 w-3 rounded-full bg-cyan-500" />
          <span className="loader-orb h-3 w-3 rounded-full bg-emerald-500" />
          Trabajando con {sourceFile.rows.length.toLocaleString('es-CL')} colaboradores…
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="relative overflow-hidden bg-[#07101f] px-6 py-8 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.24),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.2),_transparent_30%),linear-gradient(180deg,_rgba(8,15,28,1),_rgba(3,7,18,1))]" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Transformator · Carga de libros históricos</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Meta 4 → REX+ Liquidaciones en Detalle</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                Los mapeos guardados son matches perfectos. Las propuestas quedan destacadas y las altas aprobadas se muestran antes de descargar.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Metric label="Conceptos detectados" value={summary.total} />
                <Metric label="Matches perfectos" value={summary.exact} tone="success" />
                <Metric label="Propuestas a revisar" value={summary.pending} tone="warning" />
                <Metric label="Se crearán" value={summary.createdApproved} />
                <Metric label="Excluidos por regla" value={excludedConcepts.length} />
                <Metric label="Filas estimadas" value={summary.detailRows.toLocaleString('es-CL')} />
                <Metric label="Colaboradores REX+" value={`${employeeValidation.matched}/${employeeValidation.total}`} />
              </div>
            </div>
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Reglas aplicadas</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li>{isFinningCatalog
                  ? `Catálogo autorizado para Finning: ${concepts.length.toLocaleString('es-CL')} conceptos del listado FINNING V2, todos haberes o descuentos.`
                  : `Catálogo REX+ activo: ${concepts.length.toLocaleString('es-CL')} conceptos disponibles.`}</li>
                <li>Se toma sólo el monto distinto de cero de cada concepto y colaborador.</li>
                <li>La salida conserva la plantilla oficial de REX+: cinco hojas y 20 columnas en `Ejemplo`.</li>
                <li>Los mapeos confirmados en memoria se aplican como match perfecto, aunque el nombre de origen sea distinto.</li>
                <li>Los conceptos sin match quedan destacados como propuestas para asignación manual, exclusión o creación.</li>
                <li>Las reglas de Afecto, instituciones, impuesto, jornada y monto inicial se aplican según las notas de la plantilla.</li>
                <li>Los lotes se descargan en Excel y se descuentan sólo al marcarlos como cargados en REX+.</li>
              </ul>
            </div>
            <div className="mt-5 rounded-[28px] border border-cyan-100 bg-cyan-50 p-5 text-sm text-cyan-900">
              <p className="font-semibold">Funciones disponibles</p>
              <p className="mt-2 text-cyan-800">{HISTORICAL_FUNCTIONS.length} funciones del listado entregado. Se mantienen visibles como referencia para la revisión.</p>
            </div>
            {employeeValidation.missing.length > 0 ? (
              <div className="mt-5 rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
                <p className="font-semibold">Hay {employeeValidation.missing.length} colaboradores que no están creados en REX+.</p>
                <p className="mt-2">El archivo histórico queda bloqueado hasta resolverlos. Puedes llevar estos trabajadores directamente a la carga Meta 4 → REX+ o descargar el detalle.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenMissingEmployees?.(employeeValidation.missing)}
                    className="rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-800"
                  >
                    Cargar faltantes en Empleados Meta 4 → REX+
                  </button>
                  <button type="button" onClick={() => handleDownload('employee-pending')} className="rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100">
                    Descargar detalle
                  </button>
                </div>
              </div>
            ) : null}
            {employeeValidation.excludedCount > 0 ? (
              <div className="mt-5 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
                <p className="font-semibold">Se excluyeron {employeeValidation.excludedCount} registros de colaboradores desvinculados.</p>
                <p className="mt-2">No se incluirán en el archivo histórico y no bloquean la descarga.</p>
              </div>
            ) : null}
            {excludedConcepts.length > 0 ? (
              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Se excluyeron {excludedConcepts.length} conceptos que no corresponden al archivo de haberes y descuentos.</p>
                <p className="mt-2 leading-6">Ejemplos: {excludedConcepts.slice(0, 6).map((concept) => concept.baseHeader).join(', ')}{excludedConcepts.length > 6 ? '…' : ''}</p>
              </div>
            ) : null}
            <section className="mt-5 rounded-[28px] border border-indigo-200 bg-indigo-50/70 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">Archivo de carga</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">Elige qué conceptos incluir</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    El archivo puede contener haberes y descuentos. Puedes revisar por grupo y marcar los conceptos que quieres incluir en el Excel de Liquidaciones en Detalle.
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
                    Seleccionar todos los {exportGroup === 'all' ? 'conceptos disponibles' : exportGroup === 'haber' ? 'haberes' : 'descuentos disponibles'}
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
                    Se incluyen los conceptos seleccionados de todo el libro para cada colaborador del lote. Cuando REX+ confirme la carga, marca el lote como realizado para descontarlo y no duplicarlo.
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
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {employeeValidation.missing.length > 0
                    ? `Faltan ${employeeValidation.missing.length} colaboradores en el listado REX+.`
                    : selectedExportDecisions.length === 0
                      ? 'Selecciona al menos un concepto listo para incluir en el archivo.'
                      : `Hay ${selectedExportPending.length} conceptos seleccionados que todavía requieren mapeo.`}
                </p>
              ) : preparedBatch ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">Lote preparado: {preparedBatch.employeeIds.length.toLocaleString('es-CL')} colaboradores.</p>
                  <p className="mt-1">Si la carga falló en REX+, puedes descargar nuevamente el mismo lote. Si fue correcta, márcalo como realizado.</p>
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
                    Próximo lote: <strong className="text-slate-900">{nextBatchEmployeeIds.length.toLocaleString('es-CL')} colaboradores</strong>. La descarga conservará las cinco hojas del Excel oficial de REX+.
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
                  : hasExportBlockers
                    ? selectedExportDecisions.length === 0
                      ? 'Selecciona conceptos para generar el archivo'
                      : `Hay ${selectedExportPending.length} conceptos seleccionados por resolver`
                    : 'Excel de Liquidaciones en Detalle listo para cargar en REX+'}
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
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Revisión de mapeo</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Haberes y descuentos detectados</h3>
            <p className="mt-2 text-sm text-slate-600">Los matches exactos quedan seleccionados. Las propuestas muestran el primer concepto REX+ sugerido.</p>
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
            <option value={EXCLUDE_VALUE}>Excluir seleccionados</option>
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
              : hasExportBlockers
                ? selectedExportDecisions.length === 0
                  ? 'Selecciona conceptos para generar el archivo'
                  : `Hay ${selectedExportPending.length} conceptos seleccionados por resolver`
                : 'Excel de Liquidaciones en Detalle listo para cargar en REX+'}
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
    </div>
  );
}

function HistoricalConceptRow({ decision, catalog, selected, onSelect, onAssign }) {
  const statusLabel = decision.excluded
    ? 'Excluido'
    : decision.exactMatch
      ? decision.action === 'create'
        ? 'Match guardado · se creará'
        : decision.matchOrigin === 'memory' || decision.matchOrigin === 'concepts-module' ? 'Match perfecto guardado' : 'Match perfecto'
      : decision.action === 'create'
        ? decision.approved ? 'Creación aprobada' : 'Propuesta: crear nuevo'
        : decision.approved ? 'Asignado manualmente' : 'Propuesta pendiente';
  const statusClass = decision.excluded
    ? 'border-slate-200 bg-slate-100 text-slate-600'
    : decision.exactMatch
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-300 bg-amber-100 text-amber-800';

  return (
    <tr className={decision.exactMatch || decision.approved ? 'bg-white' : 'bg-amber-50/60'}>
      <td className="px-4 py-4"><input type="checkbox" checked={selected} onChange={onSelect} /></td>
      <td className="px-4 py-4">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
        {!decision.exactMatch && !decision.excluded ? <p className="mt-2 max-w-[220px] text-xs leading-5 text-amber-800">Revisa esta propuesta antes de aprobarla.</p> : null}
      </td>
      <td className="max-w-[360px] px-4 py-4">
        <p className="font-semibold text-slate-900">{decision.sourceName}</p>
        {decision.sourceKey !== decision.sourceName ? <p className="mt-1 text-xs text-slate-500">Columna: {decision.sourceKey}</p> : null}
        <p className="mt-1 text-xs text-slate-500">Ejemplo: {decision.sampleValue || '—'}</p>
      </td>
      <td className="px-4 py-4 text-slate-600"><p>{decision.nonZeroCount.toLocaleString('es-CL')} colaboradores</p><p className="mt-1 text-xs text-slate-400">{decision.sourceSection}</p></td>
      <td className="px-4 py-4">
        <ConceptSearchPicker
          selectedId={decision.targetId}
          selectedLabel={decision.action === 'create'
            ? `Crear concepto nuevo (${decision.targetId})`
            : decision.targetName
              ? `${decision.targetName} (${decision.targetId})`
              : ''}
          concepts={catalog}
          suggestedConcepts={decision.suggestedMatches.map(({ concept }) => concept)}
          createId={decision.proposedId}
          onSelect={(targetId) => onAssign(targetId)}
          onCreate={() => onAssign(CREATE_VALUE)}
          onExclude={() => onAssign(EXCLUDE_VALUE)}
        />
      </td>
      <td className="px-4 py-4 text-xs text-slate-500">{decision.approved ? 'Se incluirá en la salida' : 'Requiere asignación o exclusión'}</td>
    </tr>
  );
}

function getReviewGroup(decision) {
  if (decision.excluded || decision.exactMatch || decision.approved) {
    return decision.excluded ? 3 : 0;
  }

  return decision.suggestedMatches.length > 0 ? 1 : 2;
}

function getConceptGroup(decision) {
  const type = normalizeText(decision.type);

  if (type === '3l' || type === '4d') {
    return 'descuento';
  }

  if (type === '1h' || type === '1i' || type === '1r' || type === '2e') {
    return 'haber';
  }

  return normalizeText(decision.sourceSection).includes('descuento') ? 'descuento' : 'haber';
}

function canIncludeInHistoricalOutput(decision) {
  return Boolean(
    decision.approved
      && !decision.excluded
      && decision.targetId
      && (Number(decision.nonZeroCount) > 0 || isTaxDecision(decision)),
  );
}

function exportGroupSlug(group) {
  if (group === 'all') {
    return 'liquidaciones';
  }
  return group === 'descuento' ? 'descuentos' : 'haberes';
}

function isTaxDecision(decision) {
  return normalizeText(decision?.targetId || decision?.sourceName).includes('impuesto');
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'success' ? 'bg-emerald-400/10 text-emerald-100' : tone === 'warning' ? 'bg-amber-400/15 text-amber-100' : 'bg-white/10 text-white';
  return <div className={`rounded-2xl px-4 py-4 ${toneClass}`}><p className="text-xs text-white/60">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></div>;
}

function DownloadButton({ title, detail, onClick, disabled, primary = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`rounded-[24px] border p-5 text-left transition ${primary ? 'border-brand-200 bg-brand-50 hover:border-brand-400' : 'border-slate-200 bg-white hover:border-brand-200'} disabled:cursor-not-allowed disabled:opacity-50`}><p className="font-semibold text-slate-900">{title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p></button>;
}

function triggerWorkbookDownload(workbook, fileName) {
  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function waitForPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
}
