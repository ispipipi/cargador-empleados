import { startTransition, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import FileUploader from './components/FileUploader';
import FormatSelector from './components/FormatSelector';
import ParamsWizard from './components/ParamsWizard';
import TransformResult from './components/TransformResult';
import {
  bukColaboradoresDestination,
  getBukColaboradoresFieldDefinitions,
  getDefaultParameterValues,
} from './connectors/destinations/buk_colaboradores';
import {
  BUK_TRABAJOS_HEADERS,
  transformBukTrabajosRows,
} from './connectors/destinations/buk_trabajos';
import { getTalanaMissingColumns } from './connectors/origins/talana';
import { transformWorkbookRows } from './engine/transformer';
import {
  buildBukColaboradoresExportWorkbook,
  buildBukTrabajosExportWorkbook,
  loadBukColaboradoresTemplateResource,
  loadBukTrabajosListsResource,
} from './lib/template';
import {
  createConfigurationPayload,
  exportConfiguration,
  loadConfigurations,
  persistConfigurations,
  removeConfiguration,
  upsertConfiguration,
  validateConfigurationShape,
} from './lib/storage';
import { cleanCell, todayStamp } from './lib/utils';

const STEPS = {
  format: 'format',
  upload: 'upload',
  params: 'params',
  result: 'result',
};

export default function App() {
  const [step, setStep] = useState(STEPS.format);
  const [selectedOrigin, setSelectedOrigin] = useState('talana');
  const [selectedDestination, setSelectedDestination] = useState('buk');
  const [parameters, setParameters] = useState(getDefaultParameterValues());
  const [configurations, setConfigurations] = useState(() => loadConfigurations());
  const [activeConfiguration, setActiveConfiguration] = useState(null);
  const [templateStatus, setTemplateStatus] = useState('loading');
  const [colaboradoresTemplateResource, setColaboradoresTemplateResource] = useState(null);
  const [trabajosListResource, setTrabajosListResource] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const colaboradoresFieldDefinitions = useMemo(() => getBukColaboradoresFieldDefinitions(), []);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapTemplates() {
      try {
        const [loadedColaboradoresTemplate, loadedTrabajosLists] = await Promise.all([
          loadBukColaboradoresTemplateResource(),
          loadBukTrabajosListsResource(),
        ]);

        if (!isMounted) {
          return;
        }

        setColaboradoresTemplateResource(loadedColaboradoresTemplate);
        setTrabajosListResource(loadedTrabajosLists);
        setTemplateStatus('ready');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setTemplateStatus('error');
        setGlobalError(error.message);
      }
    }

    bootstrapTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeConfigurationId = activeConfiguration?.id ?? null;
  const destinationLabel = 'BUK';

  const handleFileSelected = async (file) => {
    if (!file) {
      return;
    }

    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setValidation({
        isValid: false,
        missingColumns: [],
        message: 'El archivo debe ser .xls o .xlsx.',
      });
      return;
    }

    setGlobalError('');
    setResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        raw: false,
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, {
        defval: '',
        raw: false,
      });
      const headers = Object.keys(rows[0] ?? {}).map(cleanCell);
      const missingColumns = getTalanaMissingColumns(headers);
      const filteredRows = rows.filter((row) =>
        Object.values(row).some((value) => cleanCell(value)),
      );

      setSourceFile({
        fileName: file.name,
        workbookName: workbook.SheetNames[0],
        headers,
        rows: filteredRows,
        previewRows: filteredRows.slice(0, 3),
      });

      setValidation({
        isValid: missingColumns.length === 0 && filteredRows.length > 0,
        missingColumns,
        message:
          missingColumns.length === 0
            ? `Archivo listo. Se detectaron ${filteredRows.length} filas en la hoja ${workbook.SheetNames[0]}.`
            : 'El archivo no cumple con las columnas mínimas para Talana.',
      });
    } catch (error) {
      setSourceFile(null);
      setValidation({
        isValid: false,
        missingColumns: [],
        message: `No se pudo leer el archivo: ${error.message}`,
      });
    }
  };

  const handleTransform = () => {
    if (!sourceFile || !colaboradoresTemplateResource || !trabajosListResource) {
      return;
    }

    setIsTransforming(true);

    try {
      const colaboradoresTransformation = transformWorkbookRows({
        sourceRows: sourceFile.rows,
        fieldDefinitions: colaboradoresFieldDefinitions,
        employeeHeaders: colaboradoresTemplateResource.employeeHeaders,
        listsCatalog: colaboradoresTemplateResource.listsCatalog,
        parameters,
      });
      const trabajosTransformation = transformBukTrabajosRows({
        sourceRows: sourceFile.rows,
        listResource: trabajosListResource,
      });

      startTransition(() => {
        setResult({
          colaboradores: {
            ...colaboradoresTransformation,
            errors: colaboradoresTransformation.allErrors,
            alerts: colaboradoresTransformation.allAlerts,
          },
          trabajos: {
            ...trabajosTransformation,
            errors: trabajosTransformation.allErrors,
          },
          generatedAt: todayStamp(),
        });
        setStep(STEPS.result);
      });
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setIsTransforming(false);
    }
  };

  const handleDownloadColaboradores = (mode) => {
    if (!result || !colaboradoresTemplateResource) {
      return;
    }

    const workbook = buildBukColaboradoresExportWorkbook({
      templateResource: colaboradoresTemplateResource,
      rowEntries:
        mode === 'all' ? result.colaboradores.transformedRows : result.colaboradores.cleanTransformedRows,
    });

    XLSX.writeFile(workbook, `BUK_colaboradores_${todayStamp()}.xlsx`);
  };

  const handleDownloadTrabajos = (mode) => {
    if (!result || !trabajosListResource) {
      return;
    }

    const workbook = buildBukTrabajosExportWorkbook({
      listResource: trabajosListResource,
      exportedRows: mode === 'all' ? result.trabajos.allExportedRows : result.trabajos.cleanExportedRows,
      headers: BUK_TRABAJOS_HEADERS,
    });

    XLSX.writeFile(workbook, `BUK_trabajos_${todayStamp()}.xlsx`);
  };

  const handleSaveConfiguration = (name) => {
    const configuration = createConfigurationPayload({
      name,
      origin: selectedOrigin,
      destination: selectedDestination,
      parameters,
    });
    const nextConfigurations = upsertConfiguration(configuration, configurations);
    setConfigurations(nextConfigurations);
    setActiveConfiguration(configuration);
  };

  const handleActivateConfiguration = (configuration) => {
    const normalizedConfiguration = {
      ...configuration,
      destino: normalizeDestination(configuration.destino),
    };

    setSelectedOrigin(configuration.origen);
    setSelectedDestination(normalizedConfiguration.destino);
    setParameters({
      ...getDefaultParameterValues(),
      ...configuration.parametros,
    });
    setActiveConfiguration(normalizedConfiguration);
  };

  const handleDeleteConfiguration = (configuration) => {
    if (!window.confirm(`¿Eliminar la configuración "${configuration.nombre}"?`)) {
      return;
    }

    const nextConfigurations = removeConfiguration(configuration.id, configurations);
    setConfigurations(nextConfigurations);

    if (activeConfiguration?.id === configuration.id) {
      setActiveConfiguration(null);
    }
  };

  const handleImportConfiguration = async (file) => {
    if (!file) {
      return;
    }

    try {
      const contents = await file.text();
      const parsed = JSON.parse(contents);

      if (!validateConfigurationShape(parsed)) {
        throw new Error('La estructura del JSON no corresponde a una configuración válida.');
      }

      const importedConfiguration = {
        ...parsed,
        id: parsed.id || crypto.randomUUID(),
        destino: normalizeDestination(parsed.destino),
      };
      const nextConfigurations = upsertConfiguration(importedConfiguration, configurations);
      setConfigurations(nextConfigurations);
      setActiveConfiguration(importedConfiguration);
      setSelectedOrigin(importedConfiguration.origen);
      setSelectedDestination(normalizeDestination(importedConfiguration.destino));
      setParameters({
        ...getDefaultParameterValues(),
        ...importedConfiguration.parametros,
      });
    } catch (error) {
      setGlobalError(error.message);
    }
  };

  const handleExportActiveConfiguration = () => {
    if (!activeConfiguration) {
      return;
    }

    exportConfiguration(activeConfiguration);
  };

  const resetFlow = () => {
    setStep(STEPS.format);
    setSourceFile(null);
    setValidation(null);
    setResult(null);
    setGlobalError('');
  };

  useEffect(() => {
    persistConfigurations(configurations);
  }, [configurations]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <div className="panel bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300">NPR interno</p>
                <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Cargador Universal de Empleados</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  Convierte archivos Talana a BUK Colaboradores y BUK Trabajos en un flujo client-side, sin backend y
                  con trazabilidad de errores de matching.
                </p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300">
                <p className="font-semibold text-white">Pair activo</p>
                <p className="mt-2">
                  {selectedOrigin} → {destinationLabel}
                </p>
              </div>
            </div>
          </div>
        </header>

        {globalError ? (
          <div className="mb-6 rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {globalError}
          </div>
        ) : null}

        {step === STEPS.format ? (
          <FormatSelector
            selectedOrigin={selectedOrigin}
            selectedDestination={selectedDestination}
            onChangeOrigin={setSelectedOrigin}
            onChangeDestination={setSelectedDestination}
            onContinue={() => setStep(STEPS.upload)}
            templateStatus={templateStatus}
            configurations={configurations}
            activeConfigurationId={activeConfigurationId}
            onActivateConfiguration={handleActivateConfiguration}
            onDeleteConfiguration={handleDeleteConfiguration}
            onImportConfiguration={handleImportConfiguration}
            onExportActiveConfiguration={handleExportActiveConfiguration}
          />
        ) : null}

        {step === STEPS.upload ? (
          <FileUploader
            sourceFile={sourceFile}
            validation={validation}
            onFileSelected={handleFileSelected}
            onBack={() => setStep(STEPS.format)}
            onContinue={() => setStep(STEPS.params)}
          />
        ) : null}

        {step === STEPS.params ? (
          <ParamsWizard
            parameters={parameters}
            parameterDefinitions={bukColaboradoresDestination.userParameters}
            onChangeParameter={(key, value) => setParameters((current) => ({ ...current, [key]: value }))}
            onBack={() => setStep(STEPS.upload)}
            onTransform={handleTransform}
            isTransforming={isTransforming}
          />
        ) : null}

        {step === STEPS.result && result ? (
          <TransformResult
            colaboradoresResult={result.colaboradores}
            trabajosResult={result.trabajos}
            activeConfiguration={activeConfiguration}
            onDownloadColaboradoresAll={() => handleDownloadColaboradores('all')}
            onDownloadColaboradoresClean={() => handleDownloadColaboradores('clean')}
            onDownloadTrabajosAll={() => handleDownloadTrabajos('all')}
            onDownloadTrabajosClean={() => handleDownloadTrabajos('clean')}
            onSaveConfiguration={handleSaveConfiguration}
            onExportActiveConfiguration={handleExportActiveConfiguration}
            onRestart={resetFlow}
          />
        ) : null}
      </div>
    </main>
  );
}

function normalizeDestination(destinationId) {
  return destinationId === 'buk' ? 'buk' : 'buk';
}
