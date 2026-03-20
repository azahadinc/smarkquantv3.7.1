import sqlite3
import uuid
import random
import string
from datetime import datetime
from typing import List, Optional

from db_config import DB_PATH


def init_transactions_table():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fund_transactions (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            amount REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            bank_name TEXT NOT NULL,
            account_number TEXT NOT NULL,
            account_name TEXT NOT NULL,
            otp_code TEXT,
            reference TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            notes TEXT
        )
    """)
    conn.commit()
    conn.close()


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _generate_ref() -> str:
    prefix = "SMQ"
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f"{prefix}-{suffix}"


def create_transaction(
    tx_type: str,
    amount: float,
    currency: str,
    bank_name: str,
    account_number: str,
    account_name: str,
    notes: str = "",
) -> dict:
    tx_id = str(uuid.uuid4())[:12]
    otp = _generate_otp()
    ref = _generate_ref()
    now = datetime.utcnow().isoformat()

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """INSERT INTO fund_transactions
           (id, type, status, amount, currency, bank_name, account_number,
            account_name, otp_code, reference, created_at, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (tx_id, tx_type, "pending", amount, currency.upper(),
         bank_name, account_number, account_name, otp, ref, now, notes),
    )
    conn.commit()
    conn.close()

    return {
        "id": tx_id,
        "type": tx_type,
        "status": "pending",
        "amount": amount,
        "currency": currency.upper(),
        "bank_name": bank_name,
        "account_number": account_number,
        "account_name": account_name,
        "reference": ref,
        "otp_code": otp,
        "created_at": now,
    }


def verify_otp(tx_id: str, otp: str) -> dict:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT id, type, status, otp_code, amount, currency FROM fund_transactions WHERE id=?",
        (tx_id,)
    ).fetchone()

    if not row:
        conn.close()
        return {"ok": False, "error": "Transaction not found"}

    tx_id_, tx_type, status, stored_otp, amount, currency = row

    if status == "completed":
        conn.close()
        return {"ok": False, "error": "Transaction already completed"}

    if status == "failed":
        conn.close()
        return {"ok": False, "error": "Transaction has been cancelled"}

    if otp.strip() != stored_otp:
        conn.close()
        return {"ok": False, "error": "Invalid OTP code. Please try again."}

    now = datetime.utcnow().isoformat()
    conn.execute(
        "UPDATE fund_transactions SET status='completed', completed_at=?, otp_code=NULL WHERE id=?",
        (now, tx_id)
    )
    conn.commit()
    conn.close()

    return {
        "ok": True,
        "id": tx_id,
        "type": tx_type,
        "status": "completed",
        "amount": amount,
        "currency": currency,
        "completed_at": now,
    }


def list_transactions(limit: int = 100) -> List[dict]:
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """SELECT id, type, status, amount, currency, bank_name, account_number,
                  account_name, reference, created_at, completed_at, notes
           FROM fund_transactions ORDER BY created_at DESC LIMIT ?""",
        (limit,)
    ).fetchall()
    conn.close()

    return [
        {
            "id": r[0], "type": r[1], "status": r[2], "amount": r[3],
            "currency": r[4], "bank_name": r[5], "account_number": r[6],
            "account_name": r[7], "reference": r[8], "created_at": r[9],
            "completed_at": r[10], "notes": r[11],
        }
        for r in rows
    ]


def get_transaction_summary() -> dict:
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT type, status, amount, currency FROM fund_transactions"
    ).fetchall()
    conn.close()

    from currency_utils import CURRENCY_TO_USD
    total_deposited = 0.0
    total_withdrawn = 0.0
    pending_count = 0

    for tx_type, status, amount, currency in rows:
        if status != "completed":
            if status == "pending":
                pending_count += 1
            continue
        rate = CURRENCY_TO_USD.get(currency.upper(), 1.0)
        usd_val = amount * rate
        if tx_type == "deposit":
            total_deposited += usd_val
        elif tx_type == "withdraw":
            total_withdrawn += usd_val

    return {
        "total_deposited_usd": round(total_deposited, 2),
        "total_withdrawn_usd": round(total_withdrawn, 2),
        "net_usd": round(total_deposited - total_withdrawn, 2),
        "pending_count": pending_count,
    }
