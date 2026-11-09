"""Regenerate current failed-test diagnoses without changing audit assertions."""
import csv
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'docs/audit/phase2'
run = json.loads((DIRECTORY / 'results.json').read_text())
tests = []
for result in run['results']:
    if result['status'] == 'passed':
        continue
    primary = result['ids'][0] if result['ids'] else ''
    diagnosis, sources = ('Requires review of this exact reached assertion and persisted evidence; no automatic root-cause claim.', [])
    tests.append({'primary_id': primary, 'ids': result['ids'], 'title': result['title'], 'test_file': result['file'], 'test_line': result['line'], 'status': result['status'],
                  'kind': 'review_required', 'diagnosis': diagnosis, 'source_files': sources, 'errors': result['errors'], 'evidence': result.get('evidence')})
analysis = {'analysed_at': datetime.now(timezone.utc).isoformat(), 'run_finished_at': run['finished_at'], 'results_sha256': hashlib.sha256((DIRECTORY / 'results.json').read_bytes()).hexdigest(),
            'failed_tests': len(tests), 'recorded_error_objects': sum(len(t['errors']) for t in tests), 'by_file': dict(Counter(t['test_file'] for t in tests)), 'by_primary_kind': dict(Counter(t['kind'] for t in tests)),
            'scope': 'Current completed-run failures. The historical 194-failure diagnosis is preserved under baseline-before-fixes. Paid leave, uncapped recovery and signed-payout tracking assertions now reflect the confirmed user rules. Passing subcases do not certify complete features.', 'tests': tests}
(DIRECTORY / 'failure-analysis.json').write_text(json.dumps(analysis, indent=2) + '\n')
with (DIRECTORY / 'failed-tests.csv').open('w', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=['primary_id','title','status','test_file','test_line','kind','diagnosis','source_files','errors'])
    writer.writeheader()
    for t in tests:
        writer.writerow({**{k:t[k] for k in ['primary_id','title','status','test_file','test_line','kind','diagnosis']}, 'source_files':'; '.join(t['source_files']), 'errors':'\n'.join(t['errors'])})
lines = ['# Current failed-test analysis', '', f"Completed run: {sum(run['counts'].values())} tests; {run['counts'].get('passed',0)} passed; {len(tests)} failed or timed out. Exact evidence: [results](results.json), [failed tests](failed-tests.csv), and [coverage](coverage.csv).", '',
         'The original 355-test run (161 passed / 194 failed) and its diagnoses remain in [baseline-before-fixes](baseline-before-fixes/failure-analysis.md). Current technical repairs and verification limits are documented in [repair verification](repair-verification.md).', '', '| Test | Reached failure and decision needed | Source |', '| --- | --- | --- |']
for t in tests:
    links=', '.join('[' + Path(p).name + '](../../../'+p+')' for p in t['source_files'])
    lines.append('| '+t['primary_id']+' | '+t['diagnosis'].replace('|',r'\|')+' | '+links+' |')
lines += ['', 'No tests were skipped or marked expected-failure to hide issues. See [decisions](../../repository/decisions.md) for confirmed rules and remaining policy questions. Source-review gaps and unexecuted complex scenarios remain explicit in that document and coverage.csv.', '',
          'Server/client unit results and the unchanged server coverage gate are separate from these Playwright results; see [validation](validation.json). Regenerate this analysis after a completed audit with python3 scripts/analyze-playwright-failures.py.', '']
(DIRECTORY / 'failure-analysis.md').write_text('\n'.join(lines))
print(json.dumps({k:v for k,v in analysis.items() if k not in {'tests','scope'}},indent=2))

