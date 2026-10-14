import { useEffect, useMemo, useState } from 'react';
import AppFlowContent from './components/AppFlowContent';
import {
  bukColaboradoresDestination,
  getBukColaboradoresFieldDefinitions,
  getDefaultParameterValues,
} from './connectors/destinations/buk_colaboradores';
import {
  rexDestination,
} from './connectors/destinations/rex_empleados';
import {
  applyRexCompanyMasterResource,
  buildRexExportWorkbook,
} from './lib/template';
import { useAppTemplates } from './lib/useAppTemplates';
import {
  loadConfigurations,
  persistConfigurations,
} from './lib/storage';
import {
  createPreparedDownload,
  getRexDownloadFilename,
  mergeSessionLists,
  revokePreparedDownload,
} from './lib/appHelpers';
import { createAppUploadActions } from './lib/appUploadActions';
import { createAppResultActions } from './lib/appResultActions';
import { createAppConfigurationActions } from './lib/appConfigurationActions';
import { useVismaHistoricalState } from './lib/useVismaHistoricalState';
import { VISMA_CATALOG_SCOPES } from './lib/vismaHistorical';
import {
  loadCloudConceptCatalog,
  listCloudSessions,
  loadCloudMappings,
  saveCloudConceptCatalog,
  saveCloudMappings,
  saveCloudSession,
} from './lib/cloudMemory';
import { ensureFirebaseSession, isFirebaseConfigured, subscribeToFirebaseAuth } from './lib/firebase';
import {
  createSessionMetadata,
  loadConceptCatalogMemory,
  loadMappingMemory,
  listSessions,
  mergeStoredMappingEntries,
  normalizeMappingScope,
  saveConceptCatalogMemory,
  saveSession,
} from './lib/sessionPersistence';

const STEPS = {
  format: 'format',
  upload: 'upload',
  params: 'params',
  review: 'review',
  result: 'result',
  concepts: 'concepts',
  historicalReview: 'historical-review',
  vismaHistoricalReview: 'visma-historical-review',
  talanaHistoricalReview: 'talana-historical-review',
  vismaMastersReview: 'visma-masters-review',
  vismaEmployeesReview: 'visma-employees-review',
};

const SUPPORTED_PAIRS = new Set(['talana:buk', 'meta4:rex']);
const cloudConfigured = isFirebaseConfigured();

