import { cleanCell } from '../../../lib/utils.js';
import {
  AFP_NAME_ALIASES,
  BANK_NAME_ALIASES,
  CARGO_NAME_ALIASES,
  CONTRACT_TYPE_ALIASES,
  HEALTH_NAME_ALIASES,
  REX_DEFAULT_PRIMARY_PHONE,
} from './catalogs.js';
import {
  findCatalogMatch,
  findHeuristicCatalogMatch,
  findScoredCatalogMatch,
  findScoredCargoCatalogMatch,
} from './catalogMatching.js';
import { buildPendingItem, isIntentionalBlankCorrection } from './pending.js';
import {
  buildSedeCandidates,
  inferContractTypeId,
  normalizeEmailValue,
  normalizePhone,
} from './contractValues.js';
import {
  normalizeAfpName,
  normalizeBankName,
  normalizeHealthName,
  normalizeLooseText,
  normalizeSedeName,
} from './normalizers.js';

export function resolveCatalogField({
  key,
  label,
  catalogName,
  sourceValue,
  correctionValue,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
  aliases = {},
  normalizer = normalizeLooseText,
  allowBlank = false,
  allowHeuristicMatch = false,
  allowScoredMatch = false,
  allowDirectValue = false,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: directCorrection };

  const candidate = cleanCell(sourceValue);
  if (!candidate) {
    if (allowBlank) return { value: '' };
    pendingItems.push(buildPendingItem({
      key, label, type: 'catalog', catalogName, rowNumber, employeeId, employeeName, sourceValue: '',
    }));
    return { value: '' };
  }

  const catalog = templateResource.catalogs[catalogName] ?? [];
  if (allowDirectValue && catalog.length === 0) return { value: candidate };
  const aliasCandidate = aliases[normalizer(candidate)] ?? candidate;
  const exactMatch = findCatalogMatch({ catalog, candidate: aliasCandidate, normalizer });
  if (exactMatch) return { value: exactMatch.id };

  if (allowHeuristicMatch) {
    const heuristicMatch = findHeuristicCatalogMatch({ catalog, candidate, normalizer });
    if (heuristicMatch) return { value: heuristicMatch.id };
  }

  if (allowScoredMatch) {
    const scoredMatch = findScoredCatalogMatch({ catalog, candidate, normalizer });
    if (scoredMatch) return { value: scoredMatch.id };
  }

  pendingItems.push(buildPendingItem({
    key, label, type: 'catalog', catalogName, rowNumber, employeeId, employeeName, sourceValue: candidate,
  }));
  return { value: '' };
}

export function resolveBankField({
  sourceValue, correctionValue, paymentMethodValue, templateResource, pendingItems, rowNumber, employeeId, employeeName, required,
}) {
  if (!required) return { value: '' };
  if (paymentMethodValue === 'cuentarut') return { value: 'estado' };

  return resolveCatalogField({
    key: 'bank', label: 'Id banco', catalogName: 'Id banco', sourceValue, correctionValue, templateResource,
    pendingItems, rowNumber, employeeId, employeeName, aliases: BANK_NAME_ALIASES, normalizer: normalizeBankName,
    allowHeuristicMatch: true, allowScoredMatch: true,
  });
}

export function resolveContractTypeField({ sourceRow, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: directCorrection };

  const sourceValue = cleanCell(sourceRow['NOMBRE CONTRATO']);
  const inferredContractTypeId = inferContractTypeId({ sourceValue, endDateValue: sourceRow['FEC FIN CONTRATO'] });
  if (inferredContractTypeId) {
    const catalog = templateResource.catalogs['Tipo del contrato'] ?? [];
    const inferredMatch =
      findCatalogMatch({ catalog, candidate: inferredContractTypeId, normalizer: normalizeLooseText }) ||
      findCatalogMatch({
        catalog,
        candidate: inferredContractTypeId === 'I' ? 'Indefinido' : 'Plazo fijo',
        normalizer: normalizeLooseText,
      });
    return { value: inferredMatch?.id ?? inferredContractTypeId };
  }

  return resolveCatalogField({
    key: 'contractType', label: 'Tipo del contrato', catalogName: 'Tipo del contrato', sourceValue,
    correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName,
    aliases: CONTRACT_TYPE_ALIASES, normalizer: normalizeLooseText, allowHeuristicMatch: true,
  });
}

