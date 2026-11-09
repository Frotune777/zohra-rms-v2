const { defineConfig, devices } = require('@playwright/test');
const path=require('node:path');
const atRoot=file=>path.join(__dirname,file);
module.exports = defineConfig({
  testDir:atRoot('tests/audit'), testMatch:'**/*.spec.cjs',
  globalSetup:atRoot('tests/audit/global-setup.cjs'), globalTeardown:atRoot('tests/audit/global-teardown.cjs'),
  fullyParallel:false, workers:1, retries:0, forbidOnly:true,
  timeout:35000, expect:{timeout:5000}, outputDir:atRoot('test-results/audit'),
  reporter:[['list'],[atRoot('tests/audit/reporter.cjs')],['html',{outputFolder:atRoot('playwright-report/audit'),open:'never'}]],
  use:{baseURL:'http://127.0.0.1:33129', trace:'retain-on-failure', screenshot:'only-on-failure', ...devices['Desktop Chrome']},
  webServer:{
    cwd:__dirname,
    command:'npm --prefix client run dev -- --host 127.0.0.1 --port 33129 --strictPort',
    url:'http://127.0.0.1:33129/login', reuseExistingServer:false,
    env:{VITE_API_URL:'http://127.0.0.1:33130/api'}, timeout:30000,
  },
});
