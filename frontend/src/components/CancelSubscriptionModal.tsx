import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { subscriptionApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void;
  proExpiresAt: string;
}

const REASONS = [
  { value: "too_expensive",    label: "Too expensive" },
  { value: "not_using",        label: "Not using it enough" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "other",            label: "Other" },
];

function calcRefund(proExpiresAt: string): number {
  const remaining = Math.max(
    0,
    Math.floor((new Date(proExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  return Math.round(((remaining / 365) * 999 * 0.95) * 100) / 100;
}

export default function CancelSubscriptionModal({ isOpen, onClose, onCancelled, proExpiresAt }: Props) {
  const { refreshUser } = useAuthStore();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ refund_amount: number; message: string } | null>(null);

  const refundPreview = calcRefund(proExpiresAt);

  const handleCancel = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const res = await subscriptionApi.cancel(reason);
      await refreshUser();
      setDone(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReason("");
    setDone(null);
    setLoading(false);
    if (done) onCancelled();
    else onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="card w-full max-w-md p-6 space-y-5"
        style={{ backgroundColor: "#111111" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: "#fb923c", flexShrink: 0 }} />
            <h2 className="text-base font-semibold text-text-primary">
              {done ? "Subscription cancelled" : "Cancel your Pro plan"}
            </h2>
          </div>
          <button onClick={handleClose} className="text-text-muted hover:text-text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{done.message}</p>
            {done.refund_amount > 0 && (
              <div
                className="rounded-xl p-3 text-sm"
                style={{ backgroundColor: "rgba(163,230,53,0.08)", border: "1px solid rgba(163,230,53,0.2)" }}
              >
                <span className="font-semibold" style={{ color: "#a3e635" }}>₹{done.refund_amount}</span>
                <span className="text-text-muted"> refund initiated · 5–7 business days</span>
              </div>
            )}
            <button onClick={handleClose} className="btn-primary w-full py-2.5 text-sm font-semibold rounded-xl">
              Done
            </button>
          </div>
        ) : (
          /* Reason + confirm */
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              You'll receive a <span className="text-text-primary font-medium">₹{refundPreview}</span> pro-rated refund
              (5% cancellation fee applied). Pro access ends immediately.
            </p>

            <div>
              <label className="label mb-1.5 block">Why are you cancelling?</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input w-full text-sm"
              >
                <option value="" disabled>Select a reason</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="btn-ghost flex-1 py-2.5 text-sm font-medium rounded-xl"
              >
                Keep Pro
              </button>
              <button
                onClick={handleCancel}
                disabled={!reason || loading}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all"
                style={{
                  backgroundColor: reason && !loading ? "#f87171" : "#2a2a2a",
                  color: reason && !loading ? "#fff" : "#555",
                  cursor: !reason || loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Processing…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
