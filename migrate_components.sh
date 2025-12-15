#!/bin/bash

# Batch Migration Script for Al Zohra RMS
# This script helps migrate components to use centralized API and formatting utilities

echo "🚀 Starting batch migration..."
echo ""

# Components to migrate
COMPONENTS=(
  "client/src/pages/EmployeeManagement.jsx"
  "client/src/pages/Payroll.jsx"
  "client/src/pages/Advances.jsx"
  "client/src/pages/Inventory.jsx"
  "client/src/pages/Staff.jsx"
  "client/src/pages/chicken/DailyRates.jsx"
  "client/src/pages/chicken/BillEntry.jsx"
  "client/src/pages/chicken/VendorManager.jsx"
  "client/src/pages/finance/DailySummary.jsx"
  "client/src/pages/finance/ExpenseMapping.jsx"
  "client/src/pages/finance/ManagerFloat.jsx"
)

echo "📋 Components to migrate: ${#COMPONENTS[@]}"
echo ""

# Create backup directory
BACKUP_DIR="client/src/pages_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "💾 Creating backups in $BACKUP_DIR..."
for component in "${COMPONENTS[@]}"; do
  if [ -f "$component" ]; then
    cp "$component" "$BACKUP_DIR/"
    echo "  ✓ Backed up: $component"
  fi
done

echo ""
echo "✅ Migration preparation complete!"
echo ""
echo "Next steps:"
echo "1. Review the migration guide: client/MIGRATION_GUIDE.md"
echo "2. Migrate components one by one"
echo "3. Test each component after migration"
echo "4. Backups are available in: $BACKUP_DIR"
echo ""
echo "Quick migration checklist per component:"
echo "  [ ] Replace 'import axios' with 'import api'"
echo "  [ ] Remove manual token handling"
echo "  [ ] Add validation using utility functions"
echo "  [ ] Replace form fields with reusable components"
echo "  [ ] Apply formatCurrency for all amounts"
echo "  [ ] Test the component"
