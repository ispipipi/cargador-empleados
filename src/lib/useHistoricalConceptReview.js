import { useEffect, useMemo, useState } from 'react';
import {
  buildHistoricalReconciliation,
  validateHistoricalEmployees,
  validateHistoricalRexLiquidationRows,
} from './historicalConcepts.js';
import { findHistoricalNegativeDiscounts } from './historicalConcepts/negativeDiscounts.js';
import { applyStoredHistoricalMapping, rememberConceptMappings } from './sessionPersistence.js';
import { canIncludeInHistoricalOutput } from '../components/HistoricalConceptsMapperParts.jsx';

const EMPTY_NEGATIVE_REVIEW = { details: [], employeeIds: [], employeeCount: 0, negativeRowCount: 0 };
const EMPTY_EMPLOYEE_VALIDATION = { total: 0, matched: 0, missing: [], excludedCount: 0, negativeDiscountExcludedRows: 0 };
const EMPTY_RECONCILIATION = {
  rows: [],
  source: { status: 'unavailable', totalRows: 0, rowsWithTotals: 0, incompleteRows: 0, differenceRows: 0, differenceTotal: 0, maxDifference: 0 },
  coverage: { differenceRows: 0, differenceTotal: 0, includedHaberes: 0, includedDescuentos: 0, includedLiquido: 0 },
};
const EMPTY_REX_VALIDATION = { valid: true, rowCount: 0, issues: [] };

function historicalExportKey(decisions) {
  return JSON.stringify(decisions.map((decision) => [
    decision.id,
    decision.targetId,
    decision.approved,
    decision.excluded,
    decision.sourceSection,
    decision.type,
    decision.targetConcept?.type,
    decision.sourceKey,
  ]));
}

