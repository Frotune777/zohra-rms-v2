"""Detect source drift before using repository notes as a current checkpoint."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/repository/source-manifest.json"
FOLDERS = ["client/src", "server/src", "server/scripts", "server/tests", "database", "server/migrations", "tests/audit", "tests/utils", "tests/e2e", "scripts"]
SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs", ".json", ".sql", ".py", ".css"}
FILES = ["package.json", "package-lock.json", "client/package.json", "client/package-lock.json",
         "server/package.json", "server/package-lock.json", "pyproject.toml", "uv.lock",
         "playwright.config.js", "playwright.config.ts", "playwright.audit.config.cjs",
         "client/playwright.config.js", "client/vite.config.js", "client/postcss.config.js",
         "client/tailwind.config.js",
         "client/Dockerfile", "client/index.html", "server/Dockerfile", "server/server.js", "server/jest.config.js",
         "docker-compose.yml", "migration_tool.py", ".nvmrc", ".env.example", "client/.env.example", "server/.env.example"]


def source_hashes():
    paths = {ROOT / file for file in FILES if (ROOT / file).is_file()}
    paths.update(p for p in ROOT.glob("*.sh") if p.is_file())
    paths.update(p for p in (ROOT / "server").glob("*.js") if p.is_file())
    for folder in FOLDERS:
        paths.update(p for p in (ROOT / folder).rglob("*")
                     if p.is_file() and p.suffix in SUFFIXES
                     and not any(part in {"node_modules", "__pycache__", "logs"} for part in p.parts))
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true",
                        help="Record source hashes after reviewing/updating affected repository documentation.")
    args = parser.parse_args()
    current = source_hashes()
    if args.refresh:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps({"recorded_at": datetime.now(timezone.utc).isoformat(),
                                      "scope": "Source checkpoint for repository notes; matching hashes do not establish feature correctness.",
                                      "sha256": current}, indent=2) + "\n")
        print("Recorded " + str(len(current)) + " source hashes. This is a freshness checkpoint, not a feature verification.")
        return 0
    if not MANIFEST.exists():
        print("Repository source checkpoint is missing. Review the notes and record it with --refresh.", file=sys.stderr)
        return 1
    expected = json.loads(MANIFEST.read_text())["sha256"]
    added = sorted(current.keys() - expected.keys())
    removed = sorted(expected.keys() - current.keys())
    changed = sorted(p for p in current.keys() & expected.keys() if current[p] != expected[p])
    if added or removed or changed:
        print(json.dumps({"status": "source_drift", "changed": changed, "added": added, "removed": removed}, indent=2))
        print("Read/update only the affected documentation and source before refreshing the checkpoint.")
        return 1
    print("Repository source hashes match the documented checkpoint (" + str(len(current)) + " files).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
