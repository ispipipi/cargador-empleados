import { downloadTextFile, sanitizeFilenameSegment, todayStamp } from './utils';

const STORAGE_KEY = 'cargador-empleados.configs.v1';

export function loadConfigurations() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistConfigurations(configurations) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configurations));
}

export function validateConfigurationShape(configuration) {
  if (!configuration || typeof configuration !== 'object') {
    return false;
  }

  const hasBaseFields =
    typeof configuration.nombre === 'string' &&
    typeof configuration.origen === 'string' &&
    typeof configuration.destino === 'string' &&
    typeof configuration.fechaCreacion === 'string' &&
    configuration.parametros &&
    typeof configuration.parametros === 'object';

  return hasBaseFields;
}

export function createConfigurationPayload({ name, origin, destination, parameters }) {
  return {
    id: crypto.randomUUID(),
    nombre: name.trim(),
    origen: origin,
    destino: destination,
    fechaCreacion: todayStamp(),
    parametros: parameters,
  };
}

export function upsertConfiguration(configuration, existingConfigurations) {
  const nextConfigurations = existingConfigurations.filter((item) => item.id !== configuration.id);
  nextConfigurations.unshift(configuration);
  persistConfigurations(nextConfigurations);
  return nextConfigurations;
}

export function removeConfiguration(configurationId, existingConfigurations) {
  const nextConfigurations = existingConfigurations.filter((item) => item.id !== configurationId);
  persistConfigurations(nextConfigurations);
  return nextConfigurations;
}

export function exportConfiguration(configuration) {
  const filename = `config_${sanitizeFilenameSegment(configuration.nombre)}_${configuration.fechaCreacion}.json`;
  downloadTextFile(JSON.stringify(configuration, null, 2), filename);
}
