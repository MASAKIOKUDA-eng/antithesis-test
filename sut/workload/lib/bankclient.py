"""Small HTTP client + shared settings for the Test Composer commands.

stdlib only (urllib) so the workload image has a single third-party
dependency: the Antithesis SDK.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional

BANK_URL = os.environ.get("BANK_URL", "http://bank:8080")
NUM_ACCOUNTS = int(os.environ.get("NUM_ACCOUNTS", "5"))
INITIAL_BALANCE = int(os.environ.get("INITIAL_BALANCE", "100"))
TRANSFERS_PER_RUN = int(os.environ.get("TRANSFERS_PER_RUN", "20"))
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "3"))

ACCOUNT_IDS = [f"acct-{i}" for i in range(NUM_ACCOUNTS)]

# Statuses the API is allowed to return for a transfer. Anything else is a bug.
EXPECTED_TRANSFER_STATUSES = {200, 409, 503}


@dataclass
class Response:
    status: Optional[int]  # None means the request never got an HTTP answer
    body: dict[str, Any]

    @property
    def unreachable(self) -> bool:
        return self.status is None


def _request(method: str, path: str, payload: Optional[dict[str, Any]] = None) -> Response:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BANK_URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:  # nosec B310 - fixed internal URL
            return Response(resp.status, json.loads(resp.read() or b"{}"))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read() or b"{}")
        except json.JSONDecodeError:
            body = {}
        return Response(exc.code, body)
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        # Network faults are expected under Antithesis fault injection.
        return Response(None, {})


def health() -> Response:
    return _request("GET", "/health")


def snapshot() -> Response:
    return _request("GET", "/snapshot")


def create_account(account_id: str, balance: int) -> Response:
    return _request("POST", "/accounts", {"id": account_id, "balance": balance})


def transfer(src: str, dst: str, amount: int) -> Response:
    return _request("POST", "/transfer", {"from": src, "to": dst, "amount": amount})


def wait_until_healthy(timeout_s: float, interval_s: float = 0.5) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if health().status == 200:
            return True
        time.sleep(interval_s)
    return False


def conservation_details(snap: dict[str, Any]) -> dict[str, Any]:
    count = int(snap.get("count", 0))
    total = int(snap.get("total", 0))
    return {
        "total": total,
        "count": count,
        "expected_total": count * INITIAL_BALANCE,
        "accounts": snap.get("accounts", {}),
    }
