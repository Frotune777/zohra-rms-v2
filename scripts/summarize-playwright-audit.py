"""Build a conservative checklist from executed tests; a subcase is not a feature."""
import csv
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "docs/audit/phase2"
run = json.loads((DIRECTORY / "results.json").read_text())
manifest = run.get("source_sha256")
if manifest is None:
    raise RuntimeError("Results do not include execution-time source hashes; rerun the audit before recording a test manifest.")
plan_path = ROOT / "docs/audit/playwright-scenarios.csv"
with plan_path.open(newline="") as handle:
    plan = list(csv.DictReader(handle))

# Explicit outstanding scope from the original bundled scenarios. Tests and
# their precise assertions remain the authority for what was actually checked.
remaining = {
    "SCREEN": "Inline retry, preserving form input on every screen, and detailed populated workflows; injected HTTP 500 recovery uses reload. Initial accessibility/viewport tests do not cover every modal or action.",
    "AUTH": "Email normalization, full role matrix, actual logout action and cross-tab propagation, expiry mid-submit, deterministic registration allocation race, authenticated socket event delivery; vendor management restrictions and employee-scoped advance reads are exercised.",
    "POS": "All payment-mode/large-total/cent combinations, discount allocation boundaries, double-clicks, receipt printing, customer edits and KOT printing; partial-payment/lost-response browser and full refund/unused-versus-cooked stock workflows have direct tests; item-level refunds remain a separate contract.",
    "MENU": "Browser CRUD/edited-price checkout, duplicate policy, and dependent recipe deletion beyond sold-item case.",
    "INV": "Browser CRUD, every editable field, nonexistent IDs, deletion with each dependency, zero-cost wastage, deterministic concurrent sale/waste races.",
    "RATES": "Browser date/calendar saving, omitted values, numeric precision and timezone matrix.",
    "MARKUP": "Browser rule CRUD, every operation/comparator combination, unknown operations, threshold rounding, rule deletion with references.",
    "BILL": "Browser bill/approval forms, missing-markup contract, full source/movement/audit checks across browser workflows, every rejection/settled-debt/stock-shortage combination.",
    "VENDOR": "Browser create/edit/payment actions, inactive modes, all aging boundaries, category filters, lost-response browser retry and every supplier profile field.",
    "EMP": "Browser CRUD/history actions, age/negative-salary validation, every employee field and dependency policy.",
    "ATT": "Browser repeated saves, duplicate input, inactive/future date policy and audit attribution.",
    "LEAVE": "Browser create/filter/delete, existing Present/Half-Day conflict and audit deduplication; approved Paid leave earnings and overlapping linked leave rejection are exercised.",
    "ADV": "Browser request/approval actions, adjustments/rejection/repeat/concurrent same-request approval in both namespaces, all repayment limits, zero/invalid installment months and leap-year schedule dates.",
    "PAY": "Browser generation/approval/payout, missing-attendance policy, mid-month eligibility, all component combinations, paid reruns, schedule synchronization, delete-one-of-two, invalid mode, and wider competing payroll races. Both payroll APIs now create drafts with one payout lifecycle; negative recovery/settlement/reversal/deletion is exercised.",
    "FIN": "Browser revenue/expense forms, payer/vendor/reference contract, invalid categories and transactionally injected failure after each write stage.",
    "TRACK": "Browser create/edit/delete/status actions, exact full tracker/P&L/counter/float/vendor reconciliation, vendor/type changes, deterministic concurrent paid transition and response-loss retries.",
    "MAP": "Browser CRUD, overlapping keyword precedence, duplicate/invalid rules and source ledger correction after historical categorization.",
    "TRANSFER": "Browser transfer actions, every source account, deterministic concurrent returns beyond the exercised two-return case and injected failures at each stage.",
    "CLOSE": "Browser count/close/reopen flows, negative/invalid count policy, deterministic concurrent variance close, period locks on every writer, full account-scoped carry-forward and timezone boundaries.",
    "GL": "Every financial source and attribution, minimum-line invariant across failed direct writes, every account type/cutoff, all sub-cent rounding boundaries and reversal source-link policy.",
    "REPORT": "Full UI chart/KPI values, every filter/default range, inactive staff, no-record denominator policy, partial months, full inventory/GL opening reconciliation across purchase, depletion and cost corrections; selected cent-conservation and unchanged-cost cases are exercised.",
    "EXPORT": "CSV on every report, newline-only/formula/Unicode/nested cells, empty JSON and exact filename policies on every report, PDF layout/visual shaping across all supported names, empty data, very wide/nested cells and font load failure; parsed contents/pagination/Hindi are exercised.",
    "DASH": "Full rendered KPI comparisons on dashboard and report landing page, all roles/date filters.",
    "AI": "Zero-usage-day forecasting policy, missing recipes, invalid item IDs, sparse date gaps, forecasting validation beyond the fixed arithmetic formula.",
    "KDS": "Authenticated event delivery and duplicate completion effects on forecasts; browser progression and timestamp/actor persistence are exercised.",
    "PO": "All status transitions, concurrent receipt and failure rollback; browser create/send/receive and cancelled-receipt rejection are exercised.",
    "CFG": "Browser CRUD/import/reorder/toggle, cross-category update/toggle/reorder, canonical inactive payment behavior across every consumer.",
    "UI": "Full keyboard journeys, associated error messages, modal Escape/focus trap/focus return, accessibility beyond initial names, clipped actions/long forms/tables, offline/403/navigation-abort and duplicate-submit recovery.",
    "E2E": "Financial/HR round trips with leave, full report reconciliation, attribution and rollback at every stage; harness external cluster/browser failure paths.",
    "DATA": "Malformed workbook rows, negative financial values, importer row-level rollback/source attribution/GL reconciliation, full multi-file orchestrator and JavaScript importers.",
}
overrides = {
    "AUTH-001": "All three real role browser logins and /auth/me identities were tested. Additional role authorization belongs to the remaining AUTH cases.",
    "AUTH-003": "Changed passwords and all three demo-password bypass regressions are exercised; additional normalization/password-management flows remain.",
    "POS-001": "The implemented search/category/empty-result assertions were executed; broader interaction coverage is in the other POS cases.",
    "POS-006": "Tax and fixed discount before tax, with customer/partial-payment browser reconciliation, executed; mixed-tax allocation and every cent boundary remain.",
    "PAY-001": "Explicit zero/half/partial/full days and inactive employee exclusion executed. Missing attendance keeps the existing full-month fallback and is now visibly flagged; its business policy still needs an answer.",
    "LEAVE-006": "User confirmed Paid leave earns salary. Mixed Present/Half-Day/Paid/Unpaid earnings and linked overlap protection executed; entitlement balances and every calendar boundary remain.",
    "E2E-002": "Independent committed purchase, approval, partial/full settlement, close and reopen are exercised. Stock rejection, browser actions, stage-specific rollback and report reconciliation remain.",
    "E2E-003": "Attendance/advance/draft/approval/payout/revert conservation is exercised; deduction-bearing repayout has separate integrity regressions. Leave, reports and full actor attribution remain incomplete.",
}

