import React from 'react';
import { FiCheckCircle, FiCircle, FiClock, FiActivity, FiServer, FiDatabase, FiLayout } from 'react-icons/fi';

const DevelopmentStatus = () => {
    const modules = [
        {
            name: "Core & Authentication",
            status: "Completed",
            features: [
                "User Authentication (Login/Logout)",
                "Role-Based Access Control (Owner, Manager, Staff)",
                "Secure Password Hashing (Bcrypt)",
                "Protected Routes & Dashboard Layout"
            ]
        },
        {
            name: "Employee Management & HR",
            status: "Completed",
            features: [
                "Employee List & Profiles (CRUD)",
                "Department & Role Management",
                "Salary Advance Ledger (with EMP ID/Dept)",
                "Bulk Attendance Marking",
                "Attendance Summary Dashboard",
                "Payroll Processing",
                "Payslip Generation"
            ]
        },
        {
            name: "Inventory & Menu",
            status: "Completed",
            features: [
                "Inventory Item Management",
                "Menu Item Management",
                "Recipe Costing (Ingredients Linking)",
                "Stock Tracking"
            ]
        },
        {
            name: "Finance & Accounting",
            status: "Completed",
            features: [
                "Chart of Accounts (Asset, Liability, Revenue, Expense)",
                "General Ledger System",
                "Daily Cash Closing (Summary)",
                "Vendor Payment Recording",
                "Financial Reports"
            ]
        },
        {
            name: "Chicken Procurement Tracker",
            status: "Completed",
            features: [
                "Daily Rate Entry (Tandoor, Boiler, Egg)",
                "Vendor Management (Contact Details, GSTIN)",
                "Markup Rules Configuration",
                "Bill Entry with Variance Calculation",
                "Vendor Ledger"
            ]
        },
        {
            name: "Reporting & Analytics",
            status: "Completed",
            features: [
                "Financial Reports (P&L, Balance Sheet)",
                "HR Reports (Attendance, Salary)",
                "Operations Reports (Sales, Wastage)",
                "AI Insights Dashboard"
            ]
        }
    ];

    const walkthrough = [
        {
            title: "Critical Backend Fixes",
            date: "Latest",
            desc: "Resolved a major transaction management bug across the entire backend. Implemented a dedicated client connection pattern for atomic transactions in Payroll, Finance, Inventory, and Employee modules. This ensures data integrity and prevents partial updates during complex operations."
        },
        {
            title: "Payroll System Stability",
            date: "Latest",
            desc: "Fixed a syntax error in the Payroll Controller that was causing 'Argument expression expected' errors. The 'Mark as Paid' functionality is now fully operational, correctly handling salary history updates, advance deductions, and general ledger entries in a single atomic transaction."
        },
        {
            title: "Vendor Management Upgrade",
            date: "Recent",
            desc: "Enhanced the Vendor Management module by adding detailed contact fields: Contact Person, Email, Address, and GSTIN. These fields are now integrated into the 'Add Supplier' form and displayed in the supplier list for better vendor relationship management."
        },
        {
            title: "Attendance System Overhaul",
            date: "Recent",
            desc: "Upgraded the Bulk Attendance page to include a real-time summary dashboard showing Total, Present, Absent, and Half-Day counts. The employee list now displays EMP ID, Role, and Department, making it easier to identify staff during attendance marking."
        }
    ];

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <FiActivity className="text-zohra-blue" />
                System Development Status
            </h1>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Modules Status Column (Span 2) */}
                <div className="xl:col-span-2 space-y-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FiLayout className="text-purple-400" />
                        Module Breakdown
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {modules.map((mod, idx) => (
                            <div key={idx} className="glass-panel p-5 rounded-xl border border-white/5 hover:border-white/10 transition">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-white">{mod.name}</h3>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${mod.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                                        mod.status === 'In Progress' ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                        }`}>
                                        {mod.status}
                                    </span>
                                </div>
                                <ul className="space-y-2">
                                    {mod.features.map((feat, fIdx) => (
                                        <li key={fIdx} className="flex items-start gap-2 text-sm text-gray-400">
                                            {feat.includes("(Pending)") ? (
                                                <FiCircle className="mt-1 shrink-0 text-gray-600" size={14} />
                                            ) : (
                                                <FiCheckCircle className="mt-1 shrink-0 text-green-500/70" size={14} />
                                            )}
                                            <span className={feat.includes("(Pending)") ? "text-gray-500" : "text-gray-300"}>
                                                {feat}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Walkthrough Column (Span 1) */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FiClock className="text-zohra-blue" />
                        Recent Updates
                    </h2>
                    <div className="glass-panel p-6 rounded-xl border-t-4 border-zohra-blue">
                        <div className="relative border-l-2 border-white/10 ml-3 space-y-8">
                            {walkthrough.map((item, index) => (
                                <div key={index} className="ml-6 relative">
                                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-zohra-blue border-4 border-[#1a1a1a]"></div>
                                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                                    <span className="text-xs text-zohra-blue font-mono mb-2 block">{item.date}</span>
                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        {item.desc}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DevelopmentStatus;
