import React, { useEffect, useState } from "react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import { Page } from "./Workflows";
import CorrectionAction from "./CorrectionAction";
import { useAuth } from "../../context/AuthContext";
export default function OrderPayments() {
  const { userRole } = useAuth();
  const [orders, set] = useState([]),
    [selected, select] = useState(null),
    [amount, setAmount] = useState(""),
    [mode, setMode] = useState("Cash"),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  const load = () => api.get("/orders").then((r) => set(r.data));
  useEffect(() => {
    load().catch(() => toast.error("Failed to load orders"));
  }, []);
  const open = (o) => {
    select(o);
    setAmount(o.outstanding);
    setKey(crypto.randomUUID());
  };
  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(
        "/orders/" + selected.id + "/payments",
        { amount, paymentMode: mode },
        { headers: { "Idempotency-Key": key } },
      );
      await load();
      select(null);
      toast.success("Order payment recorded");
    } catch (e) {
      toast.error(
        e.response?.data?.error ||
          "Payment failed. Retry with the same details.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Orders & Payments">
      {selected && (
        <form className="glass-panel p-4 flex flex-wrap gap-2" onSubmit={pay}>
          <p>Collect payment for order #{selected.id}</p>
          <input
            aria-label="Order payment amount"
            required
            min="0.01"
            max={selected.outstanding}
            step="0.01"
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setKey(crypto.randomUUID());
            }}
          />
          <select
            aria-label="Order payment mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setKey(crypto.randomUUID());
            }}
          >
            {["Cash", "Card", "UPI", "Bank Transfer"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button disabled={busy}>Collect payment</button>
          <button type="button" onClick={() => select(null)}>
            Cancel
          </button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Type/table</th>
              <th>Notes</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.id}</td>
                <td>
                  {o.customer_name || "Walk-in"} {o.customer_phone}
                </td>
                <td>
                  {o.order_type} {o.table_number}
                </td>
                <td>{o.notes}</td>
                <td>₹{Number(o.total_amount).toFixed(2)}</td>
                <td>₹{Number(o.paid_amount).toFixed(2)}</td>
                <td>₹{Number(o.outstanding).toFixed(2)}</td>
                <td>
                  {o.payment_status}
                  {o.refund && (
                    <p>
                      Refund ₹{o.refund.amount} · {o.refund.reason} ·{" "}
                      {o.refund.return_stock
                        ? "Stock returned"
                        : "Stock retained"}
                    </p>
                  )}
                </td>
                <td>
                  {Number(o.outstanding) > 0 && (
                    <button onClick={() => open(o)}>Pay order #{o.id}</button>
                  )}
                  {o.status !== "Cancelled" &&
                    ["owner", "manager"].includes(userRole) && (
                      <CorrectionAction
                        label={"Refund order #" + o.id}
                        endpoint={"/orders/" + o.id + "/refund"}
                        stockChoice
                        onComplete={load}
                      />
                    )}
                  <details>
                    <summary>Payment history</summary>
                    {o.payments.map((p) => (
                      <p key={p.id}>
                        ₹{p.amount} · {p.payment_method} · {p.status}
                      </p>
                    ))}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
