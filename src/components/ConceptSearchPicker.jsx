import { useEffect, useMemo, useState } from 'react';
import { normalizeText } from '../lib/utils';

export default function ConceptSearchPicker({
  selectedId = '',
  selectedLabel = '',
  concepts = [],
  suggestedConcepts = [],
  createId = '',
  onSelect,
  onCreate,
  onExclude,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen, selectedId, selectedLabel]);

  const options = useMemo(() => {
    const seen = new Set();
    const addOption = (concept) => {
      if (!concept?.id || seen.has(concept.id)) {
        return null;
      }

      seen.add(concept.id);
      return concept;
    };

    return [
      ...suggestedConcepts.map(addOption),
      ...concepts.map(addOption),
    ].filter(Boolean);
  }, [concepts, suggestedConcepts]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return options.slice(0, 80);
    }

    return options
      .filter((concept) => normalizeText(`${concept.id} ${concept.name}`).includes(normalizedQuery))
      .slice(0, 80);
  }, [options, query]);

  return (
    <div className="relative min-w-[300px]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700"
      >
        <span className="truncate">{selectedLabel || 'Buscar y seleccionar concepto REX+'}</span>
        <span className="shrink-0 text-slate-400">⌄</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[340px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por ID o nombre…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />

          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-100">
            {filteredOptions.length > 0 ? filteredOptions.map((concept) => (
              <button
                key={concept.id}
                type="button"
                onClick={() => {
                  onSelect(concept.id);
                  setIsOpen(false);
                }}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-brand-50"
              >
                <span className="block font-semibold text-slate-900">{concept.name}</span>
                <span className="mt-1 block font-mono text-[11px] text-slate-500">{concept.id}</span>
              </button>
            )) : (
              <p className="px-3 py-4 text-xs text-slate-500">No encontramos conceptos con esa búsqueda.</p>
            )}
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {onCreate && createId ? (
              <button
                type="button"
                onClick={() => {
                  onCreate();
                  setIsOpen(false);
                }}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                Proponer alta nueva
                <span className="mt-1 block font-mono text-[11px] font-normal">{createId}</span>
              </button>
            ) : null}
            {onExclude ? (
              <button
                type="button"
                onClick={() => {
                  onExclude();
                  setIsOpen(false);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Excluir del archivo
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            Cerrar buscador
          </button>
        </div>
      ) : null}
    </div>
  );
}
