import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  buildConceptExportWorkbook,
} from '../lib/concepts';
import {
  buildHistoricalConceptModel,
  buildHistoricalReconciliation,
  buildHistoricalReconciliationRows,
  buildHistoricalRexLiquidationCsv,
  buildHistoricalReportRows,
  getHistoricalEmployeeIds,
  HISTORICAL_FUNCTIONS,
  summarizeHistoricalDecisions,
  validateHistoricalRexLiquidationRows,
} from '../lib/historicalConcepts';
import { normalizeText } from '../lib/utils';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';
import HistoricalConceptsExportPanel from './HistoricalConceptsExportPanel';
import HistoricalConceptsReviewPanel from './HistoricalConceptsReviewPanel';
import {
  buildHistoricalLoadFileName,
  canIncludeInHistoricalOutput,
  exportGroupSlug,
  formatHistoricalMoney,
  getConceptGroup,
  getReviewGroup,
  Metric,
  ReconciliationMetric,
  todayStamp,
  triggerTextDownload,
  triggerWorkbookDownload,
  waitForPaint,
} from './HistoricalConceptsMapperParts';

const CREATE_VALUE = '__create__';
const BATCH_KEY = 'meta4-rex-concepts';

export default function HistoricalConceptsMapper({ conceptsResource, sourceFile, employeeCatalogOverride, employeeMasterFileName, mappingScope, batchState, onBatchStateChange, onBack, onOpenMissingEmployees, onBusyChange }) {
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
    () => employeeCatalogOverride ?? (isFinningCatalog
      ? conceptsResource?.finningEmployeeCatalog ?? conceptsResource?.employeeCatalog ?? []
      : conceptsResource?.employeeCatalog ?? []),
    [conceptsResource, employeeCatalogOverride, isFinningCatalog],
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
      const storedDecisions = nextModel.decisions.map((decision) => {
        if (decision.excluded) {
          return decision;
        }

        const storedDecision = applyStoredHistoricalMapping(
          'historical-concepts',
          decision,
          { concepts: nextModel.catalog, scope: mappingScope, strictCatalog: true },
        );

        // Earlier versions stored automatic exclusions for employer concepts.
        return storedDecision.excluded ? decision : storedDecision;
      });

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
  const reconciliation = useMemo(
    () => buildHistoricalReconciliation({
      sourceRows: sourceFile.rows,
      sourceHeaders: sourceFile.headers,
      decisions: selectedExportDecisions,
      employeeCatalog,
      mappingScope,
    }),
    [employeeCatalog, mappingScope, selectedExportDecisions, sourceFile.headers, sourceFile.rows],
  );
  const rexValidation = useMemo(
    () => validateHistoricalRexLiquidationRows({
      sourceRows: sourceFile.rows,
      decisions: selectedExportDecisions,
      employeeCatalog,
      mappingScope,
      period: sourceFile.period,
    }),
    [employeeCatalog, mappingScope, selectedExportDecisions, sourceFile.period, sourceFile.rows],
  );
  const hasReconciliationBlockers = reconciliation.source.status !== 'ok';
  const hasExportBlockers = selectedExportDecisions.length === 0 || selectedExportPending.length > 0 || unresolvedDecisions.length > 0 || employeeValidation.missing.length > 0 || hasReconciliationBlockers || !rexValidation.valid;
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
  const reconciliationStatusLabel = reconciliation.source.status === 'ok'
    ? 'Cuadrado'
    : reconciliation.source.status === 'blocked'
      ? 'Diferencias encontradas'
      : reconciliation.source.status === 'incomplete'
        ? 'Faltan totales'
        : 'No disponible';
  const reconciliationStatusClass = reconciliation.source.status === 'ok'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';

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

  const visibleIds = visibleDecisions.filter((decision) => !decision.excluded).map((decision) => decision.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const updateDecision = (decisionId, patch) => {
    setDecisions((current) =>
      current.map((decision) => (decision.id === decisionId ? { ...decision, ...patch } : decision)),
    );
  };

  const assignDecision = (decisionId, targetId) => {
    const currentDecision = decisions.find((decision) => decision.id === decisionId);
    if (!currentDecision || currentDecision.excluded) {
      return;
    }

    if (targetId === CREATE_VALUE) {
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
    if (decisions.find((decision) => decision.id === decisionId)?.excluded) {
      return;
    }

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
        const csv = buildHistoricalRexLiquidationCsv({
          sourceRows: sourceFile.rows,
          decisions: selectedExportDecisions,
          employeeCatalog,
          mappingScope,
          period: sourceFile.period,
        });
        triggerTextDownload(csv, buildHistoricalLoadFileName(eligibleEmployeeIds.length, sourceFile.period));
      } else if (kind === 'batch') {
        const employeeIds = preparedBatch?.employeeIds ?? nextBatchEmployeeIds;
        const csv = buildHistoricalRexLiquidationCsv({
          sourceRows: sourceFile.rows,
          decisions: selectedExportDecisions,
          employeeCatalog,
          mappingScope,
          period: sourceFile.period,
          employeeIds,
        });
        const cumulativeEmployeeCount = completedEmployeeIds.size + employeeIds.length;
        const fileName = buildHistoricalLoadFileName(cumulativeEmployeeCount, sourceFile.period);
        triggerTextDownload(csv, fileName);
        setPreparedBatch({
          employeeIds,
          fileName,
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
      } else if (kind === 'reconciliation') {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
          {
            Control: 'Estado del libro Meta4',
            Valor: reconciliation.source.status,
          },
          {
            Control: 'Filas revisadas',
            Valor: reconciliation.source.totalRows,
          },
          {
            Control: 'Filas con diferencias de líquido',
            Valor: reconciliation.source.differenceRows,
          },
          {
            Control: 'Diferencia total de líquido',
            Valor: reconciliation.source.differenceTotal,
          },
          {
            Control: 'Filas incompletas sin los tres totales',
            Valor: reconciliation.source.incompleteRows,
          },
          {
            Control: 'Nota',
            Valor: 'La cobertura de conceptos seleccionados es referencial. REX+ puede recalcular conceptos automáticos al procesar la carga.',
          },
        ]), 'Resumen');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildHistoricalReconciliationRows(reconciliation)), 'Cuadratura líquido');
        triggerWorkbookDownload(workbook, `REX_informe_cuadratura_liquido_${todayStamp()}.xlsx`);
      } else {
        const reportRows = buildHistoricalReportRows(
          kind === 'pending'
            ? decisions.filter((decision) => !decision.approved)
            : decisions,
        );
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(reportRows);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Informe');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildHistoricalReconciliationRows(reconciliation)), 'Cuadratura líquido');
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
                <Metric label="Aportes patronales" value={decisions.filter((decision) => getConceptGroup(decision) === 'aporte').length} />
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
                  ? `Catálogo autorizado para Finning: ${concepts.length.toLocaleString('es-CL')} conceptos FINNING V2, incluidos aportes patronales.`
                  : `Catálogo REX+ activo: ${concepts.length.toLocaleString('es-CL')} conceptos disponibles.`}</li>
                <li>Se toma sólo el monto distinto de cero de cada concepto y colaborador.</li>
                <li>Se incluyen los conceptos REX+ tipo 5A. Sólo se excluyen provisiones y Renta Imponible RIMA.</li>
                <li>El archivo de carga histórico se descarga como CSV UTF-8, separado por punto y coma, con las 20 columnas de `Ejemplo`.</li>
                <li>Los mapeos confirmados en memoria se aplican como match perfecto, aunque el nombre de origen sea distinto.</li>
                <li>Los conceptos sin match quedan destacados para asignación manual o creación.</li>
                <li>Los trabajadores se comparan contra el maestro cargado: {employeeMasterFileName || 'maestro REX+ embebido'}.</li>
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
                <p className="font-semibold text-slate-900">Se excluyeron {excludedConcepts.length} provisiones o conceptos de Renta Imponible RIMA, según la regla definida para FINNING.</p>
                <p className="mt-2 leading-6">Conceptos: {excludedConcepts.slice(0, 6).map((concept) => concept.baseHeader).join(', ')}{excludedConcepts.length > 6 ? '…' : ''}</p>
              </div>
            ) : null}
            <section className="mt-5 rounded-[28px] border border-sky-200 bg-sky-50/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Comprobaciones previas</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">Cuadratura del líquido</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Primero se verifica el libro Meta4 por trabajador: total de haberes menos total de descuentos debe ser igual al líquido informado.
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${reconciliationStatusClass}`}>
                  {reconciliationStatusLabel}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <ReconciliationMetric
                  label="Filas revisadas"
                  value={reconciliation.source.totalRows.toLocaleString('es-CL')}
                  detail={`${reconciliation.source.rowsWithTotals.toLocaleString('es-CL')} con los 3 totales`}
                />
                <ReconciliationMetric
                  label="Diferencias de líquido"
                  value={reconciliation.source.differenceRows.toLocaleString('es-CL')}
                  detail={reconciliation.source.differenceRows ? `Máxima: ${formatHistoricalMoney(reconciliation.source.maxDifference)}` : 'Todas cuadran'}
                  tone={reconciliation.source.differenceRows ? 'warning' : 'success'}
                />
                <ReconciliationMetric
                  label="Cobertura seleccionada"
                  value={reconciliation.coverage.differenceRows.toLocaleString('es-CL')}
                  detail="Control referencial; REX+ recalcula automáticos"
                  tone="neutral"
                />
              </div>

              <div className="mt-4 rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-700">
                {reconciliation.source.status === 'ok' ? (
                  <p><strong className="text-emerald-700">El libro Meta4 cuadra.</strong> La cobertura de conceptos seleccionados es referencial y no reemplaza el cálculo final de REX+.</p>
                ) : reconciliation.source.status === 'blocked' ? (
                  <p><strong className="text-amber-800">La descarga está bloqueada.</strong> Hay {reconciliation.source.differenceRows.toLocaleString('es-CL')} filas donde haberes menos descuentos no coincide con el líquido informado.</p>
                ) : reconciliation.source.status === 'incomplete' ? (
                  <p><strong className="text-amber-800">La descarga está bloqueada.</strong> Hay {reconciliation.source.incompleteRows.toLocaleString('es-CL')} filas sin `TOTAL_HABERES`, `TOTAL_DESCUENTOS` o `LIQUIDO`.</p>
                ) : (
                  <p><strong className="text-amber-800">La descarga está bloqueada.</strong> No se encontraron los tres totales necesarios para comprobar el líquido.</p>
                )}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Si el control referencial no coincide, puede deberse a conceptos contractuales, previsión, salud o impuestos que REX+ calcula automáticamente. El informe detallado permite revisar cada trabajador antes de continuar.
                </p>
                <button
                  type="button"
                  onClick={() => handleDownload('reconciliation')}
                  disabled={isPreparing}
                  className="mt-3 rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Descargar informe de cuadratura
                </button>
              </div>
            </section>
            <HistoricalConceptsExportPanel selectedExportIdsInGroup={selectedExportIdsInGroup} exportGroup={exportGroup} setExportGroup={setExportGroup} decisions={decisions} exportGroupDecisions={exportGroupDecisions} allExportGroupSelected={allExportGroupSelected} handleExportGroupSelectAll={handleExportGroupSelectAll} exportSelectedIds={exportSelectedIds} handleExportSelect={handleExportSelect} remainingEmployeeIds={remainingEmployeeIds} batchSize={batchSize} setBatchSize={setBatchSize} preparedBatch={preparedBatch} hasExportBlockers={hasExportBlockers} employeeValidation={employeeValidation} hasReconciliationBlockers={hasReconciliationBlockers} reconciliation={reconciliation} rexValidation={rexValidation} selectedExportDecisions={selectedExportDecisions} selectedExportPending={selectedExportPending} nextBatchEmployeeIds={nextBatchEmployeeIds} completedEmployeeIds={completedEmployeeIds} sourceFile={sourceFile} handleDownload={handleDownload} handleMarkBatchCompleted={handleMarkBatchCompleted} isPreparing={isPreparing} selectedCreatedCount={selectedCreatedCount} onBack={onBack} handleApproveExact={handleApproveExact} handleApproveCreations={handleApproveCreations} />
          </div>
        </div>
      </section>

      <HistoricalConceptsReviewPanel search={search} setSearch={setSearch} activeFilter={activeFilter} setActiveFilter={setActiveFilter} allVisibleSelected={allVisibleSelected} handleSelectAll={handleSelectAll} bulkTarget={bulkTarget} setBulkTarget={setBulkTarget} catalogOptions={catalogOptions} selectedIds={selectedIds} handleBulkApply={handleBulkApply} visibleDecisions={visibleDecisions} decisions={decisions} handleSelect={handleSelect} assignDecision={assignDecision} isPreparing={isPreparing} summary={summary} selectedCreatedCount={selectedCreatedCount} handleDownload={handleDownload} employeeValidation={employeeValidation} hasReconciliationBlockers={hasReconciliationBlockers} reconciliation={reconciliation} hasExportBlockers={hasExportBlockers} rexValidation={rexValidation} selectedExportDecisions={selectedExportDecisions} selectedExportPending={selectedExportPending} />
    </div>
  );
}
