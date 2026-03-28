"""
Alpaca historical bars importer.
Uses the Alpaca Data API v2 (free tier) to fetch OHLCV bars and store them
in the same SQLite candle table used by yfinance imports.
"""

import os
import sqlite3
import uuid
import sys
from datetime import datetime, timezone
from dotenv import load_dotenv

root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=root_env, override=False)

from alpaca_utils import get_alpaca_credentials
from db_config import DB_PATH


def _ensure_table(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS candle (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            exchange TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume REAL NOT NULL
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_candle_sym_ex_ts "
        "ON candle (symbol, exchange, timestamp)"
    )
    conn.commit()


def import_alpaca_stock(symbol: str, start_date: str, timeframe: str = "1Day", exchange: str = "alpaca"):
    """Fetch stock bars from Alpaca and persist to SQLite."""
    api_key, secret_key = get_alpaca_credentials()
    if not api_key or not secret_key:
        print("[ERROR] Alpaca API keys not configured. Add ALPACA_API_KEY/ALPACA_SECRET_KEY or APCA_API_KEY_ID/APCA_API_SECRET_KEY.")
        return

    try:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
    except ImportError:
        print("[ERROR] alpaca-py is not installed. Run: pip install alpaca-py")
        return

    TF_MAP = {
        "1m":  TimeFrame(1, TimeFrameUnit.Minute),
        "5m":  TimeFrame(5, TimeFrameUnit.Minute),
        "15m": TimeFrame(15, TimeFrameUnit.Minute),
        "30m": TimeFrame(30, TimeFrameUnit.Minute),
        "1h":  TimeFrame(1, TimeFrameUnit.Hour),
        "2h":  TimeFrame(2, TimeFrameUnit.Hour),
        "4h":  TimeFrame(4, TimeFrameUnit.Hour),
        "1D":  TimeFrame(1, TimeFrameUnit.Day),
        "1W":  TimeFrame(1, TimeFrameUnit.Week),
        "1Day":  TimeFrame(1, TimeFrameUnit.Day),
    }
    tf = TF_MAP.get(timeframe, TimeFrame(1, TimeFrameUnit.Day))

    client = StockHistoricalDataClient(api_key, secret_key)

    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.now(timezone.utc)

    print(f"[Alpaca] Fetching {symbol} bars ({timeframe}) from {start_date}...")

    try:
        req = StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=tf,
            start=start_dt,
            end=end_dt,
        )
        bars = client.get_stock_bars(req)
    except Exception as e:
        print(f"[ERROR] Alpaca API request failed: {e}")
        return

    bar_list = bars.data.get(symbol, [])
    if not bar_list:
        print(f"[WARNING] No bars returned for {symbol}.")
        return

    print(f"[OK] Downloaded {len(bar_list)} bars for {symbol}")

    conn = sqlite3.connect(DB_PATH)
    _ensure_table(conn)

    inserted = 0
    for bar in bar_list:
        ts = int(bar.timestamp.timestamp() * 1000)
        conn.execute(
            "INSERT OR IGNORE INTO candle (id, symbol, exchange, timestamp, open, high, low, close, volume) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), symbol, exchange, ts,
             float(bar.open), float(bar.high), float(bar.low),
             float(bar.close), float(bar.volume)),
        )
        inserted += 1

    conn.commit()
    conn.close()
    print(f"[OK] Inserted {inserted} candles for {symbol} ({exchange}) into DB.")


def import_alpaca_crypto(symbol: str, start_date: str, timeframe: str = "1Day", exchange: str = "alpaca"):
    """Fetch crypto bars from Alpaca (free, no key needed for crypto on paper)."""
    api_key, secret_key = get_alpaca_credentials()
    if not api_key or not secret_key:
        print("[ERROR] Alpaca API keys not configured. Add ALPACA_API_KEY/ALPACA_SECRET_KEY or APCA_API_KEY_ID/APCA_API_SECRET_KEY.")
        return

    try:
        from alpaca.data.historical import CryptoHistoricalDataClient
        from alpaca.data.requests import CryptoBarsRequest
        from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
    except ImportError:
        print("[ERROR] alpaca-py is not installed.")
        return

    TF_MAP = {
        "1m":  TimeFrame(1, TimeFrameUnit.Minute),
        "5m":  TimeFrame(5, TimeFrameUnit.Minute),
        "15m": TimeFrame(15, TimeFrameUnit.Minute),
        "30m": TimeFrame(30, TimeFrameUnit.Minute),
        "1h":  TimeFrame(1, TimeFrameUnit.Hour),
        "2h":  TimeFrame(2, TimeFrameUnit.Hour),
        "4h":  TimeFrame(4, TimeFrameUnit.Hour),
        "1D":  TimeFrame(1, TimeFrameUnit.Day),
        "1W":  TimeFrame(1, TimeFrameUnit.Week),
        "1Day":  TimeFrame(1, TimeFrameUnit.Day),
    }
    tf = TF_MAP.get(timeframe, TimeFrame(1, TimeFrameUnit.Day))

    # Crypto client works without keys on paper endpoint
    client = CryptoHistoricalDataClient(api_key, secret_key)

    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.now(timezone.utc)

    # Alpaca crypto uses BTC/USD format, not BTC-USD
    alpaca_symbol = symbol.replace("-", "/")
    print(f"[Alpaca] Fetching crypto {alpaca_symbol} bars ({timeframe}) from {start_date}...")

    try:
        req = CryptoBarsRequest(
            symbol_or_symbols=alpaca_symbol,
            timeframe=tf,
            start=start_dt,
            end=end_dt,
        )
        bars = client.get_crypto_bars(req)
    except Exception as e:
        print(f"[ERROR] Alpaca crypto API request failed: {e}")
        return

    bar_list = bars.data.get(alpaca_symbol, [])
    if not bar_list:
        print(f"[WARNING] No bars returned for {alpaca_symbol}.")
        return

    print(f"[OK] Downloaded {len(bar_list)} bars for {alpaca_symbol}")

    conn = sqlite3.connect(DB_PATH)
    _ensure_table(conn)

    inserted = 0
    for bar in bar_list:
        ts = int(bar.timestamp.timestamp() * 1000)
        # Store using original symbol format (BTC-USD) for consistency with backtest queries
        conn.execute(
            "INSERT OR IGNORE INTO candle (id, symbol, exchange, timestamp, open, high, low, close, volume) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), symbol, exchange, ts,
             float(bar.open), float(bar.high), float(bar.low),
             float(bar.close), float(bar.volume)),
        )
        inserted += 1

    conn.commit()
    conn.close()
    print(f"[OK] Inserted {inserted} candles for {symbol} ({exchange}) into DB.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python alpaca_importer.py <symbol> <start_date> [timeframe] [exchange] [type: stock|crypto]")
        sys.exit(1)
    sym = sys.argv[1]
    start = sys.argv[2]
    tf = sys.argv[3] if len(sys.argv) > 3 else "1Day"
    exch = sys.argv[4] if len(sys.argv) > 4 else "alpaca"
    asset_type = sys.argv[5] if len(sys.argv) > 5 else "stock"
    if asset_type == "crypto":
        import_alpaca_crypto(sym, start, tf, exch)
    else:
        import_alpaca_stock(sym, start, tf, exch)
