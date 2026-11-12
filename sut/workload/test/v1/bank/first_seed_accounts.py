#!/usr/bin/env python3
"""first_: runs once at the start of each timeline. Creates the accounts."""

import sys

from antithesis.assertions import always, reachable

import bankclient


def main() -> int:
    if not bankclient.wait_until_healthy(timeout_s=60):
        # Under fault injection the service may be briefly unreachable; the
        # other commands tolerate a partially seeded ledger.
        return 0
    for account_id in bankclient.ACCOUNT_IDS:
        resp = bankclient.create_account(account_id, bankclient.INITIAL_BALANCE)
        if resp.unreachable:
            continue
        always(resp.status in (200, 201), "Account creation returns 200 or 201",
               {"status": resp.status, "account": account_id})
    reachable("Account seeding finished", {"accounts": bankclient.NUM_ACCOUNTS})
    return 0


if __name__ == "__main__":
    sys.exit(main())
