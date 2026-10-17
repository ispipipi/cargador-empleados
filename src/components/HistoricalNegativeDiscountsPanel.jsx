export default function HistoricalNegativeDiscountsPanel({ review, isPreparing, onDownload }) {
  if (!review?.employeeCount) return null;

  return (
    <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <p className="font-semibold">
        {review.employeeCount.toLocaleString('es-CL')} RUT(s) excluidos por descuentos negativos
      </p>
      <p className="mt-2 leading-6 text-amber-900">
        Se excluirá cada trabajador completo del CSV principal y de todos los lotes. El archivo aparte detalla {review.negativeRowCount.toLocaleString('es-CL')} registro(s) negativo(s) para revisión.
      </p>
      <button
        type="button"
        onClick={onDownload}
        disabled={isPreparing}
        className="mt-4 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Descargar detalle de descuentos negativos
      </button>
    </section>
  );
}
