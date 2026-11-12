"""Toy ledger service used as the System Under Test (SUT) for Antithesis.

The service keeps account balances in SQLite and exposes a tiny JSON API.
Its one important property is *conservation of money*: transfers move money
between accounts, so the sum of all balances never changes.

BANK_BUG_MODE lets you plant a known bug, which is the yardstick for judging
whether Antithesis (or the local smoke test) actually finds problems:

  none                 correct implementation (one transaction per transfer)
  non_atomic_transfer  debit and credit are committed in separate transactions,
                       so a crash or a concurrent read in between breaks
                       conservation

Only the Python standard library is used, to keep the dependency surface
(and the supply-chain attack surface) of the SUT image at zero.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

DB_PATH = os.environ.get("BANK_DB_PATH", "/data/bank.db")
PORT = int(os.environ.get("BANK_PORT", "8080"))
BUG_MODE = os.environ.get("BANK_BUG_MODE", "none")
MAX_BODY_BYTES = 4096
MAX_AMOUNT = 1_000_000
ACCOUNT_ID_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
VALID_BUG_MODES = {"none", "non_atomic_transfer"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s bank %(levelname)s %(message)s")
log = logging.getLogger("bank")

_write_lock = threading.Lock()


class ClientError(Exception):
    """Raised for invalid requests; mapped to a 4xx response."""

    def __init__(self, status: HTTPStatus, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def connect() -> sqlite3.Connection:
    # isolation_level=None: we manage transactions explicitly with BEGIN.
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    return conn


def init_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    with connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts ("
            " id TEXT PRIMARY KEY,"
            " balance INTEGER NOT NULL CHECK (balance >= 0))"
        )


def validate_account_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not ACCOUNT_ID_RE.match(value):
        raise ClientError(HTTPStatus.BAD_REQUEST, f"invalid {field}")
    return value


def validate_amount(value: Any, field: str, allow_zero: bool = False) -> int:
    # bool is a subclass of int; reject it explicitly.
    if isinstance(value, bool) or not isinstance(value, int):
        raise ClientError(HTTPStatus.BAD_REQUEST, f"invalid {field}")
    lower = 0 if allow_zero else 1
    if value < lower or value > MAX_AMOUNT:
        raise ClientError(HTTPStatus.BAD_REQUEST, f"{field} out of range")
    return value


def create_account(account_id: str, balance: int) -> bool:
    """Idempotently create an account. Returns True if it was created."""
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT OR IGNORE INTO accounts (id, balance) VALUES (?, ?)",
            (account_id, balance),
        )
        return cur.rowcount == 1
    finally:
        conn.close()


def _debit(conn: sqlite3.Connection, account_id: str, amount: int) -> None:
    row = conn.execute("SELECT balance FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise ClientError(HTTPStatus.NOT_FOUND, "unknown source account")
    if row[0] < amount:
        raise ClientError(HTTPStatus.CONFLICT, "insufficient funds")
    conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (amount, account_id))


def _credit(conn: sqlite3.Connection, account_id: str, amount: int) -> None:
    cur = conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, account_id))
    if cur.rowcount != 1:
        raise ClientError(HTTPStatus.NOT_FOUND, "unknown destination account")


def transfer(src: str, dst: str, amount: int) -> None:
    if src == dst:
        raise ClientError(HTTPStatus.BAD_REQUEST, "source and destination must differ")
    conn = connect()
    try:
        if BUG_MODE == "non_atomic_transfer":
            # PLANTED BUG: two independent transactions. Anything that happens
            # between them (a crash, a restart, a concurrent /total read) can
            # observe or persist a state where money has vanished.
            with _write_lock:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    _debit(conn, src, amount)
                    conn.execute("COMMIT")
                except Exception:
                    conn.execute("ROLLBACK")
                    raise
            time.sleep(0.005)  # widen the window so the bug is findable
            with _write_lock:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    _credit(conn, dst, amount)
                    conn.execute("COMMIT")
                except Exception:
                    conn.execute("ROLLBACK")
                    raise
            return

        # Correct implementation: debit and credit in one transaction.
        with _write_lock:
            conn.execute("BEGIN IMMEDIATE")
            try:
                if conn.execute("SELECT 1 FROM accounts WHERE id = ?", (dst,)).fetchone() is None:
                    raise ClientError(HTTPStatus.NOT_FOUND, "unknown destination account")
                _debit(conn, src, amount)
                _credit(conn, dst, amount)
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
    finally:
        conn.close()


def snapshot() -> dict[str, Any]:
    """Read all balances inside a single read transaction (consistent view)."""
    conn = connect()
    try:
        conn.execute("BEGIN")
        rows = conn.execute("SELECT id, balance FROM accounts ORDER BY id").fetchall()
        conn.execute("COMMIT")
    finally:
        conn.close()
    return {
        "accounts": {account_id: balance for account_id, balance in rows},
        "total": sum(balance for _, balance in rows),
        "count": len(rows),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "bank/1.0"
    sys_version = ""  # do not advertise the Python version

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: D401 - stdlib signature
        log.info("%s %s", self.address_string(), fmt % args)

    def _send(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise ClientError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "content-type must be application/json")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid content-length") from exc
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ClientError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "body too large or empty")
        try:
            data = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid json") from exc
        if not isinstance(data, dict):
            raise ClientError(HTTPStatus.BAD_REQUEST, "json object expected")
        return data

    def _dispatch(self, method: str) -> None:
        try:
            if method == "GET" and self.path == "/health":
                self._send(HTTPStatus.OK, {"status": "ok", "bug_mode": BUG_MODE})
            elif method == "GET" and self.path == "/snapshot":
                self._send(HTTPStatus.OK, snapshot())
            elif method == "POST" and self.path == "/accounts":
                data = self._read_json()
                account_id = validate_account_id(data.get("id"), "id")
                balance = validate_amount(data.get("balance"), "balance", allow_zero=True)
                created = create_account(account_id, balance)
                self._send(HTTPStatus.CREATED if created else HTTPStatus.OK, {"id": account_id, "created": created})
            elif method == "POST" and self.path == "/transfer":
                data = self._read_json()
                src = validate_account_id(data.get("from"), "from")
                dst = validate_account_id(data.get("to"), "to")
                amount = validate_amount(data.get("amount"), "amount")
                transfer(src, dst, amount)
                self._send(HTTPStatus.OK, {"status": "ok"})
            else:
                self._send(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except ClientError as exc:
            self._send(exc.status, {"error": exc.message})
        except sqlite3.OperationalError:
            log.exception("database busy/unavailable")
            self._send(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "database unavailable"})
        except Exception:  # pragma: no cover - defensive; never leak internals
            log.exception("unhandled error")
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal error"})

    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802 - stdlib naming
        self._dispatch("POST")


def main() -> None:
    if BUG_MODE not in VALID_BUG_MODES:
        raise SystemExit(f"BANK_BUG_MODE must be one of {sorted(VALID_BUG_MODES)}")
    init_db()
    log.info("starting on port %d (bug_mode=%s)", PORT, BUG_MODE)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)  # nosec B104 - container-internal network only
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
