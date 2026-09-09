import { useEffect, useMemo, useState } from 'react';
import { fetchVismaOrganizationLists } from '../lib/vismaEmployees';
import { cleanCell } from '../lib/utils';

const ALL_LISTS_KEY = 'all';

export default function VismaMasterListsSection({ tenantId, companyId, companyTypeId, companyName, onBusyChange }) {
  const [lists, setLists] = useState([]);
  const [activeListKey, setActiveListKey] = useState(ALL_LISTS_KEY);
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    setLists([]);
    setActiveListKey(ALL_LISTS_KEY);
    setSelectedKeys(new Set());
    setSearch('');
    setError('');
    setCopyStatus('');
  }, [companyId, companyTypeId, tenantId]);

  const listTabs = useMemo(() => [
    { key: ALL_LISTS_KEY, label: 'Todos', count: lists.reduce((total, list) => total + list.items.length, 0) },
    ...lists.map((list) => ({ key: list.key, label: list.label, count: list.items.length })),
  ], [lists]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sourceLists = activeListKey === ALL_LISTS_KEY
      ? lists
      : lists.filter((list) => list.key === activeListKey);

    return sourceLists.flatMap((list) => list.items.map((item) => ({ list, item })))
      .filter(({ list, item }) => !query || [
        list.label,
        item.id,
        item.code,
        item.name,
        item.typeName,
      ].some((value) => cleanCell(value).toLowerCase().includes(query)));
  }, [activeListKey, lists, search]);

  const visibleKeys = useMemo(
    () => visibleItems.map(({ list, item }) => buildMasterItemKey(list, item)),
    [visibleItems],
  );
  const selectedItems = useMemo(() => lists.flatMap((list) => list.items
    .filter((item) => selectedKeys.has(buildMasterItemKey(list, item)))
    .map((item) => ({ list, item }))), [lists, selectedKeys]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));

  const handleLoad = async () => {
    if (!tenantId || isLoading) {
      return;
    }

    setIsLoading(true);
    setError('');
    setCopyStatus('');
    onBusyChange?.(true);

    try {
      const payload = await fetchVismaOrganizationLists({ tenantId, companyId, companyTypeId });
      const nextLists = Array.isArray(payload?.lists) ? payload.lists : [];
      setLists(nextLists.map((list) => ({ ...list, items: Array.isArray(list.items) ? list.items : [] })));
      setSelectedKeys(new Set());
      setActiveListKey(ALL_LISTS_KEY);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los maestros VISMA.');
    } finally {
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  const handleToggleItem = (key) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleVisible = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleKeys.forEach((key) => next.delete(key));
      } else {
        visibleKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const handleCopy = async () => {
    if (!selectedItems.length) {
      return;
    }

    const text = [
      ['Tipo', 'Id VISMA', 'Código', 'Nombre'].join('\t'),
      ...selectedItems.map(({ list, item }) => [
        list.label,
        cleanCell(item.id),
        cleanCell(item.code),
        cleanCell(item.name),
      ].join('\t')),
    ].join('\n');

    try {
      await copyText(text);
      setCopyStatus(`${selectedItems.length} registro${selectedItems.length === 1 ? '' : 's'} copiado${selectedItems.length === 1 ? '' : 's'}.`);
      window.setTimeout(() => setCopyStatus(''), 2500);
    } catch {
      setCopyStatus('No fue posible copiar. Revisa los permisos del navegador.');
    }
  };

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Maestros VISMA</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">Empresas y estructuras organizacionales</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            Extrae los valores completos de la conexión seleccionada, filtra por tipo y copia los registros que necesites.
          </p>
          <p className="mt-2 text-xs font-semibold text-brand-700">Empresa activa: {companyName || 'sin selección'}</p>
        </div>
        <button
          type="button"
          onClick={handleLoad}
          disabled={!tenantId || isLoading}
          className="button-primary shrink-0 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? 'Cargando maestros...' : lists.length ? 'Actualizar maestros' : 'Cargar maestros'}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {lists.length ? (
        <>
          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar maestros VISMA">
            {listTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeListKey === tab.key}
                onClick={() => setActiveListKey(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeListKey === tab.key
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'}`}
              >
                {tab.label} <span className="ml-1 opacity-75">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrar por nombre, código o ID"
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 lg:max-w-md"
            />
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={handleToggleVisible}
                  disabled={!visibleItems.length}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Seleccionar visibles
              </label>
              <span>{selectedItems.length} seleccionados</span>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!selectedItems.length}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Copiar seleccionados
              </button>
            </div>
          </div>

          {copyStatus ? (
            <p className={`mt-3 text-sm ${copyStatus.startsWith('No fue') ? 'text-rose-700' : 'text-emerald-700'}`}>
              {copyStatus}
            </p>
          ) : null}

          <div className="mt-4 max-h-[30rem] overflow-auto rounded-[20px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="w-12 px-4 py-3" aria-label="Seleccionar" />
                  <th className="px-4 py-3 font-semibold text-slate-700">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">ID VISMA</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Código</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Nombre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleItems.map(({ list, item }) => {
                  const key = buildMasterItemKey(list, item);
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          onChange={() => handleToggleItem(key)}
                          aria-label={`Seleccionar ${item.name || item.id}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{list.label}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{item.id || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.code || '-'}</td>
                      <td className="px-4 py-3 text-slate-800">{item.name || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visibleItems.length ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No hay registros para este filtro.</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          Selecciona una conexión VISMA y carga los maestros para ver sus valores.
        </div>
      )}
    </section>
  );
}

function buildMasterItemKey(list, item) {
  return [list.key, item.typeId, item.id, item.code, item.name].map(cleanCell).join('|');
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  textArea.remove();

  if (!copied) {
    throw new Error('No se pudo copiar');
  }
}
