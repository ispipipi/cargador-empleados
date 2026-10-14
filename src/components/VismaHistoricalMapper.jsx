import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ConceptSearchPicker from './ConceptSearchPicker';
import {
  buildVismaHistoricalCsv,
  buildVismaHistoricalModel,
  buildVismaHistoricalReportRows,
  getVismaHistoricalEmployeeIds,
  summarizeVismaHistoricalDecisions,
  validateVismaHistoricalInstitutions,
} from '../lib/vismaHistorical';
import { normalizeText, todayStamp } from '../lib/utils';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';
import { splitVismaHistoricalRows } from '../lib/vismaHistoricalRows';
import { buildVismaMissingEmployeeDraft } from '../lib/vismaEmployeeDraft';
import { buildRexExportWorkbook } from '../lib/template';

const MAPPING_NAMESPACE = 'visma-historical';

export default function VismaHistoricalMapper({ sourceFile, resource, employeeCatalog = [], employeeTemplateResource, companyId, mappingScope, batchState, onBatchStateChange, onBack, onBusyChange }) {
  const [model, setModel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isBuilding, setIsBuilding] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [batchSize, setBatchSize] = useState(100);
  const [preparedBatch, setPreparedBatch] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [employeeDraftError, setEmployeeDraftError] = useState('');
  const { monthlyRows, finiquitoRows } = useMemo(
    () => splitVismaHistoricalRows(sourceFile.rows),
    [sourceFile.rows],
  );

  useEffect(() => {
    let active = true;
    setIsBuilding(true);
    onBusyChange?.(true);

    const timerId = window.setTimeout(() => {
      const nextModel = buildVismaHistoricalModel({
        sourceRows: monthlyRows,
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
  }, [employeeCatalog, mappingScope, monthlyRows, onBusyChange, resource, sourceFile.headers]);

  useEffect(() => {
    onBusyChange?.(isBuilding || isDownloading);
  }, [isBuilding, isDownloading, onBusyChange]);

  useEffect(() => {
    rememberConceptMappings(MAPPING_NAMESPACE, decisions, mappingScope);
  }, [decisions, mappingScope]);

  const summary = summarizeVismaHistoricalDecisions(decisions);
  const catalog = model?.catalog ?? [];
  const employeeValidation = model?.employeeValidation ?? { total: 0, matched: 0, issues: [] };
  const missingRexEmployees = employeeValidation.issues.filter((employee) => employee.issue === 'No aparece en el maestro REX+.');
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
    sourceRows: monthlyRows,
    decisions,
    employeeCatalog,
  }), [decisions, employeeCatalog, monthlyRows]);
  const remainingEmployeeIds = useMemo(
    () => eligibleEmployeeIds.filter((employeeId) => !completedEmployeeIds.has(normalizeEmployeeKey(employeeId))),
    [completedEmployeeIds, eligibleEmployeeIds],
  );
  const normalizedBatchSize = Math.max(1, Math.min(10000, Number(batchSize) || 1));
  const nextBatchEmployeeIds = remainingEmployeeIds.slice(0, normalizedBatchSize);
  const institutionValidation = useMemo(() => validateVismaHistoricalInstitutions({
    sourceRows: monthlyRows,
    decisions,
    institutions: resource?.institutions ?? [],
    employeeCatalog,
  }), [decisions, employeeCatalog, monthlyRows, resource]);
  const nextBatchEmployeeKeys = useMemo(() => new Set(nextBatchEmployeeIds.map(normalizeEmployeeKey)), [nextBatchEmployeeIds]);
  const nextBatchInstitutionIssues = institutionValidation.issues.filter((issue) => nextBatchEmployeeKeys.has(normalizeEmployeeKey(issue.employeeId)));
  const isReadyToDownload = summary.pending + summary.proposals === 0
    && employeeValidation.issues.length === 0
    && nextBatchInstitutionIssues.length === 0
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
          sourceRows: monthlyRows,
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

  const downloadFiniquitoRows = () => {
    if (!finiquitoRows.length) return;

    const sourceHeaders = sourceFile.headers.filter((header) => String(header ?? '').trim());
    const headers = ['Archivo de origen', 'Fila de origen', 'Tipo de registro', ...sourceHeaders];
    const rows = finiquitoRows.map((row) => [
      row.__sourceFileName || sourceFile.fileName,
      row.__sourceRowNumber ?? '',
      'Finiquito',
      ...sourceHeaders.map((header) => formatFiniquitoValue(row[header], header)),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', RS: '\r\n', blankrows: false });
    downloadBlob(`\uFEFF${csv}`, `Finiquitos ${periodFileLabel(sourceFile.period)} - revision.csv`, 'text/csv;charset=utf-8');
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
    if (institutionValidation.issues.length) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(institutionValidation.issues.map((issue) => ({
        RUT: issue.employeeId,
        Trabajador: issue.employeeName,
        Concepto: issue.conceptName,
        'ID concepto': issue.conceptId,
        'Institución origen': issue.rawInstitution,
        Archivo: issue.sourceFile,
        Fila: issue.sourceRow,
        Motivo: issue.issue,
      }))), 'Instituciones pendientes');
    }
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(output, `REX_informe_visma_${sourceFile.period || todayStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const downloadMissingEmployeeDraft = () => {
    setEmployeeDraftError('');
    if (!employeeTemplateResource?.arrayBuffer || !missingRexEmployees.length) {
      setEmployeeDraftError('No está disponible la plantilla oficial de empleados REX+ o no hay trabajadores faltantes válidos.');
      return;
    }

    try {
      const { rowEntries, skipped } = buildVismaMissingEmployeeDraft({
        issues: missingRexEmployees,
        sourceRows: monthlyRows,
        templateResource: employeeTemplateResource,
        companyId,
      });
      if (!rowEntries.length) {
        setEmployeeDraftError('No se pudo preparar un archivo: verifica que los trabajadores tengan RUT válido en el libro.');
        return;
      }

      const workbook = buildRexExportWorkbook({ templateResource: employeeTemplateResource, rowEntries });
      const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      downloadBlob(output, `REX_empleados_pendientes_${sourceFile.period || todayStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (skipped.length) {
        setEmployeeDraftError(`Se prepararon ${rowEntries.length} trabajadores; ${skipped.length} no se incluyeron por falta de fila de origen o RUT válido.`);
      }
    } catch (error) {
      setEmployeeDraftError(error instanceof Error ? error.message : 'No se pudo preparar el archivo de empleados REX+.');
    }
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
            <div className="mt-8 grid gap-3 sm:grid-cols-5">
              <Metric label="Conceptos" value={summary.total} />
              <Metric label="Matches" value={summary.exact} tone="green" />
              <Metric label="Pendientes" value={summary.proposals + summary.pending} tone="amber" />
              <Metric label="Trabajadores maestro" value={`${employeeValidation.matched}/${employeeValidation.total}`} tone={employeeValidation.issues.length ? 'amber' : 'green'} />
              <Metric label="Instituciones lote" value={nextBatchInstitutionIssues.length} tone={nextBatchInstitutionIssues.length ? 'amber' : 'green'} />
            </div>
          </div>

          <div className="space-y-4 p-6 sm:p-10">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Reglas aplicadas</p>
              <ul className="mt-3 space-y-2">
                <li>RUT como identificador y contrato leído desde `contratoActi` del maestro.</li>
                <li>Fecha de proceso: {sourceFile.period || 'AAAA-MM'}; fecha de aplicación: `x` para este histórico regular.</li>
                <li>Jornada `C`, días trabajados desde Visma y licencias `0`.</li>
                <li>Se cargan todos los conceptos con monto distinto de cero, incluidos los contractuales, previsionales, de salud, impuestos y aportes patronales.</li>
                <li>Sólo se omiten columnas resumen o bases (totales, líquido, imponible/tributable y costo empresa) para no duplicar importes.</li>
                <li>La columna Afecto se informa como `0`; se conserva el orden y la cantidad de columnas del template cargado.</li>
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

      {finiquitoRows.length ? (
        <section className="panel flex flex-wrap items-center justify-between gap-5 border-amber-200 bg-amber-50/70 p-5 sm:p-6">
          <div>
            <p className="text-sm font-semibold text-amber-900">Finiquitos separados de la carga mensual</p>
            <p className="mt-1 text-sm text-amber-800">
              {finiquitoRows.length.toLocaleString('es-CL')} filas con fecha de baja no se incluirán en los lotes regulares. Este CSV conserva los datos de origen para revisión; aún no es un archivo de importación de finiquitos REX+.
            </p>
          </div>
          <button type="button" onClick={downloadFiniquitoRows} className="rounded-full border border-amber-300 bg-white px-5 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100">
            Descargar finiquitos para revisión
          </button>
        </section>
      ) : null}

      <section className={`panel p-5 sm:p-6 ${institutionValidation.issues.length ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-semibold ${institutionValidation.issues.length ? 'text-amber-900' : 'text-emerald-800'}`}>
              {institutionValidation.issues.length
                ? `${institutionValidation.issues.length.toLocaleString('es-CL')} institución(es) sin asociar a un ID REX+`
                : `Instituciones verificadas: ${institutionValidation.checked.toLocaleString('es-CL')} registros con código de catálogo`}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {institutionValidation.issues.length
                ? 'Los IDs se traducen con el catálogo del template. El lote sólo se bloquea si una diferencia afecta a los trabajadores que se descargarán ahora.'
                : 'Los IDs exportados se toman exactamente del catálogo de instituciones del template REX+.'}
            </p>
          </div>
          {institutionValidation.issues.length ? (
            <button type="button" onClick={downloadReport} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Descargar diferencias
            </button>
          ) : null}
        </div>
        {institutionValidation.issues.length ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-amber-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-900"><tr><th className="px-4 py-3">RUT</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Institución en origen</th><th className="px-4 py-3">Problema</th></tr></thead>
              <tbody className="divide-y divide-amber-100">{institutionValidation.issues.slice(0, 10).map((issue, index) => (
                <tr key={`${issue.employeeId}-${issue.conceptId}-${issue.sourceFile}-${issue.sourceRow}-${index}`}>
                  <td className="px-4 py-3 font-mono text-xs">{issue.employeeId}</td>
                  <td className="px-4 py-3">{issue.conceptName} <span className="font-mono text-xs text-slate-500">({issue.conceptId})</span></td>
                  <td className="px-4 py-3">{issue.rawInstitution || 'Vacío'}</td>
                  <td className="px-4 py-3 text-xs">{issue.issue}</td>
                </tr>
              ))}</tbody>
            </table>
            {institutionValidation.issues.length > 10 ? <p className="px-4 py-3 text-xs text-amber-800">Se muestran 10 de {institutionValidation.issues.length.toLocaleString('es-CL')} diferencias; el informe descargable incluye todas.</p> : null}
          </div>
        ) : null}
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
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadReport} className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100">
                Descargar diferencias
              </button>
              {missingRexEmployees.length ? (
                <button type="button" onClick={downloadMissingEmployeeDraft} disabled={!employeeTemplateResource?.arrayBuffer} className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                  Descargar archivo de empleados ({missingRexEmployees.length})
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {missingRexEmployees.length ? (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            El archivo usa la plantilla oficial REX+ y prellena sólo datos identificables desde el libro y catálogos con coincidencia exacta. Completa los datos personales y contractuales que falten antes de importarlo.
          </p>
        ) : null}
        {employeeDraftError ? <p className="mt-3 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800">{employeeDraftError}</p> : null}
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
                : nextBatchInstitutionIssues.length
                  ? `La descarga del lote está bloqueada: ${nextBatchInstitutionIssues.length} registro(s) no tienen una institución válida del catálogo.`
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

function formatFiniquitoValue(value, header) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && /fecha/i.test(header)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  return value ?? '';
}
