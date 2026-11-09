const db = require("../../config/db");
const { randomUUID } = require("node:crypto");
const { DomainError, finite } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const InventoryService = require("../inventory/service");
const JournalService = require("../finance/JournalService");
const PaymentModeService = require("../finance/PaymentModeService");

class PosService {
  async getTables() {
    const result = await db.query(
      "SELECT value,label,is_active FROM config_options WHERE category='dining_tables' ORDER BY display_order,value",
    );
    // An explicitly disabled catalog must not fall back to enabled defaults.
    if (result.rows.length) return result.rows.filter(table => table.is_active).map(({value,label}) => ({value,label}));
    return Array.from({length:12}, (_, index) => ({value:String(index+1),label:'Table '+(index+1)}));
  }

  async getMenu() {
    const result = await db.query(
      "SELECT m.*,t.rate_percentage FROM menu_items m LEFT JOIN tax_rates t ON t.id=m.tax_rate_id AND t.is_active=TRUE ORDER BY category",
    );
    return result.rows;
  }

  async addMenuItem(data) {
    const { name, price, category } = data;
    const result = await db.query(
      "INSERT INTO menu_items (name, price, category) VALUES ($1, $2, $3) RETURNING *",
      [name, parseFloat(price), category],
    );
    return result.rows[0];
  }

