"use client";

import Button from "../ui/Button";

/**
 * Standard application confirm dialog - replaces window.confirm everywhere
 * in Wireframe so deletes feel native (overlay, explicit choice, Esc).
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-bold text-[#27241F]">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#777168]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy} title={confirmLabel}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
