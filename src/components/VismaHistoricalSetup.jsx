import { useEffect, useState } from 'react';
import { VISMA_CATALOG_SCOPES } from '../lib/vismaHistorical';

export default function VismaHistoricalSetup({
  catalogScope,
  onCatalogScopeChange,
  catalog,
  catalogFileName,
  onCatalogSelected,
  isReadingCatalog,
  catalogLoadingLabel,
  catalogValidation,
  company,
  companyOptions = [],
  onCompanyChange,
  templateFileName,
  templateResource,
  onTemplateSelected,
  isReadingTemplate,
  templateValidation,
  sourceFile,
  sourceValidation,
  onSourceSelected,
  isReadingSource,
  onBack,
  onContinue,
}) {
  const catalogScopeName = VISMA_CATALOG_SCOPES.find((scope) => scope.id === catalogScope)?.label ?? catalogScope;
  const canContinue = Boolean(
    catalog?.length
      && templateResource
      && sourceFile?.rows?.length
      && sourceValidation?.isValid
      && companyOptions.some((option) => option.id === company)
      && !isReadingCatalog
      && !isReadingTemplate
      && !isReadingSource,
  );

  return (
    <div className="space-y-6">
      <section className="panel p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-600">Visma → REX+ · Preparación</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">Prepara la carga del libro histórico</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Selecciona el ámbito de Visma. Luego confirma el catálogo REX+, el template oficial y el libro del mes.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <span className="text-sm font-semibold text-slate-800">URL / ámbito de Visma</span>
            <select
              value={catalogScope}
              onChange={(event) => onCatalogScopeChange(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {VISMA_CATALOG_SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
            </select>
            <span className="mt-2 block text-xs leading-5 text-slate-500">El catálogo se guarda y reutiliza para este ámbito.</span>
          </label>

          <label className="block rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <span className="text-sm font-semibold text-slate-800">Empresa REX+ del template</span>
            <select
              value={company}
              onChange={(event) => onCompanyChange(event.target.value)}
              disabled={!companyOptions.length}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100"
            >
              <option value="">{companyOptions.length ? 'Selecciona una empresa' : 'Carga primero el template REX+'}</option>
              {companyOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name} · ID {option.id}</option>
              ))}
            </select>
            <span className="mt-2 block text-xs leading-5 text-slate-500">Este ID se incluye en el CSV y separa la memoria de pareos por empresa.</span>
          </label>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <WorkbookUpload
          title="Catálogo de conceptos REX+"
          description={catalog?.length
            ? `Hay ${catalog.length.toLocaleString('es-CL')} conceptos guardados para ${catalogScopeName}. Puedes usarlos o actualizar el catálogo.`
            : `Carga el listado de conceptos REX+ para ${catalogScopeName}. Se guardará para las próximas cargas de este ámbito.`}
          fileName={catalogFileName}
          isReading={isReadingCatalog}
          loadingLabel={catalogLoadingLabel}
          validation={catalogValidation}
          onFileSelected={onCatalogSelected}
          actionLabel={catalog?.length ? 'Cargar o reemplazar catálogo' : 'Cargar catálogo'}
        />

        <WorkbookUpload
          title="Template REX+ · Liquidación Detalle"
          description="Selecciona el template de carga. Se validarán las hojas y el orden de sus columnas antes de generar el CSV."
          fileName={templateFileName}
          isReady={Boolean(templateResource)}
          isReading={isReadingTemplate}
          validation={templateValidation}
          onFileSelected={onTemplateSelected}
          actionLabel={templateResource ? 'Reemplazar template' : 'Cargar template'}
        />

        <WorkbookUpload
          title="Libro mensual Visma"
          description="Carga el libro del período que quieres transformar. Se valida su estructura antes de analizar los conceptos."
          fileName={sourceFile?.fileName}
          isReady={Boolean(sourceValidation?.isValid && sourceFile?.rows?.length)}
          isReading={isReadingSource}
          validation={sourceValidation}
          onFileSelected={onSourceSelected}
          actionLabel={sourceFile ? 'Reemplazar libro mensual' : 'Cargar libro mensual'}
        />
      </div>

      <section className="panel flex flex-wrap items-center justify-between gap-4 p-6">
        <button type="button" onClick={onBack} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-brand-200 hover:text-brand-700">
          Volver
        </button>
        <div className="flex flex-col items-end gap-2">
          {!canContinue ? <p className="text-right text-xs text-slate-500">Selecciona la empresa del template y completa catálogo y libro mensual para continuar.</p> : null}
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Analizar libro histórico
          </button>
        </div>
      </section>
    </div>
  );
}

function WorkbookUpload({ title, description, fileName, isReady = false, isReading, loadingLabel = 'Leyendo archivo…', validation, onFileSelected, actionLabel }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (validation?.isValid) {
      setPassword('');
    }
  }, [validation?.isValid]);

  return (
    <section className="panel p-5">
      <div className="flex min-h-32 flex-col">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Archivo de entrada</p>
        <h3 className="mt-2 text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      {fileName ? <p className="mt-4 truncate rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700" title={fileName}>{fileName}</p> : null}

      <label className="mt-4 inline-flex cursor-pointer items-center rounded-full border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:border-brand-400 hover:bg-brand-100">
        {isReading ? loadingLabel : actionLabel}
        <input
          type="file"
          accept=".xls,.xlsx"
          className="sr-only"
          disabled={isReading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setSelectedFile(file);
              onFileSelected(file, password);
            }
            event.target.value = '';
          }}
        />
      </label>

      {validation?.requiresPassword || validation?.invalidPassword ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Este Excel está protegido con clave.</p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Clave del archivo"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <button
              type="button"
              onClick={() => selectedFile && onFileSelected(selectedFile, password)}
              disabled={isReading || !password.trim()}
              className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-amber-300"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : null}

      {validation?.message ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-xs leading-5 ${validation.isValid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          {validation.message}
        </p>
      ) : isReady ? (
        <p className="mt-3 text-xs font-semibold text-emerald-700">Listo para usar.</p>
      ) : null}
    </section>
  );
}
