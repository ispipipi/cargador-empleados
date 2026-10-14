import { cleanCell } from '../../../lib/utils.js';
import {
  findCatalogMatch,
  findHeuristicCatalogMatch,
  findScoredCatalogMatch,
  getCatalogItemName,
} from './catalogMatching.js';
import { buildPendingContext, buildPendingItem, isIntentionalBlankCorrection } from './pending.js';
import {
  buildComunaCandidates,
  findAddressComunaMatch,
  hasPendingItem,
  inferComunaFromLocation,
  inferStreetNameFallback,
  inferStreetNumberFallback,
  isValidCityId,
  isValidComunaId,
  isValidRegionId,
  parseAddress,
  resolveCityIdForRegion,
  sanitizeStreetSegment,
} from './geography.js';
import { normalizeLooseText } from './normalizers.js';

export function resolveAddress({ sourceValue, corrections }) {
  const shouldKeepStreetNameBlank = isIntentionalBlankCorrection(corrections?.streetName);
  const shouldKeepStreetNumberBlank = isIntentionalBlankCorrection(corrections?.streetNumber);
  const parsedAddress = parseAddress(sourceValue);
  const streetNameCorrection = shouldKeepStreetNameBlank ? '' : cleanCell(corrections?.streetName);
  const streetNumberCorrection = shouldKeepStreetNumberBlank ? '' : cleanCell(corrections?.streetNumber);
  const resolvedStreetName = streetNameCorrection || parsedAddress.streetName;
  const resolvedStreetNumber = streetNumberCorrection || parsedAddress.streetNumber || inferStreetNumberFallback(sourceValue);
  const sanitizedDepartment = sanitizeStreetSegment(parsedAddress.department);
  const normalizedStreetName = normalizeLooseText(resolvedStreetName);
  const shouldPromoteDepartmentToStreet =
    (!resolvedStreetName || normalizedStreetName.startsWith('depa') || normalizedStreetName.startsWith('casa')) &&
    /^[\p{L}\s]+$/u.test(sanitizedDepartment);
  const resolvedSanitizedStreetName = shouldPromoteDepartmentToStreet
    ? sanitizedDepartment
    : sanitizeStreetSegment(resolvedStreetName);
  const fallbackStreetName =
    resolvedSanitizedStreetName || sanitizeStreetSegment(inferStreetNameFallback(sourceValue)) || 'XXX';

  return {
    streetName: fallbackStreetName,
    streetNumber: resolvedStreetNumber,
    department: shouldPromoteDepartmentToStreet ? '' : sanitizedDepartment,
  };
}

