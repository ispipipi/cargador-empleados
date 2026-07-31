import { useEffect, useMemo, useState } from 'react';
import { REX_EMPTY_CORRECTION, REX_KEEP_CURRENT_CORRECTION } from '../connectors/destinations/rex_empleados';

function formatSourceContext(sourceContext = []) {
  return sourceContext
    .filter((entry) => entry?.value)
    .map((entry) => `${entry.label}: ${entry.value}`);
}

export default function RexCorrectionsStep({
  rowStates,
  correctionsByRow,
  templateResource,
  onBack,
  onDownloadPendingReport,
  onUpdateCorrection,
  onBulkApply,
  onContinue,
}) {
  const pendingEntries = useMemo(
    () =>
      rowStates.flatMap((rowState) =>
        rowState.pendingItems.map((item) => ({
          ...item,
          rowNumber: rowState.rowNumber,
          employeeId: rowState.employeeId,
          employeeName: rowState.employeeName,
        })),
      ),
    [rowStates],
  );
  const fieldGroups = useMemo(() => {
    const lookup = new Map();

    pendingEntries.forEach((entry) => {
      if (!lookup.has(entry.key)) {
        lookup.set(entry.key, {
          key: entry.key,
          label: entry.label,
          type: entry.type,
          catalogName: entry.catalogName,
          bulkDefaultValue: entry.bulkDefaultValue ?? '',
        });
      }
    });

    return [...lookup.values()];
  }, [pendingEntries]);
  const [activeFieldKey, setActiveFieldKey] = useState(fieldGroups[0]?.key ?? '');
  const [selectedRows, setSelectedRows] = useState([]);
  const [bulkValue, setBulkValue] = useState('');

  useEffect(() => {
    if (!fieldGroups.some((fieldGroup) => fieldGroup.key === activeFieldKey)) {
      setActiveFieldKey(fieldGroups[0]?.key ?? '');
    }
  }, [activeFieldKey, fieldGroups]);

  const activeField = fieldGroups.find((fieldGroup) => fieldGroup.key === activeFieldKey) ?? null;
  const activeEntries = pendingEntries.filter((entry) => entry.key === activeFieldKey);
  const activeOptions = useMemo(
    () => (activeField?.catalogName ? templateResource.catalogs[activeField.catalogName] ?? [] : []),
    [activeField?.catalogName, templateResource.catalogs],
  );
  const activeSuggestedOptions = useMemo(() => {
    if (!activeField?.catalogName) {
      return [];
    }

    const usedIds = [...new Set(
      rowStates
        .map((rowState) => rowState.exportedRow?.[activeField.label] ?? '')
        .map((value) => String(value).trim())
        .filter(Boolean),
    )];

    return usedIds
      .map((id) => activeOptions.find((option) => option.id === id))
      .filter(Boolean);
  }, [activeField?.catalogName, activeField?.label, activeOptions, rowStates]);
  const remainingOptions = useMemo(() => {
    const suggestedIds = new Set(activeSuggestedOptions.map((option) => option.id));
    return activeOptions.filter((option) => !suggestedIds.has(option.id));
  }, [activeOptions, activeSuggestedOptions]);

  useEffect(() => {
    setSelectedRows([]);
    setBulkValue(activeField?.bulkDefaultValue ?? '');
  }, [activeFieldKey, activeField?.bulkDefaultValue]);

  const isSelectionComplete = selectedRows.length > 0 && bulkValue !== '';

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1fr_1.04fr]">
          <div className="relative overflow-hidden bg-[#09101f] px-6 py-8 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.22),_transparent_28%),radial-gradient(circle_at_85%_20%,_rgba(56,189,248,0.2),_transparent_30%),linear-gradient(180deg,_rgba(8,15,28,1),_rgba(3,7,18,1))]" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-300">Paso 4</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Resuelve los no-match antes de descargar</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                El sistema dejó vacíos los campos que no pudo mapear con seguridad. Aquí los completamos por fila o en
                bloque usando solo valores válidos del template destino.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard label="Campos pendientes" value={pendingEntries.length} tone="warning" />
                <MetricCard label="Filas afectadas" value={new Set(pendingEntries.map((entry) => entry.rowNumber)).size} tone="success" />
                <MetricCard label="Grupos" value={fieldGroups.length} tone="dark" />
              </div>
            </div>
          </div>

          <div className="bg-white px-6 py-8 sm:px-8">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Cómo funciona esta revisión</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Selecciona un campo pendiente desde la lista de la derecha.</li>
                <li>Corrige por fila o usa selección múltiple para cargar el mismo valor a varias filas.</li>
                <li>Si prefieres no tocar un campo, puedes omitirlo o dejarlo vacío y seguir avanzando.</li>
                <li>La descarga final se habilita solo cuando no queden pendientes.</li>
              </ul>
            </div>

            <div className="mt-5 rounded-[28px] border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-5 shadow-[0_20px_40px_rgba(14,165,233,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Exportable para revisión</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">Descarga el archivo con pendientes</h3>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">
                    Baja un Excel con todos los no-match actuales para revisarlos fuera de la app o pasármelos y seguir trabajando sobre eso.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onDownloadPendingReport}
                  disabled={pendingEntries.length === 0}
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Descargar Excel de pendientes
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={onDownloadPendingReport}
                disabled={pendingEntries.length === 0}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Descargar pendientes
              </button>
              <button
                type="button"
                onClick={onContinue}
                disabled={pendingEntries.length > 0}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Continuar al resultado
              </button>
            </div>

            {pendingEntries.length > 0 ? (
              <p className="mt-3 text-sm text-amber-700">Aún hay {pendingEntries.length} pendientes por resolver.</p>
            ) : (
              <p className="mt-3 text-sm text-emerald-700">No quedan pendientes. Ya puedes descargar el archivo final.</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Campos pendientes</h3>
            <div className="space-y-2">
              {fieldGroups.map((fieldGroup) => {
                const fieldCount = pendingEntries.filter((entry) => entry.key === fieldGroup.key).length;

                return (
                  <button
                    key={fieldGroup.key}
                    type="button"
                    onClick={() => setActiveFieldKey(fieldGroup.key)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      fieldGroup.key === activeFieldKey
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 bg-white hover:border-brand-200'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">{fieldGroup.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{fieldCount} filas</p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div>
            {activeField ? (
              <>
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Corrección activa</p>
                      <h3 className="mt-2 text-xl font-bold text-slate-950">{activeField.label}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={activeEntries.length > 0 && selectedRows.length === activeEntries.length}
                          onChange={(event) =>
                            setSelectedRows(event.target.checked ? activeEntries.map((entry) => entry.rowNumber) : [])
                          }
                        />
                        Seleccionar todas
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                    {activeField.type === 'catalog' ? (
                      <select
                        value={bulkValue}
                        onChange={(event) => setBulkValue(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      >
                        <option value="">Selecciona un valor masivo</option>
                        <option value={REX_KEEP_CURRENT_CORRECTION}>Omitir y dejar como está</option>
                        <option value={REX_EMPTY_CORRECTION}>Dejar vacío</option>
                        {activeSuggestedOptions.length > 0 ? (
                          <optgroup label="Sugeridos por matches previos">
                            {activeSuggestedOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {remainingOptions.length > 0 ? (
                          <optgroup label="Todas las opciones">
                            {remainingOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>
                    ) : (
                      <input
                        value={bulkValue}
                        onChange={(event) => setBulkValue(event.target.value)}
                        placeholder={activeField.key === 'emails' ? 'sincorreo@gmail.com' : 'Ingresa el valor masivo'}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => onBulkApply(activeField.key, selectedRows, bulkValue)}
                      disabled={!isSelectionComplete}
                      className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Aplicar a seleccionadas
                    </button>
                  </div>

                  {activeField.key === 'emails' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setBulkValue('sincorreo@gmail.com')}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        Usar sincorreo@gmail.com
                      </button>
                      <button
                        type="button"
                        onClick={() => onBulkApply(activeField.key, selectedRows, REX_KEEP_CURRENT_CORRECTION)}
                        disabled={selectedRows.length === 0}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Omitir seleccionadas
                      </button>
                      <button
                        type="button"
                        onClick={() => onBulkApply(activeField.key, selectedRows, REX_EMPTY_CORRECTION)}
                        disabled={selectedRows.length === 0}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Dejar vacías
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onBulkApply(activeField.key, selectedRows, REX_KEEP_CURRENT_CORRECTION)}
                        disabled={selectedRows.length === 0}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Omitir seleccionadas
                      </button>
                      <button
                        type="button"
                        onClick={() => onBulkApply(activeField.key, selectedRows, REX_EMPTY_CORRECTION)}
                        disabled={selectedRows.length === 0}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Dejar vacías
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3" />
                        <th className="px-4 py-3 font-semibold text-slate-700">Fila</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Empleado</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Valor origen</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Corrección</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {activeEntries.map((entry) => {
                        const isSelected = selectedRows.includes(entry.rowNumber);

                        return (
                          <tr key={`${entry.key}-${entry.rowNumber}`}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) =>
                                  setSelectedRows((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, entry.rowNumber])]
                                      : current.filter((rowNumber) => rowNumber !== entry.rowNumber),
                                  )
                                }
                              />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">{entry.rowNumber}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{entry.employeeName || '—'}</p>
                              <p className="text-xs text-slate-500">{entry.employeeId || 'Sin identificador'}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-slate-600">{entry.sourceValue || '—'}</p>
                              {formatSourceContext(entry.sourceContext).length > 0 ? (
                                <div className="mt-2 space-y-1 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
                                  {formatSourceContext(entry.sourceContext).map((line) => (
                                    <p key={`${entry.key}-${entry.rowNumber}-${line}`} className="text-xs leading-5 text-slate-600">
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              {activeField.type === 'catalog' ? (
                                <select
                                  value={correctionsByRow[entry.rowNumber]?.[activeField.key] ?? ''}
                                  onChange={(event) => onUpdateCorrection(entry.rowNumber, activeField.key, event.target.value)}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                                >
                                  <option value="">Selecciona una opción</option>
                                  <option value={REX_KEEP_CURRENT_CORRECTION}>Omitir y dejar como está</option>
                                  <option value={REX_EMPTY_CORRECTION}>Dejar vacío</option>
                                  {activeSuggestedOptions.length > 0 ? (
                                    <optgroup label="Sugeridos por matches previos">
                                      {activeSuggestedOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ) : null}
                                  {remainingOptions.length > 0 ? (
                                    <optgroup label="Todas las opciones">
                                      {remainingOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ) : null}
                                </select>
                              ) : (
                                <div className="space-y-2">
                                  <input
                                    defaultValue={correctionsByRow[entry.rowNumber]?.[activeField.key] ?? ''}
                                    onBlur={(event) => onUpdateCorrection(entry.rowNumber, activeField.key, event.target.value)}
                                    placeholder={activeField.key === 'emails' ? 'correo@empresa.com' : 'Ingresa el valor'}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => onUpdateCorrection(entry.rowNumber, activeField.key, REX_KEEP_CURRENT_CORRECTION)}
                                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                    >
                                      Omitir
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onUpdateCorrection(entry.rowNumber, activeField.key, REX_EMPTY_CORRECTION)}
                                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                    >
                                      Dejar vacío
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">
                No quedan pendientes por resolver.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  const toneClassName =
    tone === 'success'
      ? 'bg-emerald-500/10 text-emerald-100'
      : tone === 'warning'
        ? 'bg-amber-400/12 text-amber-100'
        : 'bg-white/10 text-slate-100';

  return (
    <div className={`rounded-[28px] border border-white/10 p-5 ${toneClassName}`}>
      <p className="text-sm">{label}</p>
      <p className="mt-3 text-4xl font-extrabold">{value}</p>
    </div>
  );
}
