"""Exercise the real importer with synthetic files and an explicit guarded DB."""
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

url = urlparse(os.environ["DATABASE_URL"])
if (url.hostname != "127.0.0.1" or url.port != 55439 or
        url.username != "zohra_audit" or url.password or
        not url.path.startswith("/zohra_pw_case_")):
    raise RuntimeError("Importer audit refuses a non-disposable database")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from migration_tool import DataMigrator

request = json.load(sys.stdin)
migrator = DataMigrator(os.environ["DATABASE_URL"])
try:
    migrator.prepare_db()
    for step in request["steps"]:
        method = step["method"]
        if method not in {"migrate_employees", "migrate_chicken_rates", "migrate_vendor_bills", "migrate_attendance", "migrate_ledger", "sync_employee_statuses"}:
            raise RuntimeError("Unsupported importer audit method")
        getattr(migrator, method)(*[step["file"]] if "file" in step else [])
    print("AUDIT_RESULT " + json.dumps({"ok": True, "discrepancies": migrator.discrepancies}))
except Exception as error:
    print("AUDIT_RESULT " + json.dumps({"ok": False, "error": str(error), "discrepancies": migrator.discrepancies}))
finally:
    migrator.engine.dispose()
