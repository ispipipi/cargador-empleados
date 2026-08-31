import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ConceptSearchPicker from './ConceptSearchPicker';
import {
  buildVismaHistoricalCsv,
  buildVismaHistoricalModel,
  buildVismaHistoricalReportRows,
  summarizeVismaHistoricalDecisions,
} from '../lib/vismaHistorical';
import { normalizeText, todayStamp } from '../lib/utils';
import { applyStoredHistoricalMapping, rememberConceptMappings } from '../lib/sessionPersistence';

const MAPPING_NAMESPACE = 'visma-historical';

export default function VismaHistoricalMapper({ sourceFile, resource, mappingScope, onBack, onBusyChange }) {
  const [model, setModel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isBuilding, setIsBuilding] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    setIsBuilding(true);
    onBusyChange?.(true);

    const timerId = window.setTimeout(() => {
      const nextModel = buildVismaHistoricalModel({
        sourceRows: sourceFile.rows,
        sourceHeaders: sourceFile.headers,
        resource,
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
  }, [mappingScope, onBusyChange, resource, sourceFile]);

  useEffect(() => {
    onBusyChange?.(isBuilding || isDownloading);
  }, [isBuilding, isDownloading, onBusyChange]);

  useEffect(() => {
    rememberConceptMappings(MAPPING_NAMESPACE, decisions, mappingScope);
  }, [decisions, mappingScope]);

  const summary = summarizeVismaHistoricalDecisions(decisions);
  const catalog = model?.catalog ?? [];
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
    });
  };

  const downloadCsv = () => {
    if (summary.pending > 0 || summary.proposals > 0 || isDownloading) {
      return;
    }

    setIsDownloading(true);
    window.setTimeout(() => {
      try {
        const csv = buildVismaHistoricalCsv({
          sourceRows: sourceFile.rows,
          decisions,
          period: sourceFile.period,
          resource,
        });
        downloadBlob(csv, `REX_liquidaciones_detalle_visma_${todayStamp()}.csv`, 'text/csv;charset=utf-8');
      } finally {
        setIsDownloading(false);
      }
    }, 40);
  };

  const downloadReport = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(buildVismaHistoricalReportRows(decisions));
    XLSX.utils.book_append_sheet(workbook, sheet, 'Mapeo Visma REX');
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(output, `REX_informe_visma_${todayStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Maper · Libro histórico</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Visma → REX+ Liquidaciones Detalle</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Revisa los haberes y descuentos detectados, confirma sus conceptos REX+ y descarga el CSV del período {sourceFile.period || 'mensual'}.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Metric label="Conceptos" value={summary.total} />
              <Metric label="Matches" value={summary.exact} tone="green" />
              <Metric label="Pendientes" value={summary.proposals + summary.pending} tone="amber" />
            </div>
          </div>

          <div className="space-y-4 p-6 sm:p-10">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Reglas aplicadas</p>
              <ul className="mt-3 space-y-2">
                <li>RUT como identificador y contrato fijo `1`.</li>
                <li>Fecha de proceso y aplicación: {sourceFile.period || 'AAAA-MM'}.</li>
                <li>Jornada `C`, días trabajados desde Visma y licencias `0`.</li>
                <li>Conceptos contractuales se excluyen: REX+ los recalcula desde contrato y días trabajados.</li>
                <li>El campo Afecto queda vacío para que REX+ lo calcule.</li>
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
          <button
            type="button"
            onClick={downloadCsv}
            disabled={summary.pending + summary.proposals > 0 || isDownloading}
            className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isDownloading ? 'Preparando CSV…' : 'Descargar carga REX+'}
          </button>
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
  return <div className={`rounded-2xl px-4 py-3 ${toneClass}`}><p className="text-xs uppercase tracking-[0.16em] opacity-75">{label}</p><p className="mt-1 text-2xl font-bold">{value.toLocaleString('es-CL')}</p></div>;
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