  async updateMenuItem(id, data) {
    const price = finite(data.price, "Price", { positive: true });
    if (!data.name?.trim() || !data.category?.trim())
      throw new DomainError("Name and category required");
    const result = await db.query(
      "UPDATE menu_items SET name=$1,price=$2,category=$3 WHERE id=$4 RETURNING *",
      [data.name, price, data.category, id],
    );
    if (!result.rowCount) throw new DomainError("Menu item not found", 404);
    return result.rows[0];
  }
  async deleteMenuItem(id) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM recipe_ingredients WHERE menu_item_id = $1",
        [id],
      );
      const result = await client.query(
        "DELETE FROM menu_items WHERE id = $1 RETURNING *",
        [id],
      );
      if (result.rowCount === 0) throw new Error("Menu item not found");
      await client.query("COMMIT");
      return result.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async atomic(fn) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async retry(client, scope, key, data, fn) {
    if (key) {
      if (typeof key !== "string" || key.length > 200)
        throw new DomainError("Invalid retry key");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        scope + ":" + key,
      ]);
      const prior = (
        await client.query(
          "SELECT request,response FROM operation_keys WHERE scope=$1 AND key=$2",
          [scope, key],
        )
      ).rows[0];
      if (prior) {
        const same = (
          await client.query("SELECT $1::jsonb=$2::jsonb AS same", [
            prior.request,
            data,
          ])
        ).rows[0].same;
        if (!same)
          throw new DomainError(
            "Idempotency key reused with different order",
            409,
          );
        return prior.response;
      }
    }
    const result = await fn();
    if (key)
      await client.query(
        "INSERT INTO operation_keys(scope,key,request,response) VALUES($1,$2,$3,$4)",
        [scope, key, data, result],
      );
    return result;
  }
  async createOrder(data, userId, key = null) {
    return this.atomic((client) =>
      this.retry(client, "pos:" + userId, key, data, async () => {
        const money = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
        await assertWritable(client, new Date());
        const { items } = data;
        if (!Array.isArray(items) || !items.length)
          throw new DomainError("Order items required");
        if (new Set(items.map((i) => Number(i.id))).size !== items.length)
          throw new DomainError("Duplicate order items");
        for (const i of items)
          if (!Number.isInteger(finite(i.qty, "Quantity", { positive: true })))
            throw new DomainError("Quantity must be a positive integer");
        const type = data.type || "Dine In";
        if (!["Dine In", "Delivery", "Pick Up"].includes(type))
          throw new DomainError("Invalid order type");
        for (const [field, limit] of [["customerName",100],["customerPhone",20],["tableNumber",null],["notes",null]]) {
          if (data[field] != null && (typeof data[field] !== "string" || (limit && data[field].trim().length > limit)))
            throw new DomainError(field + " must be text" + (limit ? " of at most " + limit + " characters" : ""));
        }
        const mode = data.paymentMethod || data.paymentMode || "Cash";
        const dbItems = (
          await client.query(
            "SELECT m.*,t.rate_percentage,t.account_code AS tax_account FROM menu_items m LEFT JOIN tax_rates t ON t.id=m.tax_rate_id AND t.is_active=TRUE WHERE m.id=ANY($1) ORDER BY m.id FOR SHARE OF m",
            [items.map((i) => i.id)],
          )
        ).rows;
        const map = new Map(dbItems.map((i) => [Number(i.id), i]));
        if (items.some((i) => !map.has(Number(i.id))))
          throw new DomainError("Unknown menu item");
        const subtotal = money(
          items.reduce(
            (sum, i) =>
              sum + finite(map.get(Number(i.id)).price, "Menu price") * i.qty,
            0,
          ),
        );
        const discount = money(finite(data.discount ?? 0, "Discount"));
        if (discount > subtotal)
          throw new DomainError("Discount exceeds subtotal");
        // A fixed order discount reduces the taxable base, allocated proportionally in cents.
        let allocated = 0,
          cumulativeBase = 0;
        const taxes = new Map();
        const priced = items.map((i, index) => {
          const item = map.get(Number(i.id)),
            base = money(Number(item.price) * i.qty);
          cumulativeBase = money(cumulativeBase + base);
          const target =
            index === items.length - 1
              ? discount
              : money(subtotal ? (discount * cumulativeBase) / subtotal : 0);
          const reduction = money(target - allocated);
          allocated = target;
          const taxable = money(base - reduction),
            tax = money(taxable * Number(item.rate_percentage || 0));
          if (tax > 0)
            taxes.set(
              item.tax_account || 2100,
              money((taxes.get(item.tax_account || 2100) || 0) + tax),
            );
          return {
            ...i,
            name: item.name,
            price: Number(item.price),
            lineTotal: money(taxable + tax),
          };
        });
        const tax = money([...taxes.values()].reduce((a, b) => a + b, 0)),
          total = money(subtotal - discount + tax);
        let paid = total;
        const actualMode =
          mode === "Part" ? data.partialPaymentMode || "Cash" : mode;
        if (mode === "Due") paid = 0;
        if (mode === "Part") {
          paid = money(
            finite(data.amountPaid, "Amount paid", { positive: true }),
          );
          if (paid >= total)
            throw new DomainError("Partial payment must be below order total");
        }
        const account =
          paid > 0
            ? await PaymentModeService.getAccountCode(actualMode, client)
            : null;
        let customerId = null;
        if (data.customerPhone?.trim())
          customerId = (
            await client.query(
              "INSERT INTO customers(name,phone) VALUES($1,$2) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,updated_at=NOW() RETURNING id",
              [
                data.customerName?.trim() || "Walk-in",
                data.customerPhone.trim(),
              ],
            )
          ).rows[0].id;
        else if (data.customerName?.trim())
          customerId = (
            await client.query(
              "INSERT INTO customers(name) VALUES($1) RETURNING id",
              [data.customerName.trim()],
            )
          ).rows[0].id;
        const orderNumber = "ORD-" + randomUUID();
        const order = (
          await client.query(
            "INSERT INTO orders(total_amount,payment_mode,status,customer_id,created_by,order_number,order_type,table_number,notes,subtotal,discount_amount,tax_amount,paid_amount,payment_status) VALUES($1,$2,'Completed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
            [
              total,
              mode,
              customerId,
              userId,
              orderNumber,
              type,
              type === "Dine In" ? data.tableNumber?.trim() || null : null,
              data.notes || null,
              subtotal,
              discount,
              tax,
              paid,
              paid === total ? "Paid" : paid > 0 ? "Part" : "Due",
            ],
          )
        ).rows[0];
        const ingredients = new Map();
        for (const item of priced) {
          await client.query(
            "INSERT INTO order_items(order_id,menu_item_id,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5)",
            [order.id, item.id, item.qty, item.price, item.lineTotal],
          );
          const recipe = (
            await client.query(
              "SELECT inventory_item_id,quantity_required FROM recipe_ingredients WHERE menu_item_id=$1 ORDER BY inventory_item_id",
              [item.id],
            )
          ).rows;
          for (const ing of recipe)
            ingredients.set(
              ing.inventory_item_id,
              (ingredients.get(ing.inventory_item_id) || 0) +
                Number(ing.quantity_required) * item.qty,
            );
        }
        const valuation = require("../inventory/valuation");
        let cogs = 0;
        for (const [id, rawQty] of [...ingredients].sort(
          (a, b) => a[0] - b[0],
        )) {
          const qty = Number(rawQty.toFixed(4));
          const stock = await valuation.lock(client, id);
          const cost = valuation.outgoing(stock, qty);
          await valuation.change(client, stock, -qty, -cost);
          cogs += cost;
          await client.query(
            "INSERT INTO inventory_transactions(inventory_item_id,transaction_type,quantity,unit_cost,reference_id,reference_type,value_change) VALUES($1,'Sale',$2,$3,$4,'Order',$5)",
            [id, -qty, cost / qty, order.id, -cost],
          );
          await client.query(
            "INSERT INTO stock_movements(inventory_item_id,movement_type,quantity_change,details,created_by_user_id) VALUES($1,'SALE',$2,$3,$4)",
            [id, -qty, "Order #" + order.id, userId],
          );
        }
        if (total > 0) {
          const lines = [];
          if (paid > 0) lines.push({ account_code: account, debit: paid });
          if (total > paid)
            lines.push({ account_code: 1120, debit: money(total - paid) });
          if (subtotal > discount)
            lines.push({
              account_code: 4000,
              credit: money(subtotal - discount),
            });
          for (const [code, value] of taxes)
            lines.push({ account_code: code, credit: value });
          const je = await JournalService.createJournalEntry(
            {
              date: new Date(),
              description: "POS Order #" + orderNumber,
              reference_type: "POSOrder",
              reference_id: order.id,
              lines,
            },
            client,
          );
          if (paid > 0)
            await client.query(
              "INSERT INTO payment_transactions(order_id,amount,payment_method,status,created_by,journal_entry_id) VALUES($1,$2,$3,'Completed',$4,$5)",
              [order.id, paid, actualMode, userId, je.id],
            );
        }
        if (money(cogs) > 0)
          await JournalService.createJournalEntry(
            {
              date: new Date(),
              description: "COGS Order #" + orderNumber,
              reference_type: "COGS",
              reference_id: order.id,
              lines: [
                { account_code: 5000, debit: money(cogs) },
                { account_code: 1200, credit: money(cogs) },
              ],
            },
            client,
          );
        await client.query(
          "INSERT INTO kds_tickets(order_id,items,station,status) VALUES($1,$2,'Kitchen','Pending')",
          [
            order.id,
            JSON.stringify(
              priced.map((i) => ({ id: i.id, name: i.name, qty: i.qty })),
            ),
          ],
        );
        return {
          success: true,
          orderId: order.id,
          orderNumber,
          totalAmount: total,
          paidAmount: paid,
          outstanding: money(total - paid),
          items: priced,
          order,
        };
      }),
    );
  }
  async listOrders() {
    return (
      await db.query(
        "SELECT o.*,c.name AS customer_name,c.phone AS customer_phone,CASE WHEN o.status='Cancelled' THEN 0 ELSE o.total_amount-o.paid_amount END AS outstanding,(SELECT row_to_json(r) FROM order_refunds r WHERE r.order_id=o.id) AS refund,COALESCE((SELECT jsonb_agg(p ORDER BY p.created_at) FROM payment_transactions p WHERE p.order_id=o.id),'[]') AS payments FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 500",
      )
    ).rows;
  }
  async settleOrder(id, data, userId, key) {
    if (!key) throw new DomainError("Payment retry key required");
    return this.atomic((client) =>
      this.retry(
        client,
        "order-payment:" + userId,
        key,
        { id, ...data },
        async () => {
          const amount =
            Math.round(
              finite(data.amount, "Payment amount", { positive: true }) * 100,
            ) / 100;
          const mode = data.paymentMode || "Cash",
            account = await PaymentModeService.getAccountCode(mode, client);
          await assertWritable(client, new Date(), [account, 1120]);
          const order = (
            await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
              id,
            ])
          ).rows[0];
          if (!order) throw new DomainError("Order not found", 404);
          if (order.status === "Cancelled")
            throw new DomainError(
              "Cancelled orders cannot receive payments",
              409,
            );
          if (
            amount <= 0 ||
            Math.round(amount * 100) >
              Math.round(Number(order.total_amount) * 100) -
                Math.round(Number(order.paid_amount) * 100)
          )
            throw new DomainError(
              "Payment exceeds outstanding order balance",
              409,
            );
          const payment = (
            await client.query(
              "INSERT INTO payment_transactions(order_id,amount,payment_method,status,reference_number,created_by,idempotency_key) VALUES($1,$2,$3,'Completed',$4,$5,$6) RETURNING *",
              [id, amount, mode, data.reference || null, userId, key],
            )
          ).rows[0];
          const je = await JournalService.createJournalEntry(
            {
              date: new Date(),
              description: "Order payment #" + id,
              reference_type: "OrderSettlement",
              reference_id: payment.id,
              lines: [
                { account_code: account, debit: amount },
                { account_code: 1120, credit: amount },
              ],
            },
            client,
          );
          await client.query(
            "UPDATE payment_transactions SET journal_entry_id=$2 WHERE id=$1",
            [payment.id, je.id],
          );
          const updated = (
            await client.query(
              "UPDATE orders SET paid_amount=paid_amount+$2,payment_status=CASE WHEN paid_amount+$2=total_amount THEN 'Paid' ELSE 'Part' END WHERE id=$1 RETURNING *",
              [id, amount],
            )
          ).rows[0];
          return { success: true, payment, order: updated };
        },
      ),
    );
  }
}
module.exports = new PosService();
