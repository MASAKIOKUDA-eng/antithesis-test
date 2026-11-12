#!/usr/bin/env python3
"""eventually_: runs after fault injection stops. Liveness + final safety."""

import sys

from antithesis.assertions import always

import bankclient


def main() -> int:
    recovered = bankclient.wait_until_healthy(timeout_s=60)
    always(recovered, "Bank service recovers after faults stop", {})
    if not recovered:
        return 1
    resp = bankclient.snapshot()
    always(resp.status == 200, "Snapshot is readable after recovery", {"status": resp.status})
    if resp.status != 200:
        return 1
    details = bankclient.conservation_details(resp.body)
    always(details["total"] == details["expected_total"], "Money is conserved (after recovery)", details)
    return 0


if __name__ == "__main__":
    sys.exit(main())
