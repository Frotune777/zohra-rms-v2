const PERMISSIONS = {
    // Inventory
    INVENTORY_READ: 'inventory:read',
    INVENTORY_WRITE: 'inventory:write',

    // Finance
    FINANCE_READ: 'finance:read',
    FINANCE_WRITE: 'finance:write',

    // POS
    POS_ACCESS: 'pos:access',
    POS_MANAGE_MENU: 'pos:manage_menu',

    // HR & Payroll
    EMPLOYEES_READ: 'employees:read',
    EMPLOYEES_WRITE: 'employees:write',
    PAYROLL_READ: 'payroll:read',
    PAYROLL_WRITE: 'payroll:write',
    ATTENDANCE_WRITE: 'attendance:write',

    // System
    SYSTEM_ADMIN: 'system:admin'
};

const ROLES = {
    OWNER: 'owner',
    MANAGER: 'manager',
    STAFF: 'staff'
};

const ROLE_PERMISSIONS = {
    [ROLES.OWNER]: Object.values(PERMISSIONS), // Owner has everything

    [ROLES.MANAGER]: [
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_WRITE,
        PERMISSIONS.FINANCE_READ, // Read-only finance? Or write too? Let's give write for now.
        PERMISSIONS.FINANCE_WRITE,
        PERMISSIONS.POS_ACCESS,
        PERMISSIONS.POS_MANAGE_MENU,
        PERMISSIONS.EMPLOYEES_READ,
        PERMISSIONS.EMPLOYEES_WRITE,
        PERMISSIONS.PAYROLL_READ,
        PERMISSIONS.PAYROLL_WRITE,
        PERMISSIONS.ATTENDANCE_WRITE
    ],

    [ROLES.STAFF]: [
        PERMISSIONS.POS_ACCESS,
        PERMISSIONS.ATTENDANCE_WRITE,
        // Staff cannot access Finance, Payroll, or detailed Inventory management (maybe read inventory?)
        // Let's keep it minimal as per "Principle of Least Privilege"
    ]
};

module.exports = {
    PERMISSIONS,
    ROLES,
    ROLE_PERMISSIONS
};
