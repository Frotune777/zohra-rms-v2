"""
File: migration_tool.py
Purpose: Transforms and migrates legacy Excel 'Key Data.xls' data to the new RMS PostgreSQL database.

Dependencies:
External:
- pandas>=2.0.0: Data manipulation and Excel parsing
- sqlalchemy>=2.0.0: Database ORM and connection
- psycopg2-binary>=2.9.0: PostgreSQL driver
- openpyxl>=3.1.0: Excel file support (.xlsx)
- xlrd>=2.0.1: Excel file support (.xls)
- python-dotenv>=1.0.0: Environment variable management
Internal:
- database/01_init.sql: Reference for table schemas

Key Components:
Classes:
- DataMigrator: Orchestrates ETL from legacy files to postgres
Functions:
- None

Last Modified: 2026-04-22
Modified By: Fortune

Open Tasks:
- [ ] [HIGH] Integrate attendance and ledger migrations in next pass [1h]

Related Files:
- database/cleanup_samples.sql: Data wipe logic
"""

import logging
import os
from datetime import datetime
from typing import Dict

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataMigrator:
    """
    Orchestrates the migration of legacy restaurant data.

    Design Pattern: Strategy - encapsulates specific migration logic.

    Attributes:
        db_url (str): Connection string for out database.
        engine (Engine): SQLAlchemy engine instance.
        employee_map (dict): Lookup map for mapping employee keys.

    Public Methods:
        - run_migration(): Main entry point for migration.
        - prepare_db(): Prepares db constraints and default values.
        - migrate_employees(): Seeds the employees table.
        - migrate_chicken_rates(): Migrates paper rates.
        - migrate_vendor_bills(): Migrates daily chicken weight bills.

    Private Methods:
        - _execute(): Helper for direct inserts.

    Usage Flow:
        1. Instantiate with URL.
        2. Call run_migration() to start ETL.
    """

    def __init__(self, db_url: str):
        self.db_url = db_url
        self.engine = create_engine(db_url)
        self.employee_map: Dict[str, int] = {}
        self.discrepancies: list[str] = []
        self.active_employee_ids: set[int] = set()

    def run_migration(self) -> None:
        """
        Executes the migration pipeline for Key Data.xls.

        Logic:
            Step 1: Apply constraints and insert default suppliers
            Step 2: Migrate Employee master list
            Step 3: Migrate historical chicken paper rates
            Step 4: Migrate historical vendor bills (chicken weights)

        Parameters:
            None

        Returns:
            None
        """
        logger.info("Starting migration process...")
        self.prepare_db()

        key_data_file = "Key Data.xls"
        if os.path.exists(key_data_file):
            self.migrate_employees(key_data_file)
            self.migrate_chicken_rates(key_data_file)
            self.migrate_vendor_bills(key_data_file)
        else:
            logger.error(f"{key_data_file} not found!")

        att_data_file = "AL Zohra Attendance(1).xlsx"
        if os.path.exists(att_data_file):
            self.migrate_attendance(att_data_file)
        else:
            logger.error(f"{att_data_file} not found!")

        ledger_file = "Daily_Restaurant_Tracking - Daily Transactions(1).csv"
        if os.path.exists(ledger_file):
            self.migrate_ledger(ledger_file)
        else:
            logger.error(f"{ledger_file} not found!")

        self.sync_employee_statuses()
        self.save_review_log()
        logger.info("Full Data migration complete.")

    def prepare_db(self) -> None:
        """
        Ensures the 'Golden Chicken Supplier' exists and table constraints are ready.

        Logic:
            Step 1: Insert default vendor if not exists.
        """
        logger.info("Preparing database...")
        with self.engine.connect() as conn:
            conn.execute(
                text(
                    "INSERT INTO suppliers (name, vendor_type) VALUES (:name, :type) "
                    "ON CONFLICT DO NOTHING"
                ),
                {"name": "Golden Chicken Supplier", "type": "Meat"},
            )
            conn.commit()

            try:
                conn.execute(
                    text(
                        "ALTER TABLE employees ADD CONSTRAINT unique_employee_composite "
                        "UNIQUE (full_name, position)"
                    )
                )
                conn.commit()
            except Exception as e:
                logger.debug(f"Constraint might already exist: {e}")

    def migrate_employees(self, file_path: str) -> None:
        """
        Extracts master data from EMP List sheet and seeds employees table.

        Logic:
            Step 1: Load EMP List sheet
            Step 2: Generate employee code using EMP-prefix
            Step 3: Insert and retrieve mapping ID

        Parameters:
            file_path (str): File path for Key Data.xls
        """
        logger.info("Migrating employees...")
        xl = pd.ExcelFile(file_path)
        df = pd.read_excel(xl, sheet_name="EMP List")
        # Ensure clean data by dropping duplicated records based on identity composite
        df = df.drop_duplicates(subset=['Name', 'Role', 'Department'], keep='first')

        for idx, row in df.iterrows():
            name = str(row.get("Name", "")).strip()
            role = str(row.get("Role", "")).strip()
            dept = str(row.get("Department", "")).strip()
            emp_key = str(row.get("Key", f"{name}{role}{dept}"))

            if not name or name.lower() == "nan":
                continue

            try:
                salary = float(pd.to_numeric(row.get("Salary", 0), errors="coerce"))
                if pd.isna(salary):
                    salary = 0.0
            except Exception:
                salary = 0.0

            emp_code = f"EMP{idx + 1:04d}"

            combined_position = f"{role} - {dept}" if dept else role

            with self.engine.connect() as conn:
                res = conn.execute(
                    text(
                        "INSERT INTO employees (full_name, position, base_salary, employee_code) "
                        "VALUES (:name, :pos, :salary, :code) "
                        "ON CONFLICT (full_name, position) DO UPDATE "
                        "SET base_salary = EXCLUDED.base_salary, employee_code = EXCLUDED.employee_code "
                        "RETURNING id"
                    ),
                    {
                        "name": name,
                        "pos": combined_position,
                        "salary": salary,
                        "code": emp_code,
                    },
                )
                emp_id = res.scalar()
                if not emp_id:
                    res = conn.execute(
                        text(
                            "SELECT id FROM employees WHERE full_name = :name "
                            "AND position = :pos"
                        ),
                        {"name": name, "pos": combined_position},
                    )
                    emp_id = res.scalar()

                if emp_id:
                    self.employee_map[emp_key] = emp_id
                conn.commit()

    def migrate_chicken_rates(self, file_path: str) -> None:
        """
        Migrates historical paper rates from the Paper Rate sheet.

        Logic:
            Step 1: Get Golden Chicken Supplier id.
            Step 2: Commit daily rates per meat type (tandoor, boiler, egg) per date.

        Parameters:
            file_path (str): Excel file path.
        """
        logger.info("Migrating paper rates...")
        try:
            xl = pd.ExcelFile(file_path)
            df = pd.read_excel(xl, sheet_name="Paper Rate")

            for _, row in df.iterrows():
                dt = row.get("Date")
                if pd.isna(dt):
                    continue

                t_rate = (
                    0.0 if pd.isna(row.get("Tandoor")) else float(row.get("Tandoor", 0))
                )
                b_rate = (
                    0.0 if pd.isna(row.get("Boiler")) else float(row.get("Boiler", 0))
                )
                e_rate = 0.0 if pd.isna(row.get("Egg")) else float(row.get("Egg", 0))

                with self.engine.connect() as conn:
                    conn.execute(
                        text(
                            "INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate) "
                            "VALUES (:dt, :tr, :br, :er) ON CONFLICT DO NOTHING"
                        ),
                        {
                            "dt": dt,
                            "tr": t_rate,
                            "br": b_rate,
                            "er": e_rate,
                        },
                    )
                    conn.commit()
        except Exception as e:
            logger.error(f"Failed to migrate paper rates: {e}")
            self.discrepancies.append(f"Paper Rates Error: {e}")

    def migrate_vendor_bills(self, file_path: str) -> None:
        """
        Migrates daily received weights and converts them into bill entries.

        Logic:
            Step 1: Iterate over custom cuts (Tandoori, Spl Leg, Boneless, etc.).
            Step 2: If weight > 0, insert a record into bill_entries.
            Step 3: vendor_rate, expected_rate, variance remain 0 as custom markups dictate these later.

        Parameters:
            file_path (str): Excel file path.
        """
        logger.info("Migrating vendor bills (weights)...")
        try:
            xl = pd.ExcelFile(file_path)
            df = pd.read_excel(xl, sheet_name="Chicken Daily weight")

            with self.engine.connect() as conn:
                res = conn.execute(
                    text("SELECT id FROM suppliers WHERE name = :name"),
                    {"name": "Golden Chicken Supplier"},
                )
                supplier_id = res.scalar()

            # The columns mapping directly to the item name string for billing
            cuts = [
                "Dressing Tandoor",
                "Tandoori",
                "Spl Leg",
                "Boneless",
                "Full Leg",
                "Wings",
                "Boiler",
                "Egg",
            ]

            for _, row in df.iterrows():
                dt = row.get("Date")
                if pd.isna(dt):
                    continue

                for cut in cuts:
                    if cut in df.columns:
                        qty = row.get(cut)
                        if pd.notna(qty) and float(qty) > 0:
                            with self.engine.connect() as conn:
                                conn.execute(
                                    text(
                                        "INSERT INTO bill_entries (date, supplier_id, item_name, qty, "
                                        "vendor_rate, expected_rate, variance, status) "
                                        "VALUES (:dt, :sid, :iname, :qty, 0, 0, 0, 'Pending') "
                                        "ON CONFLICT DO NOTHING"
                                    ),
                                    {
                                        "dt": dt,
                                        "sid": supplier_id,
                                        "iname": cut,
                                        "qty": float(qty),
                                    },
                                )
                                conn.commit()
        except Exception as e:
            logger.error(f"Failed to migrate vendor bills: {e}")
            self.discrepancies.append(f"Vendor Bills Error: {e}")

    def migrate_attendance(self, file_path: str) -> None:
        """
        Transforms custom wide-format attendance data into normalized Postgres rows.
        Handles monthly sheets with day-number columns.

        Logic:
            Step 1: Iterate through month-named sheets.
            Step 2: Parse Month and Year from sheet title.
            Step 3: Extract day columns from the header row.
            Step 4: Iterate data rows, mapping to employees and constructing dates.
        """
        logger.info("Migrating attendance...")
        try:
            xl = pd.ExcelFile(file_path)
            months = [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                "July", "Aug", "Sept", "Oct", "Nov", "Dec"
            ]

            for sheet in xl.sheet_names:
                # Skip helper sheets
                if not any(m in sheet for m in months):
                    continue

                # Attempt to parse Month and Year (e.g., 'Apr-2026', 'Dec-24')
                try:
                    parts = sheet.split("-")
                    m_str = parts[0].strip()
                    y_str = parts[1].strip()
                    if len(y_str) == 2:
                        y_str = f"20{y_str}"
                except (IndexError, ValueError):
                    continue

                df = pd.read_excel(xl, sheet_name=sheet, header=None)

                # Find Day Columns in Row 1 (they are numeric 1-31)
                day_map = {}
                row_1 = df.iloc[1]
                for col_idx, val in enumerate(row_1):
                    try:
                        day_num = int(float(val))
                        if 1 <= day_num <= 31:
                            day_map[col_idx] = day_num
                    except (ValueError, TypeError):
                        continue

                # Data starts from row 4
                for row_idx, row in df.iloc[4:].iterrows():
                    try:
                        # Corrected Indices: Index 1: Name, 3: Role, 4: Dept
                        name = str(row.iloc[1]).strip()
                        role = str(row.iloc[3]).strip()
                        dept = str(row.iloc[4]).strip()
                        
                        # Position construction to match migrate_employees
                        pos = f"{role} - {dept}" if dept and dept != "nan" else role
                        
                        # Index 0 is ID
                        id_val = str(row.iloc[0]).strip()
                        key = id_val if id_val and id_val != "nan" else f"{name}{pos}"
                    except IndexError:
                        continue

                    if name == "nan" or not name:
                        continue

                    # Lookup using either ID key or Name+Position
                    emp_id = self.employee_map.get(key) or self.employee_map.get(f"{name}{pos}")
                    if not emp_id:
                        # Fallback: try mapping without the dash if it failed
                        emp_id = self.employee_map.get(f"{name}{role}{dept}")
                    
                    if not emp_id:
                        continue

                    self.active_employee_ids.add(emp_id)

                    for col_idx, day_val in day_map.items():
                        status_raw = str(row.iloc[col_idx]).strip().lower()
                        if status_raw == "nan" or not status_raw:
                            continue

                        # Map status
                        if "present" in status_raw or status_raw == "p":
                            status = "Present"
                        elif "off" in status_raw or "absent" in status_raw or status_raw == "a":
                            status = "Absent"
                        elif "half" in status_raw:
                            status = "Half-Day"
                        else:
                            status = "Absent"

                        # Construct date string for parsing
                        # month-name might be 'Nov' or 'November' or 'Sept' - pandas is usually good
                        date_str = f"{day_val}-{m_str}-{y_str}"
                        try:
                            # Try multiple possible date formats
                            dt = pd.to_datetime(date_str, errors="coerce")
                            if pd.isna(dt):
                                continue
                        except Exception:
                            continue

                        with self.engine.connect() as conn:
                            conn.execute(
                                text(
                                    "INSERT INTO attendance (employee_id, date, status) "
                                    "VALUES (:eid, :dt, :stat) ON CONFLICT DO NOTHING"
                                ),
                                {"eid": emp_id, "dt": dt, "stat": status},
                            )
                            conn.commit()
        except Exception as e:
            logger.error(f"Failed to migrate attendance: {e}")
            self.discrepancies.append(f"Attendance Error: {e}")

    def migrate_ledger(self, file_path: str) -> None:
        """
        Routes legacy financial transactions into double-entry ledger lines.

        Logic:
            Step 1: Read CSV without date boundaries.
            Step 2: Parse 'Category' for account_code mapping.
            Step 3: Execute Dr/Cr inserts to preserve balance.

        Parameters:
            file_path (str): CSV file path.
        """
        logger.info("Migrating ledger...")
        try:
            df = pd.read_csv(file_path)
            df["Date"] = pd.to_datetime(
                df["Date"], dayfirst=True, format="mixed", errors="coerce"
            )
            df = df[df["Date"].notnull()]

            for _, row in df.iterrows():
                item_desc = str(row.get("Item/Description", ""))
                remarks = str(row.get("Remarks", ""))
                desc = f"{item_desc} - {remarks}".strip()

                try:
                    amount = float(pd.to_numeric(row.get("Amount", 0), errors="coerce"))
                    if pd.isna(amount) or amount == 0:
                        continue
                except Exception:
                    continue

                cat = str(row.get("Category", "Unknown"))
                dt = row["Date"]

                with self.engine.connect() as conn:
                    res = conn.execute(
                        text(
                            "INSERT INTO journal_entries (description, transaction_date) "
                            "VALUES (:desc, :dt) RETURNING id"
                        ),
                        {"desc": desc, "dt": dt},
                    )
                    je_id = res.scalar()

                    if "Sale" in cat:
                        conn.execute(
                            text(
                                "INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES (:id, 1000, :amt)"
                            ),
                            {"id": je_id, "amt": amount},
                        )
                        conn.execute(
                            text(
                                "INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES (:id, 4000, :amt)"
                            ),
                            {"id": je_id, "amt": amount},
                        )
                    else:
                        conn.execute(
                            text(
                                "INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES (:id, 6000, :amt)"
                            ),
                            {"id": je_id, "amt": amount},
                        )
                        conn.execute(
                            text(
                                "INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES (:id, 1000, :amt)"
                            ),
                            {"id": je_id, "amt": amount},
                        )

                    conn.commit()
        except Exception as e:
            logger.error(f"Failed to migrate ledger: {e}")
            self.discrepancies.append(f"Ledger Error: {e}")

    def sync_employee_statuses(self) -> None:
        """
        Updates employee status based on attendance activity and logs history.

        Logic:
            Step 1: Fetch all employees.
            Step 2: Compare with active_employee_ids.
            Step 3: Update employees.status and insert employee_history entry.
        """
        logger.info("Syncing employee statuses...")
        try:
            with self.engine.connect() as conn:
                res = conn.execute(text("SELECT id, status FROM employees"))
                all_employees = res.fetchall()

                for emp_id, current_status in all_employees:
                    new_status = (
                        "active" if emp_id in self.active_employee_ids else "inactive"
                    )

                    # Update status if changed or if we want to force initial log
                    conn.execute(
                        text("UPDATE employees SET status = :status WHERE id = :id"),
                        {"status": new_status, "id": emp_id},
                    )

                    # Log initial/changed status in employee_history
                    conn.execute(
                        text(
                            "INSERT INTO employee_history (employee_id, field_changed, old_value, new_value, changed_by) "
                            "VALUES (:eid, 'status', :old, :new, 'system_migration')"
                        ),
                        {
                            "eid": emp_id,
                            "old": current_status,
                            "new": new_status,
                        },
                    )
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to sync employee statuses: {e}")
            self.discrepancies.append(f"Status Sync Error: {e}")

    def save_review_log(self) -> None:
        """
        Saves discrepancies to a local file for manual review.
        """
        if self.discrepancies:
            with open("migration_review_needed.log", "w") as f:
                for line in self.discrepancies:
                    f.write(f"{line}\n")
            logger.warning(
                f"Generated review log with {len(self.discrepancies)} entries."
            )


if __name__ == "__main__":
    load_dotenv()
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://admin:password@localhost:5432/alzohra_db"
    )
    migrator = DataMigrator(db_url)
    migrator.run_migration()
