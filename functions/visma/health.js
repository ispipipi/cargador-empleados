import { arrayValues, cleanValue, normalizeLookupText } from './shared.js';
import { getVismaStructureName } from '../visma-rex-mapping.mjs';

export function extractVismaSex(employee, searchEmployee) {
  const candidates = [
    employee?.sex,
    employee?.sexo,
    employee?.gender,
    employee?.genderName,
    employee?.genderType,
    employee?.sexDescription,
    employee?.genderDescription,
    employee?.sexCode,
    employee?.genderCode,
    employee?.personalData?.sex,
    employee?.personalData?.sexo,
    employee?.personalData?.gender,
    searchEmployee?.sex,
    searchEmployee?.sexo,
    searchEmployee?.gender,
    searchEmployee?.genderName,
    searchEmployee?.sexDescription,
    searchEmployee?.genderDescription,
    searchEmployee?.additionalAttributes?.Sex,
    searchEmployee?.additionalAttributes?.Gender,
  ];

  for (const candidate of candidates) {
    const value = extractVismaText(candidate);
    if (value) {
      return value;
    }
  }

  return '';
}

export function extractVismaYesNo(value) {
  const normalizedValue = normalizeLookupText(
    getVismaStructureName(value) || extractVismaText(value),
  );

  if (['s', 'si', 'yes', 'true', '1', 'afecto', 'afecta', 'cotiza'].includes(normalizedValue)) {
    return 'S';
  }

  if (['n', 'no', 'no aplica', 'no cotiza', 'false', '0', 'exento'].includes(normalizedValue)) {
    return 'N';
  }

  return '';
}

export function extractVismaHealthAmount({ healthPayElement, employee, phase, healthStructure }) {
  const payElementAmount = extractVismaPayElementAmount(healthPayElement);
  if (payElementAmount !== '') {
    return payElementAmount;
  }

  const candidates = [
    healthStructure?.amountUf,
    healthStructure?.amountUF,
    healthStructure?.ufAmount,
    healthStructure?.planAmountUf,
    healthStructure?.planAmountUF,
    healthStructure?.contributionUf,
    healthStructure?.contributionUF,
    healthStructure?.montoUf,
    healthStructure?.montoUF,
    healthStructure?.pactadoUf,
    healthStructure?.pactadoUF,
    healthStructure?.pactadoSaludUf,
    healthStructure?.pactadoSaludUF,
    healthStructure?.pactadoSalud,
    healthStructure?.saludPactadaUf,
    healthStructure?.saludPactadaUF,
    healthStructure?.planUf,
    healthStructure?.planUF,
    healthStructure?.amount,
    healthStructure?.monto,
    healthStructure?.pactado,
    healthStructure?.valueUf,
    healthStructure?.valueUF,
    healthStructure?.valorUf,
    healthStructure?.valorUF,
    healthStructure?.value,
    healthStructure?.healthAmount,
    healthStructure?.healthPlanAmount,
    healthStructure?.healthContribution,
    phase?.health?.amountUf,
    phase?.health?.amountUF,
    phase?.health?.montoUf,
    phase?.health?.montoUF,
    phase?.health?.amount,
    phase?.health?.monto,
    phase?.healthInsurance?.amountUf,
    phase?.healthInsurance?.amountUF,
    phase?.healthInsurance?.montoUf,
    phase?.healthInsurance?.montoUF,
    phase?.healthInsurance?.amount,
    phase?.healthInsurance?.monto,
    phase?.healthPlan?.amountUf,
    phase?.healthPlan?.amountUF,
    phase?.healthPlan?.montoUf,
    phase?.healthPlan?.montoUF,
    phase?.healthPlan?.amount,
    phase?.healthPlan?.monto,
    employee?.health?.amountUf,
    employee?.health?.amountUF,
    employee?.health?.montoUf,
    employee?.health?.montoUF,
    employee?.health?.amount,
    employee?.health?.monto,
    employee?.healthInsurance?.amountUf,
    employee?.healthInsurance?.amountUF,
    employee?.healthInsurance?.montoUf,
    employee?.healthInsurance?.montoUF,
    employee?.healthInsurance?.amount,
    employee?.healthInsurance?.monto,
    employee?.healthPlan?.amountUf,
    employee?.healthPlan?.amountUF,
    employee?.healthPlan?.montoUf,
    employee?.healthPlan?.montoUF,
    employee?.healthPlan?.amount,
    employee?.healthPlan?.monto,
  ];

  for (const candidate of candidates) {
    const amount = extractVismaAmount(candidate);
    if (amount) {
      return amount;
    }
  }

  const keyBasedAmount = [healthStructure, phase, phase?.health, phase?.healthInsurance, phase?.healthPlan, employee?.health, employee?.healthInsurance, employee?.healthPlan, employee]
    .map((value) => findVismaHealthAmountByKey(value))
    .find(Boolean);

  if (keyBasedAmount) {
    return keyBasedAmount;
  }

  const descriptiveValues = [
    healthStructure?.description,
    healthStructure?.name,
    phase?.health?.description,
    phase?.healthInsurance?.description,
    phase?.healthPlan?.description,
    employee?.health?.description,
    employee?.healthInsurance?.description,
    employee?.healthPlan?.description,
  ];

  for (const value of descriptiveValues) {
    const amount = extractUfAmountFromText(value);
    if (amount) {
      return amount;
    }
  }

  return '';
}

