import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  applyConceptDecision,
  buildConceptDecisions,
  buildConceptExportWorkbook,
  buildConceptReportWorkbook,
  summarizeConceptDecisions,
} from '../lib/concepts';
import { normalizeText, todayStamp } from '../lib/utils';

const NEW_CONCEPT_VALUE = '__new__';
const EXCLUDE_CONCEPT_VALUE = '__exclude__';

export default function ConceptsMapper({ resource, onBack }) {
  const [decisions, setDecisions] = useState(() =>
    buildConceptDecisions(resource).map((decision) => ({
      ...decision,
      approved: decision.approved ?? decision.matchStatus === 'exact',
    })),
  );
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const summary = summarizeConceptDecisions(decisions);
  const pendingCount = decisions.filter((decision) => !decision.approved).length;

  const visibleDecisions = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return decisions.filter((decision) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(decision.sourceName).includes(normalizedSearch) ||
        normalizeText(decision.targetName).includes(normalizedSearch) ||
        normalizeText(decision.sourceCode).includes(normalizedSearch) ||
        normalizeText(decision.lreField).includes(normalizedSearch);
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'pending' && !decision.approved) ||
        (activeFilter === 'exact' && decision.matchStatus === 'exact') ||
        (activeFilter === 'created' && decision.action === 'create') ||
        (activeFilter === 'reused' && decision.action === 'reuse');

      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, decisions, search]);

  const visibleIds = visibleDecisions.map((decision) => decision.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const updateDecision = (decisionId, patch) => {
    setDecisions((current) =>
      current.map((decision) =>
        decision.id === decisionId ? { ...decision, ...patch } : decision,
      ),
    );
  };

  const handleAssign = (decisionId, targetId) => {
    if (targetId === EXCLUDE_CONCEPT_VALUE) {
      updateDecision(decisionId, {
        action: 'exclude',
        matchStatus: 'excluded',
        excluded: true,
        targetConcept: null,
        targetId: '',
        targetName: '',
        approved: true,
      });
      return;
    }

    if (targetId === NEW_CONCEPT_VALUE) {
      const currentDecision = decisions.find((decision) => decision.id === decisionId);

      if (!currentDecision) {
        return;
      }

      updateDecision(decisionId, {
        action: 'create',
        matchStatus: 'proposal',
        targetConcept: null,
        excluded: false,
        targetId: currentDecision.proposedId,
        targetName: currentDecision.sourceName,
        sequence: currentDecision.proposedSequence,
        approved: false,
      });
      return;
    }

    const targetConcept = resource.concepts.find((concept) => concept.id === targetId);
    if (!targetConcept) {
      return;
    }

    updateDecision(
      decisionId,
      applyConceptDecision(
        decisions.find((decision) => decision.id === decisionId),
        {
          action: 'reuse',
          matchStatus: 'assigned',
          targetConcept,
          approved: true,
          excluded: false,
        },
      ),
    );
  };

  const handleApprove = (decisionId) => {
    updateDecision(decisionId, { approved: true });
  };

  const handleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  };

  const handleSelectRow = (decisionId) => {
    setSelectedIds((current) =>
      current.includes(decisionId) ? current.filter((id) => id !== decisionId) : [...current, decisionId],
    );
  };

  const handleApproveSelected = () => {
    if (selectedIds.length === 0) {
      return;
    }

    setDecisions((current) =>
      current.map((decision) => (selectedIds.includes(decision.id) ? { ...decision, approved: true } : decision)),
    );
    setSelectedIds([]);
  };

  const handleApproveAllProposals = () => {
    setDecisions((current) => current.map((decision) => ({ ...decision, approved: true })));
    setSelectedIds([]);
  };

  const handleDownload = async (kind) => {
    if (isPreparing || (kind === 'output' && pendingCount > 0)) {
      return;
    }

    setIsPreparing(true);
    await waitForPaint();

    try {
      const workbook =
        kind === 'output'
          ? buildConceptExportWorkbook({ resource, decisions })
          : buildConceptReportWorkbook({ decisions });
      const fileName =
        kind === 'output'
          ? `REX_conceptos_${todayStamp()}.xlsx`
          : `REX_informe_conceptos_${todayStamp()}.xlsx`;
      triggerWorkbookDownload(workbook, fileName);
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative overflow-hidden bg-[#07101f] px-6 py-8 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.24),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.2),_transparent_30%),linear-gradient(180deg,_rgba(8,15,28,1),_rgba(3,7,18,1))]" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Maper · Conceptos</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Mapeo Meta 4 → REX+</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                Revisa los matches exactos, aprueba las propuestas y descarga sólo las altas nuevas junto con el informe final.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Metric label="Conceptos" value={summary.total} />
                <Metric label="Pendientes" value={pendingCount} tone="warning" />
                <Metric label="Matches exactos" value={summary.exactMatches} tone="success" />
                <Metric label="Propuestas" value={summary.proposals} />
              </div>
            </div>
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Cómo se construye la salida</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li>Los nombres que coinciden exactamente con REX+ quedan reutilizados.</li>
                <li>Los demás conceptos reciben una propuesta de alta y pueden asignarse a otro concepto existente.</li>
                <li>La clasificación y el campo LRE se conservan desde el mapeo de origen.</li>
                <li>El archivo de carga incluye sólo conceptos nuevos y se habilita al aprobar todas las propuestas.</li>
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={onBack} className="button-secondary">
                Volver a módulos
              </button>
              <button
                type="button"
                onClick={handleApproveAllProposals}
                disabled={pendingCount === 0}
                className="button-primary disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Aprobar propuestas
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Revisión de mapeo</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">Todos los conceptos y su decisión</h3>
            <p className="mt-2 text-sm text-slate-600">Puedes buscar por nombre, código Meta4 o campo LRE.</p>
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
            ['pending', 'Pendientes'],
            ['exact', 'Match exacto'],
            ['created', 'Crear nuevos'],
            ['reused', 'Reutilizados'],
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
            <input type="checkbox" checked={allVisibleSelected} onChange={handleSelectAllVisible} />
            Seleccionar visibles
          </label>
          <button
            type="button"
            onClick={handleApproveSelected}
            disabled={selectedIds.length === 0}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Aprobar seleccionados ({selectedIds.length})
          </button>
          <span className="text-xs text-slate-500">Mostrando {visibleDecisions.length} de {decisions.length}</span>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
          <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-4 py-4"> </th>
                <th className="px-4 py-4">Estado</th>
                <th className="px-4 py-4">Concepto Meta4</th>
                <th className="px-4 py-4">Propuesta / match REX+</th>
                <th className="px-4 py-4">Tipo</th>
                <th className="px-4 py-4">LRE</th>
                <th className="px-4 py-4">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleDecisions.map((decision) => (
                <ConceptRow
                  key={decision.id}
                  decision={decision}
                  concepts={resource.concepts}
                  isSelected={selectedIds.includes(decision.id)}
                  onSelect={() => handleSelectRow(decision.id)}
                  onAssign={(targetId) => handleAssign(decision.id, targetId)}
                  onApprove={() => handleApprove(decision.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {isPreparing ? (
          <WorkingNotice />
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <DownloadButton
            title="Descargar altas nuevas REX+"
            detail={pendingCount ? `Faltan ${pendingCount} propuestas por aprobar` : 'Sólo incluye conceptos que deben crearse en REX+'}
            onClick={() => handleDownload('output')}
            disabled={pendingCount > 0 || isPreparing}
            primary
          />
          <DownloadButton
            title="Descargar informe final"
            detail="Incluye matches, conceptos creados, exclusiones y advertencias"
            onClick={() => handleDownload('report')}
            disabled={isPreparing}
          />
        </div>
      </section>
    </div>
  );
}

function ConceptRow({ decision, concepts, isSelected, onSelect, onAssign, onApprove }) {
  const statusLabel = decision.approved
    ? decision.matchStatus === 'excluded'
      ? 'Excluido'
      : decision.matchStatus === 'exact'
      ? 'Match exacto'
      : 'Aprobado'
    : 'Pendiente';
  const statusClass = decision.approved
    ? decision.matchStatus === 'excluded'
      ? 'border-slate-200 bg-slate-100 text-slate-600'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <tr className={decision.approved ? 'bg-white' : 'bg-amber-50/20'}>
      <td className="px-4 py-4 align-top">
        <input type="checkbox" checked={isSelected} onChange={onSelect} />
      </td>
      <td className="px-4 py-4 align-top">
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}>
          {statusLabel}
        </span>
        {decision.warning ? <p className="mt-2 max-w-[220px] text-xs leading-5 text-amber-700">{decision.warning}</p> : null}
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-slate-900">{decision.sourceName}</p>
        <p className="mt-1 text-xs text-slate-500">Meta4: {decision.sourceCode || 'Sin código'}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-slate-900">{decision.targetName}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">{decision.targetId}</p>
      </td>
      <td className="px-4 py-4 align-top font-mono text-xs text-slate-600">{decision.type || '—'}</td>
      <td className="px-4 py-4 align-top font-mono text-xs text-slate-600">{decision.lreField || '—'}</td>
      <td className="px-4 py-4 align-top">
        <div className="flex min-w-[250px] flex-col gap-2">
          <select
            value={decision.action === 'create' ? NEW_CONCEPT_VALUE : decision.action === 'exclude' ? EXCLUDE_CONCEPT_VALUE : decision.targetId}
            onChange={(event) => onAssign(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
          >
            <option value={NEW_CONCEPT_VALUE}>Crear propuesta nueva</option>
            <option value={EXCLUDE_CONCEPT_VALUE}>Excluir del archivo de carga</option>
            {concepts.map((concept) => (
              <option key={concept.id} value={concept.id}>
                Reutilizar: {concept.name} ({concept.id})
              </option>
            ))}
          </select>
          {!decision.approved ? (
            <button type="button" onClick={onApprove} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
              Aprobar decisión
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'warning' ? 'bg-amber-400/15 text-amber-100' : tone === 'success' ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-slate-100';

  return (
    <div className={`rounded-[22px] border border-white/10 px-4 py-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function DownloadButton({ title, detail, onClick, disabled, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[24px] border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        primary ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-200 bg-white hover:border-brand-300'
      }`}
    >
      <p className={`font-bold ${primary ? 'text-white' : 'text-slate-950'}`}>{title}</p>
      <p className={`mt-1 text-sm ${primary ? 'text-slate-300' : 'text-slate-600'}`}>{detail}</p>
    </button>
  );
}

function WorkingNotice() {
  return (
    <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        <span className="font-semibold">Estamos preparando el archivo y el informe…</span>
      </div>
    </div>
  );
}

function triggerWorkbookDownload(workbook, fileName) {
  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function waitForPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
}
