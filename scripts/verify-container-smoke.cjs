const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict"),
  { execFileSync } = require("child_process");
const root = process.cwd();
const config = process.env.ZOHRA_CONTAINER_COMPOSE,
  project = process.env.ZOHRA_CONTAINER_PROJECT;
if (!config || !/^zohra_rms_verification_[0-9]+$/.test(project || ""))
  throw new Error(
    "Explicit isolated verification project and compose file required.",
  );
const base = ["compose", "-p", project, "-f", config];
const sql = (q) =>
  execFileSync(
    "docker",
    [
      ...base,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "admin",
      "-d",
      "alzohra_db",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      q,
    ],
    { encoding: "utf8" },
  ).trim();
(async () => {
  const version = sql("SHOW server_version");
  assert(version.startsWith("15."));
  const empty = Number(
    sql(
      "SELECT (SELECT count(*) FROM employees)+(SELECT count(*) FROM users)+(SELECT count(*) FROM inventory_items)+(SELECT count(*) FROM menu_items)+(SELECT count(*) FROM orders)",
    ),
  );
  assert.equal(empty, 0);
  const repeat = JSON.parse(
    execFileSync(
      "docker",
      [
        ...base,
        "exec",
        "-T",
        "server",
        "node",
        "scripts/migrate.js",
        "--check",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(repeat.pending, []);
  const hash = await require(
    path.join(root, "server/node_modules/bcryptjs"),
  ).hash("Container-test-password-42", 4);
  sql(
    "INSERT INTO users(email,password_hash,full_name,role,status) VALUES('owner@container.invalid','" +
      hash +
      "','Synthetic Container Owner','owner','active')",
  );
  const login = await fetch("http://127.0.0.1:5002/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@container.invalid",
      password: "Container-test-password-42",
    }),
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).token;
  const api = async (method, url, data, key) => {
    const res = await fetch("http://127.0.0.1:5002/api/" + url, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = await res.json();
    assert(res.ok, JSON.stringify(body));
    return body;
  };
  const stock = await api("POST", "inventory", {
    name: "Container Chicken",
    stock_qty: 20,
    unit_cost: 150,
    unit: "kg",
  });
  const menu = await api("POST", "menu", {
    name: "Container Bowl",
    price: 250,
    category: "Biryani",
  });
  await api("PUT", "inventory/recipes/" + menu.id, {
    ingredients: [{ inventory_item_id: stock.id, quantity_required: 0.25 }],
  });
  const sale = await api(
    "POST",
    "orders",
    {
      items: [{ id: menu.id, qty: 1 }],
      paymentMethod: "Part",
      amountPaid: 50,
      customerPhone: "container-refund",
    },
    "checkout",
  );
  await api(
    "POST",
    "orders/" + sale.orderId + "/payments",
    { amount: 20, paymentMode: "Card" },
    "collection",
  );
  const refund = await api(
    "POST",
    "orders/" + sale.orderId + "/refund",
    { reason: "Container reversal smoke", returnStock: true },
    "refund",
  );
  assert.equal(Number(refund.refund.amount), 70);
  assert.equal(
    Number(sql("SELECT stock_qty FROM inventory_items WHERE id=" + stock.id)),
    20,
  );
  assert.equal(
    Number(sql("SELECT stock_value FROM inventory_items WHERE id=" + stock.id)),
    3000,
  );
  const playwright = require(path.join(root, "node_modules/@playwright/test"));
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(
    (actor) => {
      localStorage.setItem("token", actor.token);
      localStorage.setItem("user", JSON.stringify(actor.user));
    },
    { token, user: (await api("GET", "auth/me")).user },
  );
  await page.goto("http://127.0.0.1:3003/orders");
  await playwright
    .expect(
      page.getByRole("heading", { name: "Orders & Payments", exact: true }),
    )
    .toBeVisible();
  await playwright
    .expect(page.getByText("Stock returned", { exact: false }))
    .toBeVisible();
  await browser.close();
  const health = (await fetch("http://127.0.0.1:5002/health")).status;
  assert.equal(health, 200);
  const evidence = {
    verified_at: new Date().toISOString(),
    postgres: version,
    node: execFileSync(
      "docker",
      [...base, "exec", "-T", "server", "node", "--version"],
      { encoding: "utf8" },
    ).trim(),
    fresh_business_rows: empty,
    repeat_check: repeat,
    all_services_healthy: true,
    api_health: health,
    browser_order_refund: "passed",
    signed_stock_value_restoration: 3000,
    scope:
      "Fresh canonical bootstrap, clean Dockerfile builds, real API/Chromium partial sale/collection/full-refund smoke on PostgreSQL 15. Full Playwright suite runs separately on PostgreSQL 14.",
  };
  fs.writeFileSync(
    "docs/audit/phase2/container-verification.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
