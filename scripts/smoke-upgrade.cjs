// Browser smoke check for dependency compatibility, not the complete feature audit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit/schema-results.json')));
const database = schema.find(result => result.mode === 'diagnostic-combined').database;
if (!/^zohra_audit_diagnostic(_[0-9]+)?$/.test(database)) throw new Error('Expected a disposable audit database.');
process.env.DATABASE_URL = `postgresql://zohra_audit@127.0.0.1:55439/${database}`;
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'development';
process.env.CLIENT_URL = 'http://127.0.0.1:33029';
const app = require('../server/src/app');
const db = require('../server/src/config/db');
let apiServer, vite, browser;

async function run() {
  apiServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => apiServer.once('listening', resolve));
  process.env.VITE_API_URL = `http://127.0.0.1:${apiServer.address().port}/api`;
  const { createServer } = await import(pathToFileURL(path.join(root, 'client/node_modules/vite/dist/node/index.js')));
  vite = await createServer({root: path.join(root, 'client'),
    configFile: path.join(root, 'client/vite.config.js'),
    server: {host: '127.0.0.1', port: 33029, strictPort: true}});
  await vite.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:33029/login');
  await expect(page.locator('input[type=email]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe('rgb(15, 23, 42)');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('input[type=email]').fill('owner@alzohra.com');
  await page.locator('input[type=password]').fill('owner123');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL('http://127.0.0.1:33029/');
  await expect(page.getByText('No Item Selected', {exact: true})).toBeVisible();
  const routes = [];
  for (const route of ['/dashboard', '/employees', '/reports']) {
    await page.goto(`http://127.0.0.1:33029${route}`);
    await expect(page.locator('h1').first()).toBeVisible();
    routes.push({route, heading: await page.locator('h1').first().textContent()});
  }
  expect(errors).toEqual([]);
  await page.screenshot({path: '/private/tmp/zohra-upgrade-smoke.png', fullPage: true});
  fs.writeFileSync(path.join(root, 'docs/audit/upgrade-smoke.json'),
    JSON.stringify({status: 'passed', scope: 'Login, POS render, direct route reloads, Tailwind background and uncaught browser errors.',
      background, routes, errors, full_feature_audit: 'pending'}, null, 2) + '\n');
  console.log('Dependency browser smoke passed. Complete feature audit remains pending.');
}
run().catch(error => {console.error(error); process.exitCode = 1;}).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (apiServer) await new Promise(resolve => apiServer.close(resolve));
  await db.pool.end();
});
