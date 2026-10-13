import FileUploader from '../components/FileUploader';
import FormatSelector from '../components/FormatSelector';
import ParamsWizard from '../components/ParamsWizard';
import RexCorrectionsStep from '../components/RexCorrectionsStep';
import RexTransformResult from '../components/RexTransformResult';
import TransformResult from '../components/TransformResult';
import ConceptsMapper from '../components/ConceptsMapper';
import HistoricalConceptsMapper from '../components/HistoricalConceptsMapper';
import VismaHistoricalMapper from '../components/VismaHistoricalMapper';
import VismaHistoricalSetup from '../components/VismaHistoricalSetup';
import TalanaHistoricalMapper from '../components/TalanaHistoricalMapper';
import VismaEmployeesReview from '../components/VismaEmployeesReview';
import VismaMastersReview from '../components/VismaMastersReview';
import VismaSidebar from '../components/VismaSidebar';
import { VismaWorkspaceProvider } from '../components/VismaWorkspaceProvider';

const ART_BPO_LOGO_PATH = `${import.meta.env.BASE_URL}branding/artbpo-logo.png`;
const TMF_LOGO_PATH = `${import.meta.env.BASE_URL}branding/tmf-logo.png`;

export default function AppFlowContent({ app }) {
  const {
    STEPS,
    busyState,
    isVismaMastersFlow,
    isVismaEmployeesFlow,
    originLabel,
    destinationLabel,
    selectedOrigin,
    isConceptsFlow,
    isHistoricalConceptsFlow,
    mappingScope,
    globalError,
    showVismaSidebar,
    selectedModule,
    step,
    selectedDestination,
    mappingCompany,
    setSelectedOrigin,
    setSelectedDestination,
    setMappingCompany,
    setStep,
    templateStatus,
    conceptsResource,
    isUpdatingConceptCatalog,
    pairKey,
    isSupportedPair,
    configurations,
    activeConfigurationId,
    visibleSessions,
    setExportState,
    vismaCatalogScope,
    vismaHistoricalCatalog,
    vismaHistoricalCatalogFileName,
    isReadingVismaCatalog,
    isLoadingVismaCatalog,
    vismaHistoricalCatalogValidation,
    vismaHistoricalEmployeeCatalog,
    vismaEmployeeMasterFileName,
    vismaEmployeeMasterValidation,
    isReadingVismaEmployeeMaster,
    vismaTemplateCompanyId,
    vismaHistoricalTemplateResource,
    setVismaTemplateCompanyId,
    vismaHistoricalTemplateFileName,
    isReadingVismaTemplate,
    vismaHistoricalTemplateValidation,
    sourceFile,
    validation,
    isReadingFile,
    setGlobalError,
    historicalEmployeeMasterFile,
    historicalEmployeeMasterValidation,
    isReadingHistoricalEmployeeMaster,
    isVismaHistoricalFlow,
    isTalanaHistoricalFlow,
    historicalEmployeeCatalog,
    parameters,
    activeParameterDefinitions,
    setParameters,
    isTransforming,
    historicalBatchState,
    setHistoricalBatchState,
    setIsPreparingHistoricalDownload,
    result,
    rexTemplateResource,
    activeConfiguration,
    preparedRexDownload,
    isPreparingRexDownload,
    exportState,
    handleFileSelected,
    handleMonthlyBookSelected,
    handleHistoricalEmployeeMasterSelected,
    handleConceptCatalogUpdated,
    handleConceptCatalogFileSelected,
    handleVismaHistoricalCatalogSelected,
    handleVismaHistoricalTemplateSelected,
    handleVismaHistoricalEmployeeMasterSelected,
    handleVismaHistoricalBooksSelected,
    handleVismaCatalogScopeChange,
    handleModuleChange,
    handleVismaNavigation,
    handleVismaContextChange,
    handleOpenOtherFlows,
    handleOpenMissingMeta4Employees,
    handleTransform,
    handleVismaEmployeesReady,
    handleDownloadColaboradores,
    handleDownloadTrabajos,
    handleDownloadBukErrors,
    handleDownloadRex,
    handleDownloadRexPendingReport,
    handleUpdateRexCorrection,
    handleBulkApplyRexCorrection,
    handleSaveConfiguration,
    handleActivateConfiguration,
    handleDeleteConfiguration,
    handleImportConfiguration,
    handleResumeSession,
    handleDeleteSession,
    handleExportActiveConfiguration,
    resetFlow,
  } = app;

  return (
    <VismaWorkspaceProvider>
      <main className="min-h-screen bg-[#f6f7fb] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      {busyState ? <WorkInProgressOverlay title={busyState.title} detail={busyState.detail} /> : null}
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <div className="panel px-5 py-4 sm:px-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <img src={ART_BPO_LOGO_PATH} alt="artBPO" className="h-14 w-24 shrink-0 object-contain object-center" />
                <div className="min-w-0 border-l border-slate-200 pl-4">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-brand-600">Plataforma interna</p>
                  <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Transformator</h1>
                  <p className="mt-1 max-w-3xl text-sm text-slate-500">
                  {isVismaMastersFlow
                    ? 'Consulta los maestros VISMA desde el backend y prepáralos para las cargas.'
                    : isVismaEmployeesFlow
                      ? 'Conecta VISMA por proxy backend, elige empresa y trae empleados o libros históricos para REX+.'
                    : `Mapea archivos de ${originLabel} a ${destinationLabel} en un flujo client-side, con trazabilidad antes de descargar.`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <img src={TMF_LOGO_PATH} alt="TMF Group" className="h-10 w-10 rounded-xl object-cover" />
                  <div className="text-xs">
                    <p className="font-bold uppercase tracking-[0.16em] text-slate-500">TMF Group</p>
                    <p className="mt-1 font-semibold text-slate-900">
                    {selectedOrigin} → {destinationLabel}
                    {isConceptsFlow || isHistoricalConceptsFlow ? ` · ${mappingScope.company.toUpperCase()}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {globalError ? (
          <div className="mb-6 rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {globalError}
          </div>
        ) : null}

        <div className={showVismaSidebar ? 'grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]' : ''}>
          {showVismaSidebar ? (
            <VismaSidebar
              selectedModule={selectedModule}
              onNavigate={handleVismaNavigation}
              onContextChange={handleVismaContextChange}
              onOpenOtherFlows={handleOpenOtherFlows}
            />
          ) : null}

          <div className={showVismaSidebar ? 'min-w-0' : ''}>
        {step === STEPS.format && !showVismaSidebar ? (
          <FormatSelector
            selectedOrigin={selectedOrigin}
            selectedDestination={selectedDestination}
            mappingCompany={mappingCompany}
            selectedModule={selectedModule}
            onChangeOrigin={setSelectedOrigin}
            onChangeDestination={setSelectedDestination}
            onChangeMappingCompany={setMappingCompany}
            onChangeModule={handleModuleChange}
            onContinue={() => setStep(
              isConceptsFlow
                ? STEPS.concepts
                : isVismaMastersFlow
                  ? STEPS.vismaMastersReview
                : isVismaEmployeesFlow
                  ? STEPS.vismaEmployeesReview
                  : STEPS.upload,
            )}
            templateStatus={templateStatus}
            conceptCatalogCount={conceptsResource?.concepts?.length ?? 0}
            isUpdatingConceptCatalog={isUpdatingConceptCatalog}
            onCatalogSelected={handleConceptCatalogFileSelected}
            pairKey={pairKey}
            isSupportedPair={isSupportedPair}
            configurations={configurations}
            activeConfigurationId={activeConfigurationId}
            onActivateConfiguration={handleActivateConfiguration}
            onDeleteConfiguration={handleDeleteConfiguration}
            onImportConfiguration={handleImportConfiguration}
            onExportActiveConfiguration={handleExportActiveConfiguration}
            sessions={visibleSessions}
            onResumeSession={handleResumeSession}
            onDeleteSession={handleDeleteSession}
          />
        ) : null}

        {step === STEPS.vismaMastersReview ? (
          <VismaMastersReview
            onBack={() => handleVismaNavigation('visma-empleados')}
            onBusyChange={(isBusy) => {
              setExportState(isBusy
                ? {
                    title: 'Consultando maestros VISMA',
                    detail: 'El proxy está consultando los maestros de la conexión seleccionada.',
                  }
                : null);
            }}
          />
        ) : null}

        {step === STEPS.vismaEmployeesReview ? (
          <VismaEmployeesReview
            conceptsResource={conceptsResource}
            onBack={() => handleVismaNavigation('visma-maestros')}
            onContinue={handleVismaEmployeesReady}
            onBusyChange={(isBusy) => {
              setExportState(isBusy
                ? {
                    title: 'Consultando VISMA',
                    detail: 'El proxy está consultando VISMA con las claves guardadas y la empresa seleccionada.',
                  }
                : null);
            }}
          />
        ) : null}

        {step === STEPS.upload && isVismaHistoricalFlow ? (
          <VismaHistoricalSetup
            catalogScope={vismaCatalogScope}
            onCatalogScopeChange={handleVismaCatalogScopeChange}
            catalog={vismaHistoricalCatalog}
            catalogFileName={vismaHistoricalCatalogFileName}
            onCatalogSelected={handleVismaHistoricalCatalogSelected}
            isReadingCatalog={isReadingVismaCatalog || isLoadingVismaCatalog}
            catalogLoadingLabel={isLoadingVismaCatalog ? 'Buscando catálogo guardado…' : 'Leyendo catálogo…'}
            catalogValidation={vismaHistoricalCatalogValidation}
            company={vismaTemplateCompanyId}
            companyOptions={vismaHistoricalTemplateResource?.companies ?? []}
            onCompanyChange={setVismaTemplateCompanyId}
            templateFileName={vismaHistoricalTemplateFileName}
            templateResource={vismaHistoricalTemplateResource}
            onTemplateSelected={handleVismaHistoricalTemplateSelected}
            isReadingTemplate={isReadingVismaTemplate}
            templateValidation={vismaHistoricalTemplateValidation}
            employeeCatalog={vismaHistoricalEmployeeCatalog}
            employeeMasterFileName={vismaEmployeeMasterFileName}
            employeeMasterValidation={vismaEmployeeMasterValidation}
            onEmployeeMasterSelected={handleVismaHistoricalEmployeeMasterSelected}
            isReadingEmployeeMaster={isReadingVismaEmployeeMaster}
            sourceFile={sourceFile}
            sourceValidation={validation}
            onSourceFilesSelected={handleVismaHistoricalBooksSelected}
            isReadingSource={isReadingFile}
            onBack={() => setStep(STEPS.format)}
            onContinue={() => {
              if (!vismaTemplateCompanyId) {
                setGlobalError('Selecciona la empresa REX+ del template antes de analizar el libro.');
                return;
              }
              if (!vismaHistoricalCatalog?.length || !vismaHistoricalTemplateResource || !vismaHistoricalEmployeeCatalog?.length || !sourceFile || !validation?.isValid) {
                setGlobalError('Carga el catálogo REX+, el template, el maestro de trabajadores y los libros del período antes de analizar.');
                return;
              }
              setGlobalError('');
              setStep(STEPS.vismaHistoricalReview);
            }}
          />
        ) : null}

        {step === STEPS.upload && !isVismaHistoricalFlow ? (
          <FileUploader
            originLabel={originLabel}
            sourceFile={sourceFile}
            validation={validation}
            isReadingFile={isReadingFile}
            secondaryUpload={isHistoricalConceptsFlow ? {
              title: 'Maestro REX+ de empleados',
              description: 'Carga el maestro actualizado de REX+. Se usará sólo para comprobar qué trabajadores del libro ya existen.',
              fileName: historicalEmployeeMasterFile?.name,
              validation: historicalEmployeeMasterValidation,
              isReadingFile: isReadingHistoricalEmployeeMaster,
              onFileSelected: handleHistoricalEmployeeMasterSelected,
            } : null}
            continueLabel={isVismaHistoricalFlow || isTalanaHistoricalFlow || isHistoricalConceptsFlow ? 'Analizar libro histórico' : 'Continuar al wizard'}
            onFileSelected={handleFileSelected}
            onBack={() => setStep(showVismaSidebar ? STEPS.vismaEmployeesReview : STEPS.format)}
            onContinue={() => {
              if (isHistoricalConceptsFlow && !historicalEmployeeCatalog) {
                setGlobalError('Carga el maestro REX+ de empleados antes de analizar el libro histórico.');
                return;
              }

              setStep(isVismaHistoricalFlow ? STEPS.vismaHistoricalReview : isTalanaHistoricalFlow ? STEPS.talanaHistoricalReview : isHistoricalConceptsFlow ? STEPS.historicalReview : STEPS.params);
            }}
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
          <ConceptsMapper
            resource={conceptsResource}
            isReadingMonthlyBook={isReadingFile}
            isUpdatingCatalog={isUpdatingConceptCatalog}
            onBack={() => setStep(STEPS.format)}
            onMonthlyBookSelected={handleMonthlyBookSelected}
            onCatalogUpdated={handleConceptCatalogUpdated}
          />
        ) : null}

        {step === STEPS.historicalReview && sourceFile && conceptsResource ? (
          <HistoricalConceptsMapper
            sourceFile={sourceFile}
            conceptsResource={conceptsResource}
            employeeCatalogOverride={historicalEmployeeCatalog}
            employeeMasterFileName={historicalEmployeeMasterFile?.name}
            mappingScope={mappingScope}
            batchState={historicalBatchState}
            onBatchStateChange={setHistoricalBatchState}
            onBack={() => setStep(STEPS.format)}
            onOpenMissingEmployees={handleOpenMissingMeta4Employees}
            onBusyChange={setIsPreparingHistoricalDownload}
          />
        ) : null}

        {step === STEPS.vismaHistoricalReview && sourceFile && vismaHistoricalTemplateResource && vismaHistoricalCatalog ? (
          <VismaHistoricalMapper
            sourceFile={sourceFile}
            resource={{
              ...vismaHistoricalTemplateResource,
              companies: vismaHistoricalTemplateResource.companies.filter((company) => company.id === vismaTemplateCompanyId),
              conceptCatalog: vismaHistoricalCatalog,
            }}
            employeeCatalog={vismaHistoricalEmployeeCatalog}
            mappingScope={mappingScope}
            batchState={historicalBatchState}
            onBatchStateChange={setHistoricalBatchState}
            onBack={() => setStep(STEPS.upload)}
            onBusyChange={setIsPreparingHistoricalDownload}
          />
        ) : null}

        {step === STEPS.talanaHistoricalReview && sourceFile ? (
          <TalanaHistoricalMapper
            sourceFile={sourceFile}
            mappingScope={mappingScope}
            batchState={historicalBatchState}
            onBatchStateChange={setHistoricalBatchState}
            onBack={() => setStep(STEPS.upload)}
            onBusyChange={setIsPreparingHistoricalDownload}
          />
        ) : null}

        {step === STEPS.review && result?.kind === 'rex' ? (
          <RexCorrectionsStep
            rowStates={result.rowStates}
            correctionsByRow={result.correctionsByRow}
            templateResource={rexTemplateResource}
            onBack={() => setStep(isVismaEmployeesFlow ? STEPS.vismaEmployeesReview : STEPS.upload)}
            onDownloadRex={handleDownloadRex}
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
            onDownloadErrors={handleDownloadBukErrors}
            onSaveConfiguration={handleSaveConfiguration}
            onExportActiveConfiguration={handleExportActiveConfiguration}
            onRestart={resetFlow}
          />
        ) : null}

        {step === STEPS.result && result?.kind === 'rex' ? (
          <RexTransformResult
            result={result}
            sourceLabel={isVismaEmployeesFlow ? 'VISMA' : 'Meta 4'}
            defaultConfigurationName={isVismaEmployeesFlow ? 'VISMA → REX+ Empleados' : 'Meta 4 → REX+'}
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
        </div>
      </div>
      </main>
    </VismaWorkspaceProvider>

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
