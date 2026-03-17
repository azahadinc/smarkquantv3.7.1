import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import List, Optional, Dict, Any

from db_config import DB_PATH


def _migrate(conn):
    existing = {row[1] for row in conn.execute("PRAGMA table_info(trading_history)").fetchall()}
    if "currency" not in existing:
        conn.execute("ALTER TABLE trading_history ADD COLUMN currency TEXT DEFAULT 'USD'")
        conn.commit()


def init_history_table():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trading_history (
            id TEXT PRIMARY KEY,
            session_type TEXT NOT NULL DEFAULT 'backtest',
            strategy TEXT,
            symbol TEXT,
            exchange TEXT,
            timeframe TEXT,
            start_date TEXT,
            end_date TEXT,
            created_at TEXT NOT NULL,
            notes TEXT,
            currency TEXT DEFAULT 'USD',

            -- Performance Metrics
            pnl_value REAL DEFAULT 0,
            pnl_pct REAL DEFAULT 0,
            win_rate REAL DEFAULT 0,
            sharpe_ratio REAL DEFAULT 0,
            smart_sharpe REAL DEFAULT 0,
            sortino_ratio REAL DEFAULT 0,
            smart_sortino REAL DEFAULT 0,
            calmar_ratio REAL DEFAULT 0,
            omega_ratio REAL DEFAULT 0,
            serenity_index REAL DEFAULT 0,
            avg_win_loss REAL DEFAULT 0,
            avg_win REAL DEFAULT 0,
            avg_loss REAL DEFAULT 0,

            -- Risk Metrics
            total_losing_streak INTEGER DEFAULT 0,
            largest_losing_trade REAL DEFAULT 0,
            largest_winning_trade REAL DEFAULT 0,
            total_winning_streak INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            expectancy REAL DEFAULT 0,
            expectancy_pct REAL DEFAULT 0,
            expected_net_profit REAL DEFAULT 0,
            avg_holding_period REAL DEFAULT 0,
            gross_profit REAL DEFAULT 0,
            gross_loss REAL DEFAULT 0,
            max_drawdown REAL DEFAULT 0,

            -- Trade Metrics
            total_trades INTEGER DEFAULT 0,
            total_winning_trades INTEGER DEFAULT 0,
            total_losing_trades INTEGER DEFAULT 0,
            starting_balance REAL DEFAULT 0,
            finishing_balance REAL DEFAULT 0,
            longs_count INTEGER DEFAULT 0,
            longs_percentage REAL DEFAULT 0,
            shorts_percentage REAL DEFAULT 0,
            shorts_count INTEGER DEFAULT 0,
            fee REAL DEFAULT 0,
            total_open_trades INTEGER DEFAULT 0,
            open_pl REAL DEFAULT 0,

            equity_curve TEXT,
            raw_metrics TEXT
        )
    """)
    conn.commit()
    _migrate(conn)
    conn.close()


def save_session(
    session_type: str,
    strategy: str,
    symbol: str,
    exchange: str,
    timeframe: str,
    start_date: str,
    end_date: str,
    metrics: Dict[str, Any],
    equity_curve: Optional[List[float]] = None,
    notes: str = "",
    currency: str = "USD",
) -> str:
    init_history_table()
    session_id = str(uuid.uuid4())[:12]
    now = datetime.utcnow().isoformat()

    longs = metrics.get("longs_count", 0)
    shorts = metrics.get("shorts_count", 0)
    total = longs + shorts
    longs_pct = round(longs / total * 100, 2) if total else 0.0
    shorts_pct = round(shorts / total * 100, 2) if total else 0.0

    starting = metrics.get("initial_capital", metrics.get("starting_balance", 0))
    finishing = metrics.get("final_equity", metrics.get("finishing_balance", starting))

    currency = (currency or "USD").upper()

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO trading_history (
            id, session_type, strategy, symbol, exchange, timeframe,
            start_date, end_date, created_at, notes, currency,
            pnl_value, pnl_pct, win_rate, sharpe_ratio, smart_sharpe,
            sortino_ratio, smart_sortino, calmar_ratio, omega_ratio, serenity_index,
            avg_win_loss, avg_win, avg_loss,
            total_losing_streak, largest_losing_trade, largest_winning_trade,
            total_winning_streak, current_streak, expectancy, expectancy_pct,
            expected_net_profit, avg_holding_period, gross_profit, gross_loss, max_drawdown,
            total_trades, total_winning_trades, total_losing_trades,
            starting_balance, finishing_balance, longs_count, longs_percentage,
            shorts_percentage, shorts_count, fee, total_open_trades, open_pl,
            equity_curve, raw_metrics
        ) VALUES (
            ?,?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?
        )
    """, (
        session_id, session_type, strategy, symbol, exchange, timeframe,
        start_date, end_date, now, notes, currency,
        round(metrics.get("net_profit_val", metrics.get("pnl_value", 0)), 2),
        round(metrics.get("net_profit", metrics.get("pnl_pct", 0)), 4),
        round(metrics.get("win_rate", 0), 4),
        round(metrics.get("sharpe_ratio", 0), 4),
        round(metrics.get("smart_sharpe", 0), 4),
        round(metrics.get("sortino_ratio", 0), 4),
        round(metrics.get("smart_sortino", 0), 4),
        round(metrics.get("calmar_ratio", 0), 4),
        round(metrics.get("omega_ratio", 0), 4),
        round(metrics.get("serenity_index", 0), 4),
        round(metrics.get("avg_win_loss", 0), 4),
        round(metrics.get("avg_win", 0), 2),
        round(metrics.get("avg_loss", 0), 2),
        int(metrics.get("total_losing_streak", 0)),
        round(metrics.get("largest_loss", metrics.get("largest_losing_trade", 0)), 2),
        round(metrics.get("largest_win", metrics.get("largest_winning_trade", 0)), 2),
        int(metrics.get("total_winning_streak", 0)),
        int(metrics.get("current_streak", 0)),
        round(metrics.get("expectancy", 0), 2),
        round(metrics.get("expectancy_pct", 0), 4),
        round(metrics.get("expectancy", metrics.get("expected_net_profit", 0)), 2),
        round(metrics.get("avg_holding_period", 0), 2),
        round(metrics.get("gross_profit", 0), 2),
        round(metrics.get("gross_loss", 0), 2),
        round(metrics.get("max_drawdown", 0), 4),
        int(metrics.get("total_trades", 0)),
        int(metrics.get("winning_trades", metrics.get("total_winning_trades", 0))),
        int(metrics.get("losing_trades", metrics.get("total_losing_trades", 0))),
        round(starting, 2),
        round(finishing, 2),
        int(longs),
        longs_pct,
        shorts_pct,
        int(shorts),
        round(metrics.get("fee", 0), 2),
        int(metrics.get("total_open_trades", 0)),
        round(metrics.get("open_pl", 0), 2),
        json.dumps(equity_curve) if equity_curve else None,
        json.dumps(metrics),
    ))
    conn.commit()
    conn.close()
    return session_id


