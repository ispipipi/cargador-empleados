import { caseTypeLabel, formatCaseValue } from '../lib/geovictoria';

export function GroupSummaryCard({ section, primaryLabel, secondaryLabel, onApprove, onReject }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{primaryLabel}</p>
          <h4 className="mt-1 text-base font-bold text-slate-950">{section.label}</h4>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          {section.summary.alerts} alertas
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
        <GroupMetric label="Casos" value={section.summary.total} />
        <GroupMetric label="Aprob." value={section.summary.approved} />
        <GroupMetric label="Faltas" value={Math.trunc(section.summary.absences)} />
      </div>
      <div className="mt-4 space-y-2">
        {section.subgroups.slice(0, 3).map((subgroup) => (
          <div key={subgroup.key} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs">
            <span className="truncate text-slate-700">{secondaryLabel}: {subgroup.label}</span>
            <span className="font-semibold text-slate-950">{subgroup.summary.total}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onApprove} className="rounded-full bg-brand-600 px-3 py-2 text-xs font-semibold text-white">
          Aprobar grupo
        </button>
        <button type="button" onClick={onReject} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
          Rechazar grupo
        </button>
      </div>
    </div>
  );
}

export function GroupMetric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

export function GroupedRows({ section, primaryLabel, secondaryLabel, onSetApproval }) {
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={6} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-900">{primaryLabel}: {section.label}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {section.summary.total} casos · {section.summary.approved} aprobados · {section.summary.alerts} alertas
            </p>
          </div>
        </td>
      </tr>
      {section.subgroups.map((subgroup) => (
        <SubgroupRows
          key={subgroup.key}
          subgroup={subgroup}
          secondaryLabel={secondaryLabel}
          onSetApproval={onSetApproval}
        />
      ))}
    </>
  );
}

export function SubgroupRows({ subgroup, secondaryLabel, onSetApproval }) {
  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {secondaryLabel}: {subgroup.label} · {subgroup.summary.total} casos
        </td>
      </tr>
      {subgroup.cases.map((item) => (
        <CaseRow key={item.id} item={item} onSetApproval={onSetApproval} />
      ))}
    </>
  );
}

export function CaseRow({ item, onSetApproval }) {
  return (
    <tr className={item.severity === 'high' ? 'bg-amber-50/70' : ''}>
      <td className="px-4 py-3">
        <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white text-xs font-semibold">
          <button
            type="button"
            onClick={() => onSetApproval(item.id, true)}
            className={`px-3 py-2 transition ${
              item.approved ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => onSetApproval(item.id, false)}
            className={`border-l border-slate-200 px-3 py-2 transition ${
              !item.approved ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            Rechazar
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{item.employeeName}</p>
        <p className="mt-1 text-xs text-slate-500">
          {item.identifier} · {item.metadata?.company || 'Sin empresa'} · {item.metadata?.position || 'Sin cargo'} · CC {item.costCenter || '-'}
        </p>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass(item.severity)}`}>
          {caseTypeLabel(item.type)}
        </span>
        <p className="mt-2 font-mono text-xs text-slate-500">{item.concept}</p>
      </td>
      <td className="px-4 py-3 font-mono text-slate-800">{formatCaseValue(item)}</td>
      <td className="px-4 py-3 text-slate-600">{item.periodLabel}</td>
      <td className="max-w-sm px-4 py-3 text-slate-600">{item.notes}</td>
    </tr>
  );
}

export function MetricCard({ label, value, detail, tone = 'default' }) {
  return (
    <div className={`rounded-[24px] border p-4 ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function ConceptPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-white bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function toneClass(severity) {
  if (severity === 'high') {
    return 'bg-amber-100 text-amber-800';
  }

  if (severity === 'medium') {
    return 'bg-sky-100 text-sky-800';
  }

  return 'bg-emerald-100 text-emerald-800';
}
