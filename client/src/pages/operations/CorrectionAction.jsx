import React, { useState } from "react";
import api from "../../utils/api";
import toast from "react-hot-toast";
export default function CorrectionAction({
  label,
  endpoint,
  onComplete,
  stockChoice = false,
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [returnStock, setReturn] = useState(false),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(
        endpoint,
        { reason, ...(stockChoice ? { returnStock } : {}) },
        { headers: { "Idempotency-Key": key } },
      );
      await onComplete();
      setOpen(false);
      toast.success("Correction recorded");
    } catch (e) {
      toast.error(
        e.response?.data?.error ||
          "Correction failed. Retry with the same details.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setReason("");
          setReturn(false);
          setKey(crypto.randomUUID());
        }}
      >
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="glass-panel p-4">
          <form onSubmit={submit} className="space-y-2">
            <p>
              {label}. This preserves the original record and records a
              correction.
            </p>
            {stockChoice && (
              <p>
                Refund the full order using its recorded payment methods. Keep
                consumed stock deducted; return ingredients only if preparation
                has not started.
              </p>
            )}
            <label>
              Correction reason
              <input
                aria-label="Correction reason"
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              />
            </label>
            {stockChoice && (
              <label>
                <input
                  type="checkbox"
                  checked={returnStock}
                  onChange={(e) => {
                    setReturn(e.target.checked);
                    setKey(crypto.randomUUID());
                  }}
                />
                Return unused ingredients
              </label>
            )}
            <button disabled={busy} type="submit">
              Confirm correction
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel correction
            </button>
          </form>
        </div>
      )}
    </>
  );
}
