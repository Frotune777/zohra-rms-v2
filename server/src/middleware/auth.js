const jwt = require('jsonwebtoken');
const { ROLE_PERMISSIONS, ROLES } = require('../config/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // Attach permissions to user object for easy checking
        const role = req.user.role || ROLES.STAFF; // Default to staff
        req.user.permissions = ROLE_PERMISSIONS[role] || [];

        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
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
