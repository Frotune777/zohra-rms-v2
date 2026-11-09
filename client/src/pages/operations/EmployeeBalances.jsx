import React, { useEffect, useState } from "react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { Page } from "./Workflows";
import CorrectionAction from "./CorrectionAction";
export default function EmployeeBalances() {
  const { userRole } = useAuth(),
    [advances, setAdvances] = useState([]),
    [shorts, setShorts] = useState([]),
    [wallets, setWallets] = useState({ wallets: [], history: [] }),
    [selected, select] = useState(null),
    [amount, setAmount] = useState(""),
    [reference, setReference] = useState(""),
    [mode, setMode] = useState("Cash"),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [reversing, setReversing] = useState(null);
  const load = () =>
    Promise.all([
      api.get("/employees/payroll/advances").then((r) => setAdvances(r.data)),
      api.get("/payroll/shortfalls").then((r) => setShorts(r.data)),
      api.get("/finance/transfer/history").then((r) => setWallets(r.data)),
    ]);
  useEffect(() => {
    load().catch(() => toast.error("Failed to load employee balances"));
  }, []);
  const settle = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/payroll/shortfalls/" + selected.id + "/settle", {
        amount,
        reference,
        paymentMode: mode,
      });
      await load();
      select(null);
      toast.success("Shortfall settlement recorded");
    } catch (e) {
      toast.error(e.response?.data?.error || "Settlement failed");
    } finally {
      setBusy(false);
    }
  };
  const reverse = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(
        "/payroll/shortfalls/" +
          reversing.shortId +
          "/settlements/" +
          reversing.id +
          "/reverse",
        { reason },
      );
      await load();
      setReversing(null);
      toast.success("Settlement reversed");
    } catch (e) {
      toast.error(e.response?.data?.error || "Reversal failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Employee Balances">
      <h3 className="text-xl">Payroll shortfalls</h3>
      <p>
        A negative payout records money owed by the employee. Record a
        settlement when money is received.
      </p>
      {selected && (
        <form onSubmit={settle} className="flex flex-wrap gap-2">
          <input
            aria-label="Shortfall settlement amount"
            type="number"
            min="0.01"
            max={selected.outstanding}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            aria-label="Shortfall payment reference"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <select
            aria-label="Shortfall payment mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {["Cash", "Card", "UPI", "Bank Transfer"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button disabled={busy}>Record settlement</button>
          <button type="button" onClick={() => select(null)}>
            Cancel
          </button>
        </form>
      )}
      {reversing && (
        <form onSubmit={reverse}>
          <input
            aria-label="Settlement reversal reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button disabled={busy}>Reverse settlement</button>
          <button type="button" onClick={() => setReversing(null)}>
            Cancel
          </button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Payroll</th>
              <th>Amount</th>
              <th>Outstanding</th>
              <th>Status/history</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shorts.map((s) => (
              <tr key={s.id}>
                <td>{s.full_name}</td>
                <td>#{s.salary_history_id}</td>
                <td>₹{s.amount}</td>
                <td>₹{s.outstanding}</td>
                <td>
                  {s.status}
                  {s.settlements.map((p) => (
                    <p key={p.id}>
                      ₹{p.amount} · {p.payment_mode} ·{" "}
                      {p.reversed ? "Reversed" : p.reference}{" "}
                      {userRole === "owner" && !p.reversed && (
                        <button
                          onClick={() => {
                            setReversing({ ...p, shortId: s.id });
                            setReason("");
                          }}
                        >
                          Reverse payment #{p.id}
                        </button>
                      )}
                    </p>
                  ))}
                </td>
                <td>
                  {s.status === "Open" && (
                    <button
                      onClick={() => {
                        select(s);
                        setAmount(s.outstanding);
                        setReference(crypto.randomUUID());
                      }}
                    >
                      Settle shortfall #{s.id}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="text-xl">Advance repayment history</h3>
      {advances
        .filter(
          (a) => a.transaction_type === "Repayment" && a.advance_request_id,
        )
        .map((a) => (
          <div key={a.id}>
            {a.employee_name}: ₹{a.amount} · {a.notes}
            {a.reversal ? (
              <p>Reversed · {a.reversal.reason}</p>
            ) : (
              <CorrectionAction
                label={"Reverse repayment #" + a.advance_request_id}
                endpoint={
                  "/employees/payroll/requests/" +
                  a.advance_request_id +
                  "/reverse"
                }
                onComplete={load}
              />
            )}
          </div>
        ))}
      <h3 className="text-xl">Wallet balances and overdrafts</h3>
      {wallets.wallets.map((w) => (
        <p key={w.id}>
          {w.full_name}: ₹{w.balance} · Overdraft ₹{w.overdraft}
        </p>
      ))}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>User</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Before</th>
              <th>After</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {wallets.history.map((h) => (
              <tr key={h.id}>
                <td>{h.full_name}</td>
                <td>{h.direction}</td>
                <td>{h.amount}</td>
                <td>{h.balance_before}</td>
                <td>{h.balance_after}</td>
                <td>{h.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
