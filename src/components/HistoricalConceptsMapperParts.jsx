import * as XLSX from 'xlsx';
import ConceptSearchPicker from './ConceptSearchPicker';
import { normalizeText } from '../lib/utils';

const CREATE_VALUE = '__create__';


export function HistoricalConceptRow({ decision, catalog, selected, disabled, onSelect, onAssign }) {
  const statusLabel = decision.excluded
    ? 'Fuera de alcance por regla'
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
      <td className="px-4 py-4"><input type="checkbox" checked={selected} disabled={disabled} onChange={onSelect} /></td>
      <td className="px-4 py-4">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
        {!decision.exactMatch && !decision.excluded ? <p className="mt-2 max-w-[220px] text-xs leading-5 text-amber-800">Revisa esta propuesta antes de aprobarla.</p> : null}
        {decision.excluded && decision.exclusionReason ? <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-600">{decision.exclusionReason}</p> : null}
      </td>
      <td className="max-w-[360px] px-4 py-4">
        <p className="font-semibold text-slate-900">{decision.sourceName}</p>
        {decision.sourceKey !== decision.sourceName ? <p className="mt-1 text-xs text-slate-500">Columna: {decision.sourceKey}</p> : null}
        <p className="mt-1 text-xs text-slate-500">Ejemplo: {decision.sampleValue || '—'}</p>
      </td>
      <td className="px-4 py-4 text-slate-600"><p>{decision.nonZeroCount.toLocaleString('es-CL')} colaboradores</p><p className="mt-1 text-xs text-slate-400">{decision.sourceSection}</p></td>
      <td className="px-4 py-4">
        {decision.excluded ? (
          <span className="text-xs font-medium text-slate-500">No se incluirá por la regla definida</span>
        ) : (
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
          />
        )}
      </td>
      <td className="px-4 py-4 text-xs text-slate-500">{decision.excluded ? 'Excluido por regla' : decision.approved ? 'Se incluirá en la salida' : 'Requiere asignación para cargar'}</td>
    </tr>
  );
}

export function getReviewGroup(decision) {
  if (decision.excluded || decision.exactMatch || decision.approved) {
    return decision.excluded ? 3 : 0;
  }

  return decision.suggestedMatches.length > 0 ? 1 : 2;
}

export function getConceptGroup(decision) {
  const type = normalizeText(decision.targetConcept?.type || decision.type).replace(/[^a-z0-9]+/g, '');

  if (type === '5a') {
    return 'aporte';
  }

  if (type === '3l' || type === '4d') {
    return 'descuento';
  }

  if (type === '1h' || type === '1i' || type === '1r' || type === '2e') {
    return 'haber';
  }

  return normalizeText(decision.sourceSection).includes('descuento') ? 'descuento' : 'haber';
}

export function canIncludeInHistoricalOutput(decision) {
  return Boolean(
    decision.approved
      && !decision.excluded
      && decision.targetId
      && (Number(decision.nonZeroCount) > 0 || isTaxDecision(decision)),
  );
}

export function exportGroupSlug(group) {
  if (group === 'all') {
    return 'liquidaciones';
  }
  if (group === 'descuento') {
    return 'descuentos';
  }
  return group === 'aporte' ? 'aportes-patronales' : 'haberes';
}

export function isTaxDecision(decision) {
  return normalizeText(decision?.targetId || decision?.sourceName).includes('impuesto');
}

export function Metric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'success' ? 'bg-emerald-400/10 text-emerald-100' : tone === 'warning' ? 'bg-amber-400/15 text-amber-100' : 'bg-white/10 text-white';
  return <div className={`rounded-2xl px-4 py-4 ${toneClass}`}><p className="text-xs text-white/60">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></div>;
}

export function ReconciliationMetric({ label, value, detail, tone = 'neutral' }) {
  const toneClass = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

export function formatHistoricalMoney(value) {
  return Number(value || 0).toLocaleString('es-CL');
}

export function DownloadButton({ title, detail, onClick, disabled, primary = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`rounded-[24px] border p-5 text-left transition ${primary ? 'border-brand-200 bg-brand-50 hover:border-brand-400' : 'border-slate-200 bg-white hover:border-brand-200'} disabled:cursor-not-allowed disabled:opacity-50`}><p className="font-semibold text-slate-900">{title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p></button>;
}

export function triggerWorkbookDownload(workbook, fileName) {
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

export function triggerTextDownload(contents, fileName) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function buildHistoricalLoadFileName(employeeCount, period) {
  const match = String(period ?? '').match(/^(\d{4})-(\d{2})$/);
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const monthIndex = match ? Number(match[2]) - 1 : -1;
  const periodLabel = match && monthNames[monthIndex]
    ? `${monthNames[monthIndex]} ${match[1].slice(-2)}`
    : 'periodo';

  return `${Number(employeeCount) || 0} ${periodLabel}.csv`;
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function waitForPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
}
