import * as XLSX from 'xlsx';
import { sanitizeFilenameSegment, todayStamp } from './utils';

export function triggerWorkbookDownload(workbook, fileName) {
  triggerPreparedDownload(createPreparedDownload(workbook, fileName));
}

export function buildBukErrorsReportWorkbook({ errorRows, sourceRows, sourceFileName }) {
  const sourceRowsByNumber = new Map(
    sourceRows.map((row, index) => [Number(row.__sourceRowNumber) || index + 2, row]),
  );
  const reportRows = errorRows.map(({ section, error }) => {
    const sourceRow = sourceRowsByNumber.get(Number(error.row)) ?? {};
    const rut = firstSourceValue(sourceRow, ['RUT', 'CI', 'Número de Documento', 'Numero de Documento']);
    const employeeName = resolveSourceEmployeeName(sourceRow);
    const originalValue = error.value ?? '';

    return {
      Archivo: sourceFileName || '',
      Sección: section,
      Fila: error.row,
      RUT: rut,
      Empleado: employeeName,
      Campo: error.field || '',
      'Valor original': originalValue,
      Catálogo: error.listName || '',
      Motivo: error.message || 'El valor requiere revisión antes de cargarlo en BUK.',
    };
  });

  const workbook = XLSX.utils.book_new();
  const errorSheet = XLSX.utils.json_to_sheet(reportRows);
  const summaryRows = [
    { Indicador: 'Total de errores', Valor: reportRows.length },
    { Indicador: 'Errores en colaboradores', Valor: reportRows.filter((row) => row.Sección === 'Colaboradores').length },
    { Indicador: 'Errores en trabajos', Valor: reportRows.filter((row) => row.Sección === 'Trabajos').length },
    { Indicador: 'Archivo de origen', Valor: sourceFileName || '' },
  ];

  XLSX.utils.book_append_sheet(workbook, errorSheet, 'Errores');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumen');
  return workbook;
}

export function firstSourceValue(sourceRow, keys) {
  return keys.map((key) => sourceRow[key]).find((value) => String(value ?? '').trim()) ?? '';
}

export function resolveSourceEmployeeName(sourceRow) {
  const directName = firstSourceValue(sourceRow, ['Empleado', 'Nombre completo', 'NOMBRE']);
  if (directName) {
    return directName;
  }

  return [sourceRow['Apellido Paterno'], sourceRow['Apellido Materno'], sourceRow.Nombre]
    .filter((value) => String(value ?? '').trim())
    .join(' ');
}

export function getRexDownloadFilename(sourceFile) {
  const companyName = String(sourceFile?.companyName || '').trim();
  return companyName
    ? `REX_empleados_${sanitizeFilenameSegment(companyName)}_${todayStamp()}.xlsx`
    : `REX_empleados_${todayStamp()}.xlsx`;
}

export function createPreparedDownload(workbook, fileName) {
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

export function triggerPreparedDownload(downloadResource) {
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

export function revokePreparedDownload(downloadResource) {
  if (!downloadResource?.objectUrl) {
    return;
  }

  URL.revokeObjectURL(downloadResource.objectUrl);
}

export function mergeSessionLists(localSessions, remoteSessions) {
  const sessionsById = new Map();

  localSessions.forEach((session) => {
    sessionsById.set(session.id, { ...session, storage: 'local' });
  });

  remoteSessions.forEach((session) => {
    const current = sessionsById.get(session.id);
    sessionsById.set(session.id, {
      ...current,
      ...session,
      storage: current ? 'both' : 'cloud',
    });
  });

  return [...sessionsById.values()].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export function normalizeDestination(destinationId) {
  return destinationId === 'rex' ? 'rex' : 'buk';
}

export function normalizeOrigin(originId) {
  if (originId === 'visma') {
    return 'visma';
  }

  return originId === 'meta4' ? 'meta4' : 'talana';
}

export function normalizeEmployeeId(value) {
  return String(value ?? '').replace(/[.\s]/g, '').toUpperCase();
}

export function parseSourceWorkbook(arrayBuffer, originId, password = '') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/sourceParser.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      worker.terminate();

      if (event.data?.ok) {
        resolve(event.data);
        return;
      }

      const error = new Error(event.data?.error || 'No se pudo leer el archivo.');
      error.code = event.data?.code || '';
      reject(error);
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error('No se pudo procesar el archivo en segundo plano.'));
    };

    worker.postMessage({ arrayBuffer, originId, password }, [arrayBuffer]);
  });
}

export function waitForUiToPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

export function buildValidationMessage({ originId, parsedSource }) {
  if (parsedSource.formatIssues?.length > 0) {
    return `Formato no compatible para ${parsedSource.formatName ?? 'el flujo seleccionado'}: ${parsedSource.formatIssues.join(' ')}`;
  }

  if (parsedSource.missingColumns.length > 0) {
    return originId === 'meta4' || originId === 'meta4-historico'
      ? 'El archivo no cumple con las columnas mínimas para Meta 4.'
      : originId === 'visma-historico'
        ? 'El archivo no cumple con las columnas mínimas para Visma.'
        : originId === 'talana-historico'
          ? 'El archivo no cumple con las columnas mínimas para un libro histórico de Talana.'
        : 'El archivo no cumple con las columnas mínimas para Talana.';
  }

  return `Archivo listo. Se detectaron ${parsedSource.rows.length} filas en la hoja ${parsedSource.workbookName}.`;
}