export function resolveCargoField({ sourceRow, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: directCorrection };

  const catalog = templateResource.catalogs.Cargo ?? [];
  const candidateValues = [cleanCell(sourceRow.POSICION), cleanCell(sourceRow['JOB CODE'])]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const candidateValue of candidateValues) {
    const aliasedCandidate = CARGO_NAME_ALIASES[normalizeLooseText(candidateValue)];
    if (!aliasedCandidate) continue;
    const aliasMatch = findCatalogMatch({ catalog, candidate: aliasedCandidate, normalizer: normalizeLooseText });
    if (aliasMatch) return { value: aliasMatch.id };
  }

  for (const candidateValue of candidateValues) {
    const exactMatch = findCatalogMatch({ catalog, candidate: candidateValue, normalizer: normalizeLooseText });
    if (exactMatch) return { value: exactMatch.id };
  }

  for (const candidateValue of candidateValues) {
    const heuristicMatch = findHeuristicCatalogMatch({ catalog, candidate: candidateValue, normalizer: normalizeLooseText });
    if (heuristicMatch) return { value: heuristicMatch.id };
  }

  for (const candidateValue of candidateValues) {
    const scoredMatch = findScoredCargoCatalogMatch({ catalog, candidate: candidateValue });
    if (scoredMatch) return { value: scoredMatch.id };
  }

  for (const candidateValue of candidateValues) {
    const scoredMatch = findScoredCatalogMatch({ catalog, candidate: candidateValue, normalizer: normalizeLooseText });
    if (scoredMatch) return { value: scoredMatch.id };
  }

  pendingItems.push(buildPendingItem({
    key: 'cargo', label: 'Cargo', type: 'catalog', catalogName: 'Cargo', rowNumber, employeeId, employeeName,
    sourceValue: candidateValues.join(' / '),
  }));
  return { value: '' };
}

function inferTerminationCauseId(sourceValue) {
  const normalizedSource = normalizeLooseText(sourceValue);
  if (!normalizedSource) return '';
  if (normalizedSource.includes('mutuo acuerdo') || normalizedSource.startsWith('159 1')) return '159i1';
  if (normalizedSource.includes('renuncia')) return '159i2';
  if (normalizedSource.includes('inciso 2do') || normalizedSource.includes('desahucio')) return '161i2';
  if (normalizedSource.includes('necesidades de la empresa') || normalizedSource.startsWith('161')) return '161i1';
  if (normalizedSource.includes('falta de probidad')) return '160i1a';
  if (normalizedSource.includes('actos omisiones o imprudencias')) return '160i5';
  if (normalizedSource.includes('incumplimiento grave')) return '160i7';
  return '';
}

export function resolveTerminationCauseField({ sourceValue, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: directCorrection };
  const inferredCauseId = inferTerminationCauseId(sourceValue);
  if (inferredCauseId) return { value: inferredCauseId };

  return resolveCatalogField({
    key: 'terminationCause', label: 'Causal de término del contrato', catalogName: 'Causal de término de contrato',
    sourceValue, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName,
    normalizer: normalizeLooseText, allowBlank: true,
  });
}

export function resolveSedeField({
  sourceValue, secondarySourceValue, correctionValue, sourceCompanyValue, resolvedCompanyId, templateResource,
  pendingItems, rowNumber, employeeId, employeeName,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: directCorrection };

  const candidateValues = [cleanCell(sourceValue), cleanCell(secondarySourceValue)].filter(Boolean);
  if (candidateValues.length === 0) {
    pendingItems.push(buildPendingItem({
      key: 'sede', label: 'Id sede donde se desempeña', type: 'catalog', catalogName: 'Id sede donde se desempeña',
      rowNumber, employeeId, employeeName, sourceValue: '',
    }));
    return { value: '' };
  }

  const catalog = templateResource.catalogs['Id sede donde se desempeña'] ?? [];
  const candidateOptions = candidateValues.flatMap((candidate) =>
    buildSedeCandidates({ sourceValue: candidate, sourceCompanyValue, resolvedCompanyId }),
  );

  for (const candidateOption of candidateOptions) {
    const exactMatch = findCatalogMatch({ catalog, candidate: candidateOption, normalizer: normalizeSedeName });
    if (exactMatch) return { value: exactMatch.id };
  }

  for (const candidateOption of candidateOptions) {
    const heuristicMatch = findHeuristicCatalogMatch({ catalog, candidate: candidateOption, normalizer: normalizeSedeName });
    if (heuristicMatch) return { value: heuristicMatch.id };
  }

  pendingItems.push(buildPendingItem({
    key: 'sede', label: 'Id sede donde se desempeña', type: 'catalog', catalogName: 'Id sede donde se desempeña',
    rowNumber, employeeId, employeeName, sourceValue: candidateValues.join(' / '),
  }));
  return { value: '' };
}

