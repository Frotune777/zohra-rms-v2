const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ROLE_PERMISSIONS, ROLES } = require('../config/permissions');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in environment variables');
}

// Resolve account status and role on every request rather than trusting stale claims.
const verifyToken = async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Bearer token required' });
    let decoded;
    try { decoded = jwt.verify(match[1], JWT_SECRET); }
    catch { return res.status(403).json({ error: 'Invalid token' }); }
    try {
        const result = await db.query('SELECT id,email,full_name,role,status,employee_id,ledger_account_code FROM users WHERE id=$1',[decoded.id]);
        const user = result.rows[0];
        if (!user || user.status !== 'active') return res.status(403).json({ error: 'Account is inactive or unavailable' });
        req.user = { ...user, permissions: ROLE_PERMISSIONS[user.role] || [] };
        next();
    } catch (err) { next(err); }
};

// Check role-based access (Deprecated, prefer requirePermission)
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

// Check permission-based access
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Owner bypass
        if (req.user.role === ROLES.OWNER) {
            return next();
        }

        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: permission
            });
        }

        next();
    };
};

module.exports = { verifyToken, checkRole, requirePermission, JWT_SECRET };