ansi = re.compile(r"\x1b\[[0-9;]*m")
for result in run["results"]:
    result["ids"] = sorted(set(re.findall("[A-Z][A-Z0-9]*-[0-9]{3}", result["title"])))
    result["errors"] = [ansi.sub("", error) for error in result["errors"]]
    if result["status"] == "passed":
        result["classification"] = "passed_assertions"
    elif result["status"] == "timedOut" and any("setting up" in error for error in result["errors"]):
        result["classification"] = "environment_or_fixture_timeout"
    elif not result.get("evidence") and result["status"] != "passed":
        result["classification"] = "no_business_evidence"
    else:
        result["classification"] = "failed_assertion_review_required"

cases = []
for row in plan:
    case_id = row.get("id") or row.get("ID") or row.get("case_id")
    if not case_id:
        raise RuntimeError("Unknown scenario CSV ID column")
    results = [r for r in run["results"] if case_id in r["ids"]]
    counts = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
    prefix = case_id.split("-")[0]
    verdict = ("not_executed" if not results else "failed_subcases" if any(r["status"] != "passed" for r in results) else "passed_subcases")
    cases.append({"id": case_id, "verdict": verdict, "coverage": "partial", "counts": counts,
                  "tests": [{"title": r["title"], "file": r["file"], "line": r["line"], "status": r["status"], "classification": r["classification"]} for r in results],
                  "remaining": overrides.get(case_id, remaining[prefix])})

unknown = sorted({i for r in run["results"] for i in r["ids"]} - {c["id"] for c in cases})
if unknown:
    raise RuntimeError("Executed IDs are absent from the checklist: " + str(unknown))
summary = {"run_finished_at": run["finished_at"], "test_counts": run["counts"], "planned_ids": len(cases),
           "attempted_ids": sum(bool(c["tests"]) for c in cases), "fully_verified_ids": 0,
           "case_verdicts": {v: sum(c["verdict"] == v for c in cases) for v in {c["verdict"] for c in cases}},
           "scope": "Results verify the assertions actually reached. No bundled feature is declared fully verified.", "cases": cases}
(DIRECTORY / "coverage.json").write_text(json.dumps(summary, indent=2) + "\n")
with (DIRECTORY / "coverage.csv").open("w", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=["id", "verdict", "coverage", "passed", "failed", "timedOut", "remaining"])
    writer.writeheader()
    for case in cases:
        writer.writerow({**{k: case[k] for k in ["id", "verdict", "coverage", "remaining"]},
                         **{k: case["counts"].get(k, 0) for k in ["passed", "failed", "timedOut"]}})
# Embed evidence in the tracked report; screenshots/traces stay in the local HTML output.
(DIRECTORY / "results.json").write_text(json.dumps(run, indent=2) + "\n")
(DIRECTORY / "test-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({k: v for k, v in summary.items() if k != "cases"}, indent=2))
