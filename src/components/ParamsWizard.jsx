import { useEffect, useState } from 'react';

export default function ParamsWizard({
  parameters,
  parameterDefinitions,
  onChangeParameter,
  onBack,
  onTransform,
  isTransforming,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentParameter = parameterDefinitions[stepIndex];
  const isLastStep = stepIndex === parameterDefinitions.length - 1;

  useEffect(() => {
    setStepIndex(0);
  }, [parameterDefinitions]);

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Paso 3</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Confirma los parámetros globales</h2>
          <p className="mt-2 text-sm text-slate-600">
            El flujo pregunta uno a uno solo los valores que Talana no entrega de forma consistente para BUK.
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
          {stepIndex + 1} / {parameterDefinitions.length}
        </div>
      </div>

      <div className="mt-8 rounded-[32px] bg-slate-950 p-1">
        <div className="rounded-[28px] bg-white px-6 py-8 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-sm font-bold text-brand-700">
              {stepIndex + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-700">{currentParameter.label}</p>
              <h3 className="text-xl font-bold text-slate-950">{currentParameter.question}</h3>
            </div>
          </div>

          <p className="mt-5 text-sm leading-7 text-slate-600">{currentParameter.helperText}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {currentParameter.options.map((option) => {
              const isActive = parameters[currentParameter.key] === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChangeParameter(currentParameter.key, option)}
                  className={`rounded-[24px] border px-4 py-4 text-left transition ${
                    isActive
                      ? 'border-brand-500 bg-brand-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">{option}</p>
                  {option === currentParameter.suggestedValue ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Sugerido</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => (stepIndex === 0 ? onBack() : setStepIndex((current) => current - 1))}
          className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
        >
          {stepIndex === 0 ? 'Volver al archivo' : 'Anterior'}
        </button>

        {!isLastStep ? (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current + 1)}
            className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Siguiente
          </button>
        ) : (
          <button
            type="button"
            onClick={onTransform}
            disabled={isTransforming}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isTransforming ? 'Transformando…' : 'Transformar archivo'}
          </button>
        )}
      </div>
    </section>
  );
}
