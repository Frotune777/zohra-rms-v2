const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

async function analyze() {
    const client = await pool.connect();
    try {
        // Fetch raw descriptions containing vendor info
        const res = await client.query(`
            SELECT description 
            FROM transactions 
            WHERE description LIKE '%Vendor/Remark:%'
        `);

        // Extract and count raw vendor names
        const rawCounts = {};

        res.rows.forEach(row => {
            // Description format: "Item (Vendor/Remark: VALUE)"
            const match = row.description.match(/Vendor\/Remark: (.*)\)$/);
            if (match) {
                const rawName = match[1].trim();
                rawCounts[rawName] = (rawCounts[rawName] || 0) + 1;
            }
        });

        // 1. Basic Cleaning & Grouping
        const normalized = {}; // key: lowercase_name, value: { target: best_case_name, variants: [original_names], total_count }

        Object.entries(rawCounts).forEach(([name, count]) => {
            const low = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(); // Remove symbols for comparisons
            if (!normalized[low]) {
                normalized[low] = {
                    target: name, // Default target to first seen (will pick most frequent later)
                    variants: [],
                    total_count: 0
                };
            }
            normalized[low].variants.push({ name, count });
            normalized[low].total_count += count;

            // Update target to be the most frequent casing
            const currentBest = normalized[low].variants.reduce((a, b) => a.count > b.count ? a : b);
            normalized[low].target = currentBest.name;
        });

        // 2. Fuzzy Matching to Merge Groups
        // Convert to array for comparison
        let groups = Object.values(normalized).sort((a, b) => b.total_count - a.total_count);
        const finalGroups = [];
        const mergedIndices = new Set();

        for (let i = 0; i < groups.length; i++) {
            if (mergedIndices.has(i)) continue;

            const mainGroup = groups[i];
            const similarGroups = [];

            for (let j = i + 1; j < groups.length; j++) {
                if (mergedIndices.has(j)) continue;

                const otherGroup = groups[j];

                // Rules for similarity:
                // 1. Very short strings must match exactly (handled by basic grouping)
                // 2. Longer strings: Levenshtein distance <= 2 OR contains substring
                const dist = levenshtein(mainGroup.target.toLowerCase(), otherGroup.target.toLowerCase());
                const isSubstring = mainGroup.target.toLowerCase().includes(otherGroup.target.toLowerCase()) ||
                    otherGroup.target.toLowerCase().includes(mainGroup.target.toLowerCase());

                const minLen = Math.min(mainGroup.target.length, otherGroup.target.length);
                const isSimilar = (dist <= 2 && minLen > 3) || (dist <= 1 && minLen > 2);

                if (isSimilar) {
                    similarGroups.push(otherGroup);
                    mergedIndices.add(j);
                }
            }

            // Merge similar into main
            if (similarGroups.length > 0) {
                similarGroups.forEach(g => {
                    mainGroup.variants = [...mainGroup.variants, ...g.variants];
                    mainGroup.total_count += g.total_count;
                });
                // Recalculate best target based on total combined counts
                const allVariants = mainGroup.variants; // flatten
                const variantCounts = {};
                allVariants.forEach(v => variantCounts[v.name] = (variantCounts[v.name] || 0) + v.count);
                const bestName = Object.entries(variantCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
                mainGroup.target = bestName;
            }
            finalGroups.push(mainGroup);
        }

        // Generate Markdown Report
        let md = `# Vendor Normalization Analysis\n\n`;
        md += `Found ${Object.keys(rawCounts).length} unique raw vendor strings.\n`;
        md += `Consolidated into ${finalGroups.length} distinct groups.\n\n`;
        md += `## Proposed Mappings\n\n`;
        md += `| Proposed Vendor Name | Raw Variants (Count) | Total Records |\n`;
        md += `| :--- | :--- | :--- |\n`;

        const mappings = {};

        finalGroups.forEach(group => {
            // Sort variants by count
            const variantStr = group.variants
                .sort((a, b) => b.count - a.count)
                .map(v => `\`${v.name}\` (${v.count})`)
                .join(', ');

            md += `| **${group.target}** | ${variantStr} | ${group.total_count} |\n`;

            // Save mapping for easy execution later
            group.variants.forEach(v => {
                mappings[v.name] = group.target;
            });
        });

        // Write artifact
        const reportPath = path.join(__dirname, '../../vendor_normalization_report.md');
        const mappingPath = path.join(__dirname, 'vendor_mapping.json');

        fs.writeFileSync(reportPath, md);
        fs.writeFileSync(mappingPath, JSON.stringify(mappings, null, 2));

        console.log(`Report generated: ${reportPath}`);
        console.log(`Mapping JSON generated: ${mappingPath}`);

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

analyze();
