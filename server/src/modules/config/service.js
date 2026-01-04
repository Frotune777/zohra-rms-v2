const db = require('../../config/db');

class ConfigService {
    // Get all options for a specific category
    async getOptions(category) {
        const result = await db.query(
            `SELECT id, category, value, label, display_order, is_active, metadata, updated_at
             FROM config_options 
             WHERE category = $1 AND is_active = true
             ORDER BY display_order ASC, label ASC`,
            [category]
        );
        return result.rows;
    }

    // Get all categories with their option counts
    async getAllCategories() {
        const result = await db.query(
            `SELECT 
                category,
                COUNT(*) as total_options,
                COUNT(*) FILTER (WHERE is_active = true) as active_options
             FROM config_options
             GROUP BY category
             ORDER BY category`
        );
        return result.rows;
    }

    // Add new configuration option
    async addOption(data, userId = null) {
        const { category, value, label, display_order = 0, metadata = {} } = data;

        const result = await db.query(
            `INSERT INTO config_options (category, value, label, display_order, metadata, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [category, value, label, display_order, JSON.stringify(metadata), userId]
        );
        return result.rows[0];
    }

    // Update existing configuration option
    async updateOption(id, data, userId = null) {
        const { value, label, display_order, is_active, metadata } = data;

        const result = await db.query(
            `UPDATE config_options 
             SET value = $1, 
                 label = $2, 
                 display_order = $3, 
                 is_active = $4,
                 metadata = $5,
                 updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [value, label, display_order, is_active, JSON.stringify(metadata || {}), id]
        );

        if (result.rowCount === 0) {
            throw new Error('Configuration option not found');
        }
        return result.rows[0];
    }

    // Delete configuration option
    async deleteOption(id) {
        const result = await db.query(
            'DELETE FROM config_options WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rowCount === 0) {
            throw new Error('Configuration option not found');
        }
        return result.rows[0];
    }

    // Toggle active status
    async toggleActive(id) {
        const result = await db.query(
            `UPDATE config_options 
             SET is_active = NOT is_active, updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) {
            throw new Error('Configuration option not found');
        }
        return result.rows[0];
    }

    // Reorder options within a category
    async reorderOptions(category, orderedIds) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            for (let i = 0; i < orderedIds.length; i++) {
                await client.query(
                    'UPDATE config_options SET display_order = $1, updated_at = NOW() WHERE id = $2 AND category = $3',
                    [i + 1, orderedIds[i], category]
                );
            }

            await client.query('COMMIT');
            return { success: true, message: 'Options reordered successfully' };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // Bulk import options
    async bulkImport(category, options, userId = null) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const results = [];
            for (const option of options) {
                const result = await client.query(
                    `INSERT INTO config_options (category, value, label, display_order, metadata, created_by)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (category, value) DO UPDATE
                     SET label = EXCLUDED.label,
                         display_order = EXCLUDED.display_order,
                         metadata = EXCLUDED.metadata,
                         updated_at = NOW()
                     RETURNING *`,
                    [category, option.value, option.label, option.display_order || 0, JSON.stringify(option.metadata || {}), userId]
                );
                results.push(result.rows[0]);
            }

            await client.query('COMMIT');
            return results;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new ConfigService();
