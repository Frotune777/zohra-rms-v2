const db = require("../../config/db");
const { DomainError, finite } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const JournalService = require("../finance/JournalService");

class InventoryService {
  // --- Helper Logic ---
  calculateExpectedRate(rawRates, rule) {
    if (!rawRates || !rule) return 0.0;

    const { tandoor_rate, boiler_rate, egg_rate } = rawRates;
    const {
      base_rate_type,
      op1,
      val1,
      op2,
      val2,
      threshold_val,
      threshold_op,
      threshold_markup_op,
      threshold_markup_val,
    } = rule;

    let rate = 0.0;
    if (base_rate_type === "TandoorRate") rate = parseFloat(tandoor_rate);
    else if (base_rate_type === "BoilerRate") rate = parseFloat(boiler_rate);
    else if (base_rate_type === "EggRate") rate = parseFloat(egg_rate);

    const applyOp = (currentVal, op, operand) => {
      if (operand === null || operand === undefined || op === "" || op === null)
        return currentVal;
      const val = parseFloat(operand);
      if (op === "+") return currentVal + val;
      if (op === "-") return currentVal - val;
      if (op === "*") return currentVal * val;
      if (op === "/") return val !== 0 ? currentVal / val : currentVal;
      return currentVal;
    };

    rate = applyOp(rate, op1, val1);
    if (op2 && val2 !== null) {
      rate = applyOp(rate, op2, val2);
    }

    // Apply optional conditional markup (if threshold is met)
    if (
      threshold_val !== null &&
      threshold_markup_op &&
      threshold_markup_val !== null
    ) {
      let baseForThreshold = 0;
      if (base_rate_type === "TandoorRate")
        baseForThreshold = parseFloat(tandoor_rate);
      else if (base_rate_type === "BoilerRate")
        baseForThreshold = parseFloat(boiler_rate);
      else if (base_rate_type === "EggRate")
        baseForThreshold = parseFloat(egg_rate);

      let thresholdMet = false;
      const thresh = parseFloat(threshold_val);
      if (threshold_op === ">") thresholdMet = baseForThreshold > thresh;
      else if (threshold_op === "<") thresholdMet = baseForThreshold < thresh;
      else if (threshold_op === ">=") thresholdMet = baseForThreshold >= thresh;
      else if (threshold_op === "<=") thresholdMet = baseForThreshold <= thresh;
      else if (threshold_op === "==")
        thresholdMet = baseForThreshold === thresh;

      if (thresholdMet) {
        rate = applyOp(rate, threshold_markup_op, threshold_markup_val);
      }
    }

    return Math.max(0.0, parseFloat(rate.toFixed(2)));
  }

  // --- Core Inventory Operations ---

  async getAllItems() {
    const result = await db.query(
      "SELECT * FROM inventory_items ORDER BY name",
    );
    return result.rows;
  }

  async addItem(data, userId) {
    const { name, stock_qty, unit, unit_cost } = data;
    finite(stock_qty, "Stock quantity");
    finite(unit_cost, "Unit cost");

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        "INSERT INTO inventory_items(name,stock_qty,unit,unit_cost,created_by_user_id) VALUES($1,0,$2,$3,$4) RETURNING *",
        [name, unit, unit_cost, userId],
      );
      let newItem = result.rows[0];
      if (Number(stock_qty) > 0) {
        await require("./workflows").adjust(
          client,
          newItem.id,
          stock_qty,
          "Initial Stock",
          userId,
        );
        newItem = (
          await client.query("SELECT * FROM inventory_items WHERE id=$1", [
            newItem.id,
          ])
        ).rows[0];
      }

