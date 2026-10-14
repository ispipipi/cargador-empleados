import { useMemo, useState } from 'react';
import { normalizeText } from '../lib/utils';
import { getVismaInstitutionKindLabel } from '../lib/vismaInstitutions';

export default function VismaInstitutionResolver({ issues, checked, institutions, mappings, onAssign, onDownloadReport }) {
  const groups = useMemo(() => {
    const grouped = new Map();
    issues.forEach((issue) => {
      if (!issue.institutionMappingRequired || !issue.institutionMappingKey) return;
      const existing = grouped.get(issue.institutionMappingKey) ?? {
        key: issue.institutionMappingKey,
        kind: issue.institutionKind,
        rawValue: issue.rawInstitution,
        issueCount: 0,
        mapping: mappings[issue.institutionMappingKey],
      };
      existing.issueCount += 1;
      grouped.set(issue.institutionMappingKey, existing);
    });
    Object.entries(mappings).forEach(([key, mapping]) => {
      if (grouped.has(key)) return;
      const [kind, ...normalizedParts] = key.split(':');
      grouped.set(key, {
        key,
        kind,
        rawValue: mapping?.rawValue || normalizedParts.join(':'),
        issueCount: 0,
        mapping,
      });
    });
    return [...grouped.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.rawValue.localeCompare(right.rawValue));
  }, [issues, mappings]);
  const unmatchableCount = issues.filter((issue) => issue.institutionKind && !issue.rawInstitution).length;

  return (
    <section className={`panel p-5 sm:p-6 ${issues.length ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${issues.length ? 'text-amber-900' : 'text-emerald-800'}`}>
            {issues.length
              ? `${issues.length.toLocaleString('es-CL')} registros con instituciones pendientes de validar`
              : `Instituciones verificadas: ${checked.toLocaleString('es-CL')} registros con IDs del catálogo`}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Busca el nombre o ID del catálogo REX+ y asigna el equivalente. La decisión se guarda en este navegador para el ámbito y empresa seleccionados.
          </p>
        </div>
        {issues.length ? (
          <button type="button" onClick={onDownloadReport} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
            Descargar diferencias
          </button>
        ) : null}
      </div>

      {groups.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {groups.map((group) => (
            <InstitutionMatchCard
              key={group.key}
              group={group}
              institutions={institutions}
              onAssign={onAssign}
            />
          ))}
        </div>
      ) : null}
      {unmatchableCount ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs text-rose-800">
          {unmatchableCount.toLocaleString('es-CL')} registro(s) no traen institución de origen; esos casos requieren corregir el libro porque no hay un valor que se pueda parear.
        </p>
      ) : null}

      {issues.length ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-amber-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-900"><tr><th className="px-4 py-3">RUT</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Institución en origen</th><th className="px-4 py-3">Problema</th></tr></thead>
            <tbody className="divide-y divide-amber-100">{issues.slice(0, 10).map((issue, index) => (
              <tr key={`${issue.employeeId}-${issue.conceptId}-${issue.sourceFile}-${issue.sourceRow}-${index}`}>
                <td className="px-4 py-3 font-mono text-xs">{issue.employeeId}</td>
                <td className="px-4 py-3">{issue.conceptName} <span className="font-mono text-xs text-slate-500">({issue.conceptId})</span></td>
                <td className="px-4 py-3">{issue.rawInstitution || 'Vacío'}</td>
                <td className="px-4 py-3 text-xs">{issue.issue}</td>
              </tr>
            ))}</tbody>
          </table>
          {issues.length > 10 ? <p className="px-4 py-3 text-xs text-amber-800">Se muestran 10 de {issues.length.toLocaleString('es-CL')} diferencias; el informe descargable incluye todas.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function InstitutionMatchCard({ group, institutions, onAssign }) {
  const currentId = typeof group.mapping === 'string' ? group.mapping : group.mapping?.id ?? '';
  const currentInstitution = institutions.find((entry) => normalizeText(entry.id) === normalizeText(currentId));
  const [query, setQuery] = useState('');
  const filteredInstitutions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const matches = institutions.filter((entry) => !normalizedQuery || normalizeText(`${entry.id} ${entry.name}`).includes(normalizedQuery));
    if (currentInstitution && !matches.some((entry) => entry.id === currentInstitution.id)) matches.unshift(currentInstitution);
    return matches.slice(0, 80);
  }, [currentInstitution, institutions, query]);
  const handleChange = (event) => onAssign(group.kind, group.rawValue, event.target.value);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{getVismaInstitutionKindLabel(group.kind)}</p>
          <p className="mt-1 font-semibold text-slate-900">{group.rawValue}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${group.issueCount ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
          {group.issueCount ? `${group.issueCount.toLocaleString('es-CL')} registros` : 'Match guardado'}
        </span>
      </div>
      <label className="mt-3 block text-xs font-medium text-slate-600" htmlFor={`institution-search-${group.key}`}>Buscar por nombre o ID REX+</label>
      <input
        id={`institution-search-${group.key}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ej.: Colmena o 100"
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <select
        value={currentInstitution?.id ?? ''}
        onChange={handleChange}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        aria-label={`ID REX+ para ${group.rawValue}`}
      >
        <option value="">Selecciona una institución del catálogo…</option>
        {filteredInstitutions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · ID {entry.id}</option>)}
      </select>
      {currentId && !currentInstitution ? <p className="mt-2 text-xs text-rose-700">El ID guardado ya no aparece en el catálogo actual. Selecciona otro.</p> : null}
      {currentInstitution ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-emerald-800">
          <span>Asignado a <strong>{currentInstitution.name}</strong> · ID <code>{currentInstitution.id}</code></span>
          <button type="button" onClick={() => onAssign(group.kind, group.rawValue, '')} className="shrink-0 underline hover:text-rose-700">Quitar match</button>
        </div>
      ) : null}
    </article>
  );
}
