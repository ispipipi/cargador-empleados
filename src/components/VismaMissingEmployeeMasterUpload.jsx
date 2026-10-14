import { useEffect, useState } from 'react';

export default function VismaMissingEmployeeMasterUpload({ fileName, isReading, validation, onFileSelected }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (validation?.isValid) setPassword('');
  }, [validation?.isValid]);

  const uploadLabel = (file) => {
    setSelectedFile(file);
    onFileSelected(file, password);
  };

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Maestro VISMA para nuevas altas</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Se cruza por RUT y se usa para completar los datos personales y contractuales.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
          {isReading ? 'Leyendo maestro…' : fileName ? 'Reemplazar maestro VISMA' : 'Cargar maestro VISMA'}
          <input
            type="file"
            accept=".xls,.xlsx"
            className="sr-only"
            disabled={isReading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadLabel(file);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {fileName ? <p className="mt-3 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{fileName}</p> : null}
      {validation?.requiresPassword || validation?.invalidPassword ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Clave del archivo"
            autoComplete="off"
            className="min-w-48 flex-1 rounded-xl border border-amber-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => selectedFile && onFileSelected(selectedFile, password)}
            disabled={isReading || !password.trim() || !selectedFile}
            className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {validation?.message ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-xs leading-5 ${validation.isValid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          {validation.message}
        </p>
      ) : null}
    </div>
  );
}
