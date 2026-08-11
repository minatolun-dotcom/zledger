#!/usr/bin/env bash
# Incremental full-suite runner: processes each spec file, recording one
# result line per spec in results/e2e-full-results.txt. Re-running resumes
# where it left off (specs already recorded are skipped), so a long suite can
# be driven in chunks across multiple invocations.
#
# Pass/fail is keyed on the runner's own markers (ALL GREEN vs FAILURES
# PRESENT) because run-isolated.sh's exit code is not reliable.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

RESULTS=results/e2e-full-results.txt
mkdir -p results
touch "$RESULTS"

for spec in specs/*.spec.ts; do
  name="$(basename "$spec")"
  if grep -qF "$name|" "$RESULTS" 2>/dev/null; then
    echo "SKIP (already done): $name"
    continue
  fi
  echo "RUN: $name"
  ./run-isolated.sh "$spec" > "results/e2e-log-$name.txt" 2>&1
  if grep -q 'ALL GREEN' "results/e2e-log-$name.txt" 2>/dev/null; then
    echo "$name|PASS" >> "$RESULTS"
    echo "PASS: $name"
  else
    echo "$name|FAIL" >> "$RESULTS"
    echo "FAIL: $name"
  fi
done

echo "=== RUNNER DONE ==="
echo "passed: $(grep -c '|PASS' "$RESULTS" 2>/dev/null || echo 0), failed: $(grep -c '|FAIL' "$RESULTS" 2>/dev/null || echo 0), done: $(grep -cE '\|(PASS|FAIL)' "$RESULTS" 2>/dev/null || echo 0)/$(ls specs/*.spec.ts | wc -l)"
