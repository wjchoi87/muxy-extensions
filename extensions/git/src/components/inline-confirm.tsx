import { Loader2 } from "lucide-react";

interface InlineConfirmProps {
  message: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InlineConfirm({
  message,
  confirmLabel,
  tone = "default",
  loading,
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  const confirmClass =
    tone === "danger"
      ? "border-diff-remove/40 text-diff-remove hover:border-diff-remove hover:bg-diff-remove/10"
      : "border-primary/40 text-foreground hover:border-primary hover:bg-accent";
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2">
      <span className="text-[11px] leading-snug text-muted-foreground">{message}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`flex h-6 flex-1 items-center justify-center gap-1.5 rounded border bg-muted text-[11px] font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${confirmClass}`}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex h-6 flex-1 items-center justify-center rounded border border-border text-[11px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
