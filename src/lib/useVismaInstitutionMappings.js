import { useEffect, useState } from 'react';
import { loadVismaInstitutionMappings, normalizeMappingScope, saveVismaInstitutionMappings } from './sessionPersistence';
import { getVismaInstitutionMappingKey } from './vismaInstitutions';

export function useVismaInstitutionMappings(scope) {
  const scopeKey = normalizeMappingScope(scope ?? {}).key;
  const [state, setState] = useState(() => ({
    scopeKey,
    mappings: loadVismaInstitutionMappings(scope),
  }));

  useEffect(() => {
    setState({ scopeKey, mappings: loadVismaInstitutionMappings(scope) });
  }, [scopeKey, scope]);

  const mappings = state.scopeKey === scopeKey ? state.mappings : {};
  const assignInstitution = (kind, rawValue, institutionId) => {
    const key = getVismaInstitutionMappingKey(kind, rawValue);
    if (!key) return;
    const nextMappings = { ...mappings };
    if (institutionId) nextMappings[key] = { id: institutionId, kind, rawValue };
    else delete nextMappings[key];
    saveVismaInstitutionMappings(scope, nextMappings);
    setState({ scopeKey, mappings: nextMappings });
  };

  return { institutionMappings: mappings, assignInstitution };
}
