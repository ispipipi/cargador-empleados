import {
  buildValidationMessage,
  normalizeEmployeeId,
  parseSourceWorkbook,
  waitForUiToPaint,
} from './appHelpers';
import { parseConceptCatalogWorkbook, parseEmployeeMasterWorkbook } from './concepts';
import { getMeta4MissingColumns } from '../connectors/origins/meta4';
import { parseVismaHistoricalTemplate } from './vismaHistorical';
import { parseVismaHistoricalEmployeeMaster } from './vismaHistoricalEmployeeMaster';
import { parseVismaSourceEmployeeMaster } from './vismaSourceEmployeeMaster';
import { splitVismaHistoricalRows } from './vismaHistoricalRows';
import { saveCloudConceptCatalog, saveCloudVismaConceptCatalog } from './cloudMemory';
import {
  createSessionId,
  loadVismaConceptCatalogMemory,
  saveConceptCatalogMemory,
  saveVismaConceptCatalogMemory,
} from './sessionPersistence';
import { todayStamp } from './utils';

export function createAppUploadActions(context) {
  const {
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
  } = context;

  const handleFileSelected = async (file, password = '') => {
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
    setHistoricalBatchState({ completedEmployeeIds: [] });
    setIsReadingFile(true);

    try {
      await waitForUiToPaint();
      const arrayBuffer = await file.arrayBuffer();
      const parserOrigin = isVismaHistoricalFlow
        ? 'visma-historico'
        : isTalanaHistoricalFlow
          ? 'talana-historico'
          : isHistoricalConceptsFlow
            ? 'meta4-historico'
            : selectedOrigin;
      const parsedSource = await parseSourceWorkbook(arrayBuffer, parserOrigin, password);
      const validationMessage = buildValidationMessage({
        originId: parserOrigin,
        parsedSource,
      });
      const nextSourceFile = {
        fileName: file.name,
        workbookName: parsedSource.workbookName,
        headers: parsedSource.headers,
        rows: parsedSource.rows,
        previewRows: parsedSource.previewRows,
        period: parsedSource.period,
      };
      const nextValidation = {
        isValid: parsedSource.missingColumns.length === 0 && (parsedSource.formatIssues ?? []).length === 0 && parsedSource.rows.length > 0,
        missingColumns: parsedSource.missingColumns,
        formatIssues: parsedSource.formatIssues ?? [],
        formatName: parsedSource.formatName,
        message: validationMessage,
      };
      const nextSessionId = createSessionId();

      setSessionId(nextSessionId);
      setSourceFile(nextSourceFile);
      setValidation(nextValidation);
    } catch (error) {
      setSourceFile(null);
      setValidation({
        isValid: false,
        missingColumns: [],
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No se pudo leer el archivo: ${error.message}`,
      });
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleMonthlyBookSelected = async (file, password = '') => {
    if (!file) {
      return;
    }

    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setGlobalError('El libro mensual debe ser .xls o .xlsx.');
      return;
    }

    setGlobalError('');
    setSourceFile(null);
    setValidation(null);
    setHistoricalBatchState({ completedEmployeeIds: [] });
    setIsReadingFile(true);

    try {
      await waitForUiToPaint();
      const parsedSource = await parseSourceWorkbook(await file.arrayBuffer(), 'meta4-historico', password);

      if (parsedSource.missingColumns.length > 0 || (parsedSource.formatIssues ?? []).length > 0 || parsedSource.rows.length === 0) {
        throw new Error(
          parsedSource.missingColumns.length > 0 || (parsedSource.formatIssues ?? []).length > 0
            ? [...parsedSource.missingColumns.map((column) => `Falta la columna ${column}.`), ...(parsedSource.formatIssues ?? [])].join(' ')
            : 'El libro mensual no contiene filas de remuneraciones.',
        );
      }

      const nextSourceFile = {
        fileName: file.name,
        workbookName: parsedSource.workbookName,
        headers: parsedSource.headers,
        rows: parsedSource.rows,
        previewRows: parsedSource.previewRows,
        period: parsedSource.period,
      };

      setSessionId(createSessionId());
      setSourceFile(nextSourceFile);
      setHistoricalBatchState({ completedEmployeeIds: [] });
      setValidation({
        isValid: true,
        missingColumns: [],
        message: `Libro mensual listo. Se detectaron ${parsedSource.rows.length} colaboradores.`,
      });
      setStep(STEPS.historicalReview);
    } catch (error) {
      setSourceFile(null);
      setGlobalError(error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
        ? error.message
        : `No se pudo leer el libro mensual: ${error.message}`);
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleHistoricalEmployeeMasterSelected = async (file, password = '') => {
    if (!file) {
      return;
    }

    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setHistoricalEmployeeMasterValidation({ isValid: false, message: 'El maestro debe ser .xls o .xlsx.' });
      return;
    }

    setHistoricalEmployeeMasterFile(file);
    setHistoricalEmployeeCatalog(null);
    setHistoricalEmployeeMasterValidation(null);
    setIsReadingHistoricalEmployeeMaster(true);

    try {
      const employeeCatalog = await parseEmployeeMasterWorkbook(await file.arrayBuffer(), password);
      setHistoricalEmployeeCatalog(employeeCatalog);
      setHistoricalEmployeeMasterValidation({
        isValid: true,
        message: `Maestro listo. Se encontraron ${employeeCatalog.length.toLocaleString('es-CL')} trabajadores para comparar.`,
      });
    } catch (error) {
      setHistoricalEmployeeCatalog(null);
      setHistoricalEmployeeMasterValidation({
        isValid: false,
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No se pudo leer el maestro: ${error.message}`,
      });
    } finally {
      setIsReadingHistoricalEmployeeMaster(false);
    }
  };

  const handleConceptCatalogUpdated = async (concepts) => {
    setIsUpdatingConceptCatalog(true);
    saveConceptCatalogMemory(concepts);
    setConceptsResource((current) => (current ? { ...current, concepts } : current));

    try {
      if (authUser) {
        await saveCloudConceptCatalog(authUser, concepts);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'No se pudo guardar el catálogo REX+ en la memoria cloud.');
    } finally {
      setIsUpdatingConceptCatalog(false);
    }
  };

  const handleConceptCatalogFileSelected = async (file, password = '') => {
    if (!file) {
      return;
    }

    setGlobalError('');

    try {
      const concepts = await parseConceptCatalogWorkbook(await file.arrayBuffer(), password);
      await handleConceptCatalogUpdated(concepts);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'No fue posible leer el catálogo REX+.');
    }
  };

  const handleVismaHistoricalCatalogSelected = async (file, password = '') => {
    if (!file) {
      return;
    }

    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setVismaHistoricalCatalogValidation({ isValid: false, message: 'El catálogo debe ser .xls o .xlsx.' });
      return;
    }

    setGlobalError('');
    setVismaHistoricalCatalogValidation(null);
    setIsReadingVismaCatalog(true);
    try {
      const concepts = await parseConceptCatalogWorkbook(await file.arrayBuffer(), password);
      saveVismaConceptCatalogMemory(vismaCatalogScope, concepts);
      setVismaHistoricalCatalog(concepts);
      setVismaHistoricalCatalogFileName(file.name);
      setVismaHistoricalCatalogValidation({
        isValid: true,
        message: `Catálogo válido: ${concepts.length.toLocaleString('es-CL')} conceptos para ${vismaCatalogScopeLabel}.`,
      });
      if (authUser) {
        try {
          await saveCloudVismaConceptCatalog(authUser, vismaCatalogScope, concepts);
        } catch (error) {
          setGlobalError(`El catálogo quedó guardado en este navegador, pero no se pudo sincronizar con la memoria cloud: ${error.message}`);
        }
      }
    } catch (error) {
      setVismaHistoricalCatalogValidation({
        isValid: false,
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No fue posible leer el catálogo REX+: ${error.message}`,
      });
    } finally {
      setIsReadingVismaCatalog(false);
    }
  };

  const handleVismaHistoricalTemplateSelected = async (file, password = '') => {
    if (!file) {
      return;
    }

    setVismaHistoricalTemplateResource(null);
    setVismaTemplateCompanyId('');
    setVismaHistoricalTemplateFileName(file.name);
    setVismaHistoricalTemplateValidation(null);
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setVismaHistoricalTemplateValidation({ isValid: false, message: 'El template debe ser .xls o .xlsx.' });
      return;
    }

    setGlobalError('');
    setIsReadingVismaTemplate(true);
    try {
      const resource = await parseVismaHistoricalTemplate(await file.arrayBuffer(), password);
      setVismaHistoricalTemplateResource(resource);
      setVismaTemplateCompanyId(resource.companies.length === 1 ? resource.companies[0].id : '');
      setVismaHistoricalTemplateValidation({
        isValid: true,
        message: `Template válido: ${resource.conceptCatalog.length.toLocaleString('es-CL')} conceptos base y hojas de referencia cargadas.`,
      });
    } catch (error) {
      setVismaHistoricalTemplateValidation({
        isValid: false,
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No fue posible leer el template: ${error.message}`,
      });
    } finally {
      setIsReadingVismaTemplate(false);
    }
  };

  const handleVismaHistoricalEmployeeMasterSelected = async (file, password = '') => {
    if (!file) return;

    setVismaHistoricalEmployeeCatalog(null);
    setVismaSourceEmployeeMaster(null);
    setVismaSourceEmployeeMasterFileName('');
    setVismaSourceEmployeeMasterValidation(null);
    setVismaEmployeeMasterFileName(file.name);
    setVismaEmployeeMasterValidation(null);
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setVismaEmployeeMasterValidation({ isValid: false, message: 'El maestro debe ser .xls o .xlsx.' });
      return;
    }

    setGlobalError('');
    setIsReadingVismaEmployeeMaster(true);
    try {
      const employees = await parseVismaHistoricalEmployeeMaster(await file.arrayBuffer(), password);
      setVismaHistoricalEmployeeCatalog(employees);
      setVismaEmployeeMasterValidation({
        isValid: true,
        message: `Maestro listo: ${employees.length.toLocaleString('es-CL')} trabajadores con contratoActi.`,
      });
      setHistoricalBatchState({ completedEmployeeIds: [] });
    } catch (error) {
      setVismaEmployeeMasterValidation({
        isValid: false,
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No se pudo leer el maestro de trabajadores: ${error.message}`,
      });
    } finally {
      setIsReadingVismaEmployeeMaster(false);
    }
  };

  const handleVismaSourceEmployeeMasterSelected = async (file, password = '') => {
    if (!file) return;

    setVismaSourceEmployeeMaster(null);
    setVismaSourceEmployeeMasterFileName(file.name);
    setVismaSourceEmployeeMasterValidation(null);
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      setVismaSourceEmployeeMasterValidation({ isValid: false, message: 'El maestro VISMA debe ser .xls o .xlsx.' });
      return;
    }

    setGlobalError('');
    setIsReadingVismaSourceEmployeeMaster(true);
    try {
      const employees = await parseVismaSourceEmployeeMaster(await file.arrayBuffer(), password);
      setVismaSourceEmployeeMaster(employees);
      const uniqueRutCount = new Set(employees.map((employee) => normalizeEmployeeId(employee.id))).size;
      setVismaSourceEmployeeMasterValidation({
        isValid: true,
        message: `Maestro VISMA listo: ${uniqueRutCount.toLocaleString('es-CL')} RUT únicos en ${employees.length.toLocaleString('es-CL')} filas.`,
      });
    } catch (error) {
      setVismaSourceEmployeeMasterValidation({
        isValid: false,
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No se pudo leer el maestro VISMA: ${error.message}`,
      });
    } finally {
      setIsReadingVismaSourceEmployeeMaster(false);
    }
  };

  const handleVismaHistoricalBooksSelected = async (files, password = '') => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;

    if (selectedFiles.some((file) => !/\.(xls|xlsx)$/i.test(file.name))) {
      setValidation({ isValid: false, missingColumns: [], formatIssues: [], message: 'Los libros Visma deben ser .xls o .xlsx.' });
      return;
    }

    setGlobalError('');
    setSourceFile(null);
    setValidation(null);
    setVismaSourceEmployeeMaster(null);
    setVismaSourceEmployeeMasterFileName('');
    setVismaSourceEmployeeMasterValidation(null);
    setHistoricalBatchState({ completedEmployeeIds: [] });
    setIsReadingFile(true);

    try {
      await waitForUiToPaint();
      const books = [];
      for (const file of selectedFiles) {
        const parsedSource = await parseSourceWorkbook(await file.arrayBuffer(), 'visma-historico', password);
        if (parsedSource.missingColumns.length || parsedSource.formatIssues?.length || !parsedSource.rows.length) {
          const issues = [
            ...parsedSource.missingColumns.map((column) => `Falta la columna ${column}.`),
            ...(parsedSource.formatIssues ?? []),
          ];
          throw new Error(`${file.name}: ${issues.join(' ') || 'no contiene filas de trabajadores.'}`);
        }
        books.push({ file, parsedSource });
      }

      const periods = new Set(books.map(({ parsedSource }) => parsedSource.period).filter(Boolean));
      if (periods.size !== 1 || books.some(({ parsedSource }) => !parsedSource.period)) {
        throw new Error('Selecciona libros del mismo período; no se pudo confirmar el período de todos los archivos.');
      }

      const baseHeaders = books[0].parsedSource.headers;
      if (books.some(({ parsedSource }) => JSON.stringify(parsedSource.headers) !== JSON.stringify(baseHeaders))) {
        throw new Error('Los libros seleccionados no tienen las mismas columnas y orden.');
      }

      const rows = books.flatMap(({ file, parsedSource }) => parsedSource.rows.map((row) => ({
        ...row,
        __sourceFileName: file.name,
      })));
      const { monthlyRows, finiquitoRows } = splitVismaHistoricalRows(rows);
      const employeeIds = monthlyRows.map((row) => normalizeHistoricalRut(row.RUT)).filter(Boolean);
      const duplicates = employeeIds.length - new Set(employeeIds).size;
      if (duplicates > 0) {
        throw new Error(`Hay ${duplicates.toLocaleString('es-CL')} RUT repetidos entre las filas mensuales. Corrige la selección para evitar duplicar montos.`);
      }

      const fileNames = books.map(({ file }) => file.name);
      const period = [...periods][0];
      const uploadId = createSessionId();
      setSessionId(uploadId);
      setSourceFile({
        uploadId,
        fileName: fileNames.join(' + '),
        fileNames,
        workbookName: books.map(({ parsedSource }) => parsedSource.workbookName).join(' + '),
        headers: baseHeaders,
        rows,
        previewRows: rows.slice(0, 3),
        period,
      });
      setValidation({
        isValid: true,
        missingColumns: [],
        formatIssues: [],
        message: `${books.length} libro(s) listos para ${period}. ${new Set(employeeIds).size.toLocaleString('es-CL')} trabajadores mensuales; ${finiquitoRows.length.toLocaleString('es-CL')} filas con fecha de baja se descargarán aparte como finiquitos.`,
      });
    } catch (error) {
      setSourceFile(null);
      setValidation({
        isValid: false,
        missingColumns: [],
        formatIssues: [],
        requiresPassword: error.code === 'PASSWORD_REQUIRED',
        invalidPassword: error.code === 'INVALID_PASSWORD',
        message: error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD'
          ? error.message
          : `No se pudieron combinar los libros: ${error.message}`,
      });
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleVismaCatalogScopeChange = (scope) => {
    const localCatalog = loadVismaConceptCatalogMemory(scope);
    setVismaCatalogScope(scope);
    setVismaSourceEmployeeMaster(null);
    setVismaSourceEmployeeMasterFileName('');
    setVismaSourceEmployeeMasterValidation(null);
    setGlobalError('');
    setVismaHistoricalCatalog(localCatalog);
    setVismaHistoricalCatalogFileName('');
    setVismaHistoricalCatalogValidation(localCatalog?.length
      ? { isValid: true, message: `Catálogo local listo: ${localCatalog.length.toLocaleString('es-CL')} conceptos.` }
      : null);
    setIsLoadingVismaCatalog(Boolean(authUser));
  };

  const handleModuleChange = (moduleId) => {
    setSelectedModule(moduleId);

    if (moduleId !== 'visma-empleados') {
      setRexCompanyMasterResource(null);
    }

    if (moduleId === 'visma-empleados') {
      setSelectedOrigin('visma');
      setSelectedDestination('rex');
      setStep(STEPS.vismaEmployeesReview);
      return;
    }

    if (moduleId === 'visma-maestros') {
      setSelectedOrigin('visma');
      setSelectedDestination('rex');
      setStep(STEPS.vismaMastersReview);
      return;
    }

    if (moduleId === 'conceptos' || moduleId === 'conceptos-historicos') {
      setSelectedOrigin('meta4');
      setSelectedDestination('rex');
      if (moduleId === 'conceptos-historicos') {
        setHistoricalEmployeeCatalog(null);
        setHistoricalEmployeeMasterFile(null);
        setHistoricalEmployeeMasterValidation(null);
      }
      return;
    }

    if (moduleId === 'libros-historicos') {
      setSelectedOrigin('visma');
      setSelectedDestination('rex');
      setMappingCompany('');
      setSourceFile(null);
      setValidation(null);
      setVismaSourceEmployeeMaster(null);
      setVismaSourceEmployeeMasterFileName('');
      setVismaSourceEmployeeMasterValidation(null);
      setVismaHistoricalTemplateResource(null);
      setVismaTemplateCompanyId('');
      setVismaHistoricalTemplateFileName('');
      setVismaHistoricalTemplateValidation(null);
      setGlobalError('');
      setStep(STEPS.upload);
      return;
    }

    if (moduleId === 'talana-libros-historicos') {
      setSelectedOrigin('talana');
      setSelectedDestination('buk');
      setMappingCompany('SOSER');
      setStep(STEPS.upload);
    }

  };

  const handleVismaNavigation = (moduleId) => {
    setSelectedModule(moduleId);
    setSelectedOrigin('visma');
    setSelectedDestination('rex');
    setGlobalError('');
    setStep(moduleId === 'visma-maestros' ? STEPS.vismaMastersReview : STEPS.vismaEmployeesReview);
  };

  const handleVismaContextChange = () => {
    setRexCompanyMasterResource(null);
    setSourceFile(null);
    setValidation(null);
    setResult(null);
    setSessionId(null);
    setHistoricalEmployeeCatalog(null);
    setHistoricalEmployeeMasterFile(null);
    setHistoricalEmployeeMasterValidation(null);
    setGlobalError('');
    setStep(isVismaMastersFlow ? STEPS.vismaMastersReview : STEPS.vismaEmployeesReview);
  };

  const handleOpenOtherFlows = () => {
    setSelectedModule('empleados');
    setSelectedOrigin('talana');
    setSelectedDestination('buk');
    setRexCompanyMasterResource(null);
    setHistoricalEmployeeCatalog(null);
    setHistoricalEmployeeMasterFile(null);
    setHistoricalEmployeeMasterValidation(null);
    setStep(STEPS.format);
    setGlobalError('');
  };

  const handleOpenMissingMeta4Employees = (missingEmployees) => {
    if (!sourceFile?.rows?.length || !missingEmployees?.length) {
      return;
    }

    const missingIds = new Set(
      missingEmployees
        .map((employee) => normalizeEmployeeId(employee.id))
        .filter(Boolean),
    );
    const missingRows = sourceFile.rows.filter((row) => missingIds.has(
      normalizeEmployeeId(row.CI || row['ID EMPLEADO']),
    ));

    if (!missingRows.length) {
      setGlobalError('No se pudieron recuperar las filas de los trabajadores faltantes desde el libro cargado.');
      return;
    }

    const missingColumns = getMeta4MissingColumns(sourceFile.headers ?? []);
    const preparedFileName = `Meta4_empleados_pendientes_${todayStamp()}.xlsx`;

    setSelectedModule('empleados');
    setSelectedOrigin('meta4');
    setSelectedDestination('rex');
    setRexCompanyMasterResource(null);
    setResult(null);
    setHistoricalBatchState({ completedEmployeeIds: [] });
    setSessionId(createSessionId());
    setSourceFile({
      ...sourceFile,
      fileName: preparedFileName,
      rows: missingRows,
      previewRows: missingRows.slice(0, 3),
      preparedFromHistoricalMissingEmployees: true,
      originalFileName: sourceFile.fileName,
    });
    setValidation({
      isValid: missingColumns.length === 0,
      missingColumns,
      formatIssues: [],
      message: `Se prepararon ${missingRows.length.toLocaleString('es-CL')} trabajadores faltantes desde ${sourceFile.fileName}. Revisa los datos y continúa al wizard de empleados.`,
    });
    setGlobalError('');
    setStep(STEPS.upload);
  };
  return {
    handleFileSelected,
    handleMonthlyBookSelected,
    handleHistoricalEmployeeMasterSelected,
    handleConceptCatalogUpdated,
    handleConceptCatalogFileSelected,
    handleVismaHistoricalCatalogSelected,
    handleVismaHistoricalTemplateSelected,
    handleVismaHistoricalEmployeeMasterSelected,
    handleVismaSourceEmployeeMasterSelected,
    handleVismaHistoricalBooksSelected,
    handleVismaCatalogScopeChange,
    handleModuleChange,
    handleVismaNavigation,
    handleVismaContextChange,
    handleOpenOtherFlows,
    handleOpenMissingMeta4Employees,
  };
}

function normalizeHistoricalRut(value) {
  return String(value ?? '').replace(/[.\s-]/g, '').toUpperCase();
}
