---
name: zohra-repository-context
description: Orient work in Zohra RMS v2 using maintained source maps, feature contracts and audit evidence, or update that repository knowledge after implementation changes. Use for repository exploration, planning, documentation and source ownership questions.
---

# Zohra repository context

Use [the knowledge index](../../../docs/repository/README.md) to select relevant references. Read the requested domain's sections rather than loading every document or rediscovering the whole codebase.

- [Architecture](../../../docs/repository/architecture.md): runtime settings, source entrypoints and module ownership.
- [Feature routing](../../../docs/repository/feature-routing.md): screens, API paths, observed behavior and test boundaries.
- [Accounting and HR](../../../docs/repository/accounting-and-hr.md): journal, settlement, closure, advance and payroll models.
- [Data and migrations](../../../docs/repository/data-and-migrations.md): schema definitions, bootstrap conflicts and importer behavior.
- [Corrections and valuation](../../../docs/repository/corrections-and-valuation.md): source-linked refunds/manual repayments/stock corrections, carrying-value precision and canonical schema authority.
- [Decisions](../../../docs/repository/decisions.md): unsettled policies and reasons for current technical choices.
- [Phase 2 audit](../../../docs/audit/phase2/README.md): current executed evidence and reproduction. [Phase 1](../../../docs/audit/README.md) is the earlier checkpoint.
- [Failure analysis](../../../docs/audit/phase2/failure-analysis.md): per-test diagnoses, shared transaction failures, status-only errors and policy-dependent expectations.
- [Manual testing](../../../docs/repository/manual-testing.md): start the real application with disposable sample data and verified local role logins.

Run `python3 scripts/check-repository-knowledge.py` from the repository root. A drift report identifies sources to inspect before relying on affected prose. If a referenced document is absent or a source changed, inspect the relevant entrypoint and report the gap; do not infer behavior from an older completion claim.

When changing recorded behavior, update its maintained reference. Use `python3 scripts/check-repository-knowledge.py --refresh` only after reviewing the source changes and updating the affected documents. Keep implementation facts, intended contracts, reproduced defects, and unresolved business policies distinguishable.

For verification statements, consult the completed [results](../../../docs/audit/phase2/results.json) and [coverage](../../../docs/audit/phase2/coverage.csv), including remaining scope. Route declarations and passing subcases do not certify a complete feature.

The user's requested scope and existing authorization take precedence. This skill supplies repository context; it does not authorize code repairs or database mutations.
