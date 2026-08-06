import { startTransition, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import * as XLSX from 'xlsx';
import FileUploader from './components/FileUploader';
import FormatSelector from './components/FormatSelector';
import ParamsWizard from './components/ParamsWizard';
import RexCorrectionsStep from './components/RexCorrectionsStep';
import RexTransformResult from './components/RexTransformResult';
import TransformResult from './components/TransformResult';
import ConceptsMapper from './components/ConceptsMapper';
import HistoricalConceptsMapper from './components/HistoricalConceptsMapper';
import {
  bukColaboradoresDestination,
  getBukColaboradoresFieldDefinitions,
  getDefaultParameterValues,
} from './connectors/destinations/buk_colaboradores';
import {
  buildInitialRexTransformation,
  buildRexRow,
  getDefaultRexParameterValues,
  rexDestination,
  summarizeRexRows,
} from './connectors/destinations/rex_empleados';
import {
  buildBukTrabajosSupportSheets,
  transformBukTrabajosRows,
} from './connectors/destinations/buk_trabajos';
import { transformWorkbookRows } from './engine/transformer';
import {
  buildBukColaboradoresExportWorkbook,
  buildBukTrabajosExportWorkbook,
  buildRexExportWorkbook,
  loadBukColaboradoresTemplateResource,
  loadBukTrabajosTemplateResource,
  loadRexTemplateResource,
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
import { todayStamp } from './lib/utils';
import { loadConceptsResource } from './lib/concepts';

const STEPS = {
  format: 'format',
  upload: 'upload',
  params: 'params',
  review: 'review',
  result: 'result',
  concepts: 'concepts',
  historicalReview: 'historical-review',
};

const SUPPORTED_PAIRS = new Set(['talana:buk', 'meta4:rex']);

export default function App() {
  const [step, setStep] = useState(STEPS.format);
  const [selectedModule, setSelectedModule] = useState('empleados');
  const [selectedOrigin, setSelectedOrigin] = useState('talana');
  const [selectedDestination, setSelectedDestination] = useState('buk');
  const [parameters, setParameters] = useState(getDefaultParameterValues());
  const [configurations, setConfigurations] = useState(() => loadConfigurations());
  const [activeConfiguration, setActiveConfiguration] = useState(null);
  const [templateStatus, setTemplateStatus] = useState('loading');
  const [colaboradoresTemplateResource, setColaboradoresTemplateResource] = useState(null);
  const [trabajosTemplateResource, setTrabajosTemplateResource] = useState(null);
  const [rexTemplateResource, setRexTemplateResource] = useState(null);
  const [conceptsResource, setConceptsResource] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPreparingRexDownload, setIsPreparingRexDownload] = useState(false);
  const [isPreparingHistoricalDownload, setIsPreparingHistoricalDownload] = useState(false);
  const [preparedRexDownload, setPreparedRexDownload] = useState(null);
  const [exportState, setExportState] = useState(null);
  const [globalError, setGlobalError] = useState('');

  const pairKey = `${selectedOrigin}:${selectedDestination}`;
  const isBukFlow = pairKey === 'talana:buk';
  const isRexFlow = pairKey === 'meta4:rex';
  const isConceptsFlow = selectedModule === 'conceptos';
  const isHistoricalConceptsFlow = selectedModule === 'conceptos-historicos';
  const isSupportedPair = isHistoricalConceptsFlow || SUPPORTED_PAIRS.has(pairKey);
  const colaboradoresFieldDefinitions = useMemo(() => getBukColaboradoresFieldDefinitions(), []);
  const activeParameterDefinitions = useMemo(
    () => (isBukFlow ? bukColaboradoresDestination.userParameters : rexDestination.userParameters),
    [isBukFlow],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrapTemplates() {
      try {
        const [loadedColaboradoresTemplate, loadedTrabajosTemplate, loadedRexTemplate, loadedConcepts] = await Promise.all([
          loadBukColaboradoresTemplateResource(),
          loadBukTrabajosTemplateResource(),
          loadRexTemplateResource(),
          loadConceptsResource(),
        ]);

        if (!isMounted) {
          return;
        }

        setColaboradoresTemplateResource(loadedColaboradoresTemplate);
        setTrabajosTemplateResource(loadedTrabajosTemplate);
        setRexTemplateResource(loadedRexTemplate);
        setConceptsResource(loadedConcepts);
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
  const originLabel = selectedOrigin === 'meta4' ? 'Meta 4' : 'Talana';
  const destinationLabel = selectedDestination === 'rex' ? 'REX+' : 'BUK';
  const busyState =
    templateStatus === 'loading'
      ? {
          title: 'Preparando la app',
          detail: 'Estamos cargando templates, listas y catálogos para que la transformación sea segura.',
        }
      : isReadingFile
        ? {
            title: 'Leyendo el archivo',
            detail: 'Estamos validando el Excel y armando la vista previa. En archivos grandes puede tardar un poco.',
          }
        : isTransforming
          ? {
              title: 'Procesando la transformación',
              detail: 'Estamos aplicando reglas, armando el resultado y preparando las correcciones necesarias.',
            }
          : isPreparingRexDownload
            ? {
                title: 'Preparando descarga final',
                detail: 'Estamos dejando listo el Excel de REX+ para que el botón descargue directo apenas termine.',
              }
            : isPreparingHistoricalDownload
              ? {
                  title: 'Preparando conceptos históricos',
                  detail: 'Estamos armando el CSV de Concepto Detalle y validando sus filas antes de descargar.',
                }
              : exportState
                ? exportState
                : null;

  useEffect(() => {
    if (step !== STEPS.result || result?.kind !== 'rex' || !rexTemplateResource) {
      setIsPreparingRexDownload(false);
      setPreparedRexDownload((current) => {
        revokePreparedDownload(current);
        return null;
      });
      return undefined;
    }

    let isActive = true;

    setIsPreparingRexDownload(true);
    setPreparedRexDownload((current) => {
      revokePreparedDownload(current);
      return null;
    });

    const timerId = window.setTimeout(() => {
      try {
        const workbook = buildRexExportWorkbook({
          templateResource: rexTemplateResource,
          rowEntries: result.rowStates.map((rowState) => rowState.exportedRow),
        });
        const nextDownload = createPreparedDownload(workbook, `REX_empleados_${todayStamp()}.xlsx`);

        if (!isActive) {
          revokePreparedDownload(nextDownload);
          return;
        }

        setGlobalError('');
        setPreparedRexDownload(nextDownload);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setGlobalError(error instanceof Error ? error.message : 'No se pudo preparar la descarga de REX+.');
      } finally {
        if (isActive) {
          setIsPreparingRexDownload(false);
        }
      }
    }, 80);

    return () => {
      isActive = false;
      window.clearTimeout(timerId);
    };
  }, [step, result, rexTemplateResource]);

  useEffect(
    () => () => {
      revokePreparedDownload(preparedRexDownload);
    },
    [preparedRexDownload],
  );

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
    setSourceFile(null);
    setValidation(null);
    setIsReadingFile(true);

    try {
      await waitForUiToPaint();
      const arrayBuffer = await file.arrayBuffer();
      const parserOrigin = isHistoricalConceptsFlow ? 'meta4-historico' : selectedOrigin;
      const parsedSource = await parseSourceWorkbook(arrayBuffer, parserOrigin);
      const validationMessage = buildValidationMessage({
        originId: parserOrigin,
        parsedSource,
      });

      setSourceFile({
        fileName: file.name,
        workbookName: parsedSource.workbookName,
        headers: parsedSource.headers,
        rows: parsedSource.rows,
        previewRows: parsedSource.previewRows,
      });

      setValidation({
        isValid: parsedSource.missingColumns.length === 0 && parsedSource.rows.length > 0,
        missingColumns: parsedSource.missingColumns,
        message: validationMessage,
      });
    } catch (error) {
      setSourceFile(null);
      setValidation({
        isValid: false,
        missingColumns: [],
        message: `No se pudo leer el archivo: ${error.message}`,
      });
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleModuleChange = (moduleId) => {
    setSelectedModule(moduleId);

    if (moduleId === 'conceptos' || moduleId === 'conceptos-historicos') {
      setSelectedOrigin('meta4');
      setSelectedDestination('rex');
    }
  };

  const handleTransform = async () => {
    if (!sourceFile || !isSupportedPair) {
      return;
    }

    setIsTransforming(true);

    try {
      await waitForUiToPaint();

      if (isBukFlow) {
        const colaboradoresTransformation = transformWorkbookRows({
          sourceRows: sourceFile.rows,
          fieldDefinitions: colaboradoresFieldDefinitions,
          employeeHeaders: colaboradoresTemplateResource.employeeHeaders,
          listsCatalog: colaboradoresTemplateResource.listsCatalog,
          parameters,
          sourceMeta: {
            fileName: sourceFile.fileName,
            workbookName: sourceFile.workbookName,
            fichaCodesCatalog: colaboradoresTemplateResource.fichaCodesCatalog,
          },
        });
        const trabajosSupportSheets = buildBukTrabajosSupportSheets({
          templateResource: trabajosTemplateResource,
        });
        const trabajosTransformation = transformBukTrabajosRows({
          sourceRows: sourceFile.rows,
          trabajosHeaders: trabajosTemplateResource.trabajosHeaders,
          supportSheets: trabajosSupportSheets,
        });

        startTransition(() => {
          setResult({
            kind: 'buk',
            colaboradores: {
              ...colaboradoresTransformation,
              errors: colaboradoresTransformation.allErrors,
              alerts: colaboradoresTransformation.allAlerts,
            },
            trabajos: {
              ...trabajosTransformation,
              errors: trabajosTransformation.allErrors,
              supportSheets: trabajosSupportSheets,
            },
            generatedAt: todayStamp(),
          });
          setStep(STEPS.result);
        });
        return;
      }

      if (isRexFlow) {
        const rexTransformation = buildInitialRexTransformation({
          sourceRows: sourceFile.rows,
          templateResource: rexTemplateResource,
        });

        startTransition(() => {
          setResult({
            kind: 'rex',
            rowStates: rexTransformation.rowStates,
            correctionsByRow: {},
            summary: rexTransformation.summary,
            generatedAt: todayStamp(),
          });
          setStep(rexTransformation.summary.pendingCount > 0 ? STEPS.review : STEPS.result);
        });
      }
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setIsTransforming(false);
    }
  };

  const downloadWorkbookWithFeedback = ({ title, detail, fileName, buildWorkbook }) => {
    if (exportState) {
      return;
    }

    flushSync(() => {
      setGlobalError('');
      setExportState({ title, detail });
    });

    try {
      const workbook = buildWorkbook();
      triggerWorkbookDownload(workbook, fileName);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'No se pudo preparar la descarga.');
    } finally {
      setExportState(null);
    }
  };

  const handleDownloadColaboradores = (mode) => {
    if (!result || !colaboradoresTemplateResource) {
      return;
    }

    downloadWorkbookWithFeedback({
      title: 'Preparando BUK Colaboradores',
      detail: 'Estamos armando el Excel final para descargarlo sin congelar la pantalla.',
      fileName: `BUK_colaboradores_${todayStamp()}.xlsx`,
      buildWorkbook: () =>
        buildBukColaboradoresExportWorkbook({
          templateResource: colaboradoresTemplateResource,
          rowEntries:
            mode === 'all' ? result.colaboradores.transformedRows : result.colaboradores.cleanTransformedRows,
        }),
    });
  };

  const handleDownloadTrabajos = (mode) => {
    if (!result || !trabajosTemplateResource) {
      return;
    }

    downloadWorkbookWithFeedback({
      title: 'Preparando BUK Trabajos',
      detail: 'Estamos consolidando la hoja de trabajos y sus listas de apoyo para la descarga.',
      fileName: `BUK_trabajos_${todayStamp()}.xlsx`,
      buildWorkbook: () =>
        buildBukTrabajosExportWorkbook({
          templateResource: trabajosTemplateResource,
          exportedRows: mode === 'all' ? result.trabajos.allExportedRows : result.trabajos.cleanExportedRows,
          supportSheets: result.trabajos.supportSheets,
        }),
    });
  };

  const handleDownloadRex = () => {
    if (!result || !rexTemplateResource || result.kind !== 'rex') {
      return;
    }

    if (preparedRexDownload) {
      triggerPreparedDownload(preparedRexDownload);
      return;
    }

    if (isPreparingRexDownload) {
      return;
    }

    downloadWorkbookWithFeedback({
      title: 'Preparando REX+ Empleados',
      detail: 'Estamos construyendo el Excel final de REX+ y activando la descarga en tu navegador.',
      fileName: `REX_empleados_${todayStamp()}.xlsx`,
      buildWorkbook: () =>
        buildRexExportWorkbook({
          templateResource: rexTemplateResource,
          rowEntries: result.rowStates.map((rowState) => rowState.exportedRow),
        }),
    });
  };

  const handleDownloadRexPendingReport = () => {
    if (!result || result.kind !== 'rex') {
      return;
    }

    downloadWorkbookWithFeedback({
      title: 'Preparando reporte de pendientes',
      detail: 'Estamos consolidando los campos pendientes para que puedas revisarlos o compartirlos.',
      fileName: `REX_pendientes_${todayStamp()}.xlsx`,
      buildWorkbook: () => {
        const pendingRows = result.rowStates.flatMap((rowState) =>
          rowState.pendingItems.map((item) => ({
            Fila: rowState.rowNumber,
            Empleado: rowState.employeeName || '',
            Identificador: rowState.employeeId || '',
            Campo: item.label,
            Clave: item.key,
            Tipo: item.type,
            Catalogo: item.catalogName || '',
            'Valor origen': item.sourceValue || '',
            'Contexto origen': (item.sourceContext ?? [])
              .filter((entry) => entry?.value)
              .map((entry) => `${entry.label}: ${entry.value}`)
              .join(' | '),
            'Corrección actual': result.correctionsByRow[rowState.rowNumber]?.[item.key] ?? '',
          })),
        );

        const workbook = XLSX.utils.book_new();
        const pendingSheet = XLSX.utils.json_to_sheet(pendingRows);
        XLSX.utils.book_append_sheet(workbook, pendingSheet, 'Pendientes');
        return workbook;
      },
    });
  };

  const handleUpdateRexCorrection = (rowNumber, fieldKey, value) => {
    if (!result || result.kind !== 'rex' || !rexTemplateResource) {
      return;
    }

    setResult((current) => {
      if (!current || current.kind !== 'rex') {
        return current;
      }

      const currentRowCorrections = {
        ...(current.correctionsByRow[rowNumber] ?? {}),
      };

      if (value === '') {
        delete currentRowCorrections[fieldKey];
      } else {
        currentRowCorrections[fieldKey] = value;
      }

      const nextCorrectionsByRow = {
        ...current.correctionsByRow,
        [rowNumber]: currentRowCorrections,
      };
      const nextRowStates = current.rowStates.map((rowState) =>
        rowState.rowNumber === rowNumber
          ? buildRexRow({
              sourceRow: rowState.sourceRow,
              templateResource: rexTemplateResource,
              corrections: nextCorrectionsByRow[rowNumber],
            })
          : rowState,
      );

      return {
        ...current,
        correctionsByRow: nextCorrectionsByRow,
        rowStates: nextRowStates,
        summary: summarizeRexRows(nextRowStates),
      };
    });
  };

  const handleBulkApplyRexCorrection = (fieldKey, rowNumbers, value) => {
    if (!result || result.kind !== 'rex' || !rexTemplateResource || value === '' || rowNumbers.length === 0) {
      return;
    }

    setResult((current) => {
      if (!current || current.kind !== 'rex') {
        return current;
      }

      const nextCorrectionsByRow = { ...current.correctionsByRow };

      rowNumbers.forEach((rowNumber) => {
        const rowCorrections = {
          ...(nextCorrectionsByRow[rowNumber] ?? {}),
        };

        if (value === '') {
          delete rowCorrections[fieldKey];
        } else {
          rowCorrections[fieldKey] = value;
        }

        nextCorrectionsByRow[rowNumber] = rowCorrections;
      });

      const nextRowStates = current.rowStates.map((rowState) =>
        rowNumbers.includes(rowState.rowNumber)
          ? buildRexRow({
              sourceRow: rowState.sourceRow,
              templateResource: rexTemplateResource,
              corrections: nextCorrectionsByRow[rowState.rowNumber],
            })
          : rowState,
      );

      return {
        ...current,
        correctionsByRow: nextCorrectionsByRow,
        rowStates: nextRowStates,
        summary: summarizeRexRows(nextRowStates),
      };
    });
  };

  const handleSaveConfiguration = (name) => {
    const configuration = createConfigurationPayload({
      name,
      origin: selectedOrigin,
      destination: selectedDestination,
      parameters: isBukFlow ? parameters : {},
    });
    const nextConfigurations = upsertConfiguration(configuration, configurations);
    setConfigurations(nextConfigurations);
    setActiveConfiguration(configuration);
  };

  const handleActivateConfiguration = (configuration) => {
    const normalizedConfiguration = {
      ...configuration,
      origen: normalizeOrigin(configuration.origen),
      destino: normalizeDestination(configuration.destino),
    };

    setSelectedOrigin(normalizedConfiguration.origen);
    setSelectedDestination(normalizedConfiguration.destino);
    setParameters({
      ...(normalizedConfiguration.destino === 'buk' ? getDefaultParameterValues() : getDefaultRexParameterValues()),
      ...normalizedConfiguration.parametros,
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
        origen: normalizeOrigin(parsed.origen),
        destino: normalizeDestination(parsed.destino),
      };
      const nextConfigurations = upsertConfiguration(importedConfiguration, configurations);
      setConfigurations(nextConfigurations);
      setActiveConfiguration(importedConfiguration);
      setSelectedOrigin(importedConfiguration.origen);
      setSelectedDestination(normalizeDestination(importedConfiguration.destino));
      setParameters({
        ...(importedConfiguration.destino === 'buk' ? getDefaultParameterValues() : getDefaultRexParameterValues()),
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
      {busyState ? <WorkInProgressOverlay title={busyState.title} detail={busyState.detail} /> : null}
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <div className="panel bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300">NPR interno</p>
                <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Maper</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  Mapea archivos de {originLabel} a {destinationLabel} en un flujo client-side, sin backend y con
                  trazabilidad antes de descargar.
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
            selectedModule={selectedModule}
            onChangeOrigin={setSelectedOrigin}
            onChangeDestination={setSelectedDestination}
            onChangeModule={handleModuleChange}
            onContinue={() => setStep(isConceptsFlow ? STEPS.concepts : STEPS.upload)}
            templateStatus={templateStatus}
            pairKey={pairKey}
            isSupportedPair={isSupportedPair}
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
            originLabel={originLabel}
            sourceFile={sourceFile}
            validation={validation}
            isReadingFile={isReadingFile}
            continueLabel={isHistoricalConceptsFlow ? 'Analizar conceptos históricos' : 'Continuar al wizard'}
            onFileSelected={handleFileSelected}
            onBack={() => setStep(STEPS.format)}
            onContinue={() => setStep(isHistoricalConceptsFlow ? STEPS.historicalReview : STEPS.params)}
          />
        ) : null}

        {step === STEPS.params ? (
          <ParamsWizard
            parameters={parameters}
            parameterDefinitions={activeParameterDefinitions}
            onChangeParameter={(key, value) => setParameters((current) => ({ ...current, [key]: value }))}
            onBack={() => setStep(STEPS.upload)}
            onTransform={handleTransform}
            isTransforming={isTransforming}
          />
        ) : null}

        {step === STEPS.concepts && conceptsResource ? (
          <ConceptsMapper resource={conceptsResource} onBack={() => setStep(STEPS.format)} />
        ) : null}

        {step === STEPS.historicalReview && sourceFile && conceptsResource ? (
          <HistoricalConceptsMapper
            sourceFile={sourceFile}
            concepts={conceptsResource.concepts}
            onBack={() => setStep(STEPS.format)}
            onBusyChange={setIsPreparingHistoricalDownload}
          />
        ) : null}

        {step === STEPS.review && result?.kind === 'rex' ? (
          <RexCorrectionsStep
            rowStates={result.rowStates}
            correctionsByRow={result.correctionsByRow}
            templateResource={rexTemplateResource}
            onBack={() => setStep(STEPS.upload)}
            onDownloadPendingReport={handleDownloadRexPendingReport}
            onUpdateCorrection={handleUpdateRexCorrection}
            onBulkApply={handleBulkApplyRexCorrection}
            onContinue={() => setStep(STEPS.result)}
          />
        ) : null}

        {step === STEPS.result && result?.kind === 'buk' ? (
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

        {step === STEPS.result && result?.kind === 'rex' ? (
          <RexTransformResult
            result={result}
            activeConfiguration={activeConfiguration}
            onDownload={handleDownloadRex}
            downloadHref={preparedRexDownload?.objectUrl ?? ''}
            downloadName={preparedRexDownload?.fileName ?? ''}
            isDownloading={isPreparingRexDownload || Boolean(exportState)}
            onSaveConfiguration={handleSaveConfiguration}
            onExportActiveConfiguration={handleExportActiveConfiguration}
            onRestart={resetFlow}
          />
        ) : null}
      </div>
    </main>
  );
}

function WorkInProgressOverlay({ title, detail }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border border-white/20 bg-slate-950 px-6 py-7 text-white shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute h-16 w-16 rounded-full border border-cyan-300/30" />
            <span className="absolute h-11 w-11 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
            <span className="loader-orb absolute left-1/2 top-1/2 h-3 w-3 -translate-x-8 -translate-y-1/2 rounded-full bg-cyan-300" />
            <span className="loader-orb absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300" />
            <span className="loader-orb absolute left-1/2 top-1/2 h-3 w-3 translate-x-6 -translate-y-1/2 rounded-full bg-amber-300" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200">Trabajando</p>
            <h3 className="mt-2 text-2xl font-extrabold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
          </div>
        </div>

        <div className="loader-track mt-6 h-2 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-300" />
        </div>
      </div>
    </div>
  );
}

function triggerWorkbookDownload(workbook, fileName) {
  triggerPreparedDownload(createPreparedDownload(workbook, fileName));
}

function createPreparedDownload(workbook, fileName) {
  const arrayBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return {
    fileName,
    objectUrl: URL.createObjectURL(blob),
  };
}

function triggerPreparedDownload(downloadResource) {
  if (!downloadResource?.objectUrl || !downloadResource?.fileName) {
    return;
  }

  const link = document.createElement('a');
  link.href = downloadResource.objectUrl;
  link.download = downloadResource.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function revokePreparedDownload(downloadResource) {
  if (!downloadResource?.objectUrl) {
    return;
  }

  URL.revokeObjectURL(downloadResource.objectUrl);
}

function normalizeDestination(destinationId) {
  return destinationId === 'rex' ? 'rex' : 'buk';
}

function normalizeOrigin(originId) {
  return originId === 'meta4' ? 'meta4' : 'talana';
}

function parseSourceWorkbook(arrayBuffer, originId) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/sourceParser.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      worker.terminate();

      if (event.data?.ok) {
        resolve(event.data);
        return;
      }

      reject(new Error(event.data?.error || 'No se pudo leer el archivo.'));
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error('No se pudo procesar el archivo en segundo plano.'));
    };

    worker.postMessage({ arrayBuffer, originId }, [arrayBuffer]);
  });
}

function waitForUiToPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

function buildValidationMessage({ originId, parsedSource }) {
  if (parsedSource.missingColumns.length > 0) {
    return originId === 'meta4' || originId === 'meta4-historico'
      ? 'El archivo no cumple con las columnas mínimas para Meta 4.'
      : 'El archivo no cumple con las columnas mínimas para Talana.';
  }

  return `Archivo listo. Se detectaron ${parsedSource.rows.length} filas en la hoja ${parsedSource.workbookName}.`;
}
