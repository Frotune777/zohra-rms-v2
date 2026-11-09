const bcrypt = require("../server/node_modules/bcryptjs");
async function seed(pool) {
  await pool.query("BEGIN");
  try {
    await pool.query(
      "INSERT INTO employees(full_name,first_name,last_name,position,employee_code,base_salary,status) VALUES('Demo Cook','Demo','Cook','Cook','DEMO-001',30000,'active'),('Demo Server','Demo','Server','Waiter','DEMO-002',20000,'active'),('Demo Manager','Demo','Manager','Manager','DEMO-003',45000,'active')",
    );
    await pool.query(
      "INSERT INTO inventory_items(name,stock_qty,unit_cost,unit) VALUES('Demo Chicken',50,150,'kg'),('Demo Rice',40,50,'kg')",
    );
    await pool.query(
      "INSERT INTO menu_items(name,price,category) VALUES('Chicken Bowl',250,'Biryani'),('Rice Bowl',100,'Curry')",
    );
    await pool.query(
      "INSERT INTO recipe_ingredients(menu_item_id,inventory_item_id,quantity_required) VALUES(1,1,0.25),(1,2,0.5),(2,2,0.5)",
    );
    await pool.query(
      "INSERT INTO chart_of_accounts(code,name,type) VALUES (1051,'Demo staff wallet','Asset'),(1052,'Demo manager wallet','Asset'),(2001,'Demo chicken payable','Liability'),(2002,'Demo grocery payable','Liability') ON CONFLICT(code) DO NOTHING",
    );
    for (const [role, employee, account] of [
      ["owner", null, 3001],
      ["manager", 3, 1052],
      ["staff", 1, 1051],
    ]) {
      const hash = await bcrypt.hash(role + "123", 10);
      await pool.query(
        "INSERT INTO users(password_hash,employee_id,ledger_account_code,status,email,full_name,role) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          hash,
          employee,
          account,
          "active",
          role + "@alzohra.com",
          "Demo " + role,
          role,
        ],
      );
    }
    await pool.query(
      "INSERT INTO suppliers(name,vendor_type,markup_required,opening_balance,ledger_account_code) VALUES ('Demo Chicken Supplier','Chicken',true,0,2001),('Demo Grocery Supplier','Grocery',false,0,2002)",
    );
    await pool.query(
      "INSERT INTO daily_rates(date,tandoor_rate,boiler_rate,egg_rate,status) VALUES(CURRENT_DATE,150,100,6,'confirmed') ON CONFLICT(date) DO UPDATE SET tandoor_rate=150,boiler_rate=100,egg_rate=6,status='confirmed'",
    );
    await pool.query(
      "INSERT INTO markup_rules(supplier_id,item_name,base_rate_type,op1,val1) SELECT id,'Tandoori','TandoorRate','+',10 FROM suppliers WHERE name='Demo Chicken Supplier' ON CONFLICT(supplier_id,item_name) DO NOTHING",
    );
    await pool.query(
      "INSERT INTO attendance(employee_id,date,status) SELECT e.id,d::date,'Present' FROM employees e CROSS JOIN generate_series(CURRENT_DATE-6,CURRENT_DATE,INTERVAL '1 day') d WHERE e.status='active' ON CONFLICT(employee_id,date) DO NOTHING",
    );
    const inventory = Number(
      (
        await pool.query(
          "SELECT COALESCE(SUM(stock_qty*unit_cost),0) AS value FROM inventory_items",
        )
      ).rows[0].value,
    );
    const header = (
      await pool.query(
        "INSERT INTO journal_entries(transaction_date,description,reference_type,reference_id) VALUES(CURRENT_DATE-1,'Disposable demo opening balances','DemoOpening','initial') RETURNING id",
      )
    ).rows[0].id;
    for (const [account, debit, credit] of [
      [1000, 50000, 0],
      [1010, 100000, 0],
      [1020, 25000, 0],
      [1030, 10000, 0],
      [1200, inventory, 0],
      [3001, 0, 185000 + inventory],
    ]) {
      await pool.query(
        "INSERT INTO ledger_lines(journal_entry_id,account_code,debit,credit) VALUES($1,$2,$3,$4)",
        [header, account, debit, credit],
      );
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

module.exports = seed;
