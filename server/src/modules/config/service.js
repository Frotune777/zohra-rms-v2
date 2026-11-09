const db = require('../../config/db');
const { DomainError } = require('../../utils/domain');

function validateOption(data, partial = false) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DomainError('Configuration option must be an object');
    for (const key of ['value', 'label']) {
        if ((!partial || data[key] !== undefined) && (typeof data[key] !== 'string' || !data[key].trim())) {
            throw new DomainError(`Configuration ${key} must be nonblank text`);
        }
    }
    if (data.display_order !== undefined && (!Number.isInteger(data.display_order) || data.display_order < 0)) throw new DomainError('Display order must be a non-negative integer');
    if (data.is_active !== undefined && typeof data.is_active !== 'boolean') throw new DomainError('Active status must be a boolean');
    if (data.metadata !== undefined && (data.metadata === null || typeof data.metadata !== 'object' || Array.isArray(data.metadata))) throw new DomainError('Metadata must be an object');
}

class ConfigService {
    // Get all options for a specific category
    async getOptions(category, includeInactive = false) {
        const result = await db.query(
            `SELECT id, category, value, label, display_order, is_active, metadata, updated_at
             FROM config_options 
             WHERE category = $1 AND (is_active = true OR $2::boolean)
             ORDER BY display_order ASC, label ASC`,
            [category,includeInactive]
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
        validateOption(data);
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
    async updateOption(id, data, userId = null, category) {
        validateOption(data, true);
        const keys=['value','label','display_order','is_active','metadata'].filter(key=>data[key] !== undefined);
        if(!keys.length) throw new DomainError('No configuration changes provided');
        const values=keys.map(key=>key === 'metadata' ? JSON.stringify(data[key]) : data[key]);
        const result=await db.query('UPDATE config_options SET '+keys.map((key,i)=>key+'=$'+(i+1)).join(',')+',updated_at=NOW() WHERE id=$'+(keys.length+1)+' AND category=$'+(keys.length+2)+' RETURNING *',[...values,id,category]);
        if(!result.rowCount) throw new Error('Configuration option not found');
        return result.rows[0];
    }

    // Delete configuration option
    async deleteOption(id, category) {
        const result = await db.query(
            'DELETE FROM config_options WHERE id = $1 AND category = $2 RETURNING *',
            [id,category]
        );

        if (result.rowCount === 0) {
            throw new Error('Configuration option not found');
        }
        return result.rows[0];
    }

    // Toggle active status
    async toggleActive(id, category) {
        const result = await db.query(
            `UPDATE config_options 
             SET is_active = NOT is_active, updated_at = NOW()
             WHERE id = $1 AND category = $2
             RETURNING *`,
            [id,category]
        );

        if (result.rowCount === 0) {
            throw new Error('Configuration option not found');
        }
        return result.rows[0];
    }

    // Reorder options within a category
    async reorderOptions(category, orderedIds) {
        if (!Array.isArray(orderedIds) || orderedIds.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0) || new Set(orderedIds.map(Number)).size !== orderedIds.length) throw new DomainError('Ordered IDs must be an array of distinct positive integers');
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
        if (!Array.isArray(options)) throw new DomainError('Configuration options must be an array');
        options.forEach(option => validateOption(option));
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
