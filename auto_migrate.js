#!/usr/bin/env node

/**
 * Automated Component Migration Script
 * Migrates React components to use centralized API and utilities
 */

const fs = require('fs');
const path = require('path');

const componentsToMigrate = [
    'client/src/pages/EmployeeManagement.jsx',
    'client/src/pages/Payroll.jsx',
    'client/src/pages/Advances.jsx',
    'client/src/pages/Inventory.jsx',
    'client/src/pages/Staff.jsx',
    'client/src/pages/chicken/DailyRates.jsx',
    'client/src/pages/chicken/BillEntry.jsx',
    'client/src/pages/chicken/VendorManager.jsx',
    'client/src/pages/finance/DailySummary.jsx',
    'client/src/pages/finance/ExpenseMapping.jsx',
    'client/src/pages/finance/ManagerFloat.jsx',
    'client/src/pages/BulkAttendance.jsx',
    'client/src/pages/MenuManagement.jsx',
    'client/src/pages/POS.jsx',
    'client/src/pages/MasterDashboard.jsx',
    'client/src/pages/AIDashboard.jsx',
    'client/src/pages/reports/ReportsDashboard.jsx',
    'client/src/pages/reports/FinancialReports.jsx',
    'client/src/pages/reports/HRReports.jsx',
    'client/src/pages/reports/InventoryReports.jsx',
    'client/src/pages/reports/OperationsReports.jsx',
];

function migrateComponent(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return false;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 1. Replace axios import with api import
    if (content.includes("import axios from 'axios'")) {
        const relativePath = filePath.includes('/chicken/') || filePath.includes('/finance/') || filePath.includes('/reports/')
            ? '../../utils/api'
            : '../utils/api';

        content = content.replace(
            /import axios from ['"]axios['"];?\n/g,
            `import api from '${relativePath}';\n`
        );
        modified = true;
    }

    // 2. Replace axios.get calls
    content = content.replace(
        /const token = localStorage\.getItem\(['"]token['"]\);?\s*\n\s*const (\w+) = await axios\.get\(['"]([^'"]+)['"],\s*\{\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}\s*\}\)/g,
        "const $1 = await api.get('$2')"
    );

    // 3. Replace axios.post calls
    content = content.replace(
        /const token = localStorage\.getItem\(['"]token['"]\);?\s*\n\s*await axios\.post\(['"]([^'"]+)['"],\s*([^,]+),\s*\{\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}\s*\}\)/g,
        "await api.post('$1', $2)"
    );

    // 4. Replace standalone token + axios patterns
    content = content.replace(
        /const token = localStorage\.getItem\(['"]token['"]\);?\s*\n\s*const config = \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \};?\s*\n/g,
        ''
    );

    content = content.replace(
        /axios\.get\(([^,]+),\s*config\)/g,
        'api.get($1)'
    );

    content = content.replace(
        /axios\.post\(([^,]+),\s*([^,]+),\s*config\)/g,
        'api.post($1, $2)'
    );

    content = content.replace(
        /axios\.put\(([^,]+),\s*([^,]+),\s*config\)/g,
        'api.put($1, $2)'
    );

    content = content.replace(
        /axios\.delete\(([^,]+),\s*config\)/g,
        'api.delete($1)'
    );

    // 5. Clean up base URL references
    content = content.replace(
        /['"]http:\/\/localhost:5000\/api\//g,
        "'"
    );

    content = content.replace(
        /['"]http:\/\/localhost:3002\/api\//g,
        "'"
    );

    if (modified || content !== fs.readFileSync(filePath, 'utf8')) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Migrated: ${filePath}`);
        return true;
    }

    console.log(`ℹ️  No changes needed: ${filePath}`);
    return false;
}

console.log('🚀 Starting automated migration...\n');

let migratedCount = 0;
componentsToMigrate.forEach(component => {
    if (migrateComponent(component)) {
        migratedCount++;
    }
});

console.log(`\n✅ Migration complete! ${migratedCount}/${componentsToMigrate.length} components migrated.`);
console.log('\n📝 Next steps:');
console.log('1. Review the changes');
console.log('2. Test the application');
console.log('3. Run: npm run dev (client) and npm start (server)');