export default function App() {
  const [step, setStep] = useState(STEPS.format);
  const [selectedModule, setSelectedModule] = useState('empleados');
  const [selectedOrigin, setSelectedOrigin] = useState('talana');
  const [selectedDestination, setSelectedDestination] = useState('buk');
  const [mappingCompany, setMappingCompany] = useState('FINNING');
  const [vismaTemplateCompanyId, setVismaTemplateCompanyId] = useState('');
  const [parameters, setParameters] = useState(getDefaultParameterValues());
  const [configurations, setConfigurations] = useState(() => loadConfigurations());
  const [activeConfiguration, setActiveConfiguration] = useState(null);
  const [templateStatus, setTemplateStatus] = useState('loading');
  const [colaboradoresTemplateResource, setColaboradoresTemplateResource] = useState(null);
  const [trabajosTemplateResource, setTrabajosTemplateResource] = useState(null);
  const [baseRexTemplateResource, setBaseRexTemplateResource] = useState(null);
  const [rexCompanyMasterResource, setRexCompanyMasterResource] = useState(null);
  const [conceptsResource, setConceptsResource] = useState(null);
  const [historicalEmployeeCatalog, setHistoricalEmployeeCatalog] = useState(null);
  const [historicalEmployeeMasterFile, setHistoricalEmployeeMasterFile] = useState(null);
  const [historicalEmployeeMasterValidation, setHistoricalEmployeeMasterValidation] = useState(null);
  const [isReadingHistoricalEmployeeMaster, setIsReadingHistoricalEmployeeMaster] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [historicalBatchState, setHistoricalBatchState] = useState({ completedEmployeeIds: [] });
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [cloudSessions, setCloudSessions] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPreparingRexDownload, setIsPreparingRexDownload] = useState(false);
  const [isPreparingHistoricalDownload, setIsPreparingHistoricalDownload] = useState(false);
  const [isUpdatingConceptCatalog, setIsUpdatingConceptCatalog] = useState(false);
  const [preparedRexDownload, setPreparedRexDownload] = useState(null);
  const [exportState, setExportState] = useState(null);
  const [globalError, setGlobalError] = useState('');
  const vismaHistoricalState = useVismaHistoricalState(authUser);
  const {
    vismaCatalogScope,
    setVismaCatalogScope,
    vismaHistoricalCatalog,
    setVismaHistoricalCatalog,
    vismaHistoricalCatalogFileName,
    setVismaHistoricalCatalogFileName,
    vismaHistoricalCatalogValidation,
    setVismaHistoricalCatalogValidation,
    isReadingVismaCatalog,
    setIsReadingVismaCatalog,
    isLoadingVismaCatalog,
    setIsLoadingVismaCatalog,
    vismaHistoricalTemplateResource,
    setVismaHistoricalTemplateResource,
    vismaHistoricalTemplateFileName,
    setVismaHistoricalTemplateFileName,
    vismaHistoricalTemplateValidation,
    setVismaHistoricalTemplateValidation,
    isReadingVismaTemplate,
    setIsReadingVismaTemplate,
    vismaHistoricalEmployeeCatalog,
    setVismaHistoricalEmployeeCatalog,
    vismaEmployeeMasterFileName,
    setVismaEmployeeMasterFileName,
    vismaEmployeeMasterValidation,
    setVismaEmployeeMasterValidation,
    isReadingVismaEmployeeMaster,
    setIsReadingVismaEmployeeMaster,
    vismaSourceEmployeeMaster,
    setVismaSourceEmployeeMaster,
    vismaSourceEmployeeMasterFileName,
    setVismaSourceEmployeeMasterFileName,
    vismaSourceEmployeeMasterValidation,
    setVismaSourceEmployeeMasterValidation,
    isReadingVismaSourceEmployeeMaster,
    setIsReadingVismaSourceEmployeeMaster,
  } = vismaHistoricalState;

  const rexTemplateResource = useMemo(
    () => applyRexCompanyMasterResource(baseRexTemplateResource, rexCompanyMasterResource),
    [baseRexTemplateResource, rexCompanyMasterResource],
  );

  const pairKey = `${selectedOrigin}:${selectedDestination}`;
  const mappingScope = useMemo(
    () => normalizeMappingScope({
      origin: selectedOrigin,
      destination: selectedDestination,
      company: selectedModule === 'libros-historicos' ? `${vismaCatalogScope}:${vismaTemplateCompanyId}` : mappingCompany,
    }),
    [mappingCompany, selectedDestination, selectedModule, selectedOrigin, vismaCatalogScope, vismaTemplateCompanyId],
  );
  const isBukFlow = pairKey === 'talana:buk';
  const isRexFlow = pairKey === 'meta4:rex';
  const isConceptsFlow = selectedModule === 'conceptos';
  const isHistoricalConceptsFlow = selectedModule === 'conceptos-historicos';
  const isVismaHistoricalFlow = selectedModule === 'libros-historicos';
  const isTalanaHistoricalFlow = selectedModule === 'talana-libros-historicos';
  const isVismaMastersFlow = selectedModule === 'visma-maestros';
  const isVismaEmployeesFlow = selectedModule === 'visma-empleados';
  const vismaCatalogScopeLabel = VISMA_CATALOG_SCOPES.find((scope) => scope.id === vismaCatalogScope)?.label ?? vismaCatalogScope;
  const showVismaSidebar = isVismaMastersFlow || isVismaEmployeesFlow || isVismaHistoricalFlow;
  const isSupportedPair = isHistoricalConceptsFlow || isVismaHistoricalFlow || isTalanaHistoricalFlow || isVismaMastersFlow || isVismaEmployeesFlow || SUPPORTED_PAIRS.has(pairKey);
  const visibleSessions = useMemo(() => mergeSessionLists(sessions, cloudSessions), [cloudSessions, sessions]);
  const colaboradoresFieldDefinitions = useMemo(() => getBukColaboradoresFieldDefinitions(), []);
  const activeParameterDefinitions = useMemo(
    () => (isBukFlow ? bukColaboradoresDestination.userParameters : rexDestination.userParameters),
    [isBukFlow],
  );

  useAppTemplates({
    setColaboradoresTemplateResource,
    setConceptsResource,
    setGlobalError,
    setBaseRexTemplateResource,
    setTemplateStatus,
    setTrabajosTemplateResource,
  });

  useEffect(() => {
    if (!cloudConfigured) {
      return undefined;
    }

    const unsubscribe = subscribeToFirebaseAuth(
      (user) => {
        setAuthUser(user);
      },
      (error) => {
        setAuthUser(null);
        setGlobalError(error instanceof Error ? error.message : 'No se pudo validar la sesión cloud.');
      },
    );

    ensureFirebaseSession().catch((error) => {
      setGlobalError(error instanceof Error ? error.message : 'No se pudo activar la memoria cloud.');
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) {
      setCloudSessions([]);
      return undefined;
    }

    let isMounted = true;

    Promise.all([
      listCloudSessions(authUser),
      loadCloudMappings(authUser, 'concepts'),
      loadCloudMappings(authUser, 'historical-concepts'),
      loadCloudMappings(authUser, 'visma-historical'),
      loadCloudConceptCatalog(authUser),
    ])
      .then(([storedCloudSessions, conceptsMappings, historicalMappings, vismaHistoricalMappings, cloudConceptCatalog]) => {
        if (!isMounted) {
          return;
        }

        const localMemory = loadMappingMemory();
        const mergedConceptsMappings = {
          ...conceptsMappings,
          ...(localMemory.concepts ?? {}),
        };
        const mergedHistoricalMappings = {
          ...historicalMappings,
          ...(localMemory['historical-concepts'] ?? {}),
        };
        const mergedVismaHistoricalMappings = {
          ...vismaHistoricalMappings,
          ...(localMemory['visma-historical'] ?? {}),
        };
        const localConceptCatalog = loadConceptCatalogMemory();
        const conceptCatalog = cloudConceptCatalog?.length ? cloudConceptCatalog : localConceptCatalog;

        setCloudSessions(storedCloudSessions);
        mergeStoredMappingEntries('concepts', mergedConceptsMappings);
        mergeStoredMappingEntries('historical-concepts', mergedHistoricalMappings);
        mergeStoredMappingEntries('visma-historical', mergedVismaHistoricalMappings);

        if (conceptCatalog?.length) {
          saveConceptCatalogMemory(conceptCatalog);
          setConceptsResource((current) => (current ? { ...current, concepts: conceptCatalog } : current));
        }

        return Promise.all([
          saveCloudMappings(authUser, 'concepts', mergedConceptsMappings),
          saveCloudMappings(authUser, 'historical-concepts', mergedHistoricalMappings),
          saveCloudMappings(authUser, 'visma-historical', mergedVismaHistoricalMappings),
          ...(conceptCatalog?.length ? [saveCloudConceptCatalog(authUser, conceptCatalog)] : []),
        ]);
      })
      .catch((error) => {
        if (isMounted) {
          setGlobalError(error instanceof Error ? error.message : 'No se pudo cargar la memoria cloud.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      return undefined;
    }

    const handleMappingsChanged = (event) => {
      const { namespace, entries } = event.detail ?? {};
      if (!namespace || !entries) {
        return;
      }

      saveCloudMappings(authUser, namespace, entries).catch((error) => {
        setGlobalError(error instanceof Error ? error.message : 'No se pudo sincronizar el mapeo cloud.');
      });
    };

    window.addEventListener('maper-mappings-changed', handleMappingsChanged);
    return () => window.removeEventListener('maper-mappings-changed', handleMappingsChanged);
  }, [authUser]);

  useEffect(() => {
    let isMounted = true;

    listSessions()
      .then((storedSessions) => {
        if (isMounted) {
          setSessions(storedSessions);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSessions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !sourceFile) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      const metadata = createSessionMetadata({
        id: sessionId,
        selectedModule,
        selectedOrigin,
        selectedDestination,
        mappingCompany,
        sourceFile,
        step,
      });
      const sessionData = {
        selectedModule,
        selectedOrigin,
        selectedDestination,
        mappingCompany,
        parameters,
        sourceFile,
        validation,
        result,
        rexCompanyMasterResource,
        historicalBatchState,
        step,
      };
      const vismaHistoricalSetup = isVismaHistoricalFlow ? {
        catalogScope: vismaCatalogScope,
        catalog: vismaHistoricalCatalog,
        catalogFileName: vismaHistoricalCatalogFileName,
        catalogValidation: vismaHistoricalCatalogValidation,
        templateResource: vismaHistoricalTemplateResource,
        templateFileName: vismaHistoricalTemplateFileName,
        templateValidation: vismaHistoricalTemplateValidation,
        employeeCatalog: vismaHistoricalEmployeeCatalog,
        employeeMasterFileName: vismaEmployeeMasterFileName,
        employeeMasterValidation: vismaEmployeeMasterValidation,
        sourceEmployeeMaster: vismaSourceEmployeeMaster,
        sourceEmployeeMasterFileName: vismaSourceEmployeeMasterFileName,
        sourceEmployeeMasterValidation: vismaSourceEmployeeMasterValidation,
        companyId: vismaTemplateCompanyId,
      } : null;

      saveSession({
        metadata,
        data: {
          ...sessionData,
          ...(vismaHistoricalSetup ? { vismaHistoricalSetup } : {}),
        },
      })
        .then(() => {
          setSessions((current) => [metadata, ...current.filter((session) => session.id !== metadata.id)]);
          if (!authUser) {
            return null;
          }

          return saveCloudSession(authUser, {
            metadata,
            data: sessionData,
          });
        })
        .then(() => {
          if (authUser) {
            setCloudSessions((current) => [
              { ...metadata, storage: 'cloud' },
              ...current.filter((session) => session.id !== metadata.id),
            ]);
          }
        })
        .catch(() => {
          // The transformation must continue even if browser storage is unavailable or full.
        });
    }, 350);

    return () => window.clearTimeout(timerId);
  }, [
    parameters,
    result,
    selectedDestination,
    mappingCompany,
    selectedModule,
    selectedOrigin,
    sessionId,
    sourceFile,
    step,
    validation,
    rexCompanyMasterResource,
    historicalBatchState,
    authUser,
    isVismaHistoricalFlow,
    vismaCatalogScope,
    vismaHistoricalCatalog,
    vismaHistoricalCatalogFileName,
    vismaHistoricalCatalogValidation,
    vismaHistoricalTemplateResource,
    vismaHistoricalTemplateFileName,
    vismaHistoricalTemplateValidation,
    vismaHistoricalEmployeeCatalog,
    vismaEmployeeMasterFileName,
    vismaEmployeeMasterValidation,
    vismaSourceEmployeeMaster,
    vismaSourceEmployeeMasterFileName,
    vismaSourceEmployeeMasterValidation,
    vismaTemplateCompanyId,
  ]);

  const activeConfigurationId = activeConfiguration?.id ?? null;
  const originLabel = selectedOrigin === 'meta4' ? 'Meta 4' : selectedOrigin === 'visma' ? 'Visma' : 'Talana';
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
              title: isVismaHistoricalFlow || isTalanaHistoricalFlow || isHistoricalConceptsFlow ? 'Preparando libro histórico' : 'Preparando conceptos históricos',
              detail: isVismaHistoricalFlow
                ? 'Estamos armando el CSV de Liquidaciones Detalle y validando sus filas antes de descargar.'
                : isTalanaHistoricalFlow
                  ? 'Estamos armando el libro histórico de BUK y validando sus pestañas antes de descargar.'
                  : 'Estamos armando el Excel de Liquidaciones en Detalle y validando sus filas antes de descargar.',
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
        const nextDownload = createPreparedDownload(workbook, getRexDownloadFilename(sourceFile));

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
  }, [rexTemplateResource, result, sourceFile, step]);

  useEffect(
    () => () => {
      revokePreparedDownload(preparedRexDownload);
    },
    [preparedRexDownload],
  );

  const uploadActions = createAppUploadActions({
    STEPS,
    authUser,
    isHistoricalConceptsFlow,
    isTalanaHistoricalFlow,
    isVismaHistoricalFlow,
    isVismaMastersFlow,
    selectedOrigin,
    sourceFile,
    vismaCatalogScope,
    vismaCatalogScopeLabel,
    setConceptsResource,
    setGlobalError,
    setHistoricalBatchState,
    setHistoricalEmployeeCatalog,
    setHistoricalEmployeeMasterFile,
    setHistoricalEmployeeMasterValidation,
    setIsLoadingVismaCatalog,
    setIsReadingFile,
    setIsReadingHistoricalEmployeeMaster,
    setIsReadingVismaCatalog,
    setIsReadingVismaTemplate,
    setIsUpdatingConceptCatalog,
    setMappingCompany,
    setResult,
    setRexCompanyMasterResource,
    setSelectedDestination,
    setSelectedModule,
    setSelectedOrigin,
    setSessionId,
    setSourceFile,
    setStep,
    setValidation,
    setVismaCatalogScope,
    setVismaHistoricalCatalog,
    setVismaHistoricalCatalogFileName,
    setVismaHistoricalCatalogValidation,
    setVismaHistoricalEmployeeCatalog,
    setVismaEmployeeMasterFileName,
    setVismaEmployeeMasterValidation,
    setIsReadingVismaEmployeeMaster,
    setVismaSourceEmployeeMaster,
    setVismaSourceEmployeeMasterFileName,
    setVismaSourceEmployeeMasterValidation,
    setIsReadingVismaSourceEmployeeMaster,
    setVismaHistoricalTemplateFileName,
    setVismaHistoricalTemplateResource,
    setVismaHistoricalTemplateValidation,
    setVismaTemplateCompanyId,
  });

  const resultActions = createAppResultActions({
    STEPS,
    baseRexTemplateResource,
    colaboradoresFieldDefinitions,
    colaboradoresTemplateResource,
    exportState,
    isBukFlow,
    isPreparingRexDownload,
    isRexFlow,
    isSupportedPair,
    isVismaEmployeesFlow,
    parameters,
    preparedRexDownload,
    result,
    rexCompanyMasterResource,
    rexTemplateResource,
    sourceFile,
    step,
    trabajosTemplateResource,
    setExportState,
    setGlobalError,
    setIsTransforming,
    setResult,
    setRexCompanyMasterResource,
    setSessionId,
    setSourceFile,
    setStep,
    setValidation,
  });

  const configurationActions = createAppConfigurationActions({
    STEPS,
    activeConfiguration,
    authUser,
    configurations,
    isBukFlow,
    mappingCompany,
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
    setVismaSourceEmployeeMaster,
    setVismaSourceEmployeeMasterFileName,
    setVismaSourceEmployeeMasterValidation,
  });

  useEffect(() => {
    persistConfigurations(configurations);
  }, [configurations]);

  return (
    <AppFlowContent
      app={{
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
        vismaSourceEmployeeMaster,
        vismaSourceEmployeeMasterFileName,
        vismaSourceEmployeeMasterValidation,
        isReadingVismaSourceEmployeeMaster,
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
        historicalEmployeeCatalog,
        isVismaHistoricalFlow,
        isTalanaHistoricalFlow,
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
        ...uploadActions,
        ...resultActions,
        ...configurationActions,
      }}
    />
  );
}
