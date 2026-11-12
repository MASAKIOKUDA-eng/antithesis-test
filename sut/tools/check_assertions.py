#!/usr/bin/env python3
"""Judge Antithesis SDK local output (JSONL) the way a triage report would.

  * always / always_or_unreachable: FAIL if any record has condition=false
  * sometimes: WARN if no record ever had condition=true
  * reachable: WARN if never hit; unreachable: FAIL if hit

Usage: check_assertions.py <sdk.jsonl> [--expect pass|fail]
Exit status is 0 when the outcome matches --expect (default: pass), so a
planted-bug build can assert that the bug *is* detected.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--expect", choices=["pass", "fail"], default="pass")
    args = parser.parse_args()

    seen: dict[str, dict] = {}
    passed: dict[str, bool] = defaultdict(lambda: True)
    satisfied: dict[str, bool] = defaultdict(bool)
    setup_complete = False

    with open(args.path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "antithesis_setup" in record:
                setup_complete = True
            a = record.get("antithesis_assert")
            if not a or not a.get("hit"):
                continue
            key = f'{a["assert_type"]}:{a["message"]}'
            seen[key] = a
            if a["assert_type"] in ("always", "always_or_unreachable"):
                if not a["condition"]:
                    if passed[key]:
                        print(f"FAIL  {a['display_type']}: {a['message']} details={json.dumps(a.get('details'))[:400]}")
                    passed[key] = False
            elif a["assert_type"] == "sometimes" and a["condition"]:
                satisfied[key] = True
            elif a["assert_type"] == "reachability" and a.get("display_type") == "Unreachable":
                passed[key] = False
                print(f"FAIL  Unreachable was reached: {a['message']}")
            elif a["assert_type"] == "reachability":
                satisfied[key] = True

    failures = [k for k in seen if not passed[k]]
    for key, a in sorted(seen.items()):
        if a["assert_type"] == "sometimes" and not satisfied[key]:
            print(f"WARN  Sometimes never true: {a['message']}")
    print(f"setup_complete={setup_complete} assertions={len(seen)} failing={len(failures)}")

    outcome = "fail" if failures or not setup_complete else "pass"
    print(f"outcome={outcome} expected={args.expect}")
    return 0 if outcome == args.expect else 1


if __name__ == "__main__":
    sys.exit(main())