export function extractVismaPayElementAmount(payload, depth = 0) {
  if (!payload || depth > 2) {
    return '';
  }

  const items = Array.isArray(payload) ? payload : arrayValues(payload);
  const candidates = items.length ? items : [payload];
  const amountKeys = [
    'amountUf',
    'amountUF',
    'ufAmount',
    'planAmountUf',
    'planAmountUF',
    'contributionUf',
    'contributionUF',
    'montoUf',
    'montoUF',
    'pactadoUf',
    'pactadoUF',
    'pactadoSaludUf',
    'pactadoSaludUF',
    'saludPactadaUf',
    'saludPactadaUF',
    'valueUf',
    'valueUF',
    'amount',
    'monto',
    'value',
    'quantity',
  ];
  const nestedKeys = ['payElement', 'payElementValue', 'individual', 'detail', 'data', 'result'];

  for (const item of candidates) {
    if (!item || typeof item !== 'object') {
      const amount = extractVismaAmount(item);
      if (amount !== '') {
        return amount;
      }
      continue;
    }

    for (const key of amountKeys) {
      const amount = extractVismaAmount(item[key]);
      if (amount !== '') {
        return amount;
      }
    }

    for (const key of nestedKeys) {
      const amount = extractVismaPayElementAmount(item[key], depth + 1);
      if (amount !== '') {
        return amount;
      }
    }
  }

  return '';
}

export function extractVismaAmount(value) {
  if (value && typeof value === 'object') {
    return extractVismaAmount(value.amount ?? value.value ?? value.description);
  }

  return extractUfAmountFromText(value);
}

export function extractUfAmountFromText(value) {
  const cleaned = cleanValue(value).replace(',', '.');
  const match = cleaned.match(/(?:uf|u\.f\.)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)(?:\s*(?:uf|u\.f\.)?)?/i);
  return match ? (match[1] || match[2]) : '';
}

export function findVismaHealthAmountByKey(value, depth = 0) {
  if (!value || depth > 4 || typeof value !== 'object') {
    return '';
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeLookupText(key).replace(/[^a-z0-9]/g, '');
    const isPactadoHealthKey = normalizedKey.includes('pactadosalud') ||
      normalizedKey.includes('saludpactada') ||
      (normalizedKey.includes('pactado') && normalizedKey.includes('salud')) ||
      normalizedKey.includes('ufpactado');

    if (isPactadoHealthKey) {
      const amount = extractVismaAmount(nestedValue);
      if (amount) {
        return amount;
      }
    }

    const nestedAmount = findVismaHealthAmountByKey(nestedValue, depth + 1);
    if (nestedAmount) {
      return nestedAmount;
    }
  }

  return '';
}

export function extractVismaText(value) {
  if (value && typeof value === 'object') {
    return cleanValue(value.description || value.name || value.label || value.code || value.id);
  }

  return cleanValue(value);
}
