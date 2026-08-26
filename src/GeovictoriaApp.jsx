import { useState } from 'react';
import GeovictoriaReview from './components/GeovictoriaReview';

function getMaperUrl() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export default function GeovictoriaApp() {
  const [busyState, setBusyState] = useState(null);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      {busyState ? <GeoVictoriaBusyOverlay title={busyState.title} detail={busyState.detail} /> : null}
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <div className="panel bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300">NPR interno</p>
                <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">GeoVictoria Rex+</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  Consulta asistencia por API, revisa horas extra, atrasos y ausencias, y descarga el archivo de carga
                  para Rex+.
                </p>
              </div>

              <a
                href={getMaperUrl()}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-200/50 hover:bg-white/10"
              >
                Abrir Maper
              </a>
            </div>
          </div>
        </header>

        <GeovictoriaReview
          onBack={() => {
            window.location.assign(getMaperUrl());
          }}
          onBusyChange={(isBusy) => {
            setBusyState(isBusy
              ? {
                  title: 'Consultando GeoVictoria',
                  detail: 'El proxy esta obteniendo usuarios, asistencia, horas extra, atrasos e inasistencias.',
                }
              : null);
          }}
        />
      </div>
    </main>
  );
}

function GeoVictoriaBusyOverlay({ title, detail }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
        <h2 className="mt-5 text-xl font-bold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      </div>
    </div>
  );
}
