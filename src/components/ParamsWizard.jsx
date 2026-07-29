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
  const hasParameters = parameterDefinitions.length > 0;
  const isLastStep = stepIndex === parameterDefinitions.length - 1;
  const isBusy = isTransforming;

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
          {hasParameters ? `${stepIndex + 1} / ${parameterDefinitions.length}` : 'Sin preguntas'}
        </div>
      </div>

      <div className="mt-8 rounded-[32px] bg-slate-950 p-1">
        <div className="rounded-[28px] bg-white px-6 py-8 sm:px-8">
          {hasParameters ? (
            <>
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
                      disabled={isBusy}
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${
                        isActive
                          ? 'border-brand-500 bg-brand-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-brand-200'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <p className="text-sm font-bold text-slate-900">{option}</p>
                      {option === currentParameter.suggestedValue ? (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Sugerido</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-700">Paso automático</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">No hay preguntas pendientes para esta carga</h3>
              <p className="mt-5 text-sm leading-7 text-slate-600">
                El archivo ya contiene los datos necesarios o las reglas quedaron definidas en el sistema. Puedes seguir directo a la transformación.
              </p>
            </div>
          )}

          {isBusy ? (
            <div className="mt-7 rounded-[28px] border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-5 shadow-[0_18px_40px_rgba(14,165,233,0.12)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="loader-orb h-3 w-3 rounded-full bg-sky-500" />
                    <span className="loader-orb h-3 w-3 rounded-full bg-cyan-500" />
                    <span className="loader-orb h-3 w-3 rounded-full bg-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Procesando</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">Estamos preparando la transformación</h3>
                  </div>
                </div>

                <span className="rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                  Puede tardar unos segundos
                </span>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-600">
                Estamos aplicando reglas, cruzando listas y armando el archivo final. En cargas grandes este paso puede demorar un poco.
              </p>

              <div className="loader-track mt-5 h-2 overflow-hidden rounded-full bg-sky-100">
                <span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500" />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => (stepIndex === 0 ? onBack() : setStepIndex((current) => current - 1))}
          disabled={isBusy}
          className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stepIndex === 0 ? 'Volver al archivo' : 'Anterior'}
        </button>

        {hasParameters && !isLastStep ? (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current + 1)}
            disabled={isBusy}
            className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
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
            <span className="flex items-center gap-3">
              {isTransforming ? (
                <span className="flex items-center gap-1.5">
                  <span className="loader-orb h-2.5 w-2.5 rounded-full bg-white" />
                  <span className="loader-orb h-2.5 w-2.5 rounded-full bg-sky-200" />
                  <span className="loader-orb h-2.5 w-2.5 rounded-full bg-cyan-200" />
                </span>
              ) : null}
              <span>{isTransforming ? 'Transformando archivo…' : 'Transformar archivo'}</span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
