import { useEffect, useMemo, useState } from 'react';
import ConceptSearchPicker from './ConceptSearchPicker';
import { parseVismaHistoricalEmployeeMaster } from '../lib/vismaHistoricalEmployeeMaster';
import {
  MONTHLY_URL_SCOPES,
  buildMonthlyConceptCsv,
  buildMonthlyConceptDecisions,
  excludeMonthlyFiniquitoRows,
  getMonthlyConceptSuggestions,
  parseMonthlyConceptMatrix,
  parseMonthlyDetailTemplate,
  parseMonthlyVismaBook,
  validateMonthlyConceptLoad,
} from '../lib/monthlyConcepts';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';

const MAPPING_NAMESPACE = 'monthly-visma-rex';
const EMPTY_WORKSPACE = { book: null, matrix: null, template: null, employees: null, reading: '', errors: {} };

export default function MonthlyConceptsFlow({ mappingCompany, mappingScope, conceptCatalog = [], onCompanyChange, onBack }) {
  const [workspaces, setWorkspaces] = useState({});
  const [decisionsByScope, setDecisionsByScope] = useState({});
  const [search, setSearch] = useState('');
  const [urlScope, setUrlScope] = useState('ola-1');
  const [downloadError, setDownloadError] = useState('');
  const [downloadedFile, setDownloadedFile] = useState('');
  const scope = MONTHLY_URL_SCOPES.some((item) => item.id === urlScope) ? urlScope : 'ola-1';
  const workspace = workspaces[scope] ?? EMPTY_WORKSPACE;
  const monthlyBook = useMemo(
    () => excludeMonthlyFiniquitoRows(workspace.book, mappingCompany),
    [mappingCompany, workspace.book],
  );
  const decisions = useMemo(() => decisionsByScope[scope] ?? [], [decisionsByScope, scope]);
  const variableDecisions = decisions.filter((decision) => decision.loadable);
  const excludedDecisions = decisions.filter((decision) => !decision.loadable);

  useEffect(() => {
    if (!monthlyBook || !workspace.matrix) {
      setDecisionsByScope((current) => ({ ...current, [scope]: [] }));
      return;
    }

    const built = buildMonthlyConceptDecisions({
      sourceConcepts: monthlyBook.conceptColumns,
      matrixConcepts: workspace.matrix.concepts,
      catalog: conceptCatalog,
      scope,
      company: mappingCompany,
    }).map((decision) => applyStoredHistoricalMapping(
      MAPPING_NAMESPACE,
      decision,
      { concepts: conceptCatalog, scope: mappingScope, strictCatalog: false },
    ));
    setDecisionsByScope((current) => ({ ...current, [scope]: built }));
  }, [conceptCatalog, mappingCompany, mappingScope, monthlyBook, scope, workspace.matrix]);

  useEffect(() => {
    rememberConceptMappings(MAPPING_NAMESPACE, decisions, mappingScope);
  }, [decisions, mappingScope]);

  const validation = useMemo(() => validateMonthlyConceptLoad({
    source: monthlyBook,
    decisions,
    employeeCatalog: workspace.employees?.catalog,
    template: workspace.template,
  }), [decisions, monthlyBook, workspace.employees, workspace.template]);

  const visibleDecisions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CL');
    return query
      ? variableDecisions.filter((decision) => `${decision.sourceName} ${decision.targetId} ${decision.targetName} ${decision.classification}`.toLocaleLowerCase('es-CL').includes(query))
      : variableDecisions;
  }, [search, variableDecisions]);

  const decisionSummary = useMemo(() => ({
    available: variableDecisions.length,
    selected: variableDecisions.filter((decision) => decision.selected).length,
    matched: variableDecisions.filter((decision) => decision.selected && decision.approved && decision.targetId).length,
    pending: variableDecisions.filter((decision) => decision.selected && (!decision.approved || !decision.targetId)).length,
    amountLines: variableDecisions.reduce((sum, decision) => sum + (decision.selected ? decision.nonZeroCount : 0), 0),
  }), [variableDecisions]);

  const allVariablesSelected = variableDecisions.length > 0
    && variableDecisions.every((decision) => decision.selected);
  const someVariablesSelected = variableDecisions.some((decision) => decision.selected);

  const updateWorkspace = (activeScope, nextValues) => {
    setWorkspaces((current) => ({
      ...current,
      [activeScope]: { ...(current[activeScope] ?? EMPTY_WORKSPACE), ...nextValues },
    }));
  };

  const handleUpload = async (kind, file, password = '') => {
    if (!file) return;
    const activeScope = scope;
    const acceptedFile = kind === 'employees' ? /\.(csv|xls|xlsx)$/i : /\.(xls|xlsx)$/i;
    if (!acceptedFile.test(file.name)) {
      updateWorkspace(activeScope, {
        errors: {
          ...workspace.errors,
          [kind]: kind === 'employees'
            ? 'El maestro debe tener formato .csv, .xls o .xlsx.'
            : 'El archivo debe tener formato .xls o .xlsx.',
        },
      });
      return;
    }

    updateWorkspace(activeScope, {
      [kind]: null,
      reading: kind,
      errors: { ...workspace.errors, [kind]: '' },
    });

    try {
      const buffer = await file.arrayBuffer();
      let data;
      if (kind === 'book') {
        data = { ...await parseMonthlyVismaBook(buffer, password), fileName: file.name };
      } else if (kind === 'matrix') {
        data = { ...await parseMonthlyConceptMatrix(buffer, password), fileName: file.name };
      } else if (kind === 'template') {
        data = { ...await parseMonthlyDetailTemplate(buffer, password), fileName: file.name };
      } else {
        data = { catalog: await parseVismaHistoricalEmployeeMaster(buffer, password, file.name), fileName: file.name };
      }
      updateWorkspace(activeScope, {
        [kind]: data,
        reading: '',
        errors: { ...workspace.errors, [kind]: '', [`${kind}PasswordRequired`]: false },
      });
      setDownloadedFile('');
      setDownloadError('');
      if (kind === 'book' || kind === 'matrix') {
        setDecisionsByScope((current) => ({ ...current, [activeScope]: [] }));
      }
    } catch (error) {
      updateWorkspace(activeScope, {
        reading: '',
        errors: {
          ...workspace.errors,
          [kind]: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
            ? error.message
            : `No se pudo leer ${file.name}: ${error.message}`,
          [`${kind}PasswordRequired`]: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD',
        },
      });
    }
  };

  const updateDecision = (id, changes) => {
    setDecisionsByScope((current) => ({
      ...current,
      [scope]: (current[scope] ?? []).map((decision) => decision.id === id ? { ...decision, ...changes } : decision),
    }));
    setDownloadedFile('');
    setDownloadError('');
  };

  const updateAllVariableSelections = (selected) => {
    setDecisionsByScope((current) => ({
      ...current,
      [scope]: (current[scope] ?? []).map((decision) => (
        decision.loadable ? { ...decision, selected } : decision
      )),
    }));
    setDownloadedFile('');
    setDownloadError('');
  };

  const selectCatalogConcept = (decision, targetId) => {
    const concept = conceptCatalog.find((item) => String(item.id) === String(targetId));
    if (!concept) return;
    updateDecision(decision.id, {
      targetId: concept.id,
      targetName: concept.name,
      targetConcept: concept,
      approved: true,
      excluded: false,
      action: 'reuse',
      matchStatus: 'manual',
      matchOrigin: 'manual',
    });
  };

  const handleDownload = () => {
    setDownloadError('');
    try {
      const result = buildMonthlyConceptCsv({
        source: monthlyBook,
        decisions,
        employeeCatalog: workspace.employees.catalog,
        templateHeaders: workspace.template.headers,
        scope,
      });
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setDownloadedFile(result.fileName);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'No se pudo generar el archivo.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] bg-slate-950 text-white shadow-xl">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Carga mensual · Visma → REX+</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Conceptos de remuneraciones</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Revisa los conceptos del período, confirma su ID REX+ y genera el CSV de Conceptos Detalle.
              Los pareos se guardan separados por URL.
            </p>
          </div>
          <div className="grid min-w-64 gap-2 sm:grid-cols-2">
            <label className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">URL / ámbito</span>
              <select
                value={scope}
                onChange={(event) => {
                  setUrlScope(event.target.value);
                  setSearch('');
                  setDownloadedFile('');
                }}
                className="mt-2 w-full bg-transparent text-sm font-semibold text-white outline-none"
              >
                {MONTHLY_URL_SCOPES.map((item) => <option key={item.id} value={item.id} className="text-slate-900">{item.label}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Empresa</span>
              <input
                value={mappingCompany}
                onChange={(event) => onCompanyChange(event.target.value)}
                className="mt-2 w-full bg-transparent text-sm font-semibold text-white outline-none"
                aria-label="Empresa que se procesará"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UploadCard
          title="Libro mensual Visma"
          description="Libro del período que se transformará."
          kind="book"
          file={workspace.book}
          reading={workspace.reading === 'book'}
          error={workspace.errors.book}
          passwordRequired={workspace.errors.bookPasswordRequired}
          onSelect={handleUpload}
        />
        <UploadCard
          title="Mapeo de conceptos Visma → REX+"
          description="Carga el mapeo con sus nombres, IDs destino y similitud; también se acepta la matriz anterior."
          kind="matrix"
          file={workspace.matrix}
          reading={workspace.reading === 'matrix'}
          error={workspace.errors.matrix}
          passwordRequired={workspace.errors.matrixPasswordRequired}
          onSelect={handleUpload}
        />
        <UploadCard
          title="Template Conceptos Detalle"
          description="Valida encabezados y orden de las 16 columnas oficiales."
          kind="template"
          file={workspace.template}
          reading={workspace.reading === 'template'}
          error={workspace.errors.template}
          passwordRequired={workspace.errors.templatePasswordRequired}
          onSelect={handleUpload}
        />
        <UploadCard
          title="Maestro REX+ de contratos"
          description="Necesario para asociar cada RUT con su contrato real. Acepta el Excel del template o el CSV de colaboradores exportado desde REX+."
          kind="employees"
          file={workspace.employees}
          reading={workspace.reading === 'employees'}
          error={workspace.errors.employees}
          passwordRequired={workspace.errors.employeesPasswordRequired}
          onSelect={handleUpload}
        />
      </section>

      {monthlyBook?.excludedFiniquitoRows ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          Se excluyeron {monthlyBook.excludedFiniquitoRows} fila(s) de finiquito de la carga mensual de GREENVIC.
        </div>
      ) : null}

      {monthlyBook ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Período detectado" value={monthlyBook.period || 'Revisar'} />
          <SummaryCard label="Trabajadores" value={monthlyBook.workerCount.toLocaleString('es-CL')} />
          <SummaryCard label="Variables disponibles" value={decisionSummary.available.toLocaleString('es-CL')} />
          <SummaryCard label="Líneas a exportar" value={validation.detailCount.toLocaleString('es-CL')} />
        </section>
      ) : null}

      {monthlyBook && workspace.matrix ? (
        <section className="panel p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Revisión de mapeo</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">Conceptos de {MONTHLY_URL_SCOPES.find((item) => item.id === scope)?.label}</h3>
              <p className="mt-2 text-sm text-slate-600">
                {decisionSummary.available} variables disponibles · {decisionSummary.selected} seleccionadas · {decisionSummary.matched} pareadas · {decisionSummary.pending} por resolver.
              </p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar concepto Visma o REX+"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:max-w-sm"
            />
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={allVariablesSelected}
              aria-checked={someVariablesSelected && !allVariablesSelected ? 'mixed' : allVariablesSelected}
              onChange={(event) => updateAllVariableSelections(event.target.checked)}
              disabled={!variableDecisions.length}
              className="size-4 accent-brand-600"
            />
            Seleccionar todas las variables
            <span className="ml-auto text-xs font-normal text-slate-500">
              {decisionSummary.selected} de {decisionSummary.available} seleccionadas · {decisionSummary.amountLines.toLocaleString('es-CL')} valores no cero
            </span>
          </label>

          <div className="mt-5 space-y-3">
            {visibleDecisions.map((decision) => (
              <ConceptMappingRow
                key={`${scope}-${decision.id}`}
                decision={decision}
                catalog={conceptCatalog}
                onSelect={(targetId) => selectCatalogConcept(decision, targetId)}
                onUpdate={(changes) => updateDecision(decision.id, changes)}
              />
            ))}
            {!variableDecisions.length ? <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">No se detectaron variables con monto distinto de cero.</p> : null}
            {variableDecisions.length > 0 && !visibleDecisions.length ? <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">No hay conceptos que coincidan con la búsqueda.</p> : null}
          </div>

          {excludedDecisions.length ? (
            <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Fuera de esta carga: {excludedDecisions.length} conceptos contractuales, aportes patronales o provisiones
              </summary>
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                {excludedDecisions.map((decision) => (
                  <li key={`excluded-${decision.id}`}>
                    <strong className="text-slate-800">{decision.sourceName}:</strong> {decision.exclusionReason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {monthlyBook && workspace.matrix ? (
        <section className={`rounded-[26px] border p-5 sm:p-6 ${validation.canDownload ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-950">Validaciones antes de descargar</p>
              {validation.canDownload ? (
                <p className="mt-2 text-sm text-emerald-800">Las variables seleccionadas, trabajadores, contratos y template están listos para generar el CSV.</p>
              ) : (
                <p className="mt-2 text-sm text-amber-900">La descarga se habilita cuando se resuelvan todos los bloqueos.</p>
              )}
              {validation.issues.length ? (
                <ul className="mt-3 space-y-1 text-sm text-amber-900">
                  {validation.issues.slice(0, 8).map((issue, index) => <li key={`${issue.id}-${index}`}>{issue.id}: {issue.reason}</li>)}
                  {validation.issues.length > 8 ? <li>Y {validation.issues.length - 8} validación(es) más.</li> : null}
                </ul>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!validation.canDownload}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Descargar CSV REX+
              </button>
              <button type="button" onClick={onBack} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-300">
                Volver a módulos
              </button>
            </div>
          </div>
          {downloadError ? <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{downloadError}</p> : null}
          {downloadedFile ? <p className="mt-3 text-sm font-medium text-emerald-800">Archivo generado: {downloadedFile}</p> : null}
          <p className="mt-4 border-t border-amber-200 pt-3 text-xs leading-5 text-slate-600">
            Se exportan sólo las variables seleccionadas con monto distinto de cero. Conceptos contractuales, aportes patronales, provisiones, totales y datos de identificación quedan fuera.
            Origen y período de pago se informan como M; contrato, ID y columnas se validan antes de generar.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-600">
        <strong className="text-slate-900">Formato REX+:</strong> CSV UTF-8, encabezados obligatorios y orden exacto del template. Los montos se exportan sin separadores de miles; los campos no usados quedan en blanco.
        <a
          href="https://ayudachile.rexmas.com/es/articles/8851619-ingreso-masivo-en-detalle-de-conceptos-a-la-plantilla-propia-del-colaborador"
          target="_blank"
          rel="noreferrer"
          className="ml-2 font-semibold text-brand-700 underline underline-offset-2"
        >
          Ver ayuda de REX+
        </a>
      </section>
    </div>
  );
}

function UploadCard({ title, description, kind, file, reading, error, passwordRequired, onSelect }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (file) setPassword('');
  }, [file]);

  return (
    <section className="panel flex min-h-56 flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Archivo de entrada</p>
      <h3 className="mt-2 text-base font-bold text-slate-950">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
      {file?.fileName ? <p className="mt-3 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" title={file.fileName}>{file.fileName}</p> : null}
      <label className="mt-4 inline-flex w-fit cursor-pointer items-center rounded-full border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">
        {reading ? 'Leyendo archivo…' : file ? 'Reemplazar archivo' : 'Seleccionar archivo'}
        <input
          type="file"
          accept={kind === 'employees' ? '.csv,.xls,.xlsx' : '.xls,.xlsx'}
          className="sr-only"
          disabled={reading}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) {
              setSelectedFile(nextFile);
              onSelect(kind, nextFile);
            }
            event.target.value = '';
          }}
        />
      </label>
      {passwordRequired ? (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Clave del Excel"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => selectedFile && onSelect(kind, selectedFile, password)}
            disabled={!password.trim() || reading}
            className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-amber-300"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{error}</p> : null}
    </section>
  );
}

function ConceptMappingRow({ decision, catalog, onSelect, onUpdate }) {
  const savedLabel = decision.targetId ? `${decision.targetName || 'Concepto REX+'} (${decision.targetId})` : '';
  const mapped = Boolean(decision.approved && decision.targetId);
  const draftId = decision.draftTargetId ?? decision.targetId;
  const draftName = decision.draftTargetName ?? decision.targetName;

  return (
    <article className={`grid gap-4 rounded-2xl border p-4 lg:grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)_minmax(280px,1.25fr)] ${mapped ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={decision.selected}
          onChange={(event) => onUpdate({ selected: event.target.checked })}
          aria-label={`Incluir ${decision.sourceName} en el CSV`}
          className="mt-1 size-4 shrink-0 accent-brand-600"
        />
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${mapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            {mapped ? (decision.matchOrigin === 'memory' ? 'Mapeo guardado' : decision.matchStatus === 'matrix' || decision.matchStatus === 'mapping' ? 'ID desde mapeo' : 'Pareo confirmado') : 'Falta pareo'}
          </span>
          <p className="mt-3 font-semibold text-slate-950">{decision.sourceName}</p>
          <p className="mt-1 text-xs text-slate-500">{decision.nonZeroCount.toLocaleString('es-CL')} trabajador(es) con valor</p>
          {decision.sourceCode ? <p className="mt-1 font-mono text-xs text-slate-500">Visma {decision.sourceCode}</p> : null}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {decision.mappingSource ? 'Referencia del mapeo' : 'Referencia de matriz'}
        </p>
        <p className="mt-2 text-sm font-medium text-slate-800">
          {decision.mappingConflict
            ? 'Hay destinos distintos para este concepto'
            : decision.mappingSource
              ? decision.targetName || 'Sin coincidencia en el archivo'
              : decision.matrixConcept?.lreName || 'No aparece en el mapeo cargado'}
        </p>
        {decision.mappingSource && Number.isFinite(decision.similarity) ? (
          <p className={`mt-1 text-xs ${decision.similarity === 100 ? 'text-emerald-700' : 'text-amber-800'}`}>
            Similitud {decision.similarity}%{decision.similarity < 100 ? ' · requiere confirmación' : ' · coincidencia exacta'}
          </p>
        ) : null}
        {decision.classification ? <p className="mt-1 text-xs text-slate-500">{decision.classification}</p> : null}
        {decision.formulation ? <p className="mt-1 line-clamp-2 text-xs text-slate-500" title={decision.formulation}>{decision.formulation}</p> : null}
      </div>

      <div className="space-y-2">
        {catalog.length ? (
          <ConceptSearchPicker
            selectedId={decision.targetId}
            selectedLabel={savedLabel}
            concepts={catalog}
            suggestedConcepts={getMonthlyConceptSuggestions(decision.sourceName, catalog)}
            onSelect={onSelect}
          />
        ) : <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500">No hay catálogo REX+ cargado; completa el ID manual desde REX+.</p>}
        {!mapped ? (
          <div className="grid grid-cols-[minmax(90px,0.7fr)_minmax(130px,1.3fr)_auto] gap-2">
            <input
              value={draftId}
              onChange={(event) => onUpdate({ draftTargetId: event.target.value.slice(0, 20) })}
              maxLength={20}
              placeholder="ID REX+"
              aria-label={`ID REX+ para ${decision.sourceName}`}
              className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            />
            <input
              value={draftName}
              onChange={(event) => onUpdate({ draftTargetName: event.target.value })}
              placeholder="Nombre del concepto"
              aria-label={`Nombre REX+ para ${decision.sourceName}`}
              className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => onUpdate({ targetId: draftId.trim(), targetName: draftName.trim(), approved: true, action: 'reuse', matchStatus: 'manual', matchOrigin: 'manual', excluded: false })}
              disabled={!draftId.trim() || !draftName.trim() || draftId.trim().length > 20}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
            >
              Confirmar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onUpdate({ targetId: '', targetName: '', targetConcept: null, approved: false, action: 'pending', matchStatus: 'pending', matchOrigin: '' })}
            className="text-xs font-semibold text-slate-500 underline underline-offset-2 hover:text-rose-700"
          >
            Cambiar pareo
          </button>
        )}
      </div>
    </article>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