      await client.query("COMMIT");
      return newItem;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateItem(id, data, userId) {
    const { name, stock_qty, unit, unit_cost } = data;
    finite(stock_qty, "Stock quantity");
    finite(unit_cost, "Unit cost");

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      await assertWritable(client, new Date(), [1200, 6200]);
      const current = (
        await client.query(
          "SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!current) throw new DomainError("Item not found", 404);
      const qty = Number(stock_qty),
        cost = Number(unit_cost),
        diff = Number((qty - Number(current.stock_qty)).toFixed(4));
      if (diff)
        await require("./workflows").adjust(
          client,
          id,
          diff,
          data.adjustment_reason || "Inventory edit",
          userId,
        );
      if (cost !== Number(current.unit_cost)) {
        const updated = (
          await client.query("SELECT * FROM inventory_items WHERE id=$1", [id])
        ).rows[0];
        const value = Number(
          (qty * cost - require("./valuation").valueOf(updated)).toFixed(2),
        );
        const revaluation = (
          await client.query(
            "INSERT INTO stock_revaluations(inventory_item_id,stock_qty,previous_cost,new_cost,value_change,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [
              id,
              qty,
              current.unit_cost,
              cost,
              value,
              data.adjustment_reason || "Unit cost edit",
              userId,
            ],
          )
        ).rows[0];
        if (value) {
          const je = await JournalService.createJournalEntry(
            {
              date: new Date(),
              description: "Inventory cost change #" + revaluation.id,
              reference_type: "StockRevaluation",
              reference_id: revaluation.id,
              lines:
                value > 0
                  ? [
                      { account_code: 1200, debit: value },
                      { account_code: 6200, credit: value },
                    ]
                  : [
                      { account_code: 6200, debit: -value },
                      { account_code: 1200, credit: -value },
                    ],
            },
            client,
          );
          await client.query(
            "UPDATE stock_revaluations SET journal_entry_id=$2 WHERE id=$1",
            [revaluation.id, je.id],
          );
        }
      }
      const after = (
        await client.query("SELECT * FROM inventory_items WHERE id=$1", [id])
      ).rows[0];
      const finalValue =
        cost !== Number(current.unit_cost)
          ? require("./valuation").money(qty * cost)
          : require("./valuation").valueOf(after);
      const result = await client.query(
        "UPDATE inventory_items SET name=$1,stock_qty=$2,unit=$3,unit_cost=$4,stock_value=$6 WHERE id=$5 RETURNING *",
        [name, qty, unit, cost, id, finalValue],
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async adjustStock(
    itemId,
    quantityChange,
    type,
    details,
    userId,
    client = null,
  ) {
    const shouldRelease = !client;
    if (shouldRelease) {
      client = await db.pool.connect();
      await client.query("BEGIN");
    }

    try {
      // Update inventory_items
      const op = quantityChange >= 0 ? "+" : "-";
      const absQty = Math.abs(quantityChange);

      const res = await client.query(
        `UPDATE inventory_items 
                 SET stock_qty = stock_qty ${op} $1, updated_at = NOW() 
                 WHERE id = $2 RETURNING *`,
        [absQty, itemId],
      );

      if (res.rowCount === 0)
        throw new Error(`Inventory item ${itemId} not found`);

      // Log movement
      await client.query(
        `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_change, details, created_by_user_id)
                 VALUES ($1, $2, $3, $4, $5)`,
        [itemId, type, absQty, details, userId],
      );

      if (shouldRelease) await client.query("COMMIT");
      return res.rows[0];
    } catch (e) {
      if (shouldRelease) await client.query("ROLLBACK");
      throw e;
    } finally {
      if (shouldRelease) client.release();
    }
  }

  async deleteItem(id) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      // Delete recipe ingredients first
      await client.query(
        "DELETE FROM recipe_ingredients WHERE inventory_item_id = $1",
        [id],
      );
      const result = await client.query(
        "DELETE FROM inventory_items WHERE id = $1 RETURNING *",
        [id],
      );

      if (result.rowCount === 0) throw new Error("Item not found");

      await client.query("COMMIT");
      return result.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // --- Daily Rates ---

  async getDailyRates(date) {
    const result = await db.query(
      `SELECT dr.*, u.full_name as updated_by_name 
             FROM daily_rates dr
             LEFT JOIN users u ON dr.updated_by = u.id
             WHERE dr.date = $1`,
      [date],
    );
    return result.rows[0] || null;
  }

  async saveDailyRates(data, userId = null) {
    const { date, tandoor_rate, boiler_rate, egg_rate } = data;
    for (const key of ["tandoor_rate", "boiler_rate", "egg_rate"])
      finite(data[key], key);

    // Determine status based on whether all rates are filled
    const hasAllRates = tandoor_rate > 0 && boiler_rate > 0 && egg_rate > 0;
    const status = hasAllRates ? "confirmed" : "pending";

    const result = await db.query(
      `INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate, status, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (date) DO UPDATE 
             SET tandoor_rate = EXCLUDED.tandoor_rate,
                 boiler_rate = EXCLUDED.boiler_rate,
                 egg_rate = EXCLUDED.egg_rate,
                 status = EXCLUDED.status,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = NOW()
             RETURNING *`,
      [date, tandoor_rate, boiler_rate, egg_rate, status, userId],
    );
    return result.rows[0];
  }

  async getRateStatus() {
    const result = await db.query(
      "SELECT date FROM daily_rates ORDER BY date DESC LIMIT 10",
    );
    return result.rows;
  }

  async getAllRatesCalendar(startDate, endDate) {
    // Get all dates with rates and their status within the date range
    const result = await db.query(
      `SELECT 
                TO_CHAR(date, 'YYYY-MM-DD') as date, 
                tandoor_rate, 
                boiler_rate, 
                egg_rate,
                COALESCE(status, 'pending') as status
            FROM daily_rates 
            WHERE date >= $1 AND date <= $2
            ORDER BY date ASC`,
      [startDate, endDate],
    );
    return result.rows;
  }

  // --- Suppliers & Markup ---

  async getSuppliers() {
    const result = await db.query("SELECT * FROM suppliers ORDER BY name");
    return result.rows;
  }

  async createSupplier(data) {
    const {
      name,
      phone,
      payment_type,
      vendor_type,
      markup_required,
      contact_person,
      email,
      address,
      gstin,
    } = data;

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Ledger Code for Vendor Payables (Range 2001+)
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('supplier-account-code'))",
      );
      const codeRes = await client.query(
        "SELECT MAX(code) as max_code FROM chart_of_accounts WHERE code >= 2001 AND code < 3000",
      );
      let nextCode = (codeRes.rows[0].max_code || 2000) + 1;

      // 2. Create Account
      await client.query(
        "INSERT INTO chart_of_accounts (code, name, type) VALUES ($1, $2, 'Liability')",
        [nextCode, "Payable - " + name],
      );

      // 3. Create Supplier
      const result = await client.query(
        `INSERT INTO suppliers (name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin, ledger_account_code)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          name,
          phone,
          payment_type,
          vendor_type,
          markup_required,
          contact_person,
          email,
          address,
          gstin,
          nextCode,
        ],
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateSupplier(id, data) {
    const {
      name,
      phone,
      payment_type,
      vendor_type,
      markup_required,
      contact_person,
      email,
      address,
      gstin,
    } = data;
    const result = await db.query(
      `UPDATE suppliers 
             SET name = $1, phone = $2, payment_type = $3, vendor_type = $4, markup_required = $5,
                 contact_person = $6, email = $7, address = $8, gstin = $9, updated_at = NOW()
                 , opening_balance = COALESCE($11, opening_balance)
             WHERE id = $10
             RETURNING *`,
      [
        name,
        phone,
        payment_type,
        vendor_type,
        markup_required,
        contact_person,
        email,
        address,
        gstin,
        id,
        data.opening_balance ?? null,
      ],
    );
    if (result.rowCount === 0) throw new Error("Supplier not found");
    return result.rows[0];
  }

  async getMarkupRules(supplierId) {
    const result = await db.query(
      "SELECT * FROM markup_rules WHERE supplier_id = $1",
      [supplierId],
    );
    return result.rows;
  }

  async saveMarkupRule(data) {
    this.validateMarkup(data);
    const {
      supplier_id,
      item_name,
      base_rate_type,
      op1,
      val1,
      op2,
      val2,
      threshold_val,
      threshold_op,
      threshold_markup_op,
      threshold_markup_val,
    } = data;
    const result = await db.query(
      `INSERT INTO markup_rules (
                supplier_id, item_name, base_rate_type, 
                op1, val1, op2, val2,
                threshold_val, threshold_op, threshold_markup_op, threshold_markup_val
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (supplier_id, item_name) DO UPDATE
             SET base_rate_type = EXCLUDED.base_rate_type,
                 op1 = EXCLUDED.op1, val1 = EXCLUDED.val1,
                 op2 = EXCLUDED.op2, val2 = EXCLUDED.val2,
                 threshold_val = EXCLUDED.threshold_val,
                 threshold_op = EXCLUDED.threshold_op,
                 threshold_markup_op = EXCLUDED.threshold_markup_op,
                 threshold_markup_val = EXCLUDED.threshold_markup_val
             RETURNING *`,
      [
        supplier_id,
        item_name,
        base_rate_type,
        op1,
        val1,
        op2 || null,
        val2 ?? null,
        threshold_val ?? null,
        threshold_op || null,
        threshold_markup_op || null,
        threshold_markup_val ?? null,
      ],
    );
    return result.rows[0];
  }

  async updateMarkupRule(id, data) {
    this.validateMarkup(data);
    const {
      item_name,
      base_rate_type,
      op1,
      val1,
      op2,
      val2,
      threshold_val,
      threshold_op,
      threshold_markup_op,
      threshold_markup_val,
    } = data;
    const result = await db.query(
      `UPDATE markup_rules 
             SET item_name = $1, base_rate_type = $2, 
                 op1 = $3, val1 = $4, op2 = $5, val2 = $6,
                 threshold_val = $7, threshold_op = $8,
                 threshold_markup_op = $9, threshold_markup_val = $10
             WHERE id = $11
             RETURNING *`,
      [
        item_name,
        base_rate_type,
        op1,
        val1,
        op2 || null,
        val2 ?? null,
        threshold_val ?? null,
        threshold_op || null,
        threshold_markup_op || null,
        threshold_markup_val ?? null,
        id,
      ],
    );
    if (result.rowCount === 0) throw new Error("Markup rule not found");
    return result.rows[0];
  }

  async deleteMarkupRule(id) {
    const result = await db.query(
      "DELETE FROM markup_rules WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rowCount === 0) throw new Error("Markup rule not found");
    return result.rows[0];
  }

  // --- Bill Entries ---
  validateMarkup(data) {
    for (const [operator, operand] of [
      ["op1", "val1"],
      ["op2", "val2"],
      ["threshold_markup_op", "threshold_markup_val"],
    ]) {
      if (!data[operator]) continue;
      if (
        !["+", "-", "*", "/"].includes(data[operator]) ||
        !Number.isFinite(Number(data[operand]))
      )
        throw new DomainError("Invalid markup operation");
      if (data[operator] === "/" && Number(data[operand]) === 0)
        throw new DomainError("Division by zero is not allowed");
    }
  }

  async createBillEntry(data, userId) {
    const { date, supplier_id, item_name, qty, vendor_rate } = data;
    finite(qty, "Quantity", { positive: true });
    finite(vendor_rate, "Vendor rate");

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      await assertWritable(client, date, [1200]);
      if (
        !(
          await client.query("SELECT id FROM suppliers WHERE id = $1", [
            supplier_id,
          ])
        ).rowCount
      )
        throw new DomainError("Supplier not found", 404);
      const ratesRes = await client.query(
        "SELECT * FROM daily_rates WHERE date = $1",
        [date],
      );
      if (ratesRes.rows.length === 0)
        throw new Error("Daily rates not set for this date");
      const rawRates = ratesRes.rows[0];

      const ruleRes = await client.query(
        "SELECT * FROM markup_rules WHERE supplier_id = $1 AND item_name = $2",
        [supplier_id, item_name],
      );

      let expected_rate = 0;
      if (ruleRes.rows.length > 0) {
        expected_rate = this.calculateExpectedRate(rawRates, ruleRes.rows[0]);
      }

      const variance =
        (parseFloat(vendor_rate) - expected_rate) * parseFloat(qty);

      const result = await client.query(
        `INSERT INTO bill_entries (date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending') RETURNING *`,
        [
          date,
          supplier_id,
          item_name,
          qty,
          vendor_rate,
          expected_rate,
          variance,
        ],
      );
      const billEntry = result.rows[0];

      // Pending bills do not make unapproved stock available for consumption.
      const matched = (
        await client.query(
          "SELECT id FROM inventory_items WHERE LOWER(name)=LOWER($1) ORDER BY id",
          [item_name],
        )
      ).rows;
      if (matched.length > 1)
        throw new DomainError("Ambiguous inventory item name");
      const stockUpdated = false,
        inventoryItemId = matched[0]?.id || null;

      // Return bill entry with stock update status
      await client.query("COMMIT");
      return {
        ...billEntry,
        stock_updated: stockUpdated,
        inventory_item_id: inventoryItemId,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateBillStatus(id, status, userId) {
    if (!["Pending", "Approved", "Rejected"].includes(status))
      throw new DomainError("Invalid bill status");
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get current bill details
      const candidate = (
        await client.query("SELECT * FROM bill_entries WHERE id=$1", [id])
      ).rows[0];
      if (!candidate) throw new DomainError("Bill entry not found", 404);
      await assertWritable(client, candidate.date);
      const supplier = (
        await client.query("SELECT * FROM suppliers WHERE id = $1 FOR UPDATE", [
          candidate.supplier_id,
        ])
      ).rows[0];
      const bill = (
        await client.query(
          "SELECT * FROM bill_entries WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !bill ||
        bill.supplier_id !== candidate.supplier_id ||
        new Date(bill.date).getTime() !== new Date(candidate.date).getTime()
      )
        throw new DomainError("Bill changed during approval; retry", 409);
      const oldStatus = bill.status;
      await assertWritable(client, bill.date, [
        1200,
        supplier.ledger_account_code || 2000,
      ]);
      if (oldStatus === status) {
        await client.query("COMMIT");
        return bill;
      }
      if (
        oldStatus === "Rejected" ||
        (oldStatus === "Approved" && status === "Pending")
      )
        throw new DomainError("Bill cannot return to an earlier status", 409);

      // 2. Update status
      const result = await client.query(
        `UPDATE bill_entries SET status = $1 WHERE id = $2 RETURNING *`,
        [status, id],
      );
      const updatedBill = result.rows[0];

      // 3. Handle Ledger Logic
      if (status === "Approved" && oldStatus !== "Approved") {
        const matched = (
          await client.query(
            "SELECT id FROM inventory_items WHERE LOWER(name)=LOWER($1) ORDER BY id",
            [bill.item_name],
          )
        ).rows;
        if (matched.length > 1)
          throw new DomainError("Ambiguous inventory item name");
        if (matched.length)
          await require("./valuation").receive(
            client,
            matched[0].id,
            bill.qty,
            Math.round(Number(bill.qty) * Number(bill.vendor_rate) * 100) / 100,
            "Bill",
            bill.id,
            userId,
          );
        // APPROVAL ACTION: Add to ledger
        const billAmount =
          Math.round(Number(bill.qty) * Number(bill.vendor_rate) * 100) / 100;
        if (billAmount > 0) {
          await client.query(
            `INSERT INTO vendor_ledger (date, supplier_id, transaction_type, amount, details, created_by, bill_entry_id)
                         VALUES ($1, $2, 'Bill', $3, $4, $5, $6)`,
            [
              bill.date,
              bill.supplier_id,
              billAmount,
              `Bill for ${bill.item_name} (${bill.qty} x ${bill.vendor_rate})`,
              userId,
              bill.id,
            ],
          );
          await JournalService.createJournalEntry(
            {
              date: bill.date,
              description: "Bill #" + bill.id + " - " + bill.item_name,
              reference_type: "Bill",
              reference_id: bill.id,
              lines: [
                { account_code: 1200, debit: billAmount },
                {
                  account_code: supplier.ledger_account_code || 2000,
                  credit: billAmount,
                },
              ],
            },
            client,
          );
        }
      } else if (
        (status === "Pending" || status === "Rejected") &&
        oldStatus === "Approved"
      ) {
        const receipts = (
          await client.query(
            "SELECT * FROM stock_receipts WHERE source_type='Bill' AND source_id=$1 ORDER BY inventory_item_id",
            [String(bill.id)],
          )
        ).rows;
        for (const receipt of receipts)
          await require("./corrections").returnReceipt(
            client,
            receipt,
            "Bill rejected",
            userId,
          );
        const amount =
          Math.round(Number(bill.qty) * Number(bill.vendor_rate) * 100) / 100;
        if (amount > 0) {
          const outstanding = Number(
            (
              await client.query(
                "SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1",
                [bill.supplier_id],
              )
            ).rows[0].outstanding_balance,
          );
          if (outstanding < amount)
            throw new DomainError("A settled bill cannot be rejected", 409);
          await client.query(
            "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount,details,created_by,bill_entry_id) VALUES($1,$2,'Bill',$3,$4,$5,$6)",
            [
              bill.date,
              bill.supplier_id,
              -amount,
              "Reversal of bill #" + bill.id,
              userId,
              bill.id,
            ],
          );
          const original = await client.query(
            "SELECT id FROM journal_entries WHERE reference_type = 'Bill' AND reference_id = $1",
            [String(bill.id)],
          );
          if (!original.rowCount)
            throw new DomainError("Bill journal is missing", 409);
          await JournalService.reverseJournalEntry(
            original.rows[0].id,
            "Bill rejected",
            bill.date,
            client,
          );
        }
      }

      await client.query("COMMIT");
      return updatedBill;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error updating bill status:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  async getBillEntries(query) {
    const { date, supplierId, status } = query;
    let sql = `
            SELECT b.*, s.name as supplier_name 
            FROM bill_entries b
            JOIN suppliers s ON b.supplier_id = s.id
            WHERE 1=1
        `;
    const params = [];
    let pIdx = 1;

    if (date) {
      sql += ` AND b.date = $${pIdx++}`;
      params.push(date);
    }
    if (supplierId) {
      sql += ` AND b.supplier_id = $${pIdx++}`;
      params.push(supplierId);
    }
    if (status) {
      sql += ` AND b.status = $${pIdx++}`;
      params.push(status);
    }

    sql += " ORDER BY b.created_at DESC";
    const result = await db.query(sql, params);
    return result.rows;
  }

  async getBillSummary(query) {
    const { date, supplierId } = query;
    let sql = `
            SELECT 
                COUNT(*) as total_entries,
                COALESCE(SUM(qty * vendor_rate), 0) as total_amount,
                COALESCE(SUM(qty * expected_rate), 0) as total_expected,
                COALESCE(SUM(variance), 0) as total_variance,
                COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count
            FROM bill_entries
            WHERE 1=1
        `;
    const params = [];
    let pIdx = 1;

    if (date) {
      sql += ` AND date = $${pIdx++}`;
      params.push(date);
    }
    if (supplierId) {
      sql += ` AND supplier_id = $${pIdx++}`;
      params.push(supplierId);
    }

    const result = await db.query(sql, params);
    const data = result.rows[0];

    const totalAmount = parseFloat(data.total_amount);
    const totalVariance = parseFloat(data.total_variance);
    const variancePercentage =
      totalAmount > 0 ? ((totalVariance / totalAmount) * 100).toFixed(2) : 0;

    return {
      total_entries: parseInt(data.total_entries),
      total_amount: totalAmount,
      total_expected: parseFloat(data.total_expected),
      total_variance: totalVariance,
      variance_percentage: variancePercentage,
      approved_count: parseInt(data.approved_count),
      pending_count: parseInt(data.pending_count),
    };
  }

  async getVendorLedger(supplierId) {
    const result = await db.query(
      "SELECT * FROM vendor_ledger WHERE supplier_id = $1 ORDER BY date DESC, created_at DESC",
      [supplierId],
    );
    return result.rows;
  }
}

module.exports = new InventoryService();
