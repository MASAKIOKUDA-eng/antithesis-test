#!/usr/bin/env python3
"""anytime_: may run at any point, even while faults are being injected.

Safety property: the total amount of money equals count * INITIAL_BALANCE,
and no balance is negative.
"""

import sys

from antithesis.assertions import always, sometimes

import bankclient


def main() -> int:
    resp = bankclient.snapshot()
    if resp.status != 200:
        return 0  # unavailability is not a safety violation
    details = bankclient.conservation_details(resp.body)
    always(details["total"] == details["expected_total"], "Money is conserved (anytime)", details)
    always(all(b >= 0 for b in details["accounts"].values()), "No balance is negative", details)
    sometimes(details["count"] == bankclient.NUM_ACCOUNTS, "Snapshot saw every seeded account", details)
    return 0


if __name__ == "__main__":
    sys.exit(main())