export default function useHistoricalConceptReview({
  concepts,
  conceptsResource,
  fullConcepts,
  employeeCatalog,
  isFinningCatalog,
  mappingScope,
  sourceFile,
  exportSelectedIds,
  setExportSelectedIds,
  setExportGroup,
  isPreparing,
  onBusyChange,
}) {
  const [model, setModel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [isBuilding, setIsBuilding] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [buildAttempt, setBuildAttempt] = useState(0);
  const [historicalAnalysis, setHistoricalAnalysis] = useState(null);

  useEffect(() => {
    let active = true;
    let worker;
    const terminateWorker = () => {
      worker?.terminate();
      worker = null;
    };
    setIsBuilding(true);
    setIsValidating(false);
    setBuildError('');
    setHistoricalAnalysis(null);
    onBusyChange?.(true);

    const handleModel = (nextModel) => {
      const storedDecisions = nextModel.decisions.map((decision) => {
        if (decision.excluded) return decision;
        const stored = applyStoredHistoricalMapping(
          'historical-concepts',
          decision,
          { concepts: nextModel.catalog, scope: mappingScope, strictCatalog: true },
        );
        return stored.excluded ? decision : stored;
      });
      if (!active) return;

      const selectedIds = storedDecisions.filter(canIncludeInHistoricalOutput).map((decision) => decision.id);
      setModel(nextModel);
      setDecisions(storedDecisions);
      setExportGroup('all');
      setExportSelectedIds(selectedIds);
      setIsValidating(true);
      worker.postMessage({
        type: 'validate',
        decisions: storedDecisions,
        selectedExportDecisionIds: selectedIds,
        employeeCatalog,
        mappingScope,
        period: sourceFile.period,
        isFinningCatalog,
        exportKey: historicalExportKey(storedDecisions.filter((decision) => selectedIds.includes(decision.id))),
      });
    };

    try {
      worker = new Worker(new URL('../workers/historicalConcepts.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!active) return;
        if (!data?.ok) {
          terminateWorker();
          setBuildError(data?.error || 'No se pudo analizar el libro histórico.');
          setIsValidating(false);
          setIsBuilding(false);
          onBusyChange?.(false);
        } else if (data.type === 'model') {
          try {
            handleModel(data.model);
          } catch (error) {
            terminateWorker();
            setBuildError(error instanceof Error ? error.message : 'No se pudo preparar el análisis histórico.');
            setIsValidating(false);
            setIsBuilding(false);
            onBusyChange?.(false);
          }
        } else if (data.type === 'analysis') {
          terminateWorker();
          setHistoricalAnalysis(data.analysis);
          setIsValidating(false);
          setIsBuilding(false);
          onBusyChange?.(false);
        } else {
          terminateWorker();
          setBuildError('El análisis terminó con una respuesta inesperada. Reintenta el proceso.');
          setIsValidating(false);
          setIsBuilding(false);
          onBusyChange?.(false);
        }
      };
      worker.onerror = () => {
        if (!active) return;
        terminateWorker();
        setBuildError('El navegador interrumpió el análisis en segundo plano. Reintenta; tus archivos siguen en esta sesión.');
        setIsValidating(false);
        setIsBuilding(false);
        onBusyChange?.(false);
      };
      worker.postMessage({
        type: 'build',
        sourceRows: sourceFile.rows,
        sourceHeaders: sourceFile.headers,
        concepts: fullConcepts,
        historicalConcepts: concepts,
        mappingRows: conceptsResource?.mappingRows ?? [],
        mappingScope,
      });
    } catch (error) {
      terminateWorker();
      setBuildError(error instanceof Error ? error.message : 'No se pudo iniciar el análisis en segundo plano.');
      setIsValidating(false);
      setIsBuilding(false);
      onBusyChange?.(false);
    }

    return () => {
      active = false;
      terminateWorker();
      onBusyChange?.(false);
    };
  }, [buildAttempt, concepts, conceptsResource, employeeCatalog, fullConcepts, isFinningCatalog, mappingScope, onBusyChange, setExportGroup, setExportSelectedIds, sourceFile]);

  useEffect(() => {
    onBusyChange?.(isBuilding || isPreparing);
  }, [isBuilding, isPreparing, onBusyChange]);

  useEffect(() => {
    rememberConceptMappings('historical-concepts', decisions, mappingScope);
  }, [decisions, mappingScope]);

  const retryBuild = () => {
    setModel(null);
    setDecisions([]);
    setBuildAttempt((attempt) => attempt + 1);
  };
  const selectedExportDecisions = useMemo(
    () => decisions.filter((decision) => exportSelectedIds.includes(decision.id)),
    [decisions, exportSelectedIds],
  );
  const analysisMatches = historicalAnalysis?.exportKey === historicalExportKey(selectedExportDecisions);
  const negativeDiscountReview = useMemo(
    () => historicalAnalysis?.negativeDiscountReview ?? (!model || isBuilding
      ? EMPTY_NEGATIVE_REVIEW
      : isFinningCatalog ? findHistoricalNegativeDiscounts({ sourceRows: sourceFile.rows, decisions }) : EMPTY_NEGATIVE_REVIEW),
    [decisions, historicalAnalysis, isBuilding, isFinningCatalog, model, sourceFile.rows],
  );
  const employeeValidation = useMemo(
    () => historicalAnalysis?.employeeValidation ?? (model && !isBuilding
      ? validateHistoricalEmployees(sourceFile.rows, employeeCatalog, mappingScope, negativeDiscountReview.employeeIds)
      : EMPTY_EMPLOYEE_VALIDATION),
    [employeeCatalog, historicalAnalysis, isBuilding, mappingScope, model, negativeDiscountReview.employeeIds, sourceFile.rows],
  );
  const reconciliation = useMemo(
    () => analysisMatches
      ? historicalAnalysis.reconciliation
      : model && !isBuilding ? buildHistoricalReconciliation({
        sourceRows: sourceFile.rows,
        sourceHeaders: sourceFile.headers,
        decisions: selectedExportDecisions,
        employeeCatalog,
        mappingScope,
        additionalExcludedEmployeeIds: negativeDiscountReview.employeeIds,
      }) : EMPTY_RECONCILIATION,
    [analysisMatches, employeeCatalog, historicalAnalysis, isBuilding, mappingScope, model, negativeDiscountReview.employeeIds, selectedExportDecisions, sourceFile.headers, sourceFile.rows],
  );
  const rexValidation = useMemo(
    () => analysisMatches
      ? historicalAnalysis.rexValidation
      : model && !isBuilding ? validateHistoricalRexLiquidationRows({
        sourceRows: sourceFile.rows,
        decisions: selectedExportDecisions,
        employeeCatalog,
        mappingScope,
        period: sourceFile.period,
        excludedEmployeeIds: negativeDiscountReview.employeeIds,
      }) : EMPTY_REX_VALIDATION,
    [analysisMatches, employeeCatalog, historicalAnalysis, isBuilding, mappingScope, model, negativeDiscountReview.employeeIds, selectedExportDecisions, sourceFile.period, sourceFile.rows],
  );

  return {
    model,
    decisions,
    setDecisions,
    isBuilding,
    isValidating,
    buildError,
    retryBuild,
    negativeDiscountReview,
    employeeValidation,
    selectedExportDecisions,
    reconciliation,
    rexValidation,
  };
}
