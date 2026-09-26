import { useEffect, useState } from 'react';

export default function FileUploader({
  originLabel,
  sourceFile,
  validation,
  isReadingFile,
  continueLabel = 'Continuar al wizard',
  onFileSelected,
  onBack,
  onContinue,
}) {
  const canContinue = !isReadingFile && validation?.isValid && sourceFile?.rows?.length > 0;
  const visibleHeaders = sourceFile?.headers?.slice(0, 8) ?? [];
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePassword, setFilePassword] = useState('');

  useEffect(() => {
    if (validation?.isValid) {
      setFilePassword('');
    }
  }, [validation?.isValid]);

  const handleFileSelected = (file) => {
    if (!file) {
      return;
    }

    setSelectedFile(file);
    onFileSelected(file, filePassword);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];

    if (file) {
      handleFileSelected(file);
    }
  };

  return (
    <div className="space-y-8">
      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Paso 2</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Carga el archivo {originLabel}</h2>
            <p className="mt-2 text-sm text-slate-600">
              Se leerá el Excel en el navegador y se validarán las columnas clave antes de transformar.
            </p>
          </div>

          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
            Formatos permitidos: <span className="font-semibold text-slate-900">.xls / .xlsx</span>
          </div>
        </div>

        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="mt-8 flex cursor-pointer flex-col items-center justify-center rounded-[32px] border border-dashed border-brand-200 bg-brand-50/70 px-6 py-12 text-center transition hover:border-brand-400 hover:bg-brand-50"
        >
          <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand-700 shadow-sm">
            Drag & Drop
          </span>
          <p className="mt-6 text-xl font-bold text-slate-900">Arrastra tu Excel {originLabel} aquí</p>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            También puedes hacer clic para buscar el archivo. Si está protegido, la aplicación te pedirá la clave antes de procesarlo.
          </p>
          <input
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            disabled={isReadingFile}
            onChange={(event) => handleFileSelected(event.target.files?.[0])}
          />
        </label>

        {validation?.requiresPassword || validation?.invalidPassword ? (
          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Este Excel está protegido con clave</p>
            <p className="mt-1 text-amber-800">
              La clave se usa solo en la memoria del navegador y no se guarda ni se envía a un servidor.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="password"
                value={filePassword}
                onChange={(event) => setFilePassword(event.target.value)}
                placeholder="Ingresa la clave del Excel"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-amber-400 transition focus:ring-2"
              />
              <button
                type="button"
                onClick={() => selectedFile && onFileSelected(selectedFile, filePassword)}
                disabled={isReadingFile || !filePassword.trim()}
                className="rounded-2xl bg-amber-600 px-5 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                Reintentar lectura
              </button>
            </div>
          </div>
        ) : null}

        {isReadingFile ? (
          <div className="mt-6 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-700">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="loader-orb h-2.5 w-2.5 rounded-full bg-sky-500" />
                <span className="loader-orb h-2.5 w-2.5 rounded-full bg-cyan-500" />
                <span className="loader-orb h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <p className="font-semibold">Leyendo y validando el Excel</p>
            </div>
            <p className="mt-2">
              En archivos grandes puede tardar un poco. La app sigue trabajando aunque todavía no veas el resultado.
            </p>
          </div>
        ) : null}

        {validation?.message ? (
          <div
            className={`mt-6 rounded-3xl border px-5 py-4 text-sm ${
              validation.isValid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            {validation.message}
          </div>
        ) : null}

        {sourceFile?.preparedFromHistoricalMissingEmployees ? (
          <div className="mt-4 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm text-cyan-900">
            <p className="font-semibold">Carga preparada desde un libro histórico</p>
            <p className="mt-1 text-cyan-800">
              Se muestran sólo los trabajadores que no estaban en REX+. El archivo original fue {sourceFile.originalFileName}.
            </p>
          </div>
        ) : null}

        {validation?.missingColumns?.length ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            Faltan columnas clave: {validation.missingColumns.join(', ')}
          </div>
        ) : null}

        {validation?.formatIssues?.length ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            <p className="font-semibold">El archivo no corresponde al formato {validation.formatName ?? originLabel}.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validation.formatIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isReadingFile ? 'Leyendo archivo…' : continueLabel}
          </button>
        </div>
      </section>

      {sourceFile ? (
        <section className="panel p-6 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Preview de entrada</h3>
              <p className="mt-1 text-sm text-slate-600">
                {sourceFile.fileName} · {sourceFile.rows.length} filas detectadas
              </p>
            </div>
            <p className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Primeras 3 filas
            </p>
          </div>

          <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {visibleHeaders.map((header) => (
                    <th key={header} className="px-4 py-3 font-semibold text-slate-700">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sourceFile.previewRows.map((row, index) => (
                  <tr key={`${sourceFile.fileName}-${index}`}>
                    {visibleHeaders.map((header) => (
                      <td key={header} className="px-4 py-3 text-slate-600">
                        {row[header] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
