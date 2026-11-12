#!/usr/bin/env python3
"""singleton_driver_: an ordinary integration test, run with no other driver.

Antithesis suggests starting by wrapping an existing integration test like
this one, then moving to property-style drivers.
"""

import sys

from antithesis.assertions import always, reachable

import bankclient

SRC, DST = "itest-src", "itest-dst"


def main() -> int:
    if not bankclient.wait_until_healthy(timeout_s=60):
        return 0
    for account_id in (SRC, DST):
        if bankclient.create_account(account_id, bankclient.INITIAL_BALANCE).unreachable:
            return 0
    before = bankclient.snapshot()
    resp = bankclient.transfer(SRC, DST, 1)
    if resp.unreachable or before.status != 200:
        return 0
    after = bankclient.snapshot()
    if after.status != 200:
        return 0
    if resp.status == 200:
        delta_src = after.body["accounts"][SRC] - before.body["accounts"][SRC]
        delta_dst = after.body["accounts"][DST] - before.body["accounts"][DST]
        always(delta_src == -1 and delta_dst == 1, "Integration: transfer moves exactly the amount",
               {"delta_src": delta_src, "delta_dst": delta_dst})
        reachable("Integration test completed a transfer", {})
    return 0


if __name__ == "__main__":
    sys.exit(main())
