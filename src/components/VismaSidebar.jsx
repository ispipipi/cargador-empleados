import { useEffect, useMemo, useState } from 'react';
import { useVismaWorkspace, ALL_COMPANIES_VALUE } from './VismaWorkspaceProvider';

const ART_BPO_LOGO_PATH = `${import.meta.env.BASE_URL}branding/artbpo-logo.png`;
const TMF_LOGO_PATH = `${import.meta.env.BASE_URL}branding/tmf-logo.png`;

export default function VismaSidebar({ selectedModule, onNavigate, onContextChange, onOpenOtherFlows }) {
  const {
    connection,
    companyOptions,
    isLoadingConnection,
    refreshConnection,
    selectCompany,
    selectedCompany,
    selectedOrganizationGroup,
    selectedTenant,
    selection,
  } = useVismaWorkspace();
  const [tenantSearch, setTenantSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');

  const visibleTenantOptions = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    const sortedTenants = [...(connection?.tenants ?? [])].sort(compareTenants);

    if (!query) {
      return sortedTenants;
    }

    return sortedTenants.filter((tenant) =>
      [tenant.name, tenant.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [connection?.tenants, tenantSearch]);

  const visibleCompanyOptions = useMemo(() => {
    const query = companySearch.trim().toLowerCase();

    if (!query) {
      return companyOptions;
    }

    return companyOptions.filter((company) =>
      [company.name, company.id, company.externalId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [companyOptions, companySearch]);

  useEffect(() => {
    setCompanySearch('');
  }, [selectedOrganizationGroup?.id]);

  useEffect(() => {
    setTenantSearch('');
  }, [connection?.tenants]);

  return (
    <aside className="self-start lg:sticky lg:top-6">
      <div className="panel overflow-hidden">
        <div className="border-b border-slate-100 bg-white px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <img src={ART_BPO_LOGO_PATH} alt="artBPO" className="h-12 w-24 object-contain object-center" />
            <img src={TMF_LOGO_PATH} alt="TMF Group" className="h-10 w-10 rounded-xl object-cover" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">VISMA workspace</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Centro de preparación de cargas</p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Empresa de trabajo</p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              {selectedCompany?.name || (selection.companyId === ALL_COMPANIES_VALUE ? 'Todas las empresas' : 'Sin empresa seleccionada')}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {selectedTenant?.name || 'Conexión VISMA'} · {selectedOrganizationGroup?.name || 'Organización'}
            </p>
          </div>

          {(connection?.tenants ?? []).length > 1 ? (
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Conexión</span>
              <input
                value={tenantSearch}
                onChange={(event) => setTenantSearch(event.target.value)}
                placeholder="Buscar conexión"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              />
              <select
                value={selection.tenantId}
                onChange={(event) => {
                  onContextChange?.();
                  refreshConnection(event.target.value);
                }}
                disabled={isLoadingConnection}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 disabled:bg-slate-100"
              >
                {visibleTenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name || `Tenant ${tenant.id}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Empresa</span>
            {companyOptions.length > 12 ? (
              <input
                value={companySearch}
                onChange={(event) => setCompanySearch(event.target.value)}
                placeholder="Filtrar empresa"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              />
            ) : null}
            <select
              value={selection.companyId}
              onChange={(event) => {
                onContextChange?.();
                selectCompany(event.target.value);
              }}
              disabled={isLoadingConnection || !companyOptions.length}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 disabled:bg-slate-100"
            >
              <option value="">Selecciona una empresa</option>
              <option value={ALL_COMPANIES_VALUE}>Todas las empresas · {companyOptions.length}</option>
              {visibleCompanyOptions.map((company) => (
                <option key={`${company.typeId}-${company.id}-${company.name}`} value={company.id}>
                  {company.name || `Empresa ${company.id}`} · {company.id}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              onContextChange?.();
              refreshConnection(selection.tenantId);
            }}
            disabled={isLoadingConnection}
            className="w-full rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {isLoadingConnection ? 'Actualizando conexión...' : 'Actualizar conexión'}
          </button>

          <nav aria-label="Secciones VISMA" className="space-y-2 border-t border-slate-100 pt-5">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Flujo VISMA</p>
            <SidebarLink
              active={selectedModule === 'visma-maestros'}
              label="Extraer maestros"
              detail="Cargos, centros de costo y áreas"
              onClick={() => onNavigate('visma-maestros')}
            />
            <SidebarLink
              active={selectedModule === 'visma-empleados' || selectedModule === 'libros-historicos'}
              label="Generar archivos de carga"
              detail="Empleados y libros históricos"
              onClick={() => onNavigate('visma-empleados')}
            />
          </nav>

          <button
            type="button"
            onClick={onOpenOtherFlows}
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
          >
            Otros flujos
          </button>
        </div>
      </div>
    </aside>
  );
}

function compareTenants(left, right) {
  const leftLabel = String(left.name || left.id || '').trim();
  const rightLabel = String(right.name || right.id || '').trim();
  return leftLabel.localeCompare(rightLabel, 'es', { numeric: true, sensitivity: 'base' });
}

function SidebarLink({ active, label, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${active
        ? 'border-brand-500 bg-brand-50 text-slate-950 shadow-sm'
        : 'border-transparent bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50/60'}`}
    >
      <span className="block text-sm font-bold">{label}</span>
      <span className="mt-1 block text-xs text-slate-500">{detail}</span>
    </button>
  );
}
