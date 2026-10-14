import {
  createConfigurationPayload,
  exportConfiguration,
  removeConfiguration,
  upsertConfiguration,
  validateConfigurationShape,
} from './storage';
import { getDefaultParameterValues } from '../connectors/destinations/buk_colaboradores';
import { getDefaultRexParameterValues } from '../connectors/destinations/rex_empleados';
import { normalizeDestination, normalizeOrigin } from './appHelpers';
import { deleteCloudSession, loadCloudSession } from './cloudMemory';
import { deleteSession, loadSession } from './sessionPersistence';

export function createAppConfigurationActions(context) {
  const {
    STEPS,
    activeConfiguration,
    authUser,
    configurations,
    isBukFlow,
    parameters,
    selectedDestination,
    selectedOrigin,
    sessionId,
    visibleSessions,
    setActiveConfiguration,
    setCloudSessions,
    setConfigurations,
    setGlobalError,
    setHistoricalBatchState,
    setHistoricalEmployeeCatalog,
    setHistoricalEmployeeMasterFile,
    setHistoricalEmployeeMasterValidation,
    setMappingCompany,
    setParameters,
    setRexCompanyMasterResource,
    setResult,
    setSelectedDestination,
    setSelectedModule,
    setSelectedOrigin,
    setSessionId,
    setSessions,
    setSourceFile,
    setStep,
    setValidation,
    setVismaCatalogScope,
    setVismaHistoricalCatalog,
    setVismaHistoricalCatalogFileName,
    setVismaHistoricalCatalogValidation,
    setVismaHistoricalTemplateResource,
    setVismaHistoricalTemplateFileName,
    setVismaHistoricalTemplateValidation,
    setVismaHistoricalEmployeeCatalog,
    setVismaEmployeeMasterFileName,
    setVismaEmployeeMasterValidation,
    setVismaTemplateCompanyId,
  } = context;

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

  const handleResumeSession = async (storedSessionId) => {
    try {
      const storedMetadata = visibleSessions.find((session) => session.id === storedSessionId);
      const storedSession = storedMetadata?.storage === 'cloud' && authUser
        ? await loadCloudSession(authUser, storedSessionId)
        : await loadSession(storedSessionId);
      if (!storedSession) {
        throw new Error('No se encontró la carga guardada.');
      }

      const { metadata, data } = storedSession;
      const restoredOrigin = normalizeOrigin(data.selectedOrigin ?? metadata.selectedOrigin);
      const restoredDestination = normalizeDestination(data.selectedDestination ?? metadata.selectedDestination);
      const restoredModule = data.selectedModule ?? metadata.selectedModule ?? 'empleados';
      const restoredCompanyMaster = data.rexCompanyMasterResource ?? null;
      const vismaSetup = data.vismaHistoricalSetup;
      const canRestoreVismaReview = Boolean(
        vismaSetup?.catalog?.length
        && vismaSetup?.templateResource
        && vismaSetup?.employeeCatalog?.length,
      );

      if (restoredModule === 'libros-historicos') {
        setVismaCatalogScope(vismaSetup?.catalogScope ?? 'fruticola');
        if (vismaSetup?.catalog) setVismaHistoricalCatalog(vismaSetup.catalog);
        setVismaHistoricalCatalogFileName(vismaSetup?.catalogFileName ?? '');
        setVismaHistoricalCatalogValidation(vismaSetup?.catalogValidation ?? null);
        setVismaHistoricalTemplateResource(vismaSetup?.templateResource ?? null);
        setVismaHistoricalTemplateFileName(vismaSetup?.templateFileName ?? '');
        setVismaHistoricalTemplateValidation(vismaSetup?.templateValidation ?? null);
        setVismaHistoricalEmployeeCatalog(vismaSetup?.employeeCatalog ?? null);
        setVismaEmployeeMasterFileName(vismaSetup?.employeeMasterFileName ?? '');
        setVismaEmployeeMasterValidation(vismaSetup?.employeeMasterValidation ?? null);
        setVismaTemplateCompanyId(vismaSetup?.companyId ?? '');
      }

      setSessionId(metadata.id);
      setSelectedModule(restoredModule);
      setSelectedOrigin(restoredOrigin);
      setSelectedDestination(restoredDestination);
      setMappingCompany(data.mappingCompany ?? metadata.mappingCompany ?? 'FINNING');
      setParameters({
        ...(restoredDestination === 'buk' ? getDefaultParameterValues() : getDefaultRexParameterValues()),
        ...(data.parameters ?? {}),
      });
      setSourceFile(data.sourceFile ?? null);
      setValidation(data.validation ?? null);
      setResult(data.result ?? null);
      setRexCompanyMasterResource(restoredCompanyMaster);
      setHistoricalBatchState(data.historicalBatchState ?? { completedEmployeeIds: [] });
      setStep(
        restoredModule === 'visma-empleados' && !restoredCompanyMaster
          ? STEPS.vismaEmployeesReview
          : restoredModule === 'libros-historicos' && !canRestoreVismaReview
            ? STEPS.upload
          : data.step ?? metadata.step ?? STEPS.upload,
      );
      setGlobalError('');
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'No se pudo retomar la carga guardada.');
    }
  };

  const handleDeleteSession = async (session) => {
    if (!window.confirm(`¿Eliminar la carga guardada "${session.fileName || 'sin nombre'}"?`)) {
      return;
    }

    try {
      if (session.storage !== 'cloud' || !authUser) {
        await deleteSession(session.id);
      }
      if ((session.storage === 'cloud' || session.storage === 'both') && authUser) {
        await deleteCloudSession(authUser, session);
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setCloudSessions((current) => current.filter((item) => item.id !== session.id));

      if (sessionId === session.id) {
        resetFlow();
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'No se pudo eliminar la carga guardada.');
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
    setSelectedModule('empleados');
    setSelectedOrigin('talana');
    setSelectedDestination('buk');
    setSessionId(null);
    setSourceFile(null);
    setValidation(null);
    setResult(null);
    setRexCompanyMasterResource(null);
    setHistoricalEmployeeCatalog(null);
    setHistoricalEmployeeMasterFile(null);
    setHistoricalEmployeeMasterValidation(null);
    setHistoricalBatchState({ completedEmployeeIds: [] });
    setGlobalError('');
  };
  return {
    handleSaveConfiguration,
    handleActivateConfiguration,
    handleDeleteConfiguration,
    handleImportConfiguration,
    handleResumeSession,
    handleDeleteSession,
    handleExportActiveConfiguration,
    resetFlow,
  };
}
