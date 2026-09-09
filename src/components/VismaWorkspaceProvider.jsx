import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchVismaConnectionContext } from '../lib/vismaEmployees';

export const ALL_COMPANIES_VALUE = '__all__';

const VismaWorkspaceContext = createContext(null);

export function VismaWorkspaceProvider({ children }) {
  const [connection, setConnection] = useState(null);
  const [selection, setSelection] = useState({
    tenantId: '',
    companyTypeId: '',
    companyId: '',
  });
  const [isLoadingConnection, setIsLoadingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  const refreshConnection = useCallback(async (preferredTenantId = '') => {
    setConnectionError('');
    setIsLoadingConnection(true);

    try {
      const nextConnection = await fetchVismaConnectionContext({ tenantId: preferredTenantId });
      const groups = getOrganizationGroups(nextConnection);
      const selectedTypeId = nextConnection.selectedCompanyTypeId || groups[0]?.id || '';
      const selectedGroup = groups.find((group) => String(group.id) === String(selectedTypeId)) ?? groups[0] ?? null;
      const suggestedCompanyId = nextConnection.selectedCompanyId || '';
      const hasSuggestedCompany = (selectedGroup?.options ?? []).some(
        (company) => String(company.id) === String(suggestedCompanyId),
      );

      setConnection(nextConnection);
      setSelection({
        tenantId: nextConnection.selectedTenantId || nextConnection.tenants?.[0]?.id || '',
        companyTypeId: selectedGroup?.id || '',
        companyId: hasSuggestedCompany ? suggestedCompanyId : '',
      });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'No se pudo validar la conexión VISMA.');
    } finally {
      setIsLoadingConnection(false);
    }
  }, []);

  useEffect(() => {
    refreshConnection();
  }, [refreshConnection]);

  const organizationGroups = useMemo(() => getOrganizationGroups(connection), [connection]);
  const selectedOrganizationGroup = useMemo(
    () => organizationGroups.find((group) => String(group.id) === String(selection.companyTypeId)) ?? organizationGroups[0] ?? null,
    [organizationGroups, selection.companyTypeId],
  );
  const companyOptions = selectedOrganizationGroup?.options ?? [];
  const selectedTenant = useMemo(
    () => (connection?.tenants ?? []).find((tenant) => String(tenant.id) === String(selection.tenantId)) ?? null,
    [connection, selection.tenantId],
  );
  const selectedCompany = useMemo(
    () => companyOptions.find((company) => String(company.id) === String(selection.companyId)) ?? null,
    [companyOptions, selection.companyId],
  );

  const selectCompany = useCallback((companyId) => {
    setSelection((current) => ({ ...current, companyId }));
  }, []);

  const value = useMemo(() => ({
    connection,
    connectionError,
    isLoadingConnection,
    organizationGroups,
    selectedOrganizationGroup,
    companyOptions,
    selectedTenant,
    selectedCompany,
    selection,
    refreshConnection,
    selectCompany,
  }), [
    companyOptions,
    connection,
    connectionError,
    isLoadingConnection,
    organizationGroups,
    refreshConnection,
    selectCompany,
    selectedCompany,
    selectedOrganizationGroup,
    selectedTenant,
    selection,
  ]);

  return (
    <VismaWorkspaceContext.Provider value={value}>
      {children}
    </VismaWorkspaceContext.Provider>
  );
}

export function useVismaWorkspace() {
  const context = useContext(VismaWorkspaceContext);

  if (!context) {
    throw new Error('useVismaWorkspace debe usarse dentro de VismaWorkspaceProvider.');
  }

  return context;
}

function getOrganizationGroups(connection) {
  if (Array.isArray(connection?.organizationGroups) && connection.organizationGroups.length) {
    return connection.organizationGroups;
  }

  if (Array.isArray(connection?.companies) && connection.companies.length) {
    return [{
      id: connection.selectedCompanyTypeId || '',
      name: 'Empresa operacional',
      count: connection.companies.length,
      options: connection.companies,
    }];
  }

  return [];
}
