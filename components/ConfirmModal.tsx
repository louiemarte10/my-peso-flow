"use client";

export type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmModal({
  state,
  loading,
  onClose,
}: {
  state: ConfirmState | null;
  loading?: boolean;
  onClose: () => void;
}) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-800">{state.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{state.message}</p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {state.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => state.onConfirm()}
            disabled={loading}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              state.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand hover:bg-brand-dark"
            }`}
          >
            {loading ? "Working…" : (state.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