export function resolveComuna({
  sourceValue,
  locationValue,
  secondaryLocationValue,
  addressValue,
  correctionValue,
  templateResource,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  if (isIntentionalBlankCorrection(correctionValue)) {
    return { comunaId: '', cityId: '', regionId: '' };
  }

  const directCorrection = cleanCell(correctionValue);
  const catalog = templateResource.catalogs.Comuna ?? [];
  const sourceAndLocationCandidates = buildComunaCandidates({
    sourceValue,
    locationValue,
    secondaryLocationValue,
    addressValue: '',
  });
  const addressCandidates = buildComunaCandidates({ sourceValue: '', locationValue: '', secondaryLocationValue: '', addressValue });
  const resolveCandidate = (candidate) =>
    findCatalogMatch({ catalog, candidate, normalizer: normalizeLooseText }) ||
    findHeuristicCatalogMatch({ catalog, candidate, normalizer: normalizeLooseText }) ||
    findScoredCatalogMatch({ catalog, candidate, normalizer: normalizeLooseText });
  const selectedComuna =
    catalog.find((item) => item.id === directCorrection) ||
    sourceAndLocationCandidates.map(resolveCandidate).find(Boolean) ||
    findAddressComunaMatch({ catalog, addressValue }) ||
    addressCandidates.map(resolveCandidate).find(Boolean);

  if (!selectedComuna) {
    pendingItems.push(buildPendingItem({
      key: 'comuna',
      label: 'Comuna',
      type: 'catalog',
      catalogName: 'Comuna',
      rowNumber,
      employeeId,
      employeeName,
      sourceValue: cleanCell(sourceValue),
      sourceContext: buildPendingContext([
        ['Ubicación', locationValue],
        ['Ubicación Workday', secondaryLocationValue],
        ['Dirección', addressValue],
      ]),
    }));
    return { comunaId: '', cityId: '', regionId: '' };
  }

  const regionId = selectedComuna.id.slice(0, 2);
  return {
    comunaId: selectedComuna.id,
    cityId: resolveCityIdForRegion(regionId, selectedComuna.name, templateResource.catalogs.Ciudad ?? []),
    regionId,
  };
}

export function enrichGeographyFromSede({ comunaResolution, sedeValue, templateResource }) {
  if (
    isValidComunaId(comunaResolution.comunaId) &&
    isValidCityId(comunaResolution.cityId) &&
    isValidRegionId(comunaResolution.regionId)
  ) {
    return comunaResolution;
  }

  const sedeName = getCatalogItemName(templateResource.catalogs['Id sede donde se desempeña'] ?? [], sedeValue);
  const cityCatalog = templateResource.catalogs.Ciudad ?? [];
  const comunaCatalog = templateResource.catalogs.Comuna ?? [];
  const inferredComunaName = inferComunaFromLocation(sedeName);
  const seededComuna =
    (isValidComunaId(comunaResolution.comunaId)
      ? comunaCatalog.find((item) => item.id === comunaResolution.comunaId)
      : null) ||
    (inferredComunaName
      ? findCatalogMatch({ catalog: comunaCatalog, candidate: inferredComunaName, normalizer: normalizeLooseText }) ||
        findHeuristicCatalogMatch({ catalog: comunaCatalog, candidate: inferredComunaName, normalizer: normalizeLooseText }) ||
        findScoredCatalogMatch({ catalog: comunaCatalog, candidate: inferredComunaName, normalizer: normalizeLooseText })
      : null);
  const cityMatch =
    (isValidCityId(comunaResolution.cityId) ? cityCatalog.find((item) => item.id === comunaResolution.cityId) : null) ||
    (seededComuna
      ? cityCatalog.find((item) => normalizeLooseText(item.name) === normalizeLooseText(seededComuna.name))
      : null) ||
    findCatalogMatch({ catalog: cityCatalog, candidate: sedeName, normalizer: normalizeLooseText }) ||
    findHeuristicCatalogMatch({ catalog: cityCatalog, candidate: sedeName, normalizer: normalizeLooseText }) ||
    findScoredCatalogMatch({ catalog: cityCatalog, candidate: sedeName, normalizer: normalizeLooseText });
  const nextRegionId =
    (isValidRegionId(comunaResolution.regionId) ? comunaResolution.regionId : '') ||
    (isValidComunaId(comunaResolution.comunaId) ? cleanCell(comunaResolution.comunaId).slice(0, 2) : '') ||
    (seededComuna ? cleanCell(seededComuna.id).slice(0, 2) : '') ||
    (cityMatch ? cleanCell(cityMatch.id).slice(0, 2) : '');
  const nextComunaId =
    (isValidComunaId(comunaResolution.comunaId) ? comunaResolution.comunaId : '') ||
    seededComuna?.id ||
    comunaCatalog.find(
      (item) => item.id.startsWith(nextRegionId) && cityMatch && normalizeLooseText(item.name) === normalizeLooseText(cityMatch.name),
    )?.id ||
    '';
  const fallbackCityId = cityCatalog.find((item) => item.id.startsWith(`${nextRegionId}-`))?.id || '';

  return {
    comunaId: nextComunaId,
    cityId:
      (isValidCityId(comunaResolution.cityId) ? comunaResolution.cityId : '') || cityMatch?.id || fallbackCityId,
    regionId: nextRegionId,
  };
}

export function ensureRequiredGeography({
  geographyResolution,
  templateResource,
  sourceComunaValue,
  sourceLocationValue,
  secondaryLocationValue,
  addressValue,
  pendingItems,
  rowNumber,
  employeeId,
  employeeName,
}) {
  const cityCatalog = templateResource.catalogs.Ciudad ?? [];
  const comunaCatalog = templateResource.catalogs.Comuna ?? [];
  const currentComunaId = cleanCell(geographyResolution.comunaId);
  const currentRegionId = cleanCell(geographyResolution.regionId) || (currentComunaId ? currentComunaId.slice(0, 2) : '');
  const currentComunaName = currentComunaId ? getCatalogItemName(comunaCatalog, currentComunaId) : '';
  const rebuiltCityId =
    resolveCityIdForRegion(currentRegionId, currentComunaName, cityCatalog) ||
    cityCatalog.find((item) => cleanCell(item.id).startsWith(`${currentRegionId}-`))?.id ||
    '';
  const resolvedGeography = {
    comunaId: currentComunaId,
    cityId: isValidCityId(geographyResolution.cityId) ? geographyResolution.cityId : rebuiltCityId,
    regionId: currentRegionId,
  };
  const geographySourceValue = cleanCell(sourceComunaValue) || cleanCell(addressValue);
  const geographyContext = buildPendingContext([
    ['Comuna origen', sourceComunaValue],
    ['Ubicación', sourceLocationValue],
    ['Ubicación Workday', secondaryLocationValue],
    ['Dirección', addressValue],
  ]);

  const requiredFields = [
    ['comuna', 'Comuna', 'Comuna', isValidComunaId(resolvedGeography.comunaId)],
    ['city', 'Ciudad', 'Ciudad', isValidCityId(resolvedGeography.cityId)],
    ['region', 'Region', 'Region', isValidRegionId(resolvedGeography.regionId)],
  ];
  requiredFields.forEach(([key, label, catalogName, isValid]) => {
    if (!isValid && !hasPendingItem(pendingItems, key)) {
      pendingItems.push(buildPendingItem({
        key,
        label,
        type: 'catalog',
        catalogName,
        rowNumber,
        employeeId,
        employeeName,
        sourceValue: geographySourceValue,
        sourceContext: geographyContext,
      }));
    }
  });

  return resolvedGeography;
}