export function resolveAfpField({ sourceRow, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName, noCotiza }) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  if (cleanCell(correctionValue)) return { value: cleanCell(correctionValue) };
  if (noCotiza) return { value: 'afp' };

  return resolveCatalogField({
    key: 'afp', label: 'Id AFP', catalogName: 'Id AFP', sourceValue: sourceRow.AFP, correctionValue,
    templateResource, pendingItems, rowNumber, employeeId, employeeName,
    aliases: AFP_NAME_ALIASES, normalizer: normalizeAfpName, allowHeuristicMatch: true,
  });
}

export function resolveHealthField({ sourceRow, correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  return resolveCatalogField({
    key: 'health', label: 'Id institución de salud', catalogName: 'Id institución de salud', sourceValue: sourceRow.ISAPRE,
    correctionValue, templateResource, pendingItems, rowNumber, employeeId, employeeName,
    aliases: HEALTH_NAME_ALIASES, normalizer: normalizeHealthName, allowHeuristicMatch: true,
  });
}

export function resolveFixedProfessionField({ correctionValue, templateResource }) {
  if (isIntentionalBlankCorrection(correctionValue)) return { value: '' };
  const directCorrection = cleanCell(correctionValue);
  if (directCorrection) return { value: directCorrection };

  const professionCatalog = templateResource.catalogs.Profesión ?? [];
  const fixedMatch =
    findCatalogMatch({ catalog: professionCatalog, candidate: 'Sin Definir', normalizer: normalizeLooseText }) ||
    findCatalogMatch({ catalog: professionCatalog, candidate: 'sinDefinir', normalizer: normalizeLooseText });
  return { value: fixedMatch?.id ?? 'sinDefinir' };
}

export function resolvePhone({ key, label, sourceValue, corrections, pendingItems, rowNumber, employeeId, employeeName }) {
  if (key === 'phoneTwo') return '';
  if (isIntentionalBlankCorrection(corrections?.[key])) return key === 'phoneOne' ? REX_DEFAULT_PRIMARY_PHONE : '';
  const directCorrection = cleanCell(corrections?.[key]);
  if (directCorrection) return directCorrection;

  const normalizedPhone = normalizePhone(sourceValue);
  if (normalizedPhone) return normalizedPhone;
  if (key === 'phoneOne') return REX_DEFAULT_PRIMARY_PHONE;

  pendingItems.push(buildPendingItem({
    key, label, type: 'text', rowNumber, employeeId, employeeName, sourceValue: cleanCell(sourceValue),
    bulkDefaultValue: key === 'emails' ? 'sincorreo@gmail.com' : '',
  }));
  return '';
}

export function resolveEmail({ sourceRow, corrections, templateResource, pendingItems, rowNumber, employeeId, employeeName }) {
  if (isIntentionalBlankCorrection(corrections?.emails)) return { email: 'sincorreo@gmail.com' };
  const directCorrection = normalizeEmailValue(corrections?.emails);
  if (directCorrection) return { email: directCorrection };

  const ciMatches = templateResource.emailCatalog.byCi.get(cleanCell(sourceRow.CI)) ?? [];
  const employeeMatches = templateResource.emailCatalog.byEmployeeId.get(cleanCell(sourceRow['ID EMPLEADO'])) ?? [];
  const uniqueMatches = [...new Set([...ciMatches, ...employeeMatches].filter(Boolean))];
  if (uniqueMatches.length === 1) return { email: uniqueMatches[0] };
  if (uniqueMatches.length === 0) return { email: 'sincorreo@gmail.com' };

  pendingItems.push(buildPendingItem({
    key: 'emails', label: 'Correos', type: 'text', rowNumber, employeeId, employeeName,
    sourceValue: uniqueMatches.join(', '), bulkDefaultValue: 'sincorreo@gmail.com',
  }));
  return { email: '' };
}
