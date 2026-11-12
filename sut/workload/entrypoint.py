#!/usr/bin/env python3
"""Workload container entrypoint.

Waits for the SUT, tells Antithesis that setup is complete (fault injection
starts after this), then stays alive so Test Composer can exec commands.
"""

import signal
import sys
import time

from antithesis.lifecycle import setup_complete

import bankclient


def main() -> int:
    if not bankclient.wait_until_healthy(timeout_s=120):
        print("bank service did not become healthy", file=sys.stderr, flush=True)
        return 1
    setup_complete({"bank_url": bankclient.BANK_URL, "accounts": bankclient.NUM_ACCOUNTS})
    print("setup complete; waiting for Test Composer commands", flush=True)

    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    sys.exit(main())
