"""Produce a repeatable static inventory; matches are evidence, not runtime proof."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def inventory():
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    ).decode().split("\0")
    files = []
    endpoints = []
    page_routes = []
    api_calls = []
    imports_missing = []
    tests = []
    sql_tables = set()
    for relative in sorted(filter(None, tracked)):
        path = ROOT / relative
        if not path.is_file():
            continue
        data = path.read_bytes()
        record = {
            "path": relative,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            record["kind"] = "binary"
            files.append(record)
            continue
        record.update(kind="text", lines=len(content.splitlines()))
        files.append(record)
        for index, line in enumerate(content.splitlines(), 1):
            location = {"file": relative, "line": index}
            if relative.startswith("server/src/"):
                match = re.search(r"router\.(get|post|put|patch|delete)\(['\"]([^'\"]*)", line)
                if match:
                    endpoints.append({**location, "method": match[1].upper(),
                                      "path": match[2], "registration": line.strip()})
            if relative == "client/src/App.jsx":
                match = re.search(r'<Route path="([^"]+)" element={<([^ />]+)', line)
                if match:
                    page_routes.append({**location, "path": match[1], "component": match[2]})
            if relative.startswith("client/src/"):
                for match in re.finditer(r"api\.(get|post|put|patch|delete)\(['\"`]([^'\"`]+)", line):
                    api_calls.append({**location, "method": match[1].upper(), "path_expression": match[2]})
            if path.suffix in {".js", ".jsx", ".ts", ".tsx"}:
                for match in re.finditer(r"(?:from\s+|require\()['\"](\.[^'\"]+)", line):
                    target = path.parent / match[1]
                    candidates = [target, *[Path(str(target) + suffix) for suffix in
                                  (".js", ".jsx", ".ts", ".tsx", ".json")],
                                  target / "index.js", target / "index.jsx"]
                    if not any(candidate.exists() for candidate in candidates):
                        imports_missing.append({**location, "import": match[1]})
            if "test" in relative and path.suffix in {".js", ".jsx", ".ts"}:
                match = re.search(r"(?:test|it)(\.skip|\.only)?\(['\"]([^'\"]+)", line)
                if match:
                    tests.append({**location, "name": match[2], "modifier": match[1]})
            if path.suffix == ".sql":
                sql_tables.update(re.findall(r"CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)", line, re.I))
    return {
        "scope": "Tracked repository files; regex-derived registrations require human review.",
        "git_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip(),
        "files": files, "server_route_registrations": endpoints,
        "client_page_routes": page_routes, "client_api_calls": api_calls,
        "unresolved_relative_imports": imports_missing,
        "test_declarations": tests, "sql_created_tables": sorted(sql_tables),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="docs/audit/repository-inventory.json")
    args = parser.parse_args()
    result = inventory()
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({
        "files": len(result["files"]),
        "server_routes": len(result["server_route_registrations"]),
        "client_routes": len(result["client_page_routes"]),
        "client_api_calls": len(result["client_api_calls"]),
        "unresolved_imports": result["unresolved_relative_imports"],
        "tests": len(result["test_declarations"]),
        "sql_tables": len(result["sql_created_tables"]),
    }, indent=2))
