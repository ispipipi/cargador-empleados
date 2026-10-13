import { startTransition } from 'react';
import { flushSync } from 'react-dom';
import * as XLSX from 'xlsx';
import { buildInitialRexTransformation, buildRexRow, summarizeRexRows } from '../connectors/destinations/rex_empleados';
import { buildBukTrabajosSupportSheets, transformBukTrabajosRows } from '../connectors/destinations/buk_trabajos';
import { transformWorkbookRows } from '../engine/transformer';
import {
  buildBukColaboradoresExportWorkbook,
  buildBukTrabajosExportWorkbook,
  buildRexExportWorkbook,
  applyRexCompanyMasterResource,
} from './template';
import {
  buildBukErrorsReportWorkbook,
  getRexDownloadFilename,
  triggerPreparedDownload,
  triggerWorkbookDownload,
  waitForUiToPaint,
} from './appHelpers';
import { createSessionId } from './sessionPersistence';
import { todayStamp } from './utils';

export function createAppResultActions(context) {
  const {
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
  } = context;

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
              alerts: trabajosTransformation.allAlerts,
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

  const handleVismaEmployeesReady = (nextSourceFile, nextValidation, nextCompanyMasterResource) => {
    if (!nextSourceFile?.rows?.length || !rexTemplateResource || !nextCompanyMasterResource) {
      setGlobalError('Carga el maestro REX+ para generar el archivo final.');
      return;
    }

    try {
      const nextRexTemplateResource = applyRexCompanyMasterResource(
        baseRexTemplateResource,
        nextCompanyMasterResource,
      );
      const rexTransformation = buildInitialRexTransformation({
        sourceRows: nextSourceFile.rows,
        templateResource: nextRexTemplateResource,
      });

      setRexCompanyMasterResource(nextCompanyMasterResource);
      setSessionId(createSessionId());
      setSourceFile(nextSourceFile);
      setValidation(nextValidation);
      setResult({
        kind: 'rex',
        rowStates: rexTransformation.rowStates,
        correctionsByRow: {},
        summary: rexTransformation.summary,
        generatedAt: todayStamp(),
      });
      setGlobalError('');
      setStep(rexTransformation.summary.pendingCount > 0 ? STEPS.review : STEPS.result);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'No se pudo transformar la respuesta VISMA.');
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

  const handleDownloadBukErrors = () => {
    if (!result || result.kind !== 'buk' || !sourceFile?.rows?.length) {
      return;
    }

    const errorRows = [
      ...result.colaboradores.errors.map((error) => ({ section: 'Colaboradores', error })),
      ...result.trabajos.errors.map((error) => ({ section: 'Trabajos', error })),
    ];

    if (errorRows.length === 0) {
      return;
    }

    downloadWorkbookWithFeedback({
      title: 'Preparando reporte de errores',
      detail: 'Estamos consolidando los errores de colaboradores y trabajos para que puedas corregirlos.',
      fileName: `BUK_errores_${todayStamp()}.xlsx`,
      buildWorkbook: () => buildBukErrorsReportWorkbook({ errorRows, sourceRows: sourceFile.rows, sourceFileName: sourceFile.fileName }),
    });
  };

  const handleDownloadRex = () => {
    if (!result || !rexTemplateResource || result.kind !== 'rex') {
      return;
    }

    if (isVismaEmployeesFlow && !rexCompanyMasterResource) {
      setGlobalError('Para descargar empleados VISMA debes cargar el maestro REX+.');
      return;
    }

    if (step === STEPS.result && preparedRexDownload) {
      triggerPreparedDownload(preparedRexDownload);
      return;
    }

    if (isPreparingRexDownload) {
      return;
    }

    downloadWorkbookWithFeedback({
      title: 'Preparando REX+ Empleados',
      detail: 'Estamos construyendo el Excel final de REX+ y activando la descarga en tu navegador.',
      fileName: getRexDownloadFilename(sourceFile),
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
  return {
    handleTransform,
    handleVismaEmployeesReady,
    handleDownloadColaboradores,
    handleDownloadTrabajos,
    handleDownloadBukErrors,
    handleDownloadRex,
    handleDownloadRexPendingReport,
    handleUpdateRexCorrection,
    handleBulkApplyRexCorrection,
  };
}
