---
name: zohra-dependency-upgrade
description: Upgrade Zohra RMS v2's root, client, server or Python dependencies and validate repository-specific compatibility across lockfiles, runtime, CSS, exports and importers. Use for dependency or runtime upgrades, rather than unrelated feature repairs.
---

# Zohra dependency upgrade

Read [architecture](../../../docs/repository/architecture.md) for runtime/configuration ownership and [phase 1's dependency checkpoint](../../../docs/audit/README.md) for the previous upgrade evidence. [Phase 2](../../../docs/audit/phase2/README.md) supersedes its Python driver and audit-bootstrap status. Version claims are dated evidence; verify requested registry versions when upgrading.

## Update the actual layers

The repository has three npm installations and lockfiles: root, `client`, and `server`. Python uses root `pyproject.toml` and `uv.lock`. Keep runtime declarations consistent with `.nvmrc`, package engines and the client/server Dockerfiles when the requested runtime changes. The recorded Node runtime is 26.13.0.

Review the affected direct dependencies and transitive overrides. The current [deepmerge install mitigation](../../../server/scripts/patch-deepmerge.cjs) checks upstream source hashes and preserves the real 4.3.1 version and advisory evidence. A clean server install applies it; production installs without the dev package skip it. Review/remove it only after a verified compatible fixed release, and run its security regressions. Server `glob`/`minimatch` overrides were added for advisories without changing the existing test failure set. SheetJS is a pinned official CDN tarball in `server/package.json`; do not replace it with the old registry release merely because npm reports that release as latest. Recheck current registry/advisory results rather than copying old counts.

Use lockfile installs to reproduce the selected graph:

```sh
npm ci
npm --prefix client ci
npm --prefix server ci
uv sync --locked
```

## Known compatibility edges

- Tailwind 4 uses `@tailwindcss/postcss`, the CSS import and `@utility` declarations. Vite relies on automatic PostCSS discovery; an explicit relative search path previously broke styling when started from the repository root.
- Vitest matcher setup uses `@testing-library/jest-dom/vitest`. React/Vite changes need both the production build and a rendered browser check.
- The Excel export icon changed because its prior Simple Icons export disappeared. Verify package exports at real consumers.
- SQLAlchemy 2.1.8's PostgreSQL engine default required Psycopg 3.3.8 (`psycopg[binary]`); keeping only `psycopg2-binary` failed engine construction. Python import checks do not establish ETL correctness; use synthetic importer scenarios for an affected ETL change.

## Compare meaningful evidence

Run checks appropriate to the changed layers: `npm run build`, `npm run test:client`, `npm run test:server -- --runInBand --coverage`, and dependency-tree/advisory checks in the installations touched. Compare failed test names and messages with the recorded baseline; do not weaken or skip existing failures to declare compatibility.

For rendered or importer regressions, use the guarded `npm run test:audit` harness as documented in phase 2. A focused run overwrites the active results and bootstrap artifacts, so preserve complete-run evidence and identify the focused scope. Run `python3 scripts/summarize-playwright-audit.py` only for the corresponding completed result set.

Report executed checks, remaining failures and exact verification limits. Compose syntax or an image manifest does not prove container execution. [Container evidence](../../../docs/audit/phase2/container-verification.json) covers clean builds, fresh canonical PostgreSQL 15 initialization and real API/Chromium refund smoke; the full guarded audit runs separately on PostgreSQL 14. `npm run test:docker` reproduces the isolated smoke and cleans up only its synthetic project. Existing business-data upgrades and deployment retain separate scope. Dependency authorization does not authorize unrelated accounting/authentication fixes or live database upgrades. Update the relevant repository knowledge after a compatibility change.
