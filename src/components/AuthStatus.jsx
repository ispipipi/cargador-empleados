export default function AuthStatus({ configured, user, isBusy, onSignIn, onSignOut }) {
  if (!configured) {
    return (
      <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <p className="font-semibold">Modo local</p>
        <p className="mt-1">Firebase se activará al completar la configuración.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        disabled={isBusy}
        className="rounded-[24px] border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-left text-sm text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-wait disabled:opacity-60"
      >
        <p className="font-semibold text-white">{isBusy ? 'Conectando…' : 'Conectar memoria cloud'}</p>
        <p className="mt-1 text-xs text-cyan-100/70">Iniciar sesión con Google</p>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
      <div className="min-w-0">
        <p className="font-semibold text-white">Memoria cloud activa</p>
        <p className="max-w-[180px] truncate text-xs text-emerald-100/70">{user.email || user.displayName || user.uid}</p>
      </div>
      <button type="button" onClick={onSignOut} disabled={isBusy} className="text-xs font-semibold text-white underline-offset-2 hover:underline">
        Salir
      </button>
    </div>
  );
}
