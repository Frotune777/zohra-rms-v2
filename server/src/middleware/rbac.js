const checkPermission = (permission) => {
    return (req, res, next) => {
        // For now, we map existing roles to permissions.
        // In the future, this will check a permissions table.
        const rolePermissions = {
            'owner': ['*'], // Owner has all permissions
            'manager': [
                'inventory:view', 'inventory:create', 'inventory:edit',
                'pos:view', 'pos:create',
                'finance:view', 'finance:create',
                'hr:view', 'hr:create', 'hr:edit'
            ],
            'cashier': [
                'pos:view', 'pos:create',
                'inventory:view'
            ],
            'kitchen': [
                'kds:view', 'kds:update'
            ]
        };

        const userRole = req.user?.role;

        if (!userRole) {
            return res.status(403).json({ error: 'Access denied. No role assigned.' });
        }

        if (userRole === 'owner') return next();

        const allowedPermissions = rolePermissions[userRole] || [];

        if (allowedPermissions.includes(permission)) {
            return next();
        }

        return res.status(403).json({ error: `Access denied. Missing permission: ${permission}` });
    };
};

module.exports = { checkPermission };
