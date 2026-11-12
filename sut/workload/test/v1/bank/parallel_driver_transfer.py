#!/usr/bin/env python3
"""parallel_driver_: runs many times, concurrently. Generates transfer load.

Uses antithesis.random so that Antithesis controls (and can replay) every
choice the workload makes.
"""

import sys

from antithesis.assertions import always, sometimes
from antithesis.random import get_random, random_choice

import bankclient


def main() -> int:
    accounts = bankclient.ACCOUNT_IDS
    for _ in range(bankclient.TRANSFERS_PER_RUN):
        src = random_choice(accounts)
        dst = random_choice([a for a in accounts if a != src])
        # Amounts up to 1.5x the initial balance so the "insufficient funds"
        # path is exercised too.
        amount = 1 + get_random() % (bankclient.INITIAL_BALANCE + bankclient.INITIAL_BALANCE // 2)
        resp = bankclient.transfer(src, dst, amount)
        if resp.unreachable:
            sometimes(True, "Transfer hit a network fault", {})
            continue
        always(resp.status in bankclient.EXPECTED_TRANSFER_STATUSES,
               "Transfer returns an expected status code",
               {"status": resp.status, "body": resp.body})
        sometimes(resp.status == 200, "A transfer succeeded", {"amount": amount})
        sometimes(resp.status == 409, "A transfer was rejected for insufficient funds", {"amount": amount})
    return 0


if __name__ == "__main__":
    sys.exit(main())
