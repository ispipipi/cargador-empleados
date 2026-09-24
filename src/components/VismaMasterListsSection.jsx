import { useEffect, useMemo, useState } from 'react';
import { fetchVismaOrganizationLists } from '../lib/vismaEmployees';
import {
  buildVismaMasterLoadCsv,
  buildVismaMasterFileName,
  loadVismaMasterLoadTemplate,
  VISMA_MASTER_LOAD_CONFIG,
} from '../lib/vismaMasters';

export default function VismaMasterListsSection({
  tenantId,
  companyId,
  companyTypeId,
  companyName,
  connectionName,
  onBusyChange,
}) {
  const [lists, setLists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState('');
  const [error, setError] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');

  useEffect(() => {
    setLists([]);
    setIsLoading(false);
    setDownloadingKey('');
    setError('');
    setDownloadStatus('');
  }, [companyId, companyTypeId, tenantId]);

  const masterCards = useMemo(() => VISMA_MASTER_LOAD_CONFIG.map((config) => ({
    ...config,
    items: lists.find((list) => list.key === config.key)?.items ?? [],
  })), [lists]);

  const handleLoad = async () => {
    if (!tenantId || isLoading) {
      return;
    }

    setIsLoading(true);
    setError('');
    setDownloadStatus('');
    onBusyChange?.(true);

    try {
      const payload = await fetchVismaOrganizationLists({ tenantId, companyId, companyTypeId });
      const nextLists = Array.isArray(payload?.lists) ? payload.lists : [];
      setLists(nextLists.map((list) => ({
        ...list,
        items: Array.isArray(list.items) ? list.items : [],
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los maestros VISMA.');
    } finally {
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  const handleDownload = async (master) => {
    if (!master.items.length || downloadingKey) {
      return;
    }

    setDownloadingKey(master.key);
    setError('');
    setDownloadStatus('');

    try {
      const template = await loadVismaMasterLoadTemplate(master.key);
      const csv = buildVismaMasterLoadCsv({
        masterKey: master.key,
        items: master.items,
        template,
      });
      triggerTextDownload(csv, buildVismaMasterFileName(master.key, connectionName));
      setDownloadStatus(`CSV de ${master.label.toLowerCase()} generado con ${master.items.length.toLocaleString('es-CL')} registros.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : `No se pudo generar el archivo de ${master.label.toLowerCase()}.`);
    } finally {
      setDownloadingKey('');
    }
  };

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Maestros VISMA</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">Archivos de creación REX+</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            Genera los archivos de importación de cargos, centros de costo y áreas para la conexión seleccionada.
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
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {masterCards.map((master) => (
            <article key={master.key} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Carga REX+</p>
              <h4 className="mt-2 text-xl font-bold text-slate-950">{master.label}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{master.description}</p>
              <p className="mt-5 text-2xl font-extrabold text-slate-950">{master.items.length.toLocaleString('es-CL')}</p>
              <p className="text-xs text-slate-500">registros disponibles</p>
              <button
                type="button"
                onClick={() => handleDownload(master)}
                disabled={!master.items.length || Boolean(downloadingKey)}
                className="mt-5 w-full rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {downloadingKey === master.key ? 'Generando CSV...' : `Descargar CSV de ${master.label.toLowerCase()}`}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          Selecciona una conexión VISMA y carga los maestros para generar los tres archivos.
        </div>
      )}

      {downloadStatus ? (
        <p className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          {downloadStatus}
        </p>
      ) : null}
    </section>
  );
}

function triggerTextDownload(contents, fileName) {
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
