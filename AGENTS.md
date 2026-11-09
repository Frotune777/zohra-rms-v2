# Repository guidance

Start with [the repository knowledge index](docs/repository/README.md), then read only the documents relevant to the task. They describe observed implementation and evidence; historical plans and intended contracts do not establish that a feature works.

| Task | Maintained reference |
| --- | --- |
| Runtime, source ownership, routes, configuration | [Architecture](docs/repository/architecture.md) |
| Screens, APIs, feature behavior and remaining coverage | [Feature routing](docs/repository/feature-routing.md) |
| Journals, vendor settlement, closures, advances and payroll | [Accounting and HR](docs/repository/accounting-and-hr.md) |
| Corrections, refunds and cent-accurate stock value | [Corrections and valuation](docs/repository/corrections-and-valuation.md) |
| Table definitions, migration conflicts and import contracts | [Data and migrations](docs/repository/data-and-migrations.md) |
| Unresolved business policies and technical decisions | [Decisions](docs/repository/decisions.md) |
| Current executed audit evidence and reproduction | [Phase 2 audit](docs/audit/phase2/README.md) |
| Failed assertions, shared causes and priorities | [Failure analysis](docs/audit/phase2/failure-analysis.md) |
| Running/restarting the disposable manual demo | [Manual testing](docs/repository/manual-testing.md) |
| Earlier dependency and schema checkpoint | [Phase 1 audit](docs/audit/README.md) |

Run `python3 scripts/check-repository-knowledge.py` to detect source changes since the knowledge snapshot. Review the changed sources and update affected docs before using `--refresh`; refreshing hashes alone does not make stale prose accurate. When completing a change, update the relevant repository document if its recorded behavior or entrypoints changed.

## Entrypoints

The React/Vite client is under `client/`; the Express/PostgreSQL server is under `server/`; Python importers use the root `pyproject.toml` and `uv.lock`. Read [architecture](docs/repository/architecture.md) for the source map instead of searching the whole repository.

Commands below run from the repository root:

- `npm run build` — client production build.
- `npm run test:client` — client Vitest tests.
- `npm run test:server -- --runInBand --coverage` — server Jest checks and coverage.
- `npm run test:audit` — current guarded Playwright audit.
- `npm run dev:demo` — real application with fresh sample data on ports 3002/5001; preserves existing databases and audit results.
- `python3 scripts/summarize-playwright-audit.py` — derive checklist coverage from that audit's results.
- `npm run audit:inventory` — regenerate the earlier source inventory.

The root and client historical Playwright configurations forward to `playwright.audit.config.cjs`; historical `tests/e2e` files remain source references, not the active default suite. Audit tests live in `tests/audit`.

## Audit constraints and interpretation

Use the guarded disposable harness for audit work. It requires PostgreSQL user `zohra_audit`, host `127.0.0.1`, port `55439`, database names `zohra_pw_*`, and the verified cluster at `/private/tmp/zohra-audit-pg`. The harness uses Vite port `33129` and a fresh API process on `33130` for each test. These settings differ from normal application defaults.

The canonical baseline/checksum engine serves CLI, Docker and audits. Fresh Docker/PostgreSQL15 smoke is verified separately from full PostgreSQL14 tests. Only exact recorded synthetic legacy schemas support adoption; custom/business-data migrations remain unverified. Do not repurpose scripts that load application credentials as audit setup.

Treat `docs/audit/phase2/results.json`, `coverage.json`, `coverage.csv`, and `bootstrap.json` as the current audit evidence. Counts must come from completed artifacts. A passed subcase proves the assertions reached; every original checklist ID retains partial scope. A failed early assertion leaves later assertions unexecuted. Preserve that distinction when documenting or fixing defects.

The audit reporter overwrites `docs/audit/phase2/results.json` even for filtered runs. Preserve full-run evidence before a focused rerun and identify its narrower scope. Screenshots, traces and server logs are local under `test-results/audit` and `playwright-report/audit`.

## Local skills

Skills in `.agents/skills/` are repository scoped and use default automatic discovery. Explicit invocations are also available:

- [$zohra-repository-context](.agents/skills/zohra-repository-context/SKILL.md) — orient work and maintain repository knowledge.
- [$zohra-playwright-audit](.agents/skills/zohra-playwright-audit/SKILL.md) — run, extend or interpret the guarded browser/API/database audit.
- [$zohra-accounting-change](.agents/skills/zohra-accounting-change/SKILL.md) — follow financial and HR contracts across competing source models.
- [$zohra-dependency-upgrade](.agents/skills/zohra-dependency-upgrade/SKILL.md) — update this repository's dependency layers and check compatibility.

These skills provide context and workflows. They do not expand the user's requested scope, authorize business-data changes, or authorize unrelated business-logic repairs.
