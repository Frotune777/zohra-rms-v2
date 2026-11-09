import React, { useEffect, useState } from "react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import CorrectionAction from "./CorrectionAction";
const error = (e) =>
  toast.error(e.response?.data?.error || "Operation failed. Please retry.");
export const Page = ({ title, children }) => (
  <div className="workflow p-4 md:p-6 overflow-y-auto space-y-4 text-white">
    <h2 className="text-2xl font-bold">{title}</h2>
    {children}
  </div>
);
const money = (v) => Number(v || 0).toFixed(2);
function useItems() {
  const [items, set] = useState([]);
  useEffect(() => {
    api
      .get("/inventory")
      .then((r) => set(r.data))
      .catch(error);
  }, []);
  return items;
}
const ItemSelect = ({ items, ...props }) => (
  <select required {...props}>
    <option value="">Select ingredient</option>
    {items.map((i) => (
      <option key={i.id} value={i.id}>
        {i.name} ({i.unit})
      </option>
    ))}
  </select>
);
export function KitchenDisplay() {
  const [tickets, set] = useState([]),
    [busy, setBusy] = useState(null),
    [failure, setFailure] = useState("");
  const load = () =>
    api
      .get("/kds/tickets")
      .then((r) => {
        set(r.data);
        setFailure("");
      })
      .catch(() =>
        setFailure("Kitchen refresh failed. Retry to see current tickets."),
      );
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);
  const advance = async (t) => {
    setBusy(t.id);
    try {
      await api.put("/kds/tickets/" + t.id, {
        status: t.status === "Pending" ? "Preparing" : "Done",
      });
      await load();
    } catch (e) {
      error(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Kitchen Display">
      <button onClick={load}>Refresh tickets</button>
      {failure && <p role="alert">{failure}</p>}
      <div className="grid md:grid-cols-3 gap-4">
        {tickets.map((t) => (
          <article className="glass-panel p-4 space-y-2" key={t.id}>
            <h3 className="font-bold">Ticket #{t.id}</h3>
            <p>
              {t.order_type} {t.table_number && " · Table " + t.table_number}
            </p>
            <p>{t.status}</p>
            <ul>
              {(t.items || []).map((i, n) => (
                <li key={n}>
                  {i.qty} × {i.name}
                </li>
              ))}
            </ul>
            {t.notes && <p>Notes: {t.notes}</p>}
            <button disabled={busy === t.id} onClick={() => advance(t)}>
              {t.status === "Pending" ? "Start preparing" : "Mark done"}
            </button>
          </article>
        ))}
      </div>
      {tickets.length === 0 && !failure && <p>No active kitchen tickets</p>}
    </Page>
  );
}
export function RecipeManagement() {
  const items = useItems(),
    [recipes, set] = useState([]),
    [selected, select] = useState(""),
    [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false);
  const load = () => api.get("/inventory/recipes").then((r) => set(r.data));
  useEffect(() => {
    load().catch(error);
  }, []);
  const choose = (id) => {
    select(id);
    setRows(
      (recipes.find((r) => String(r.id) === id)?.ingredients || []).map(
        (i) => ({
          inventory_item_id: String(i.inventory_item_id),
          quantity_required: i.quantity_required,
        }),
      ),
    );
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/inventory/recipes/" + selected, { ingredients: rows });
      await load();
      toast.success("Recipe saved");
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const patch = (n, key, v) =>
    setRows(rows.map((r, i) => (i === n ? { ...r, [key]: v } : r)));
  return (
    <Page title="Recipe Management">
      <label>
        Menu item
        <select
          aria-label="Recipe menu item"
          value={selected}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">Select menu item</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <form onSubmit={save} className="space-y-3">
          <p>
            Cost per serving: ₹
            {money(recipes.find((r) => String(r.id) === selected)?.recipe_cost)}
          </p>
          {rows.map((r, n) => (
            <div key={n} className="flex flex-wrap gap-2">
              <ItemSelect
                aria-label={"Ingredient " + (n + 1)}
                items={items}
                value={r.inventory_item_id}
                onChange={(e) => patch(n, "inventory_item_id", e.target.value)}
              />
              <input
                aria-label={"Quantity per serving " + (n + 1)}
                required
                type="number"
                min="0.0001"
                step="0.0001"
                value={r.quantity_required}
                onChange={(e) => patch(n, "quantity_required", e.target.value)}
              />
              <button
                type="button"
                aria-label={"Remove ingredient " + (n + 1)}
                onClick={() => setRows(rows.filter((_, i) => i !== n))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setRows([
                ...rows,
                { inventory_item_id: "", quantity_required: "" },
              ])
            }
          >
            Add ingredient
          </button>
          <button disabled={busy} type="submit">
            Save recipe
          </button>
        </form>
      )}
    </Page>
  );
}
export function PurchaseOrders() {
  const inventory = useItems(),
    [suppliers, setSuppliers] = useState([]),
    [orders, setOrders] = useState([]),
    [supplier, setSupplier] = useState(""),
    [rows, setRows] = useState([
      { inventory_item_id: "", qty: "", unit_cost: "" },
    ]),
    [busy, setBusy] = useState(false);
  const load = () => api.get("/inventory/po").then((r) => setOrders(r.data));
  useEffect(() => {
    load().catch(error);
    api
      .get("/inventory/suppliers")
      .then((r) => setSuppliers(r.data))
      .catch(error);
  }, []);
  const patch = (n, key, v) =>
    setRows(rows.map((r, i) => (i === n ? { ...r, [key]: v } : r)));
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/inventory/po", { supplier_id: supplier, items: rows });
      await load();
      setRows([{ inventory_item_id: "", qty: "", unit_cost: "" }]);
      toast.success("Purchase order created");
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const status = async (id, status) => {
    setBusy(true);
    try {
      await api.put("/inventory/po/" + id + "/status", { status });
      await load();
      toast.success("Purchase order " + status.toLowerCase());
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Purchase Orders">
      <form onSubmit={create} className="glass-panel p-4 space-y-3">
        <select
          aria-label="Purchase order supplier"
          required
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        >
          <option value="">Select supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {rows.map((r, n) => (
          <div className="flex flex-wrap gap-2" key={n}>
            <ItemSelect
              aria-label={"Purchase item " + (n + 1)}
              items={inventory}
              value={r.inventory_item_id}
              onChange={(e) => patch(n, "inventory_item_id", e.target.value)}
            />
            <input
              aria-label={"Purchase quantity " + (n + 1)}
              required
              type="number"
              step="0.01"
              min="0.01"
              value={r.qty}
              onChange={(e) => patch(n, "qty", e.target.value)}
            />
            <input
              aria-label={"Purchase unit cost " + (n + 1)}
              required
              type="number"
              step="0.01"
              min="0"
              value={r.unit_cost}
              onChange={(e) => patch(n, "unit_cost", e.target.value)}
            />
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={"Remove purchase item " + (n + 1)}
                onClick={() => setRows(rows.filter((_, i) => n !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setRows([
              ...rows,
              { inventory_item_id: "", qty: "", unit_cost: "" },
            ])
          }
        >
          Add purchase item
        </button>
        <button type="submit" disabled={busy}>
          Create purchase order
        </button>
      </form>
      {orders.map((o) => (
        <article className="glass-panel p-4 space-y-2" key={o.id}>
          <h3>
            PO #{o.id} · {o.supplier_name} · {o.status} · ₹
            {money(o.total_amount)}
          </h3>
          <ul>
            {(o.items || []).map((i, n) => (
              <li key={n}>
                {i.name}: {i.qty} ordered, {i.qty_received} received @ ₹
                {money(i.unit_cost)}
              </li>
            ))}
          </ul>
          {o.status === "Draft" && (
            <button disabled={busy} onClick={() => status(o.id, "Sent")}>
              Send PO #{o.id}
            </button>
          )}
          {["Draft", "Sent"].includes(o.status) && (
            <>
              <button disabled={busy} onClick={() => status(o.id, "Received")}>
                Receive PO #{o.id}
              </button>
              <button disabled={busy} onClick={() => status(o.id, "Cancelled")}>
                Cancel PO #{o.id}
              </button>
            </>
          )}
        </article>
      ))}
    </Page>
  );
}
export function StockWorkflow({ wastage = false }) {
  const items = useItems(),
    [logs, setLogs] = useState([]),
    [item, setItem] = useState(""),
    [qty, setQty] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = wastage ? "/wastage" : "/inventory/adjustments",
    load = () => api.get(endpoint).then((r) => setLogs(r.data));
  useEffect(() => {
    load().catch(error);
  }, [endpoint]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(endpoint, {
        inventory_item_id: item,
        [wastage ? "qty" : "quantity_change"]: qty,
        reason,
      });
      await load();
      setQty("");
      setReason("");
      toast.success(wastage ? "Wastage logged" : "Stock adjusted");
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title={wastage ? "Wastage" : "Stock Adjustments"}>
      <form onSubmit={submit} className="glass-panel p-4 flex flex-wrap gap-3">
        <ItemSelect
          aria-label="Stock item"
          items={items}
          value={item}
          onChange={(e) => setItem(e.target.value)}
        />
        <input
          aria-label={wastage ? "Wasted quantity" : "Quantity change"}
          required
          type="number"
          step="0.0001"
          min={wastage ? "0.0001" : undefined}
          placeholder={wastage ? "Quantity" : "Signed change (+/-)"}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <input
          aria-label="Stock reason"
          required
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button disabled={busy} type="submit">
          {wastage ? "Log wastage" : "Record adjustment"}
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Reason</th>
              <th>Value</th>
              <th>Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.item_name}</td>
                <td>{wastage ? l.qty : l.quantity_change}</td>
                <td>{l.reason}</td>
                <td>
                  ₹
                  {money(
                    wastage
                      ? l.cost
                      : Math.abs(
                          l.value_change ?? l.quantity_change * l.unit_cost,
                        ),
                  )}
                </td>
                <td>
                  {l.actor_name || l.reported_by}
                  {l.correction ? (
                    <p>Reversed · {l.correction.reason}</p>
                  ) : (
                    <CorrectionAction
                      label={
                        (wastage
                          ? "Reverse wastage #"
                          : "Reverse adjustment #") + l.id
                      }
                      endpoint={endpoint + "/" + l.id + "/reverse"}
                      onComplete={load}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