def list_sessions(session_type: Optional[str] = None, limit: int = 200) -> List[dict]:
    init_history_table()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    if session_type:
        rows = conn.execute(
            "SELECT * FROM trading_history WHERE session_type=? ORDER BY created_at DESC LIMIT ?",
            (session_type, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM trading_history ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        if d.get("equity_curve"):
            try:
                d["equity_curve"] = json.loads(d["equity_curve"])
            except Exception:
                d["equity_curve"] = []
        if d.get("raw_metrics"):
            try:
                d["raw_metrics"] = json.loads(d["raw_metrics"])
            except Exception:
                d["raw_metrics"] = {}
        result.append(d)
    return result


def get_session(session_id: str) -> Optional[dict]:
    init_history_table()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM trading_history WHERE id=?", (session_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("equity_curve"):
        try:
            d["equity_curve"] = json.loads(d["equity_curve"])
        except Exception:
            d["equity_curve"] = []
    if d.get("raw_metrics"):
        try:
            d["raw_metrics"] = json.loads(d["raw_metrics"])
        except Exception:
            d["raw_metrics"] = {}
    return d


def delete_session(session_id: str) -> bool:
    init_history_table()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute("DELETE FROM trading_history WHERE id=?", (session_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def update_notes(session_id: str, notes: str) -> bool:
    init_history_table()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        "UPDATE trading_history SET notes=? WHERE id=?", (notes, session_id)
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0
